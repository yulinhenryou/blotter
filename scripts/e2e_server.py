"""Serve the API and the built web app on a fresh, temporary SQLite database.

Used by the end-to-end tests (web/playwright.config.ts starts it); each run starts from an empty
database, migrated with Alembic, which is deleted when the server stops.

Usage (from the repository root, after `npm run build` in web/):
    uv run --project python python scripts/e2e_server.py --port 8765
"""

import argparse
import tempfile
from pathlib import Path

import uvicorn

from review.api.app import create_app
from review.storage import migrate
from review.storage.db import make_engine

WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"


def main() -> None:
    """Migrate a temporary database and serve the app on 127.0.0.1 until interrupted."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--web-dist", type=Path, default=WEB_DIST)
    args = parser.parse_args()
    if not (args.web_dist / "index.html").is_file():
        raise SystemExit(f"no built web app in {args.web_dist}: run `npm run build` in web/")
    with tempfile.TemporaryDirectory() as tmp:
        url = f"sqlite:///{tmp}/e2e.db"
        migrate.upgrade(url)
        app = create_app(make_engine(url), web_dist=args.web_dist)
        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
