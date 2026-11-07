"""Hand records to rows and back, and saving by revision (M3a plan §1.2 and D3).

A stored hand is the canonical record (:func:`review.domain.check.check`) as rows: one ``hands``
row, one ``hand_seats`` row per dealt-in seat, one ``actions`` row per action. The mapping is
exact: :func:`load_hand` after :func:`save_hand` returns a record equal to the one saved
(acceptance criterion AC4). Two details make that work:

- the canonical record lists every dealt-in seat, so ``dealt_in_seats`` is the set of
  ``hand_seats`` rows, and a seat's entry in ``results`` is its ``won_chips`` when that is above
  zero (canonical results are sorted by seat and never hold zero);
- ``played_at`` comes back in UTC. It is the same instant, and aware datetimes compare equal
  across time zones, so the record is equal; only its ``tzinfo`` may differ.

Revisions (D3): the same id and revision with the same content changes nothing; a higher revision
replaces the hand; the same revision with different content, or a lower revision, is a conflict
and leaves the stored hand as it is.

The functions here run inside the caller's transaction and never commit: the caller decides what
belongs together (in Task 6, one item of a sync batch).
"""

import uuid
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Literal

from sqlalchemy import delete, insert, select, update
from sqlalchemy.orm import Session as OrmSession

from review.domain import HandRecord, check
from review.domain.check import Issue
from review.domain.record import (
    SCHEMA_VERSION,
    Action,
    Ante,
    Board,
    Card,
    Completeness,
    Result,
    SeatEntry,
    Stakes,
)
from review.storage.models import Hand, HandAction, HandSeat, HandSource


class SaveOutcome(StrEnum):
    """What :func:`save_hand` did."""

    CREATED = "created"
    REPLACED = "replaced"
    UNCHANGED = "unchanged"
    CONFLICT = "conflict"


@dataclass(frozen=True)
class Saved:
    """The outcome of a save and the revision stored afterwards."""

    outcome: SaveOutcome
    stored_revision: int


class NotCanonicalError(ValueError):
    """The record is invalid, or valid but not in canonical form; nothing was written."""

    def __init__(self, issues: tuple[Issue, ...]) -> None:
        self.issues = issues
        detail = "; ".join(f"{i.location}: {i.code}" for i in issues) or "not in canonical form"
        super().__init__(detail)


def save_hand(db: OrmSession, record: HandRecord) -> Saved:
    """Save a canonical hand record, deciding by revision what to do (D3).

    Raises
    ------
    NotCanonicalError
        If ``check(record)`` reports issues, or its canonical form differs from ``record``.
        Only canonical records are stored, so that rows always describe a valid hand.
    """
    result = check(record)
    if not result.ok:
        raise NotCanonicalError(result.issues)
    if result.record != record:
        raise NotCanonicalError(())

    # FOR UPDATE locks the row on PostgreSQL until the transaction ends, so that two saves of
    # the same hand cannot both read revision n and both write; SQLite ignores it (it locks the
    # whole database for a write anyway).
    stored_revision = db.execute(
        select(Hand.revision).where(Hand.id == record.id).with_for_update()
    ).scalar_one_or_none()

    if stored_revision is None:
        db.execute(insert(Hand), [_hand_row(record)])
        _insert_children(db, record)
        return Saved(SaveOutcome.CREATED, record.revision)
    if record.revision > stored_revision:
        # Children first: actions refer to hand_seats, hand_seats to hands.
        db.execute(delete(HandAction).where(HandAction.hand_id == record.id))
        db.execute(delete(HandSeat).where(HandSeat.hand_id == record.id))
        db.execute(update(Hand).where(Hand.id == record.id).values(_hand_row(record)))
        _insert_children(db, record)
        return Saved(SaveOutcome.REPLACED, record.revision)
    if record.revision == stored_revision and load_hand(db, record.id) == record:
        return Saved(SaveOutcome.UNCHANGED, stored_revision)
    return Saved(SaveOutcome.CONFLICT, stored_revision)


def load_hand(db: OrmSession, hand_id: uuid.UUID) -> HandRecord | None:
    """Rebuild a stored hand record from its rows, or return ``None`` if there is none.

    The record is validated again on the way out (Pydantic), so a row that no longer fits the
    record model is an error here rather than a silently wrong record.
    """
    hand = db.execute(
        select(Hand).where(Hand.id == hand_id).execution_options(populate_existing=True)
    ).scalar_one_or_none()
    if hand is None:
        return None
    seats = db.scalars(
        select(HandSeat)
        .where(HandSeat.hand_id == hand_id)
        .order_by(HandSeat.seat)
        .execution_options(populate_existing=True)
    ).all()
    actions = db.scalars(
        select(HandAction)
        .where(HandAction.hand_id == hand_id)
        .order_by(HandAction.seq)
        .execution_options(populate_existing=True)
    ).all()

    ante = (
        Ante(kind=hand.ante_kind, chips=hand.ante_chips)
        if hand.ante_kind is not None and hand.ante_chips is not None
        else None
    )
    return HandRecord(
        schema_version=_schema_version(hand.schema_version),
        id=hand.id,
        revision=hand.revision,
        session_id=hand.session_id,
        client_seq=hand.client_seq,
        played_at=hand.played_at,
        record_reason=hand.record_reason,
        source=_source(hand.source),
        stakes=Stakes(
            small_blind_chips=hand.small_blind_chips,
            big_blind_chips=hand.big_blind_chips,
            straddles_chips=tuple(hand.straddles_chips),
            ante=ante,
        ),
        table_size=hand.table_size,
        dealt_in_seats=tuple(s.seat for s in seats),
        button_seat=hand.button_seat,
        hero_seat=hand.hero_seat,
        seats=tuple(
            SeatEntry(
                seat=s.seat,
                player_id=s.player_id,
                starting_stack_chips=s.starting_stack_chips,
                stack_approximate=s.stack_approximate,
                hole_cards=_two_cards(s.hole_cards),
                showed=s.showed,
            )
            for s in seats
        ),
        board=Board(
            flop=_three_cards(hand.board_flop), turn=hand.board_turn, river=hand.board_river
        ),
        actions=tuple(
            Action(
                street=a.street,
                seat=a.seat,
                kind=a.kind,
                amount_to_chips=a.amount_to_chips,
                ante_chips=a.ante_chips,
                all_in=a.all_in,
                amount_approximate=a.amount_approximate,
            )
            for a in actions
        ),
        results=tuple(Result(seat=s.seat, won_chips=s.won_chips) for s in seats if s.won_chips),
        completeness=Completeness(
            villain_cards_unknown=hand.villain_cards_unknown,
            stacks_approximate=hand.stacks_approximate,
            amounts_approximate=hand.amounts_approximate,
        ),
        rake_chips=hand.rake_chips,
        hero_net_chips=hand.hero_net_chips,
    )


# --- record -> rows ----------------------------------------------------------------------------


def _hand_row(r: HandRecord) -> dict[str, Any]:
    # Canonical records always carry the derived fields; check() above guarantees it.
    assert r.completeness is not None
    assert r.rake_chips is not None
    assert r.hero_net_chips is not None
    ante = r.stakes.ante
    return {
        "id": r.id,
        "revision": r.revision,
        "session_id": r.session_id,
        "client_seq": r.client_seq,
        "schema_version": r.schema_version,
        "played_at": r.played_at,
        "record_reason": r.record_reason,
        "source": HandSource(r.source),
        "table_size": r.table_size,
        "button_seat": r.button_seat,
        "hero_seat": r.hero_seat,
        "small_blind_chips": r.stakes.small_blind_chips,
        "big_blind_chips": r.stakes.big_blind_chips,
        "straddles_chips": list(r.stakes.straddles_chips),
        "ante_kind": ante.kind if ante else None,
        "ante_chips": ante.chips if ante else None,
        "board_flop": "".join(r.board.flop) if r.board.flop else None,
        "board_turn": r.board.turn,
        "board_river": r.board.river,
        "rake_chips": r.rake_chips,
        "hero_net_chips": r.hero_net_chips,
        "villain_cards_unknown": r.completeness.villain_cards_unknown,
        "stacks_approximate": r.completeness.stacks_approximate,
        "amounts_approximate": r.completeness.amounts_approximate,
    }


def _insert_children(db: OrmSession, r: HandRecord) -> None:
    won = {res.seat: res.won_chips for res in r.results}
    seat_rows = [
        {
            "hand_id": r.id,
            "seat": e.seat,
            "player_id": e.player_id,
            "starting_stack_chips": e.starting_stack_chips,
            "stack_approximate": e.stack_approximate,
            "hole_cards": "".join(e.hole_cards) if e.hole_cards else None,
            "showed": e.showed,
            "won_chips": won.get(e.seat, 0),
        }
        for e in r.seats
    ]
    action_rows = [
        {
            "hand_id": r.id,
            "seq": seq,
            "street": a.street,
            "seat": a.seat,
            "kind": a.kind,
            "amount_to_chips": a.amount_to_chips,
            "ante_chips": a.ante_chips,
            "all_in": a.all_in,
            "amount_approximate": a.amount_approximate,
        }
        for seq, a in enumerate(r.actions)
    ]
    # Seats before actions: an action's (hand_id, seat) refers to a hand_seats row.
    if seat_rows:
        db.execute(insert(HandSeat), seat_rows)
    if action_rows:
        db.execute(insert(HandAction), action_rows)


# --- rows -> record ----------------------------------------------------------------------------


def _two_cards(text: str | None) -> tuple[Card, Card] | None:
    return None if text is None else (text[0:2], text[2:4])


def _three_cards(text: str | None) -> tuple[Card, Card, Card] | None:
    return None if text is None else (text[0:2], text[2:4], text[4:6])


def _schema_version(value: int) -> Literal[1]:
    if value != SCHEMA_VERSION:
        raise ValueError(f"stored hand has schema version {value}; this code reads only 1")
    return SCHEMA_VERSION


def _source(value: HandSource) -> Literal["manual"]:
    if value is not HandSource.MANUAL:
        raise ValueError(f"stored hand has source {value!r}; record v1 knows only 'manual'")
    return "manual"
