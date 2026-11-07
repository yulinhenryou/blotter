"""M3a acceptance criterion 2: migrations apply cleanly from empty on SQLite and PostgreSQL, and a
downgrade/upgrade cycle works. Also the storage set-up both backends rely on."""

import uuid
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import Uuid, bindparam, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as OrmSession

from review.storage import migrate
from review.storage.db import make_engine
from review.storage.models import Base, HandSeat, Session

TABLES = {"venues", "players", "sessions", "hands", "hand_seats", "actions"}


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
    with engine.begin() as connection, pytest.raises(IntegrityError):
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
