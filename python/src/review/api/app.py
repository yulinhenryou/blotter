"""FastAPI application factory.

Run locally with ``uv run uvicorn --factory review.api.app:create_app --reload``.

With ``WEB_DIST_DIR`` set to a built web app (``web/dist``), the same process serves it at ``/``,
so the phone talks to one origin for the app and the API (``docs/ARCHITECTURE.md`` §8).
"""

import os
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel
from sqlalchemy import Engine
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from review import engine
from review._project import DISPLAY_NAME
from review.api import read, sync

API_PREFIX = "/api/v1"
API_VERSION = "1"
WEB_DIST_ENV = "WEB_DIST_DIR"


class Health(BaseModel):
    """Response body of ``GET /api/v1/health``."""

    status: Literal["ok"]
    engine_version: str


router = APIRouter(prefix=API_PREFIX)


@router.get("/health")
def health() -> Health:
    """Report liveness and the version of the Rust engine behind the API."""
    return Health(status="ok", engine_version=engine.engine_version())


class WebApp(StaticFiles):
    """The built web app, with ``index.html`` for paths that are not files.

    The app's own routes (``/capture``, ...) then load on a reload or from a bookmark; paths under
    ``/api`` never get the app.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        """Serve the file at ``path``, or the app's ``index.html`` if there is none."""
        try:
            return await super().get_response(path, scope)
        except HTTPException as error:
            if error.status_code != 404 or path == "api" or path.startswith("api/"):
                raise
            return await super().get_response("index.html", scope)


def create_app(database: Engine | None = None, web_dist: Path | None = None) -> FastAPI:
    """Build the FastAPI application.

    Parameters
    ----------
    database
        The engine to use. Without one, it is created from ``DATABASE_URL`` on the first request
        that needs it (``review.api.deps``), so building the app needs no database.
    web_dist
        A built web app to serve at ``/``. Without one, ``WEB_DIST_DIR`` is used if set;
        otherwise only the API is served.

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
    if web_dist is None and os.environ.get(WEB_DIST_ENV):
        web_dist = Path(os.environ[WEB_DIST_ENV])
    if web_dist is not None:
        # Mounted last: the API routes above match first.
        app.mount("/", WebApp(directory=web_dist, html=True), name="web")
    return app
