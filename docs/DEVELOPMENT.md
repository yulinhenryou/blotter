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
cd python && uv run uvicorn --factory review.api.app:create_app --reload --port 8000
```

```bash
cd web && npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to port 8000. The page shows the
engine version reported by the Rust crates through the API.
