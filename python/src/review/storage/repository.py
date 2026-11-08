"""Records to rows and back, and saving by revision (M3a plan §1.2, ADR-0026).

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

Venues, players and sessions (:mod:`review.domain.entities`) are one row each and follow the same
revision rules. Every save checks the record's references first (a hand's session and players, a
session's venue) and refuses a record that refers to something not stored.

The functions here run inside the caller's transaction and never commit: the caller decides what
belongs together (the sync endpoint: one item of a batch).
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Literal

from sqlalchemy import delete, insert, select, update
from sqlalchemy.orm import Session as OrmSession

from review.domain import HandRecord, check
from review.domain.check import Issue
from review.domain.entities import PlayerRecord, SessionRecord, VenueRecord
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
    Street,
)
from review.ledger import CLASSIFIER_VERSION, DecisionPoint, Situation, Texture, decision_points
from review.ledger.situations import (
    BoardSuits,
    Depth,
    HighCard,
    Initiative,
    InPosition,
    NewCard,
    Pairing,
    Players,
    PositionGroup,
    PotType,
    Size,
    Spot,
    TextureClass,
)
from review.storage.models import (
    Base,
    DecisionPointRow,
    Hand,
    HandAction,
    HandSeat,
    HandSource,
    Player,
    Session,
    Venue,
)

UNSCORED_REASON = "engine_not_available"
"""Why every decision point is unscored until the evaluator exists (M3b)."""


class SaveOutcome(StrEnum):
    """What a save did."""

    CREATED = "created"
    REPLACED = "replaced"
    UNCHANGED = "unchanged"
    CONFLICT = "conflict"


@dataclass(frozen=True)
class Saved:
    """The outcome of a save and the revision stored afterwards."""

    outcome: SaveOutcome
    stored_revision: int


class RejectedError(ValueError):
    """The record cannot be stored; nothing was written. ``issues`` says why, field by field."""

    def __init__(self, issues: tuple[Issue, ...], fallback: str = "rejected") -> None:
        self.issues = issues
        super().__init__("; ".join(f"{i.location}: {i.code}" for i in issues) or fallback)


class NotCanonicalError(RejectedError):
    """The hand record is invalid, or valid but not in canonical form."""

    def __init__(self, issues: tuple[Issue, ...]) -> None:
        super().__init__(issues, "not in canonical form")


class UnknownReferenceError(RejectedError):
    """The record refers to a session, player or venue that is not stored, or reuses a number."""


def save_hand(db: OrmSession, record: HandRecord) -> Saved:
    """Save a canonical hand record, deciding by revision what to do (D3).

    Raises
    ------
    NotCanonicalError
        If ``check(record)`` reports issues, or its canonical form differs from ``record``.
        Only canonical records are stored, so that rows always describe a valid hand.
    UnknownReferenceError
        If the session or a player is not stored, or another hand of the session has the same
        ``client_seq``.
    """
    result = check(record)
    if not result.ok:
        raise NotCanonicalError(result.issues)
    if result.record != record:
        raise NotCanonicalError(())
    _check_hand_references(db, record)

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
        # Children first: decision points refer to actions, actions to hand_seats, hand_seats
        # to hands.
        db.execute(delete(DecisionPointRow).where(DecisionPointRow.hand_id == record.id))
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
    # Seats before actions before decision points: each refers to the one before.
    if seat_rows:
        db.execute(insert(HandSeat), seat_rows)
    if action_rows:
        db.execute(insert(HandAction), action_rows)
    point_rows = [_decision_row(r.id, p) for p in decision_points(r)]
    if point_rows:
        db.execute(insert(DecisionPointRow), point_rows)


def _decision_row(hand_id: uuid.UUID, point: DecisionPoint) -> dict[str, Any]:
    s = point.situation
    t = s.texture
    return {
        "hand_id": hand_id,
        "action_seq": point.action_seq,
        "classifier_version": CLASSIFIER_VERSION,
        "street": s.street.value,
        "spot": s.spot.value,
        "pot_type": _value(s.pot_type),
        "players": s.players.value,
        "position_label": s.position_label,
        "position_group": s.position_group.value,
        "in_position": _value(s.in_position),
        "initiative": _value(s.initiative),
        "depth": s.depth.value,
        "size": _value(s.size),
        "facing_all_in": s.facing_all_in,
        "board_suits": t.suits.value if t else None,
        "board_pairing": t.pairing.value if t else None,
        "board_high_card": t.high_card.value if t else None,
        "board_connected": t.connected if t else None,
        "texture_class": t.texture_class.value if t else None,
        "new_card": _value(t.new_card) if t else None,
        "line": s.line,
        "straddled": s.straddled,
        "scorable": False,
        "unscored_reason": UNSCORED_REASON,
    }


def _value(member: StrEnum | None) -> str | None:
    return None if member is None else member.value


# --- rows -> record ----------------------------------------------------------------------------


@dataclass(frozen=True)
class StoredDecisionPoint:
    """A decision point as stored: with its classifier version and whether it is scored yet."""

    point: DecisionPoint
    classifier_version: int
    scorable: bool
    unscored_reason: str | None


def load_decision_points(db: OrmSession, hand_id: uuid.UUID) -> tuple[DecisionPoint, ...]:
    """Read a stored hand's decision points, in order (see :func:`load_stored_decision_points`)."""
    return tuple(stored.point for stored in load_stored_decision_points(db, hand_id))


def load_stored_decision_points(
    db: OrmSession, hand_id: uuid.UUID
) -> tuple[StoredDecisionPoint, ...]:
    """Read a stored hand's decision points with their scoring columns, in order.

    Raises
    ------
    ValueError
        If a row was written by another classifier version: its keys mean something else and
        must be recomputed first.
    """
    rows = db.scalars(
        select(DecisionPointRow)
        .where(DecisionPointRow.hand_id == hand_id)
        .order_by(DecisionPointRow.action_seq)
        .execution_options(populate_existing=True)
    ).all()
    points = []
    for row in rows:
        if row.classifier_version != CLASSIFIER_VERSION:
            raise ValueError(
                f"decision point ({hand_id}, {row.action_seq}) has classifier version "
                f"{row.classifier_version}; this code reads only {CLASSIFIER_VERSION}"
            )
        texture = None
        if row.texture_class is not None:
            # _decision_row writes the texture columns all together or not at all.
            assert row.board_suits and row.board_pairing and row.board_high_card
            assert row.board_connected is not None
            texture = Texture(
                suits=BoardSuits(row.board_suits),
                pairing=Pairing(row.board_pairing),
                high_card=HighCard(row.board_high_card),
                connected=row.board_connected,
                texture_class=TextureClass(row.texture_class),
                new_card=_opt(NewCard, row.new_card),
            )
        situation = Situation(
            street=Street(row.street),
            spot=Spot(row.spot),
            pot_type=_opt(PotType, row.pot_type),
            players=Players(row.players),
            position_label=row.position_label,
            position_group=PositionGroup(row.position_group),
            in_position=_opt(InPosition, row.in_position),
            initiative=_opt(Initiative, row.initiative),
            depth=Depth(row.depth),
            size=_opt(Size, row.size),
            facing_all_in=row.facing_all_in,
            texture=texture,
            line=row.line,
            straddled=row.straddled,
        )
        points.append(
            StoredDecisionPoint(
                DecisionPoint(row.action_seq, situation),
                row.classifier_version,
                row.scorable,
                row.unscored_reason,
            )
        )
    return tuple(points)


def _opt[E: StrEnum](enum: type[E], value: str | None) -> E | None:
    return None if value is None else enum(value)


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


# --- References --------------------------------------------------------------------------------


def _exists(db: OrmSession, model: type[Base], key: uuid.UUID) -> bool:
    return db.get(model, key) is not None


def _check_hand_references(db: OrmSession, r: HandRecord) -> None:
    issues: list[Issue] = []
    if not _exists(db, Session, r.session_id):
        issues.append(Issue(("session_id",), "unknown_session", "no session with this id"))
    for i, entry in enumerate(r.seats):
        if entry.player_id is not None and not _exists(db, Player, entry.player_id):
            path = ("seats", i, "player_id")
            issues.append(Issue(path, "unknown_player", "no player with this id"))
    clash = db.execute(
        select(Hand.id).where(
            Hand.session_id == r.session_id, Hand.client_seq == r.client_seq, Hand.id != r.id
        )
    ).first()
    if clash is not None:
        issues.append(
            Issue(("client_seq",), "duplicate_client_seq", "another hand of the session has it")
        )
    if issues:
        raise UnknownReferenceError(tuple(issues))


# --- Venues, players, sessions -----------------------------------------------------------------


def save_venue(db: OrmSession, record: VenueRecord) -> Saved:
    """Save a venue by revision (ADR-0026)."""
    return _save_by_revision(db, Venue, record, record.model_dump(), _venue)


def save_player(db: OrmSession, record: PlayerRecord) -> Saved:
    """Save a player by revision (ADR-0026)."""
    return _save_by_revision(db, Player, record, record.model_dump(), _player)


def save_session(db: OrmSession, record: SessionRecord) -> Saved:
    """Save a session by revision (ADR-0026).

    Raises
    ------
    UnknownReferenceError
        If ``venue_id`` names a venue that is not stored.
    """
    if record.venue_id is not None and not _exists(db, Venue, record.venue_id):
        raise UnknownReferenceError(
            (Issue(("venue_id",), "unknown_venue", "no venue with this id"),)
        )
    return _save_by_revision(db, Session, record, record.model_dump(), _session)


def load_venue(db: OrmSession, venue_id: uuid.UUID) -> VenueRecord | None:
    """Return the stored venue, or ``None``."""
    row = _fresh(db, Venue, venue_id)
    return None if row is None else _venue(row)


def load_player(db: OrmSession, player_id: uuid.UUID) -> PlayerRecord | None:
    """Return the stored player, or ``None``."""
    row = _fresh(db, Player, player_id)
    return None if row is None else _player(row)


def load_session(db: OrmSession, session_id: uuid.UUID) -> SessionRecord | None:
    """Return the stored session, or ``None``."""
    row = _fresh(db, Session, session_id)
    return None if row is None else _session(row)


def list_sessions(db: OrmSession) -> list[SessionRecord]:
    """Return every session, the most recent start first."""
    rows = db.scalars(
        select(Session)
        .order_by(Session.started_at.desc(), Session.id)
        .execution_options(populate_existing=True)
    ).all()
    return [_session(row) for row in rows]


def list_hands(db: OrmSession, session_id: uuid.UUID) -> list[HandRecord]:
    """Return the hands of a session in ``client_seq`` order (one query per hand for now)."""
    ids = db.scalars(
        select(Hand.id).where(Hand.session_id == session_id).order_by(Hand.client_seq)
    ).all()
    hands = [load_hand(db, hand_id) for hand_id in ids]
    return [h for h in hands if h is not None]


def _save_by_revision[R: VenueRecord | PlayerRecord | SessionRecord, M: (Venue, Player, Session)](
    db: OrmSession,
    model: type[M],
    record: R,
    row: dict[str, Any],
    to_record: Callable[[M], R],
) -> Saved:
    # As for hands: FOR UPDATE keeps two saves of one record from both passing the check.
    stored = db.get(model, record.id, with_for_update=True, populate_existing=True)
    if stored is None:
        db.execute(insert(model), [row])
        return Saved(SaveOutcome.CREATED, record.revision)
    if record.revision > stored.revision:
        db.execute(update(model).where(model.id == record.id).values(row))
        return Saved(SaveOutcome.REPLACED, record.revision)
    if record.revision == stored.revision and to_record(stored) == record:
        return Saved(SaveOutcome.UNCHANGED, stored.revision)
    return Saved(SaveOutcome.CONFLICT, stored.revision)


def _fresh[M: Base](db: OrmSession, model: type[M], key: uuid.UUID) -> M | None:
    return db.get(model, key, populate_existing=True)


def _venue(row: Venue) -> VenueRecord:
    return VenueRecord(
        id=row.id, revision=row.revision, name=row.name, kind=row.kind, timezone=row.timezone
    )


def _player(row: Player) -> PlayerRecord:
    return PlayerRecord(
        id=row.id,
        revision=row.revision,
        display_name=row.display_name,
        is_hero=row.is_hero,
        notes=row.notes,
    )


def _session(row: Session) -> SessionRecord:
    return SessionRecord(
        id=row.id,
        revision=row.revision,
        venue_id=row.venue_id,
        started_at=row.started_at,
        ended_at=row.ended_at,
        small_blind_chips=row.small_blind_chips,
        big_blind_chips=row.big_blind_chips,
        currency=row.currency,
        chip_unit_minor=row.chip_unit_minor,
        buy_in_chips=row.buy_in_chips,
        cash_out_chips=row.cash_out_chips,
        notes=row.notes,
    )
