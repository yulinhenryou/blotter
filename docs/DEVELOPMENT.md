# Development

How to set up, check and run every layer locally. CI runs the same commands
(`.github/workflows/`). Versions are pinned in `rust-toolchain.toml`, `python/.python-version`
and `web/.nvmrc`.

## Prerequisites

| Tool | Notes |
|---|---|
| `rustup` | Installs the toolchain pinned in `rust-toolchain.toml` (with `rustfmt`, `clippy`) |
| `uv` | Manages the Python interpreter and dependencies |
| Node.js + npm | Version in `web/.nvmrc`; any later release usually works locally |
| `cargo-deny` | Optional locally (`brew install cargo-deny`); CI always runs it |

On macOS with Homebrew: `brew install rustup uv cargo-deny`. Homebrew's `rustup` is keg-only, so
add its proxies to `PATH` (e.g. in `~/.zprofile`):

```bash
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
```

Make sure `cargo` is on `PATH` before running `uv sync`: if maturin cannot find a Rust toolchain
it bootstraps its own copy in a cache directory instead of using the pinned one.

## First-time setup

```bash
rustup toolchain install          # toolchain from rust-toolchain.toml
cd python && uv sync              # creates .venv, builds the native module review._engine
cd ../web && npm ci
```

## Checks

Run from the repository root unless noted.

### Rust

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo bench --workspace --no-run   # compile benchmarks; run them with `cargo bench`
cargo deny check licenses
```

### Python (in `python/`)

```bash
uv run ruff check
uv run ruff format --check
uv run mypy
uv run pytest
```

`uv run` rebuilds the native module automatically when files under `crates/` change (configured
by `[tool.uv] cache-keys` in `python/pyproject.toml`). To force a rebuild:
`uv sync --reinstall-package <distribution name from pyproject.toml>`.

### Web (in `web/`)

```bash
npm run check:api       # src/api/schema.d.ts is up to date with openapi.json
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

End-to-end tests (Playwright, ADR-0033) run the production build against the real API. The
first time, download the browsers: `npx playwright install chromium webkit`. Then:

```bash
npm run build
npm run e2e
```

`npm run e2e` starts `scripts/e2e_server.py` itself (FastAPI on a fresh temporary SQLite database,
serving `web/dist` and the API on `127.0.0.1:8765`) and stops it at the end; it fails if something
else already listens on that port. A failed test leaves a trace in `web/test-results/`
(`npx playwright show-trace <path>/trace.zip`).

### Repository

```bash
python3 -m unittest discover -s scripts/tests
python3 scripts/check_project_name.py
```

## The API contract

`web/openapi.json` is generated from the FastAPI app and committed. After changing any endpoint
or response model:

```bash
uv run --project python python scripts/export_openapi.py   # regenerate web/openapi.json
cd web && npm run gen:api                                   # regenerate src/api/schema.d.ts
```

A Python test fails if `web/openapi.json` is stale; `npm run check:api` fails if the TypeScript
types are stale.

`web/hand-record.schema.json` is the JSON Schema of the hand record (`review.domain`), for the web
app's offline validation. After changing the record model:

```bash
uv run --project python python scripts/export_hand_record_schema.py
```

A Python test fails if it is stale.

`web/src/rules/fixtures/corpus.json` is the rules corpus: hands and the Python rules' answers
about them, which the TypeScript rules must reproduce (ADR-0028). After changing the betting rules
(`review.domain.rules`, `review.domain.pots`), the test dealer or the worked examples:

```bash
uv run --project python python scripts/export_rules_corpus.py
```

A Python test fails if it is stale; then `cd web && npx vitest run src/rules` shows whether the
TypeScript rules still agree.

## Database

The API and the migrations read the SQLAlchemy URL from `DATABASE_URL`, for example
`sqlite:///data/hands.db` (relative to `python/`). In `python/`:

```bash
DATABASE_URL=sqlite:///data/hands.db uv run alembic upgrade head   # create or migrate
uv run alembic revision --autogenerate --rev-id 0004 -m "what changes"  # next migration
```

A new migration is generated against a database migrated to the previous head, then reviewed by
hand (autogenerate misses some changes, e.g. renames); `test_models_and_migrations_agree` fails
if the models and the migrations differ.

Storage and API tests run on SQLite and, when `TEST_POSTGRES_URL` is set, on PostgreSQL; CI always
runs both (ADR-0025). To run the PostgreSQL ones locally against a server you have:

```bash
TEST_POSTGRES_URL=postgresql+pg8000://USER:PASSWORD@localhost:5432/DB uv run pytest
```

The tests drop and recreate the `public` schema of that database: use a throwaway one.

## Results and plots

Measured outputs live in `docs/results/`, each with the command that produced it in
`docs/results/README.md`. Plotting scripts need the optional `plots` dependency group
(ADR-0022), which `uv sync` does not install:

```bash
uv run --project python --group plots python scripts/plot_leduc_convergence.py docs/results/m1-leduc-convergence.csv docs/results/m1-leduc-convergence.svg
```

## Running the app locally

Two terminals:

```bash
cd python && DATABASE_URL=sqlite:///data/hands.db uv run uvicorn --factory review.api.app:create_app --reload --port 8000
```

```bash
cd web && npm run dev
```

The database must be migrated first (see Database). Without `DATABASE_URL` the app still starts
and serves `/api/v1/health`; the sync and read endpoints then fail with an error naming the
variable.

Open <http://localhost:5173>. The Vite dev server proxies `/api` to port 8000. The page shows the
engine version reported by the Rust crates through the API.

### The production build (offline app)

The Vite dev server does not register the service worker, so installability and offline behavior
are checked on the production build, which FastAPI serves itself when `WEB_DIST_DIR` points at
it (ADR-0031):

```bash
cd web && npm run build
```

```bash
cd python && WEB_DIST_DIR=../web/dist DATABASE_URL=sqlite:///data/hands.db uv run uvicorn --factory review.api.app:create_app --port 8000
```

Open <http://localhost:8000>. Paths under `/api/` reach the API (an unknown one is a JSON 404);
any other unknown path gets `index.html`, so a deep link such as `/capture` opens the app. Once
the page has loaded, the service worker serves the app shell even with the server stopped. A
service worker needs HTTPS or `localhost`; on the phone, HTTPS comes from `tailscale serve`
(ADR-0027, M4a Task 8).

### Icons

The app icons in `web/public/` are drawn by a script (standard library only, no text in the
image):

```bash
python3 scripts/make_icons.py
```

## Use on the phone

The server runs on the Mac and the iPhone reaches it through Tailscale (ADR-0027). Nothing listens
on the local network or the internet: the app binds to `127.0.0.1`, and `tailscale serve` gives
the Mac an HTTPS address that only devices in Henry's tailnet can open. The tailnet must hold only
Henry's own devices: membership is the only access control.

### Once

1. **Tailscale on the Mac.** Install it (Mac App Store or the standalone download from
   tailscale.com) and sign in. The command-line tool: the App Store version has it at
   `/Applications/Tailscale.app/Contents/MacOS/Tailscale`; the standalone version installs
   `/usr/local/bin/tailscale` from Settings → CLI integration.
2. **Tailscale on the iPhone.** Install it from the App Store and sign in with the same account.
3. **Start the server** (see below), then publish it to the tailnet; this setting survives
   reboots until it is turned off:

   ```bash
   tailscale serve --bg --https=443 http://127.0.0.1:8000
   ```

   `tailscale serve status` shows the address, `https://<mac-name>.<tailnet>.ts.net/`. If the
   tailnet does not have HTTPS certificates enabled yet, the command says so and prints the link
   to enable them in the admin console. To stop publishing: `tailscale serve --https=443 off`.
4. **Install the app on the iPhone.** With Tailscale connected, open the address in Safari, then
   Share → Add to Home Screen. Use the app from the Home Screen icon: Safari keeps a Home Screen
   app's storage more readily than a website's, and the capture home says whether the browser
   agreed to keep it ("Storage: …").

### Every time

```bash
uv run --project python python scripts/serve.py
```

It builds the web app, copies the database to the backup folder, migrates it and serves on
`127.0.0.1:8000` until Ctrl-C. Defaults (chosen by Henry, 2026-11-09):

| What | Where |
|---|---|
| Database | `~/HandData/hands.db` (outside the repository) |
| Backups | iCloud Drive, `HandData-backups/hands-<date>-<time>.db`; the newest 30 are kept |

Each backup is SQLite's online copy, checked with `PRAGMA integrity_check`. To restore one: stop
the server, copy the backup over `~/HandData/hands.db`, start again. `--data-dir`, `--backup-dir`,
`--port` and `--no-build` change the defaults (for example, a separate database for a test).

Sync happens only while the Mac is awake and the server running; until then hands wait on the
phone, which can also export them as a file (capture home → "Export unsynced records"). Safari has
no background sync: the app syncs when it is opened, when it comes back online, after a save and
on "Sync now".
