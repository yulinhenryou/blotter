"""M3a acceptance criterion 2: migrations apply cleanly from empty on SQLite and PostgreSQL, and a
downgrade/upgrade cycle works. Also the storage set-up both backends rely on, and the data steps
of migration 0003 (record version 2, ADR-0030)."""

import uuid
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import Uuid, bindparam, insert, inspect, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as OrmSession

from review.storage import migrate
from review.storage.db import make_engine
from review.storage.models import Base, Hand, HandSeat, Session

TABLES_0001 = {"venues", "players", "sessions", "hands", "hand_seats", "actions"}
TABLES = TABLES_0001 | {"decision_points"}  # 0002


def tables(url: str) -> set[str]:
    engine = make_engine(url)
    names = set(inspect(engine).get_table_names())
    engine.dispose()
    return names


def test_upgrade_from_empty_creates_every_table(database_url: str) -> None:
    assert tables(database_url) == set()
    migrate.upgrade(database_url)
    assert tables(database_url) == TABLES | {"alembic_version"}
    assert set(Base.metadata.tables) == TABLES


def test_downgrade_to_base_and_upgrade_again(database_url: str) -> None:
    migrate.upgrade(database_url)
    migrate.downgrade(database_url)
    assert tables(database_url) == {"alembic_version"}
    migrate.upgrade(database_url)
    assert tables(database_url) == TABLES | {"alembic_version"}


def test_migrations_go_up_and_down_one_step_at_a_time(database_url: str) -> None:
    migrate.upgrade(database_url, "0001")
    assert tables(database_url) == TABLES_0001 | {"alembic_version"}
    migrate.upgrade(database_url, "0002")
    assert tables(database_url) == TABLES | {"alembic_version"}
    migrate.upgrade(database_url, "0003")
    assert tables(database_url) == TABLES | {"alembic_version"}
    migrate.downgrade(database_url, "0002")
    migrate.downgrade(database_url, "0001")
    assert tables(database_url) == TABLES_0001 | {"alembic_version"}


def _store_a_version_1_hand(database_url: str) -> uuid.UUID:
    """Insert, at migration 0002, the rows of a hand as version 1 stored them."""
    migrate.upgrade(database_url, "0002")
    engine = make_engine(database_url)
    session_id, hand_id = uuid.uuid7(), uuid.uuid7()
    with OrmSession(engine) as db, db.begin():
        db.add(
            Session(
                id=session_id,
                started_at=datetime(2026, 11, 7, 21, 0, tzinfo=UTC),
                small_blind_chips=1,
                big_blind_chips=2,
            )
        )
        db.flush()
        # Core insert of the 0002 columns only: the model already has the 0003 column.
        db.execute(
            insert(Hand).values(
                id=hand_id,
                revision=1,
                session_id=session_id,
                client_seq=0,
                schema_version=1,
                record_reason="notable",
                source="manual",
                table_size=2,
                button_seat=1,
                hero_seat=1,
                small_blind_chips=1,
                big_blind_chips=2,
                straddles_chips=[],
                rake_chips=0,
                hero_net_chips=-1,
                villain_cards_unknown=False,
                stacks_approximate=False,
                amounts_approximate=False,
            )
        )
    engine.dispose()
    return hand_id


def test_stored_hands_become_version_2(database_url: str) -> None:
    hand_id = _store_a_version_1_hand(database_url)
    migrate.upgrade(database_url, "0003")
    engine = make_engine(database_url)
    with OrmSession(engine) as db:
        row = db.execute(
            select(Hand.schema_version, Hand.ends_at_hero_fold).where(Hand.id == hand_id)
        ).one()
    engine.dispose()
    assert tuple(row) == (2, False)
    migrate.downgrade(database_url, "0002")  # no hand needs version 2: allowed


def test_downgrade_is_refused_while_a_hand_ends_at_hero_fold(database_url: str) -> None:
    hand_id = _store_a_version_1_hand(database_url)
    migrate.upgrade(database_url, "0003")
    engine = make_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            update(Hand).where(Hand.id == hand_id).values(ends_at_hero_fold=True, rake_chips=None)
        )
    engine.dispose()
    with pytest.raises(RuntimeError, match="end at hero's fold"):
        migrate.downgrade(database_url, "0002")


def test_models_and_migrations_agree(database_url: str) -> None:
    migrate.upgrade(database_url)
    migrate.check(database_url)  # raises if autogenerate would find a difference


def test_foreign_keys_are_enforced(database_url: str) -> None:
    migrate.upgrade(database_url)
    engine = make_engine(database_url)
    orphan = HandSeat(
        hand_id=uuid.uuid7(), seat=1, stack_approximate=False, showed=False, won_chips=0
    )
    with OrmSession(engine) as db, pytest.raises(IntegrityError):
        db.add(orphan)
        db.commit()
    engine.dispose()


@pytest.mark.parametrize(
    ("name", "kind"),
    [("Casino", "casino"), (None, "live")],
    ids=["check constraint", "not null"],
)
def test_constraint_violations_are_integrity_errors(
    database_url: str, name: str | None, kind: str
) -> None:
    # Raw SQL, so that the database (not SQLAlchemy's Enum type) has to reject the value.
    migrate.upgrade(database_url)
    engine = make_engine(database_url)
    insert = text(
        "INSERT INTO venues (id, revision, name, kind, timezone)"
        " VALUES (:id, 1, :name, :kind, 'UTC')"
    ).bindparams(bindparam("id", type_=Uuid()))
    # pytest.raises outside the transaction: the error must leave engine.begin(), which then
    # rolls back. Inside, begin() would try to commit, and PostgreSQL refuses to commit a
    # failed transaction.
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(insert, {"id": uuid.uuid7(), "name": name, "kind": kind})
    engine.dispose()


def test_timestamps_come_back_as_the_same_instant_in_utc(database_url: str) -> None:
    migrate.upgrade(database_url)
    engine = make_engine(database_url)
    vienna_evening = datetime(2026, 11, 7, 21, 30, tzinfo=timezone(timedelta(hours=1)))
    session_id = uuid.uuid7()
    with OrmSession(engine) as db:
        db.add(
            Session(
                id=session_id,
                started_at=vienna_evening,
                small_blind_chips=1,
                big_blind_chips=2,
            )
        )
        db.commit()
    with OrmSession(engine) as db:
        stored = db.scalars(select(Session.started_at).where(Session.id == session_id)).one()
    engine.dispose()
    assert stored == vienna_evening
    assert stored.tzinfo == UTC


def test_naive_timestamps_are_refused(database_url: str) -> None:
    migrate.upgrade(database_url)
    engine = make_engine(database_url)
    with OrmSession(engine) as db, pytest.raises(Exception, match="naive datetime"):
        db.add(
            Session(
                id=uuid.uuid7(),
                started_at=datetime(2026, 11, 7, 21, 30),
                small_blind_chips=1,
                big_blind_chips=2,
            )
        )
        db.commit()
    engine.dispose()
