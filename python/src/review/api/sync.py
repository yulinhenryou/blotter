"""``POST /api/v1/sync``: the one write path (ADR-0026, M3a plan D3).

The phone sends a batch of venues, players, sessions and hands. Every item is handled on its own:

- it is validated alone, so one malformed hand does not reject the batch (an item that fails
  validation comes back as ``invalid`` with field paths, like the checker's issues);
- it is saved in its own transaction, by revision (``review.storage.repository``): ``created``,
  ``replaced``, ``unchanged`` or ``conflict``; a record that refers to something not stored, or
  that the database refuses, is ``invalid`` and nothing of it is written;
- kinds are applied in dependency order — venues, players, sessions, hands — so a batch can
  carry a new session together with its hands.

Sending the same batch again changes nothing and reports every valid item as ``unchanged``: the
phone can retry after a lost response without creating duplicates.
"""

import uuid
from collections.abc import Callable, Sequence
from enum import StrEnum
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, PrivateAttr, ValidationError, model_validator
from pydantic.functional_validators import ModelWrapValidatorHandler
from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as OrmSession

from review.api.deps import EngineDep
from review.domain import HandRecord, check
from review.domain.check import Issue
from review.domain.entities import PlayerRecord, SessionRecord, VenueRecord
from review.storage.repository import (
    NotCanonicalError,
    RejectedError,
    Saved,
    save_hand,
    save_player,
    save_session,
    save_venue,
)

ItemKind = Literal["venue", "player", "session", "hand"]
_LISTS: tuple[tuple[ItemKind, str, type[BaseModel]], ...] = (
    ("venue", "venues", VenueRecord),
    ("player", "players", PlayerRecord),
    ("session", "sessions", SessionRecord),
    ("hand", "hands", HandRecord),
)
_ORDER = {kind: n for n, (kind, _, _) in enumerate(_LISTS)}


class SyncOutcome(StrEnum):
    """What happened to one item."""

    CREATED = "created"
    REPLACED = "replaced"
    UNCHANGED = "unchanged"
    CONFLICT = "conflict"
    INVALID = "invalid"


class IssueOut(BaseModel):
    """Why an item is invalid: a field path inside the item, a stable code and a sentence."""

    path: list[str | int]
    code: str
    message: str


class SyncItemResult(BaseModel):
    """The result for one item of the batch.

    ``index`` is the item's position in its list in the request. ``stored_revision`` is the
    revision stored after the call (``None`` when nothing is stored for an invalid item).
    """

    kind: ItemKind
    index: int
    id: uuid.UUID | None
    outcome: SyncOutcome
    stored_revision: int | None
    issues: list[IssueOut] = []


class SyncResponse(BaseModel):
    """One result per item, venues first, then players, sessions and hands, each in order."""

    items: list[SyncItemResult]


class SyncBatch(BaseModel):
    """A batch from the phone. Each list may be empty or left out."""

    model_config = ConfigDict(extra="forbid")

    venues: list[VenueRecord] = []
    players: list[PlayerRecord] = []
    sessions: list[SessionRecord] = []
    hands: list[HandRecord] = []

    _rejected: list[SyncItemResult] = PrivateAttr(default_factory=list)
    _positions: dict[str, list[int]] = PrivateAttr(default_factory=dict)

    @model_validator(mode="wrap")
    @classmethod
    def _items_one_by_one(
        cls, data: Any, handler: ModelWrapValidatorHandler[SyncBatch]
    ) -> SyncBatch:
        # Validate each item alone and keep only the valid ones in the lists; the others are
        # remembered as invalid results. Anything wrong with the batch's own shape (not an
        # object, a list that is not a list, an unknown key) still fails the whole request.
        if not isinstance(data, dict):
            return handler(data)
        kept: dict[str, Any] = dict(data)
        rejected: list[SyncItemResult] = []
        positions: dict[str, list[int]] = {}
        for kind, key, model in _LISTS:
            raw = data.get(key, [])
            if not isinstance(raw, list):
                continue  # the handler reports it
            valid = []
            positions[key] = []
            for index, item in enumerate(raw):
                try:
                    valid.append(model.model_validate(item))
                except ValidationError as error:
                    rejected.append(_invalid_item(kind, index, item, error))
                else:
                    positions[key].append(index)
            kept[key] = valid
        batch = handler(kept)
        batch._rejected = rejected
        batch._positions = positions
        return batch


def _invalid_item(kind: ItemKind, index: int, item: Any, error: ValidationError) -> SyncItemResult:
    issues = [
        IssueOut(path=list(e["loc"]), code=e["type"], message=e["msg"]) for e in error.errors()
    ]
    return SyncItemResult(
        kind=kind,
        index=index,
        id=_id_of(item),
        outcome=SyncOutcome.INVALID,
        stored_revision=None,
        issues=issues,
    )


def _id_of(item: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(item["id"]))
    except TypeError, KeyError, ValueError:
        return None


router = APIRouter()


@router.post("/sync")
def sync(batch: SyncBatch, engine: EngineDep) -> SyncResponse:
    """Apply a batch item by item and report what happened to each (ADR-0026)."""
    return apply_batch(engine, batch)


def apply_batch(engine: Engine, batch: SyncBatch) -> SyncResponse:
    """Save every valid item of ``batch`` in its own transaction; see the module docstring."""
    results = list(batch._rejected)
    savers: dict[ItemKind, Callable[[OrmSession, Any], Saved]] = {
        "venue": save_venue,
        "player": save_player,
        "session": save_session,
        "hand": _save_hand_input,
    }
    for kind, key, _ in _LISTS:
        records: Sequence[BaseModel] = getattr(batch, key)
        positions = batch._positions.get(key, list(range(len(records))))
        for index, record in zip(positions, records, strict=True):
            results.append(_apply(engine, kind, index, record, savers[kind]))
    results.sort(key=lambda r: (_ORDER[r.kind], r.index))
    return SyncResponse(items=results)


def _save_hand_input(db: OrmSession, record: HandRecord) -> Saved:
    # The phone sends the record as entered; what is stored is its canonical form.
    result = check(record)
    if not result.ok or result.record is None:
        raise NotCanonicalError(result.issues)
    return save_hand(db, result.record)


def _apply(
    engine: Engine,
    kind: ItemKind,
    index: int,
    record: Any,
    save: Callable[[OrmSession, Any], Saved],
) -> SyncItemResult:
    def invalid(issues: Sequence[Issue]) -> SyncItemResult:
        return SyncItemResult(
            kind=kind,
            index=index,
            id=record.id,
            outcome=SyncOutcome.INVALID,
            stored_revision=None,
            issues=[IssueOut(path=list(i.path), code=i.code, message=i.message) for i in issues],
        )

    try:
        # The error, if any, leaves the transaction first, which then rolls back.
        with OrmSession(engine) as db, db.begin():
            saved = save(db, record)
    except RejectedError as error:
        return invalid(error.issues)
    except IntegrityError:
        return invalid([Issue((), "constraint_violation", "the database refused the record")])
    return SyncItemResult(
        kind=kind,
        index=index,
        id=record.id,
        outcome=SyncOutcome(saved.outcome.value),
        stored_revision=saved.stored_revision,
    )
