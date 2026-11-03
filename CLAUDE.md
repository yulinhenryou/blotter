# CLAUDE.md

Guidance for every Claude session working in this repository. Read this file first, then the
relevant document under `docs/`.

> **The project name "Blotter" is provisional.** It may change. Follow the naming rules below so
> that a rename touches only the locations listed in the rename checklist.

## 1. What this project is

**A trading blotter for your poker decisions.** Traders record every trade on a blotter and later
run P&L attribution: how much of the result came from real edge and how much from noise. This
project does the same for poker decisions.

It is **not** another GTO solver. Mature open-source solvers (TexasSolver, postflop-solver and its
GUIs) and commercial review tools already exist. Here the solver is only the EV engine underneath;
the product is **statistical attribution and the measurement of decision quality**.

Five pillars (details in `docs/VISION.md`):

1. **Decision Ledger** – every decision recorded like a trade: situation, available actions, EV of
   each action, the action taken, EV loss in bb.
2. **Luck/Skill Attribution** – split each hand's and session's result into decision EV and
   card variance, using published methods (formulas and sources in `docs/MATH.md`).
3. **Statistically Honest Leak Detection** – situation-level leaks estimated with hierarchical /
   empirical Bayes shrinkage, multiple-comparison control (e.g. Benjamini–Hochberg), evidence
   strength, and "how many more samples are needed".
4. **Calibration Training** – the user commits a judgment before the model answer is revealed;
   Brier score and calibration curves track intuition over time.
5. **Risk-Aware Exploitation & Bankroll** – Bayesian opponent models with credible intervals;
   deviation from equilibrium only with strong evidence plus a stated cost-if-wrong; bankroll
   advice from the posterior of the win rate, not a point estimate.

The product is **live-first**: manual entry of a key hand must be fast (target: under 60 seconds
on a phone) and must allow incomplete information (e.g. unseen villain cards).

The first real user is **Henry**, a live and online No-Limit Hold'em player (about two years of
experience; has read *The Theory of Poker* and *Modern Poker Theory*), who will use it to review
their own hands. Henry knows Python, Java and JavaScript well and is **new to Rust**.

**Current status:** design documents only. No feature code exists yet. Next milestone: M0,
planned in `docs/plans/M0.md`. See `docs/ROADMAP.md`.

## 2. Core principles (non-negotiable)

1. **Never fabricate results.** No invented benchmark numbers, convergence figures, accuracy
   claims or test outcomes — not in code comments, docs, commit messages or chat. README and docs
   state only facts verified by a test or a reproducible run (record the command and commit).
   If something has not been measured, say "not yet measured".
2. **Statistical honesty over impressive output.** Every estimate carries its uncertainty and its
   provenance (which ranges, abstraction, solver version, convergence achieved). Prefer
   "insufficient evidence" to a false positive. Every statistical method is validated on
   synthetic data with known ground truth before it is applied to real data.
3. **Post-game only. No real-time assistance (RTA).** Nothing in this project may be designed to
   give advice during a live hand. The capture (hand entry) flow never displays solver output,
   EVs, or strategy hints.
4. **Measure before optimizing.** Performance work must be motivated by a criterion benchmark or
   profile, and the before/after measurement goes in the PR description.
5. **Correctness has external anchors.** Kuhn poker value −1/18, Leduc exploitability convergence,
   comparison with independent solvers on fixed spots (see §8).
6. **License hygiene.** The project is dual-licensed MIT OR Apache-2.0 (ADR-0014); only add
   dependencies whose licenses are compatible with that (no GPL / LGPL / AGPL). Reference solvers (TexasSolver, postflop-solver; both AGPL-3.0) are used
   only as external test oracles, run as separate programs. Never copy, vendor, link or transcribe
   their code. Implement algorithms from the papers cited in `docs/MATH.md`.
7. **Stable technical direction.** The stack in §5 is decided. Do not switch libraries,
   frameworks or architecture on your own. If a change of direction seems necessary, **stop and
   ask Henry first**, then record the outcome as an ADR in `docs/DECISIONS.md`.

## 3. Communication conventions

- **Reply to Henry in Chinese** — all conversation, explanations, plans and summaries.
- **Repository content is in English**: README, everything under `docs/`, code comments,
  docstrings, commit messages, identifiers.
- **Teach, don't just ship.** Henry wants to understand every piece of math and key code:
  - For derivations and core algorithms, explain the principle first, then write code; walk
    through it line by line when it is non-trivial.
  - For Rust, additionally explain the language mechanics the code relies on — ownership,
    borrowing, lifetimes, traits/generics, `Copy` vs `Clone`, slices, iterators, error handling
    with `Result`, `unsafe` (avoid) — *as they apply to the code at hand*, not in the abstract.
  - Keep explanations at the level of someone fluent in Python/Java/JS.
- Before large changes, state the plan briefly; after them, summarize what changed and what is
  not yet verified.
- When a decision belongs to Henry (scope, direction, trade-offs), ask instead of assuming.

## 4. Naming rules and rename checklist

### Rules

- The project name is defined centrally in a few places only (listed below). Do not hard-code it
  anywhere else — not in identifiers, module names, environment-variable prefixes, database file
  names, log messages or UI strings (UI strings read it from the central definition).
- Internal modules, crates, types and functions are named **by function**: `cards`, `solver`,
  `ledger`, `attribution`, `leaks`, `calibration`, `opponents`, `bankroll`, `storage`, `api`.
  Never prefix them with the project name.
- In prose documentation, prefer "the project" / "the product" over the name, except in titles
  and the opening of README / VISION.
- From M0 onward, a CI check (`scripts/check_project_name.py`, planned) fails the build if the
  name appears outside the allowed locations.

### Rename checklist

Locations that **currently** contain the name (design-documents phase):

| Location | What |
|---|---|
| `CLAUDE.md` | This notice and checklist |
| `README.md` | Title and opening paragraph |
| `docs/VISION.md` | Title and opening paragraph |
| `docs/DECISIONS.md` | ADR-0011 (naming policy), which must mention the name |
| Local folder `~/Desktop/Blotter`, future GitHub repository name | Outside the code |

Locations **planned** for M0 (update this table when they are created):

| Location | What |
|---|---|
| `project.json` (repo root) | Canonical display name and tagline. Single source of truth for the web app (index.html title, PWA manifest) via the Vite config |
| `python/pyproject.toml` → `[project].name` | Python distribution name (lower case). The import package is `review`, not the project name |
| `python/src/review/_project.py` | `DISPLAY_NAME` constant used by the API (e.g. OpenAPI title); checked against `project.json` by CI |
| `web/package.json` → `name` | npm package name (lower case) |
| `python/uv.lock`, `web/package-lock.json` | Lock files repeat the package names; regenerated, not hand-edited |
| `Cargo.toml` (workspace) | **No occurrence by design** — crates are named `cards`, `solver`, `bindings` |

Note: the tagline "A trading blotter for your poker decisions" uses *blotter* as a common noun.
On a rename, decide separately whether to keep the tagline. To audit:
`grep -rni blotter . --exclude-dir={.git,node_modules,target,.venv}`.

## 5. Technology stack (decided)

| Layer | Choice |
|---|---|
| EV engine | Rust (edition 2024): hand evaluation, range representation, game-tree building, CFR+ / Discounted CFR; heads-up turn and river subgames with a limited bet-size abstraction. Benchmarks with `criterion` from day one |
| Bridge | PyO3 + maturin; native module `review._engine` |
| Statistics & service | Python, uv for dependencies; NumPy, SciPy, pandas; FastAPI for the HTTP API. Bayesian tooling (ADR-0008): closed-form / empirical Bayes in NumPy/SciPy for the serving path; PyMC + ArviZ (optional dependency group) for offline modeling and validation |
| Storage | SQLite first; schema kept portable to PostgreSQL via SQLAlchemy 2 + Alembic (ADR-0006) |
| Front end | TypeScript + React + Vite; responsive web app, installable PWA with offline capture |
| Repo / CI | Monorepo; GitHub Actions running tests and lint for all three parts: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`; `ruff`, `mypy`, `pytest`; `eslint`, `tsc`, tests |

Rationale and alternatives: `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`.

## 6. Repository layout (planned, created in M0)

```
.
├── CLAUDE.md  README.md  LICENSE-MIT  LICENSE-APACHE  project.json
├── Cargo.toml                 # Rust workspace
├── crates/
│   ├── cards/                 # cards, combos, ranges, hand evaluator, equity
│   ├── solver/                # games, trees, CFR variants, best response
│   └── bindings/              # PyO3 layer only; no logic
├── python/
│   ├── pyproject.toml         # maturin build backend, uv-managed
│   ├── src/review/            # ledger, attribution, leaks, calibration, opponents,
│   │                          # bankroll, storage, api, engine wrapper
│   └── tests/
├── web/                       # Vite + React + TS app
├── scripts/                   # repo tooling (name check, plot generation)
├── docs/                      # VISION, ARCHITECTURE, MATH, ROADMAP, DECISIONS
│   └── plans/                 # per-milestone implementation plans
└── .github/workflows/
```

## 7. Code conventions

**General**
- Small, reviewable changes. Each PR states what was tested and how.
- Units are explicit in names or types: `_bb`, `_chips`, `_pct_pot`. Chip amounts are stored as
  integers in the smallest unit of the stakes; analysis is in big blinds (bb).
- Every EV number stored or displayed must be traceable to its inputs (solve spec hash, engine
  version, ranges, abstraction, achieved exploitability).

**Rust**
- `cargo fmt`; `cargo clippy --all-targets -- -D warnings` must pass.
- No `unsafe` unless a benchmark proves the need; then a `// SAFETY:` comment and a test.
- Library errors via `Result` with typed errors; no `unwrap()` / `expect()` in library code
  except where an invariant is documented in a comment.
- Doc comments (`///`) on all public items, including the math they implement and a reference.
- `crates/bindings` only converts types; all logic lives in `cards` / `solver`.
- Numeric precision: `f64` by default; any switch to `f32` must be justified by a measurement.

**Python**
- Python version pinned in M0. `ruff check`, `ruff format`, `mypy --strict` clean.
- Type hints everywhere; NumPy-style docstrings; formulas in docstrings reference `docs/MATH.md`
  section numbers.
- Pure modules (`ledger`, `attribution`, `leaks`, `calibration`, `opponents`, `bankroll`) do not
  import `storage` or `api`. Only `review/engine.py` imports `review._engine`.
- Randomness always through an explicit `numpy.random.Generator` with a seed parameter.

**TypeScript**
- `strict: true`; `eslint` clean; Prettier formatting.
- API types are generated from the FastAPI OpenAPI schema, never hand-written.
- Design tokens (color, spacing, type) as CSS custom properties; numbers use
  `font-variant-numeric: tabular-nums`.

## 8. Testing requirements

- **Rust:** unit tests per module; property tests (`proptest`) for invariants (e.g. strategy
  rows sum to 1, chip conservation, evaluator ordering); known-value tests:
  - Kuhn poker: first player's game value converges to −1/18; exploitability → 0.
  - Leduc Hold'em: exploitability decreases with iterations; the convergence plot is generated
    by a script from real runs and committed with the command and commit hash.
  - Hand evaluator: exhaustive 5-card category counts (2,598,960 hands).
  - Two independent CFR implementations (tabular reference vs vector-form) agree on Leduc.
  - Fixed river/turn spots compared with an independent open-source solver run externally;
    expected outputs stored as fixtures with their provenance.
- **Benchmarks:** `criterion` benches exist for every hot path; CI compiles them
  (`cargo bench --no-run`) but performance numbers are recorded only from local, documented runs.
- **Python:** `pytest` + `hypothesis`. Every statistical method gets a simulation test with known
  truth (interval coverage near nominal, FDR controlled at the stated level, shrinkage reduces
  error). Tests use fixed seeds.
- **Web:** component tests (Vitest + Testing Library); end-to-end test of the capture flow
  (Playwright) from M4a.
- **Migrations:** from M3a, migrations are tested against both SQLite and PostgreSQL in CI.
- A failing test is reported as failing, with its output. Never weaken a test to make it pass
  without saying so explicitly.

## 9. Workflow notes

- Significant decisions → new ADR in `docs/DECISIONS.md` (status Proposed → Accepted by Henry).
- Keep `docs/` in sync with the code in the same PR.
- Math first: a new algorithm gets its `docs/MATH.md` section (derivation done together with
  Henry) before or alongside its implementation.
