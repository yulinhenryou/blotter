"""Database URLs for storage tests: SQLite always, PostgreSQL when a test database is given.

PostgreSQL tests need ``TEST_POSTGRES_URL`` (for example
``postgresql+pg8000://postgres:postgres@localhost:5432/test``); without it they are skipped. CI
sets ``REQUIRE_POSTGRES=1``, which turns that skip into a failure, so that the PostgreSQL tests
cannot silently stop running there (M3a plan, D2).
"""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import text

from review.storage.db import make_engine

BACKENDS = ["sqlite", "postgresql"]


def backend_url(backend: str, tmp_path: Path) -> Iterator[str]:
    """Yield an empty database of the given backend, and clean it up afterwards."""
    if backend == "sqlite":
        yield f"sqlite:///{tmp_path / 'test.db'}"
        return
    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        if os.environ.get("REQUIRE_POSTGRES") == "1":
            pytest.fail("REQUIRE_POSTGRES=1 but TEST_POSTGRES_URL is not set")
        pytest.skip("PostgreSQL: set TEST_POSTGRES_URL to run")
    _reset(url)
    yield url
    _reset(url)


def _reset(url: str) -> None:
    engine = make_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()
