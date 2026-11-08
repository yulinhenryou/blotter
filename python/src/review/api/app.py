"""FastAPI application factory.

Run locally with ``uv run uvicorn --factory review.api.app:create_app --reload``.
"""

from typing import Literal

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel
from sqlalchemy import Engine

from review import engine
from review._project import DISPLAY_NAME
from review.api import read, sync

API_PREFIX = "/api/v1"
API_VERSION = "1"


class Health(BaseModel):
    """Response body of ``GET /api/v1/health``."""

    status: Literal["ok"]
    engine_version: str


router = APIRouter(prefix=API_PREFIX)


@router.get("/health")
def health() -> Health:
    """Report liveness and the version of the Rust engine behind the API."""
    return Health(status="ok", engine_version=engine.engine_version())


def create_app(database: Engine | None = None) -> FastAPI:
    """Build the FastAPI application.

    Parameters
    ----------
    database
        The engine to use. Without one, it is created from ``DATABASE_URL`` on the first request
        that needs it (``review.api.deps``), so building the app needs no database.

    Returns
    -------
    FastAPI
        The application with all routers mounted.
    """
    app = FastAPI(title=f"{DISPLAY_NAME} API", version=API_VERSION)
    app.state.engine = database
    app.include_router(router)
    app.include_router(sync.router, prefix=API_PREFIX)
    app.include_router(read.router, prefix=API_PREFIX)
    return app
