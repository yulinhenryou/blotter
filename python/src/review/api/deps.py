"""FastAPI dependencies: the database engine and a session per request.

The engine is created on first use, from ``DATABASE_URL`` unless :func:`review.api.app.create_app`
was given one (tests pass their own). Building the app therefore needs no database: the OpenAPI
export and the health check work without one.
"""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import Engine
from sqlalchemy.orm import Session as OrmSession

from review.storage.db import database_url, make_engine


def get_engine(request: Request) -> Engine:
    """Return the application's engine, creating it from ``DATABASE_URL`` the first time."""
    state = request.app.state
    if state.engine is None:
        state.engine = make_engine(database_url())
    engine: Engine = state.engine
    return engine


def get_db(engine: Annotated[Engine, Depends(get_engine)]) -> Iterator[OrmSession]:
    """Open a session for one request and close it afterwards (reads only: nothing commits)."""
    with OrmSession(engine) as db:
        yield db


EngineDep = Annotated[Engine, Depends(get_engine)]
DbDep = Annotated[OrmSession, Depends(get_db)]
