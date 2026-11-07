# Architecture

Status: **draft** (design phase, nothing implemented). Decisions referenced here are recorded as
ADRs in `DECISIONS.md` (all accepted 2026-11-03 unless stated otherwise).

## 1. Overview

Three layers, each in its own directory of one monorepo, each independently buildable and
testable:

```
┌──────────────────────────────────────────────────────────────────────┐
│ web/  TypeScript · React · Vite · PWA                                │
│   capture (offline-first)   review   visualizations   design tokens  │
└───────────────▲──────────────────────────────────────────────────────┘
                │  HTTPS / JSON  (REST, OpenAPI-generated TS types)
┌───────────────┴──────────────────────────────────────────────────────┐
│ python/  review package · FastAPI · NumPy / SciPy / pandas           │
│   api ─ ledger ─ attribution ─ leaks ─ calibration ─ opponents ─     │
│   bankroll ─ storage (SQLAlchemy → SQLite / PostgreSQL)              │
│   engine.py  (the only importer of the native module)                │
└───────────────▲──────────────────────────────────────────────────────┘
                │  in-process call via PyO3 (native module review._engine)
┌───────────────┴──────────────────────────────────────────────────────┐
│ crates/  Rust                                                        │
│   bindings (PyO3 glue only) → solver (trees, CFR, best response)     │
│                             → cards  (cards, ranges, evaluator)      │
└──────────────────────────────────────────────────────────────────────┘
```

Guiding rules:

- **Dependencies point downward only.** Rust knows nothing about Python, storage or HTTP. The
  statistics modules know nothing about HTTP or the database.
- **Each boundary has one owner.** `crates/bindings` is the only Rust code that knows about
  Python; `python/src/review/engine.py` is the only Python code that imports the native module;
  `web/src/api/` is the only front-end code that knows about HTTP.
- **Logic is testable without the layer above.** Rust is tested with `cargo test`; statistics with
  `pytest` on synthetic data; UI with mocked API responses.

## 2. Repository layout

```
.
├── project.json               # canonical display name + tagline (see CLAUDE.md §4)
├── Cargo.toml                 # [workspace] members = crates/*
├── crates/
│   ├── cards/
│   │   ├── src/{card,combo,range,eval,equity}.rs
│   │   └── benches/
│   ├── solver/
│   │   ├── src/
│   │   │   ├── game/          # tabular extensive-form games: kuhn, leduc
│   │   │   ├── cfr/           # regret matching, CFR, CFR+, DCFR (tabular reference)
│   │   │   ├── tree/          # public betting tree, bet-size abstraction
│   │   │   ├── vector/        # vector-form (range vs range) CFR for hold'em subgames
│   │   │   ├── br.rs          # best response, exploitability
│   │   │   └── spec.rs        # serde types: SubgameSpec, SolveResult
│   │   └── benches/
│   └── bindings/              # #[pymodule] _engine; conversion only
├── python/
│   ├── pyproject.toml         # build-backend = maturin; managed with uv
│   ├── src/review/
│   │   ├── _engine.*.so       # built by maturin (not committed)
│   │   ├── _project.py        # DISPLAY_NAME (checked against project.json)
│   │   ├── engine.py          # typed wrapper around _engine
│   │   ├── domain/            # hand record model + validation (Pydantic)
│   │   ├── ledger/            # decision extraction, evaluation orchestration
│   │   ├── attribution/
│   │   ├── leaks/
│   │   ├── calibration/
│   │   ├── opponents/
│   │   ├── bankroll/
│   │   ├── stats/             # shared: shrinkage, multiple testing, intervals
│   │   ├── storage/           # SQLAlchemy models, repositories, Alembic migrations
│   │   └── api/               # FastAPI app, routers, request/response schemas
│   └── tests/
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── api/               # generated types + thin client
│       ├── capture/           # hand entry flow, offline queue
│       ├── review/            # hand replayer, ledger views
│       ├── viz/               # range matrix, EV-vs-size curve, calibration chart
│       └── design/            # tokens, typography, primitives
├── scripts/
└── docs/
```

Python packaging (ADR-0013): one Python distribution built by maturin in
"mixed Rust/Python" mode — `python-source = "src"`, `module-name = "review._engine"`,
`manifest-path = "../crates/bindings/Cargo.toml"`. The distribution name is the project name
(one of the rename locations); the import name is the functional `review`.

## 3. Rust engine

### 3.1 Scope

- Heads-up only. Subgames rooted at the **start of the turn or the river**, given: board, pot,
  effective stack, both players' ranges, who acts first, and a bet-size abstraction.
- Algorithms: CFR+ and Discounted CFR (DCFR); vanilla CFR kept as a reference.
- Outputs: average strategy at every node for every combo, EV of each action for each combo at
  every hero decision node, and exploitability of the returned strategy profile.

### 3.2 Crate `cards`

| Item | Representation (initial) |
|---|---|
| `Card` | `u8` in 0..52 (rank × 4 + suit) |
| `CardSet` | `u64` bitmask (fast intersection = card-removal checks) |
| `Combo` | index in 0..1326 for an unordered pair of distinct cards |
| `Range` | `[f64; 1326]` weights in [0, 1]; parser for standard notation (`AA, AKs, T9s+, 76o`) |
| Evaluator | strength of best 5-of-7 as a totally ordered integer; correctness first |
| Equity | exact enumeration over remaining cards for turn / river; range vs range with card removal |

Evaluator speed matters less than it looks: in a river solve each combo's strength is computed
once per board and the solver then works with a sorted order. Optimizations (lookup tables,
perfect hashing) are considered only if a benchmark shows the evaluator is the bottleneck.

### 3.3 Crate `solver`

Two independent CFR implementations, cross-validated (ADR-0015):

1. **Tabular reference** (`game/`, `cfr/`): a generic extensive-form game trait with explicit
   information sets. Used for Kuhn and Leduc. Small, readable, close to the papers.
2. **Vector-form public-tree CFR** (`tree/`, `vector/`): the tree contains only public actions;
   at each node, each player's state is a vector over combos (reach probabilities, counterfactual
   values). This is how practical hold'em subgame solvers work. It can also solve Leduc, so both
   implementations must agree there.

Key components:

- **Bet-size abstraction**: per street, bet sizes as pot fractions, raise sizes, all-in, raise cap,
  minimum-bet rules. **The line actually played in the reviewed hand is always injected into the
  tree**, so the hero's real bet size is priced directly rather than mapped to a nearby size.
- **Showdown evaluation** in O(N log N) per node via sorting combos by strength and correcting
  for card removal (derivation in `MATH.md` §2.6), instead of O(N²) pairwise comparison.
- **Turn subgames** add one chance node (river card) per turn line; parallelization across river
  cards (e.g. with `rayon`) only after measuring.
- **Best response / exploitability** for any strategy profile, reported in % of pot.
- **Stopping rules**: max iterations, target exploitability, time budget.

### 3.4 Performance practice

- `criterion` benches from M1: CFR iterations on Kuhn/Leduc, evaluator throughput, river and turn
  solves on fixed spots, showdown evaluation.
- Optimization PRs include before/after criterion output from the same machine.
- CI only compiles benches; it does not judge performance (shared runners are noisy).
- No performance numbers in docs unless measured, with machine, commit and command recorded.

## 4. Rust ↔ Python boundary

### 4.1 Interface (initial sketch)

```text
_engine.version() -> str
_engine.solve(spec_json: str) -> SolveHandle            # releases the GIL while running
SolveHandle.result() -> (meta_json: str, arrays: dict[str, numpy.ndarray])
_engine.equity(board, hero_range, villain_range) -> numpy.ndarray   # per-combo equity
_engine.parse_range(text) -> numpy.ndarray[1326]
_engine.evaluate(cards) -> int
```

Design choices (ADR-0004):

- **Specs as versioned JSON** (`schema_version` field). Rust parses with `serde`; Python builds the
  JSON from Pydantic models. One schema, defined in Rust (`spec.rs`), mirrored by a Pydantic model
  and tested for round-trip equality. JSON parsing cost is negligible next to a solve.
- **Bulk numeric results as NumPy arrays** (via the `numpy` crate for PyO3), e.g. per-combo EVs and
  strategies, avoiding millions of Python objects.
- **The GIL is released** during solves so the API stays responsive; solves run in a worker thread
  with progress and cancellation.
- Rust errors map to a small set of Python exceptions (`InvalidSpec`, `SolveFailed`).
- A typed stub (`_engine.pyi`) is maintained so `mypy --strict` covers the boundary.

### 4.2 Example `SubgameSpec`

```json
{
  "schema_version": 1,
  "street": "river",
  "board": ["Ks", "7d", "2c", "Th", "3s"],
  "pot_bb": 20.0,
  "effective_stack_bb": 80.0,
  "first_to_act": "oop",
  "ranges": { "oop": "<1326 weights or range string>", "ip": "<...>" },
  "abstraction": {
    "bet_sizes_pct_pot": [33, 75, 150],
    "raise_sizes_pct_pot": [100],
    "all_in": true,
    "max_raises": 2,
    "forced_lines": [["bet", 6.6], ["raise", 22.0]]
  },
  "stopping": { "max_iterations": 2000, "target_exploitability_pct_pot": 0.5 },
  "algorithm": "dcfr"
}
```

All numbers above are placeholders for illustrating the format, not tuned defaults.

## 5. Python service layer

### 5.1 Module responsibilities

| Module | Responsibility | Depends on |
|---|---|---|
| `domain` | Hand record model, validation (legal action order, chip conservation, card uniqueness), incomplete-information flags | — |
| `engine` | Typed wrapper over `_engine`; builds specs; caches solves by spec hash | `_engine`, `domain` |
| `ledger` | Extract hero decision points from hand records; classify situations; request evaluations; compute EV loss with noise floor | `domain`, `engine` |
| `attribution` | Per-hand and per-session luck/skill decomposition (`MATH.md` §4) | `domain`, `engine` |
| `leaks` | Situation-level hierarchical estimates, FDR control, evidence and sample-size statements (§5) | `stats` |
| `calibration` | Prompt generation, scoring, calibration curves (§6) | `stats` |
| `opponents` | Bayesian opponent models (§7) | `stats` |
| `bankroll` | Win-rate posterior, risk of ruin, Kelly guidance (§8) | `stats` |
| `stats` | Shared statistical utilities | NumPy, SciPy |
| `storage` | ORM models, repositories, migrations | SQLAlchemy, `domain` |
| `api` | HTTP endpoints, auth (when needed), background jobs | everything above |

### 5.2 Bayesian tooling (ADR-0008)

Compared options:

| Option | Strengths | Weaknesses for this project |
|---|---|---|
| Closed-form / empirical Bayes with NumPy + SciPy | Transparent (every formula visible), fast enough for request-time use, no heavy dependencies, ideal for learning the math | Only conjugate or approximate models; must validate approximations ourselves |
| **PyMC** (+ ArviZ) | Pythonic model syntax, mature, extensive docs and case studies, NUTS sampler, good diagnostics through ArviZ | Heavier install; sampling too slow for request-time use; compile step |
| NumPyro (JAX) | Very fast samplers, vectorization | JAX dependency and functional style add a second learning curve; less beginner-friendly docs |
| Stan via CmdStanPy | Gold-standard sampler and diagnostics | A separate modeling language and C++ toolchain — a third language next to Rust and Python |
| Bambi | Formula interface on top of PyMC | Convenient for regression-style models only; less control |

Decision: **two tiers.**

1. **Serving path**: conjugate and empirical-Bayes models implemented directly with NumPy/SciPy
   (Beta-Binomial, Normal-Normal hierarchical with method-of-moments or marginal-likelihood
   hyperparameters). Fast, deterministic, and every line can be derived in `MATH.md`.
2. **Offline modeling and validation**: PyMC + ArviZ for full hierarchical models, posterior
   predictive checks, and for checking that the tier-1 approximations agree with full Bayes on
   synthetic and real data. PyMC is an optional dependency group (`uv sync --group bayes`).

### 5.3 API (initial sketch)

REST under `/api/v1`, JSON, OpenAPI schema generated by FastAPI; the web app's TypeScript types
are generated from it (`openapi-typescript`).

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness, engine version |
| `POST /sessions`, `GET /sessions/{id}` | Session bookkeeping (stakes, buy-in, cash-out, time) |
| `POST /hands`, `GET /hands/{id}`, `PATCH /hands/{id}` | Hand records (idempotent by client-generated ID) |
| `POST /sync` | Batch upload from the offline capture queue |
| `POST /hands/{id}/evaluate` → `GET /jobs/{id}` | Start / poll solver-backed evaluation |
| `GET /ledger` | Decision entries with filters (street, situation class, date range) |
| `GET /attribution/sessions/{id}`, `GET /attribution/summary` | Luck/skill decomposition |
| `GET /leaks` | Leak report with evidence strength and samples needed |
| `GET /calibration/next`, `POST /calibration/responses`, `GET /calibration/report` | Calibration training |
| `GET /opponents/{id}` | Opponent model posterior summaries |
| `GET /bankroll` | Win-rate posterior, risk of ruin, stake guidance |

Long solves are background jobs stored in a `jobs` table and executed by an in-process worker
pool. A separate task queue (Celery, RQ, …) is not needed for a single-user deployment and is
deliberately left out until measurement says otherwise.

## 6. Web application

- **Stack**: React + TypeScript (strict) + Vite. Server state with TanStack Query; routing with
  React Router. (ADR-0007.)
- **Styling**: CSS Modules + design tokens as CSS custom properties; no heavy component library.
  Headless accessible primitives (e.g. Radix) where interaction is complex (dialogs, popovers).
- **Typography**: headings in a Baskerville-style serif (system Baskerville on Apple devices,
  self-hosted Libre Baskerville as fallback, OFL-licensed); body in the system UI font stack;
  every number with `font-variant-numeric: tabular-nums`. Fonts self-hosted so the offline PWA
  renders correctly.
- **Color**: a near-monochrome base, one accent, and a colorblind-safe diverging pair
  (e.g. blue/orange) for EV gain/loss — never red/green alone. WCAG AA contrast at minimum.
- **Visualizations**: React renders SVG; D3 modules (`d3-scale`, `d3-shape`, `d3-array`) do the
  math. This gives full control over the restrained visual style. Planned first components:
  13×13 range matrix with per-combo drill-down; EV-vs-bet-size curve for a decision; calibration
  curve with uncertainty bands.
- **PWA and offline capture**: `vite-plugin-pwa` (Workbox) for installability and asset caching;
  hand records written first to IndexedDB with a client-generated UUID, then synced via
  `POST /sync` when the server is reachable. Capture works with no network.
- **Capture mode shows no analysis.** The capture routes do not fetch or render any EV, strategy
  or opponent-model output (enforced by route structure and an e2e test). This is how the
  post-game-only rule is built into the architecture.
- **Entry speed**: target under 60 seconds for a typical key hand on a phone. Design levers:
  tap-only card picker, position-aware defaults, bet-size chips in bb and pot fractions,
  "unknown" as a first-class value for villain cards and approximate stacks, finish-later drafts.

## 7. Storage and data model (first draft)

### 7.1 Portability rules (SQLite now, PostgreSQL later)

- Access through SQLAlchemy 2.0; schema changes through Alembic migrations (ADR-0006). No raw SQLite-specific SQL in application code.
- Primary keys: UUIDs (UUIDv7, time-ordered) generated by the client where records originate
  offline; SQLAlchemy's `Uuid` type stores them as native `uuid` on PostgreSQL and as 32 hex
  characters (no dashes) on SQLite.
- Enumerations are text columns with a check constraint (`Enum(native_enum=False)`), not
  PostgreSQL enum types, so migrations never have to create, alter or drop types.
- Constraint names follow one naming convention (`review.storage.models`), so a migration can
  refer to a constraint by name on either backend.
- SQLite enforces foreign keys only when asked; every connection turns them on
  (`review.storage.db.make_engine`).
- A violated constraint (foreign key, unique, check, not null) is a SQLAlchemy `IntegrityError`
  on both backends. pg8000 reports only unique violations that way, so `make_engine` maps the
  rest of SQLSTATE class 23 to it (found in M3a Task 3's first PostgreSQL run).
- Money: integer chip amounts in the smallest unit of the session's stakes; the big blind size
  is stored per session so bb values are derived, never stored as the primary truth.
- Times: UTC, timezone-aware; the venue's timezone stored separately. SQLite drops the zone, so
  the `UTCDateTime` column type converts to UTC on write, attaches UTC on read and refuses naive
  values.
- Semi-structured data (solver outputs, abstraction configs) in SQLAlchemy `JSON` columns (JSONB
  on PostgreSQL), never queried by inner fields in hot paths; anything we filter on is a column.
- Cards as canonical text (`"Ks"`), boards as ordered text, validated in `domain`.
- CI runs the migration suite against both SQLite and PostgreSQL from M3a (ADR-0025).
- The database URL comes from `DATABASE_URL`; there is no default location for real data.

### 7.2 Entities

```
players ─┐                         venues
         │                           │
         ├── hand_seats ──── hands ── sessions
         │                   │  │
         │        actions ───┘  └── decision_points ── evaluations ── evaluation_actions
         │                                  │               │
         │                                  │             solves (cache by spec hash)
         │                                  └── calibration_responses
         └── opponent_observations
```

Tables marked *(M3a)* exist (migration `0001`, `review.storage.models`); the others are drafts.
Every table that the phone syncs has a `revision` column (sync semantics: M3a plan, D3).
A hand is stored as its canonical record (§7.3) in `hands`, `hand_seats` and `actions`, and nothing
else; `review.storage.repository` maps it both ways and applies the revision rules.

| Table | Key columns |
|---|---|
| `venues` *(M3a)* | id, revision, name, kind (`live`/`online`), timezone (IANA name) |
| `sessions` *(M3a)* | id, revision, venue_id, started_at, ended_at, small_blind_chips, big_blind_chips, currency (ISO 4217), chip_unit_minor (one chip in the currency's minor unit), buy_in_chips, cash_out_chips, notes |
| `players` *(M3a)* | id, revision, display_name, is_hero, notes (private) |
| `hands` *(M3a)* | id, revision, session_id, client_seq (unique per session), schema_version, played_at, record_reason, source (`manual`/`import`), table_size, button_seat, hero_seat, small_blind_chips, big_blind_chips, straddles_chips (JSON list), ante_kind, ante_chips, board_flop (`"Ks7d2c"`), board_turn, board_river; derived: rake_chips, hero_net_chips, villain_cards_unknown, stacks_approximate, amounts_approximate |
| `hand_seats` *(M3a)* | hand_id, seat, player_id (nullable), starting_stack_chips, stack_approximate, hole_cards (`"AsKd"`, nullable), showed, won_chips. One row per dealt-in seat |
| `actions` *(M3a)* | hand_id, seq, street, seat (→ `hand_seats`), kind (`post_ante`/`post_small_blind`/`post_big_blind`/`post_straddle`/`fold`/`check`/`call`/`bet`/`raise`), amount_to_chips (total on this street), ante_chips, all_in, amount_approximate |
| `decision_points` | id, hand_id, action_seq, street, situation key columns (pot_type, hero_position, in_position, line, spr_bucket, facing_size_bucket, texture_class), scorable (bool), unscored_reason |
| `solves` | id, spec_hash (unique), spec (JSON), engine_version, algorithm, iterations, exploitability_pct_pot, status, created_at, result_blob_ref |
| `evaluations` | id, decision_point_id, solve_id, reference (`equilibrium`/`opponent_model`), hero_combo, chosen_action, best_action, ev_loss_bb, noise_floor_bb, robust_to_ranges (nullable bool) |
| `evaluation_actions` | evaluation_id, action_label, size_pct_pot, ev_bb, equilibrium_frequency |
| `attributions` | id, hand_id, method (versioned), luck_bb, hero_skill_bb, villain_skill_bb, components (JSON per street) |
| `calibration_responses` | id, decision_point_id, question_kind, user_answer, user_confidence, locked_at, model_answer, resolution (`model`/`showdown`), revealed_at |
| `opponent_observations` | player_id, hand_id, stat_key, opportunity (bool), occurred (bool) |
| `range_presets` | id, name, description, weights (JSON), version |
| `jobs` | id, kind, status, progress, payload_ref, error |

`record_reason` exists because live records are a selected sample (see `MATH.md` §4.5); it lets the
analysis condition on why a hand was logged.

### 7.3 Hand record format

The canonical hand record is a versioned JSON document (Pydantic model in `domain`, JSON Schema
exported for the web app), used by capture, sync and import alike. Relational tables are a
projection of it. Validation rejects impossible records (duplicate cards, illegal action order,
chip creation) but accepts incomplete ones, recording what is missing.

Version 1 (M3a; scope in ADR-0024, rules in `MATH.md` §1.5). Amounts are integer chips in the
session's smallest unit (ADR-0012). Fields marked *derived* are computed by the server and are
ignored if sent.

**Hand**

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | `1` | Record format version |
| `id` | UUIDv7 | Generated by the client when the hand is created |
| `revision` | int ≥ 1 | Incremented by the client on every edit after the first sync (sync semantics: M3a plan, D3) |
| `session_id` | UUIDv7 | The session the hand belongs to |
| `client_seq` | int ≥ 0 | Order of the hand within its session, unique per session |
| `played_at` | UTC timestamp or `null` | When the hand was played, if known |
| `record_reason` | `notable` / `routine` / `random_sample` | Why the hand was logged (`MATH.md` §4.5) |
| `source` | `manual` | `import` is reserved for a later milestone |
| `stakes` | object | `small_blind_chips`, `big_blind_chips`, `straddles_chips` (list, in posting order), `ante` (`null`, or `{kind: per_player \| big_blind, chips}`) |
| `table_size` | 2–10 | Number of seats at the table |
| `dealt_in_seats` | list of seat numbers | Seats dealt into this hand; at least 2 |
| `button_seat` | seat number | Must be dealt in (dead buttons are not in version 1) |
| `hero_seat` | seat number | Hero's seat; must be in `seats` with known hole cards |
| `seats` | list | One entry per seat that matters (below); others are implied |
| `board` | object | `flop` (3 cards or `null`), `turn`, `river` (a card or `null`) |
| `actions` | list | In order (below) |
| `results` | list | `{seat, won_chips ≥ 1}` per seat that won chips; omitted seats won 0; at least one entry |
| `completeness` | object, *derived* | `villain_cards_unknown`, `stacks_approximate`, `amounts_approximate` |
| `rake_chips`, `hero_net_chips` | int, *derived* | `MATH.md` §1.5, results and conservation |

**Seat entry**

| Field | Type | Meaning |
|---|---|---|
| `seat` | seat number | Must be dealt in |
| `player_id` | UUIDv7 or `null` | A known player (hero, a regular), or anonymous |
| `starting_stack_chips` | int or `null` | `null` = unknown. If the seat is all-in and the stack is unknown, the stack is derived as its total committed |
| `stack_approximate` | bool | The stack is an estimate |
| `hole_cards` | two cards or `null` | `null` = not seen |
| `showed` | bool | The cards were shown at the table (not just known to hero) |

**Action**

| Field | Type | Meaning |
|---|---|---|
| `street` | `preflop` / `flop` / `turn` / `river` | |
| `seat` | seat number | |
| `kind` | `post_small_blind` / `post_big_blind` / `post_straddle` / `post_ante` / `fold` / `check` / `call` / `bet` / `raise` | |
| `amount_to_chips` | int or `null` | For posts (except antes), calls, bets and raises: the seat's total committed on this street after the action ($x_i$ of `MATH.md` §1.5). `null` for fold and check. May be left `null` for a call: it is then the current bet, or the whole stack if `all_in` |
| `ante_chips` | int or `null` | For `post_ante` only |
| `all_in` | bool | The action put the seat all-in; checked against the stack when it is known, and the only source when it is not (forced bets included) |
| `amount_approximate` | bool | The amount is an estimate |

**Invalid vs. incomplete.** A record is *invalid* — rejected, with each error pointing at a field
path such as `actions[7].amount_to_chips` — if it contradicts itself or the rules of `MATH.md` §1.5:
a card used twice, a malformed card, an action out of turn or not legal at that point, a raise below
the minimum or without raise rights, a total above a known stack, a missing board card on a street
that was reached, results that are not feasible or a negative rake. A record is *incomplete* —
accepted, and flagged — when something is unknown or estimated: villain hole cards `null`, stacks
`null` or approximate, amounts approximate. Approximation flags say how the record relates to what
happened at the table; they never excuse an internal contradiction: approximate amounts must still
add up.

**Implicit seats and folds.** To keep entry short, the input may leave out (a) the forced posts,
which are then derived from `stakes`, the button and `dealt_in_seats`, and (b) seats that never
put chips in voluntarily and folded preflop when it was first their turn, facing a bet. Such seats
need no entry in `seats` and no actions; canonicalization inserts their folds. A seat that could
have checked at its turn (the big blind's option, a straddler's) must have its action entered, and
a seat with any entered action must have all its actions entered; hero's actions are always
entered. Forced posts are either all left out or all given, before any other action and in the
order of `MATH.md` §1.5 (antes, small blind, big blind, straddles). What the server stores and
returns is the **canonical** record, with every seat, post and fold explicit, seats and results
sorted by seat; canonicalizing a canonical record changes nothing.

`completeness.villain_cards_unknown` is true when some non-folded villain at the end of the hand
has `null` hole cards. `stacks_approximate` is true when some *involved* seat — hero, a seat that
called, bet or raised, or a seat that acted after the flop — has a `null` stack (not derived) or an
approximate one; stacks of seats that only posted or folded preflop do not matter for analysis.
`amounts_approximate` is true when some action is approximate.

## 8. Deployment model (to be decided in M4a)

Single user, local-first. The open question is how the phone reaches the server for sync and
review: (a) server on a home computer reached over a private network (e.g. Tailscale), or (b) a
small hosted instance with authentication. Capture is offline-first in both cases. This decision is
deferred to M4a and will be an ADR.

## 9. Engineering

- **Monorepo**, three independent toolchains: Cargo workspace, uv project, npm package.
- **CI (GitHub Actions)**, one workflow per layer, path-filtered, plus a small repo-level workflow:
  - Rust: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`,
    `cargo bench --no-run`, `cargo deny check licenses` (guards against accidentally adding
    AGPL dependencies).
  - Python: `uv sync`, maturin build of the native module, `ruff check`, `ruff format --check`,
    `mypy --strict`, `pytest`.
  - Web: `npm ci`, `eslint`, `tsc --noEmit`, `vitest run`, `vite build`.
  - Repo: project-name check (`scripts/check_project_name.py`), docs link check (optional).
- **Formatting**: rustfmt, ruff format, Prettier.
- **Pre-commit hooks** optional and local; CI is the source of truth.

## 10. Alternatives considered (summary)

| Topic | Chosen | Alternative | Why not (for now) |
|---|---|---|---|
| ORM / migrations | SQLAlchemy 2 + Alembic | SQLModel; raw SQL | SQLModel is thinner but younger; raw SQL makes the PostgreSQL migration harder |
| Data frames | pandas (as specified) | Polars | Data volumes are small (thousands of decisions); pandas is more familiar and enough |
| Type checker | mypy (as specified) | pyright | Either works; mypy is specified, no reason to switch |
| Visualization | D3 modules + React SVG | visx, Observable Plot, Recharts | Higher-level libraries make the restrained custom style harder; visx is a reasonable fallback |
| Package manager (web) | npm | pnpm | pnpm is faster, but npm is one less tool to learn |
| Task queue | in-process worker | Celery / RQ / Arq | Single user; adds infrastructure without measured need |
