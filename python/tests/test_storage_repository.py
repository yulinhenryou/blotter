"""Record <-> rows and saving by revision, on SQLite and PostgreSQL.

M3a acceptance criterion 4: for generated canonical records (the dealer's hands, plus incomplete
variants), record -> rows -> record is the identity on both backends. Revision rules: D3.
"""

import random
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta, timezone

import pytest
from dealer import deal
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session as OrmSession

from review.domain import HandRecord, check
from review.domain.record import POSTS, SeatEntry
from review.storage import migrate
from review.storage.db import make_engine
from review.storage.models import Hand, HandAction, HandSeat, Player, Session
from review.storage.repository import (
    NotCanonicalError,
    SaveOutcome,
    load_hand,
    save_hand,
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
    hand, notes = deal(rng)
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
