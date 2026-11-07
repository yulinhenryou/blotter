"""Engine set-up: the database URL and the per-backend settings it needs."""

import os
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import ExceptionContext
from sqlalchemy.exc import IntegrityError

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
    """Create an engine that behaves the same on SQLite and PostgreSQL.

    - SQLite: foreign keys are enforced (they are off by default there).
    - pg8000: every integrity-constraint violation is an
      :class:`~sqlalchemy.exc.IntegrityError`. The driver reports only unique violations
      (SQLSTATE 23505) that way and the others of SQLSTATE class 23 — foreign key, check, not
      null — as ``ProgrammingError``; SQLite reports them all as ``IntegrityError``.
    """
    engine = create_engine(url)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def _foreign_keys_on(connection: Any, _record: Any) -> None:
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    if engine.dialect.driver == "pg8000":

        @event.listens_for(engine, "handle_error")
        def _integrity_errors(context: ExceptionContext) -> IntegrityError | None:
            if isinstance(context.sqlalchemy_exception, IntegrityError):
                return None
            original = context.original_exception
            details = original.args[0] if original.args else None
            if isinstance(details, dict) and str(details.get("C", "")).startswith("23"):
                return IntegrityError(context.statement, context.parameters, original)
            return None

    return engine
