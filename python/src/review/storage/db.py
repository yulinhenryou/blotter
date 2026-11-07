"""Engine set-up: the database URL and the per-backend settings it needs."""

import os
from typing import Any

from sqlalchemy import Engine, create_engine, event

DATABASE_URL_ENV = "DATABASE_URL"
"""Environment variable holding the SQLAlchemy URL, e.g. ``sqlite:///data/hands.db``."""


def database_url() -> str:
    """Return the database URL from the environment.

    Raises
    ------
    RuntimeError
        If ``DATABASE_URL`` is not set: there is no silent default location for real data.
    """
    url = os.environ.get(DATABASE_URL_ENV)
    if not url:
        raise RuntimeError(f"set {DATABASE_URL_ENV} to a SQLAlchemy URL")
    return url


def make_engine(url: str) -> Engine:
    """Create an engine; on SQLite, turn on foreign-key enforcement (off by default there)."""
    engine = create_engine(url)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def _foreign_keys_on(connection: Any, _record: Any) -> None:
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine
