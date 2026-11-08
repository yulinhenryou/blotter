"""Record <-> rows and saving by revision, on SQLite and PostgreSQL.

M3a acceptance criterion 4: for generated canonical records (the dealer's hands, plus incomplete
variants), record -> rows -> record is the identity on both backends. Revision rules: D3.
"""

import random
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

import pytest
from dealer import deal, deal_any
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session as OrmSession

from review.domain import HandRecord, check
from review.domain.entities import PlayerRecord, SessionRecord, VenueKind, VenueRecord
from review.domain.record import POSTS, SeatEntry
from review.ledger import DecisionPoint, decision_points
from review.storage import migrate
from review.storage.db import make_engine
from review.storage.models import (
    DecisionPointRow,
    Hand,
    HandAction,
    HandSeat,
    Player,
    Session,
)
from review.storage.repository import (
    NotCanonicalError,
    SaveOutcome,
    UnknownReferenceError,
    load_decision_points,
    load_hand,
    load_player,
    load_session,
    load_venue,
    save_hand,
    save_player,
    save_session,
    save_venue,
)

# One migrated database per test (the fixture), shared by that test's Hypothesis examples; each
# example starts by deleting the hands, so examples do not see each other's rows.
shared_db = settings(suppress_health_check=[HealthCheck.function_scoped_fixture])

offsets = st.integers(min_value=-12 * 60, max_value=14 * 60).map(
    lambda m: timezone(timedelta(minutes=m))
)
played_at = st.none() | st.builds(
    lambda t, tz: t.replace(tzinfo=tz),
    st.datetimes(min_value=datetime(2000, 1, 1), max_value=datetime(2100, 1, 1)),
    offsets,
)


@st.composite
def stored_records(draw: st.DrawFn) -> HandRecord:
    """A canonical record: a dealt hand, often made incomplete the way a live entry would be."""
    rng = draw(st.randoms(use_true_random=False))
    hand, notes = deal_any(rng)
    if rng.random() < 0.7:
        hand = _vague(hand, rng, notes.implicit_folders)
    hand = hand.model_copy(
        update={
            "revision": draw(st.integers(min_value=1, max_value=1000)),
            "played_at": draw(played_at),
        }
    )
    result = check(hand)
    assert result.ok and result.record is not None, result.issues
    return result.record


def _vague(hand: HandRecord, rng: random.Random, implicit: set[int]) -> HandRecord:
    # Unknown villain cards and stacks, rough stacks and amounts, implicit folds left out.
    gone = {s for s in implicit if rng.random() < 0.5}
    seats = tuple(
        e
        if e.seat == hand.hero_seat
        else e.model_copy(
            update={
                "hole_cards": None if rng.random() < 0.5 else e.hole_cards,
                "starting_stack_chips": None if rng.random() < 0.3 else e.starting_stack_chips,
                "stack_approximate": rng.random() < 0.2,
            }
        )
        for e in hand.seats
        if e.seat not in gone
    )
    actions = tuple(
        a.model_copy(update={"amount_approximate": rng.random() < 0.1})
        for a in hand.actions
        if a.kind not in POSTS and a.seat not in gone
    )
    return hand.model_copy(update={"seats": seats, "actions": actions})


@pytest.fixture
def engine(database_url: str) -> Iterator[Engine]:
    migrate.upgrade(database_url)
    engine = make_engine(database_url)
    yield engine
    engine.dispose()


def _fresh(engine: Engine, *records: HandRecord) -> None:
    """Delete every hand, and make sure the sessions and players the records refer to exist."""
    with OrmSession(engine) as db, db.begin():
        db.execute(delete(DecisionPointRow))
        db.execute(delete(HandAction))
        db.execute(delete(HandSeat))
        db.execute(delete(Hand))
        for r in records:
            db.merge(
                Session(
                    id=r.session_id,
                    started_at=datetime(2026, 11, 7, tzinfo=UTC),
                    small_blind_chips=r.stakes.small_blind_chips,
                    big_blind_chips=r.stakes.big_blind_chips,
                )
            )
            for e in r.seats:
                if e.player_id is not None:
                    db.merge(Player(id=e.player_id, display_name="p"))


def _save(engine: Engine, record: HandRecord) -> tuple[SaveOutcome, int]:
    with OrmSession(engine) as db, db.begin():
        saved = save_hand(db, record)
    return saved.outcome, saved.stored_revision


def _load(engine: Engine, record: HandRecord) -> HandRecord | None:
    # A new session each time, so the record is rebuilt from the database, not from memory.
    with OrmSession(engine) as db:
        return load_hand(db, record.id)


def _load_points(engine: Engine, record: HandRecord) -> tuple[DecisionPoint, ...]:
    with OrmSession(engine) as db:
        return load_decision_points(db, record.id)


@shared_db
@given(stored_records())
def test_record_rows_record_is_the_identity(engine: Engine, record: HandRecord) -> None:
    _fresh(engine, record)
    assert _save(engine, record) == (SaveOutcome.CREATED, record.revision)
    loaded = _load(engine, record)
    assert loaded == record
    assert loaded is not None
    if loaded.played_at is not None:
        assert loaded.played_at.utcoffset() == timedelta(0)
    # The decision points are written with the hand and read back unchanged too.
    assert _load_points(engine, record) == decision_points(record)


@shared_db
@given(stored_records())
def test_what_a_seat_won_is_null_only_when_unknown(engine: Engine, record: HandRecord) -> None:
    # In a hand that ends at hero's fold hero won 0 and the others' winnings are unknown (NULL),
    # not 0; in a complete hand every seat's winnings are known.
    _fresh(engine, record)
    _save(engine, record)
    with OrmSession(engine) as db:
        won = {seat: chips for seat, chips in db.execute(select(HandSeat.seat, HandSeat.won_chips))}
    if record.ends_at_hero_fold:
        assert won == {s: None for s in won} | {record.hero_seat: 0}
    else:
        assert None not in won.values()


@shared_db
@given(stored_records())
def test_saving_the_same_revision_again_changes_nothing(engine: Engine, record: HandRecord) -> None:
    _fresh(engine, record)
    _save(engine, record)
    assert _save(engine, record) == (SaveOutcome.UNCHANGED, record.revision)
    assert _load(engine, record) == record


@shared_db
@given(stored_records(), stored_records())
def test_a_higher_revision_replaces_the_hand(
    engine: Engine, first: HandRecord, other: HandRecord
) -> None:
    # The same hand id, re-entered with different content (another dealt hand).
    second = other.model_copy(update={"id": first.id, "revision": first.revision + 1})
    _fresh(engine, first, second)
    _save(engine, first)
    assert _save(engine, second) == (SaveOutcome.REPLACED, second.revision)
    assert _load(engine, first) == second
    with OrmSession(engine) as db:
        rows = db.scalar(select(func.count()).select_from(HandAction))
    assert rows == len(second.actions)  # the old actions are gone, not left behind
    assert _load_points(engine, first) == decision_points(second)


@shared_db
@given(stored_records(), stored_records(), st.integers(min_value=0, max_value=5))
def test_a_lower_or_equal_revision_with_other_content_is_a_conflict(
    engine: Engine, first: HandRecord, other: HandRecord, lower_by: int
) -> None:
    revision = max(1, first.revision - lower_by)
    late = other.model_copy(update={"id": first.id, "revision": revision})
    if late == first:
        return  # the same record: not a conflict (covered above)
    _fresh(engine, first, late)
    _save(engine, first)
    assert _save(engine, late) == (SaveOutcome.CONFLICT, first.revision)
    assert _load(engine, first) == first


@shared_db
@given(st.randoms(use_true_random=False))
def test_only_canonical_records_are_saved(engine: Engine, rng: random.Random) -> None:
    hand, notes = deal(rng)  # valid, but without the derived fields
    canonical = check(hand).record
    assert canonical is not None
    # Remove a seat entry that the canonical form would insert again (or, failing that, break
    # the record outright): valid input to check(), but not what is stored.
    gone = next(iter(notes.implicit_folders), None)
    if gone is not None:
        short = canonical.model_copy(
            update={"seats": tuple(e for e in canonical.seats if e.seat != gone)}
        )
    else:
        short = canonical.model_copy(update={"seats": (*canonical.seats, SeatEntry(seat=10))})
    _fresh(engine, canonical)
    for record in (hand, short):
        with pytest.raises(NotCanonicalError), OrmSession(engine) as db, db.begin():
            save_hand(db, record)
    assert _load(engine, canonical) is None


def test_loading_a_missing_hand_gives_none(engine: Engine) -> None:
    hand, _ = deal(random.Random(0))
    assert _load(engine, hand) is None


# --- Venues, players, sessions -----------------------------------------------------------------


def _entities() -> list[tuple[Any, Any, Any, Any]]:
    venue = VenueRecord(
        id=uuid.UUID("019a5f00-0000-7000-8000-000000000001"),
        name="Casino",
        kind=VenueKind.LIVE,
        timezone="Europe/Vienna",
    )
    player = PlayerRecord(id=uuid.UUID("019a5f00-0000-7000-8000-000000000002"), display_name="V")
    session = SessionRecord(
        id=uuid.UUID("019a5f00-0000-7000-8000-000000000003"),
        venue_id=venue.id,
        started_at=datetime(2026, 11, 7, 20, tzinfo=timezone(timedelta(hours=1))),
        small_blind_chips=1,
        big_blind_chips=3,
        currency="EUR",
        chip_unit_minor=100,
    )
    return [
        (venue, save_venue, load_venue, {"name": "Casino 2"}),
        (player, save_player, load_player, {"notes": "calls too much"}),
        (session, save_session, load_session, {"cash_out_chips": 450}),
    ]


@pytest.mark.parametrize("which", [0, 1, 2], ids=["venue", "player", "session"])
def test_entities_follow_the_revision_rules(engine: Engine, which: int) -> None:
    entities = _entities()
    record, save, load, change = entities[which]

    def run(r: Any) -> tuple[SaveOutcome, int]:
        with OrmSession(engine) as db, db.begin():
            if which == 2:  # a session refers to its venue
                save_venue(db, entities[0][0])
            saved = save(db, r)
        return saved.outcome, saved.stored_revision

    def stored() -> Any:
        with OrmSession(engine) as db:
            return load(db, record.id)

    assert run(record) == (SaveOutcome.CREATED, 1)
    assert stored() == record
    assert run(record) == (SaveOutcome.UNCHANGED, 1)
    edited = record.model_copy(update=change)
    assert run(edited) == (SaveOutcome.CONFLICT, 1)
    newer = record.model_copy(update={**change, "revision": 2})
    assert run(newer) == (SaveOutcome.REPLACED, 2)
    assert stored() == newer
    assert run(record) == (SaveOutcome.CONFLICT, 2)
    assert stored() == newer


def test_a_session_needs_its_venue(engine: Engine) -> None:
    session = _entities()[2][0]
    with pytest.raises(UnknownReferenceError), OrmSession(engine) as db, db.begin():
        save_session(db, session)
