"""Run the app for real on this Mac: the API and the built web app, on Henry's own database.

Every start:
1. builds the web app (`npm run build` in web/; skip with --no-build);
2. copies the database, if it exists, to the backup folder (SQLite's online backup, checked with
   `PRAGMA integrity_check`), keeping the newest 30 copies;
3. migrates the database to the latest schema (Alembic);
4. serves the API and the web app on 127.0.0.1 only, so the phone reaches it through
   `tailscale serve` and nothing else can (ADR-0027).

Defaults (M4a plan, Task 8, chosen by Henry on 2026-11-09): database `~/HandData/hands.db`,
backups in iCloud Drive `HandData-backups/`.

Usage (from the repository root):
    uv run --project python python scripts/serve.py
"""

import argparse
import sqlite3
import subprocess
from contextlib import closing
from datetime import datetime
from pathlib import Path

import uvicorn

from review.api.app import create_app
from review.storage import migrate
from review.storage.db import make_engine

REPO = Path(__file__).resolve().parent.parent
WEB = REPO / "web"
DATA_DIR = Path.home() / "HandData"
ICLOUD = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
BACKUP_DIR = ICLOUD / "HandData-backups"
KEEP = 30


def backup(database: Path, folder: Path, keep: int = KEEP) -> Path | None:
    """Copy ``database`` into ``folder`` with a timestamp; keep the newest ``keep`` copies.

    Uses SQLite's online backup API, which copies a consistent snapshot, then checks the copy.
    Returns the copy's path, or ``None`` when there is no database yet.
    """
    if not database.exists():
        return None
    folder.mkdir(parents=True, exist_ok=True)
    # Microseconds too, so two starts in one second never overwrite a copy; names sort by time.
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    target = folder / f"{database.stem}-{stamp}.db"
    # `closing`: a sqlite3 connection used in `with` only commits; it is not closed.
    with closing(sqlite3.connect(database)) as source, closing(sqlite3.connect(target)) as copy:
        source.backup(copy)
        (result,) = copy.execute("PRAGMA integrity_check").fetchone()
    if result != "ok":
        raise SystemExit(f"backup {target} failed its integrity check: {result}")
    copies = sorted(folder.glob(f"{database.stem}-*.db"))
    for old in copies[:-keep]:
        old.unlink()
    return target


def main() -> None:
    """Build, back up, migrate and serve until interrupted (Ctrl-C)."""
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--backup-dir", type=Path, default=BACKUP_DIR)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-build", action="store_true", help="serve web/dist as it is")
    args = parser.parse_args()

    if not args.no_build:
        subprocess.run(["npm", "run", "build"], cwd=WEB, check=True)
    dist = WEB / "dist"
    if not (dist / "index.html").is_file():
        raise SystemExit(f"no built web app in {dist}")
    if args.backup_dir == BACKUP_DIR and not ICLOUD.is_dir():
        raise SystemExit(f"iCloud Drive not found at {ICLOUD}; pass --backup-dir")

    args.data_dir.mkdir(parents=True, exist_ok=True)
    database = args.data_dir / "hands.db"
    copy = backup(database, args.backup_dir)
    print(f"backup: {copy}" if copy else f"backup: none yet ({database} is new)", flush=True)

    url = f"sqlite:///{database}"
    migrate.upgrade(url)
    print(f"database: {database}", flush=True)
    print(f"serving on http://127.0.0.1:{args.port} (Ctrl-C to stop)", flush=True)
    uvicorn.run(create_app(make_engine(url), web_dist=dist), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
