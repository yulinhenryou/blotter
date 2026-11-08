# M3a plan — Hand record format and storage (Python, no solver)

Status: **accepted (2026-11-07)**; D1–D5 decided as recommended (§0.1). Acceptance criteria:
`ROADMAP.md` → M3a. Progress: Tasks 1–5 merged; Task 6 in review.

M3a gives captured hands a durable, validated home that the phone (M4a) can sync into. Nothing in
it calls the engine: every decision point is stored unscored, with the reason "engine not
available". What M3a must get right is the *record*: a hand that is impossible is rejected with a
precise error, a hand that is merely incomplete is accepted and says what is missing, and nothing
is lost between the JSON document, the database rows and back.

The order mirrors M1: **rules before code.** The no-limit betting rules and the pot accounting are
written down and checked by hand first (Task 1); the validator, the generator of random legal hands
used by the property tests, and the decision-point extractor all implement that one description.

---

## 0. Before starting

### 0.1 Decisions (made by Henry, 2026-11-07)

Decided: **D1 = (a), D2 = (a), D3 = (a), D4 = (a), D5 = (a).** D1 is recorded as an ADR in
Task 1, D2 in Task 3, D3 in Task 6.

| # | Decision | Options (chosen option first) | Blocks |
|---|---|---|---|
| D1 | Game formats that record version 1 must represent | **(a)** No-limit hold'em cash games, 2–10 seats: small and big blind, any number of straddles, optional antes (per player or big-blind ante); rake derived from the pot. Not in v1: run-it-twice, bomb pots, tournaments, other games — each can be added later behind a new `schema_version`. **(b)** as (a) plus run-it-twice (several boards, split results) | Task 1 |
| D2 | PostgreSQL driver and where PostgreSQL tests run | **(a)** `pg8000` (BSD-3-Clause; synchronous, a supported SQLAlchemy dialect) as a dev-dependency; PostgreSQL tests run in CI against a service container; locally they are skipped unless a test database URL is set, and CI sets a flag that turns the skip into a failure. **(b)** as (a), and also install PostgreSQL locally with Homebrew so every test runs on the laptop | Task 3 |
| D3 | Write path and sync semantics | **(a)** One write path: `POST /sync` with a batch of venues, sessions, players and hands. Each record carries a client-generated UUIDv7 and an integer `revision`. Same id, same revision, same content → no-op; higher revision → replace; same revision with different content, or a lower revision → a per-item conflict, that item unchanged, the rest of the batch applied. Read endpoints are `GET` only. **(b)** `POST /sync` plus per-resource `POST` / `PATCH` as in the `ARCHITECTURE.md` §5.3 sketch | Task 6 |
| D4 | Situation-class definitions (positions, SPR buckets, facing-size buckets, board texture) | **(a)** Set together in Task 5, starting from a proposal; the classifier is versioned, so changing a boundary later means recomputing, not migrating. **(b)** Only street, pot type, position, in/out of position and line in M3a; buckets and texture deferred to M5, when the leak model needs them | Task 5 |
| D5 | Review cadence | **(a)** As in M1: one PR per task below; each waits for Henry's review and merge. **(b)** Claude merges when CI is green; Henry reviews afterwards | all |

Licenses checked on PyPI on 2026-11-07: `psycopg` (LGPL-3.0-only) and `psycopg2` (LGPL) are
excluded by `CLAUDE.md` §2.6, which is why D2 names `pg8000`; `asyncpg` (Apache-2.0) would force
the async SQLAlchemy API on the whole storage layer for one test backend.

New Python dependencies in M3a (versions pinned when added and recorded in an ADR, as in M0/M1):

| Package | License (PyPI, 2026-11-07) | Group | Why |
|---|---|---|---|
| `sqlalchemy` | MIT | runtime | ORM and SQL portability (ADR-0006) |
| `alembic` | MIT | runtime | Migrations (ADR-0006) |
| `pg8000` | BSD-3-Clause | dev | PostgreSQL in the test suite (D2) |

`pydantic` is already installed through FastAPI and is imported directly; it becomes an explicit
dependency. UUIDv7 comes from the standard library (`uuid.uuid7`, checked on the project's Python
3.15.2), so no package is needed for it.

Local state checked on 2026-11-07: no PostgreSQL server and no Docker on Henry's machine — hence
the CI-first default in D2.

### 0.2 Rules of engagement for every task

1. The rules or the math for the task are worked out together in the session first and land in
   the docs in the same PR as the code.
2. Then the code, explained where it is non-trivial. Henry knows Python well, so explanations
   focus on what is new here: Pydantic v2 validation, SQLAlchemy 2's typed ORM, Alembic, FastAPI
   dependencies and transactions, Hypothesis strategies.
3. Every number in a test or a doc is derived by hand (and the derivation is in the docs) or
   measured by a committed command.

---

## 1. Design

### 1.1 Modules (`python/src/review/`)

```
domain/
├── cards.py          # Card, Board: canonical text ("Ks"), parsing, uniqueness
├── record.py         # HandRecord and its parts (Pydantic), schema_version
├── rules.py          # NLHE betting state machine: whose turn, legal actions, min raise
├── pots.py           # contributions, uncalled bets, main and side pots, eligibility
├── validate.py       # replay a record through rules + pots; collect issues with field paths
└── canonical.py      # fill implicit folds and derived fields; the stored form
ledger/
├── decisions.py      # extract hero decision points from a canonical record
└── situations.py     # situation keys (versioned classifier)
storage/
├── models.py         # SQLAlchemy 2 typed models (Mapped[...])
├── types.py          # portable UUID column
├── repository.py     # record <-> rows, upsert by (id, revision)
└── migrations/       # Alembic environment and versions
api/
├── app.py            # existing; mounts the new routers
├── sync.py           # POST /sync
└── read.py           # GET sessions, hands, decision points
```

Dependency direction (`ARCHITECTURE.md` §5.1, `CLAUDE.md` §7): `domain` imports nothing from the
project; `ledger` imports `domain`; `storage` imports `domain` and `ledger`; `api` imports all
three. `ledger` never imports `storage` or `api`.

### 1.2 The hand record (version 1)

One JSON document per hand, the same for capture, sync and later import. A sketch (final field
list in Task 1):

```json
{
  "schema_version": 1,
  "id": "<uuid7>",
  "revision": 1,
  "session_id": "<uuid7>",
  "client_seq": 14,
  "played_at": "2026-11-07T21:14:00Z",
  "record_reason": "notable",
  "stakes": { "small_blind_chips": 1, "big_blind_chips": 3, "straddles_chips": [], "ante": null },
  "table_size": 9,
  "button_seat": 5,
  "hero_seat": 2,
  "seats": [
    { "seat": 2, "player_id": "<uuid7>", "starting_stack_chips": 300,
      "stack_approximate": false, "hole_cards": ["As", "Kd"] },
    { "seat": 7, "player_id": "<uuid7>", "starting_stack_chips": 450,
      "stack_approximate": true, "hole_cards": null }
  ],
  "board": { "flop": ["Ks", "7d", "2c"], "turn": "Th", "river": null },
  "actions": [
    { "street": "preflop", "seat": 7, "kind": "raise", "amount_to_chips": 9,
      "amount_approximate": false }
  ],
  "results": [ { "seat": 2, "won_chips": 61 } ]
}
```

Design points, each to be confirmed in Task 1:

- **Integer chips, explicit units** (ADR-0012). `amount_to_chips` is the player's total committed
  on the current street after the action ("raise to 9"), which is how live players say it.
- **Internally consistent, honestly flagged.** A record must add up on its own terms: no
  duplicate cards, no acting out of turn, no raise below the minimum, no chips created or
  destroyed. Approximation flags (`stack_approximate`, `amount_approximate`) and unknowns (`null`
  hole cards, `null` stack) describe how the record relates to what really happened; they never
  excuse an internal contradiction. The hand-level completeness flags of `ARCHITECTURE.md` §7.2
  are derived from these per-field facts, so the two cannot disagree.
- **Implicit folds** (for the 60-second entry). The input may leave out seats that only folded
  preflop without putting chips in voluntarily, and their folds; `canonicalize` inserts them at
  their turn. Hero's actions are always explicit. What is stored and returned is the canonical
  record.
- **Rake is derived**, not entered: rake = Σ committed − Σ won, which must be ≥ 0. Hero's net is
  derived as well. Who wins is entered, not computed — showdown evaluation needs the hand
  evaluator (M2); M3b can then cross-check entered results against the cards where they are
  known.
- **Drafts stay on the device** (M4a). The server receives finished records only; editing a
  finished record is a new revision (D3).
- **Rows are the source of truth.** The database stores the record as relational rows only, not
  also as a JSON copy, so there is one truth and AC4 genuinely tests the projection.
- **JSON Schema** exported from the Pydantic model and committed for the web app, with a staleness
  test like the one for `web/openapi.json`. The web app's TypeScript types still come from
  `openapi.json` (`CLAUDE.md` §7).

### 1.3 Rules and pot accounting (`MATH.md` §1.5, Task 1)

New section, derived and checked by hand:

- Order of action preflop (with straddles) and postflop; when a street closes.
- No-limit raising: the minimum raise is the size of the last full bet or raise; an all-in for
  less than a full raise does not reopen the betting for players who have already acted.
- Uncalled bets are returned before pots are formed.
- Main and side pots from the contributions; which seats are eligible for which pot.
- Conservation: Σ starting stacks = Σ final stacks + rake, equivalently Σ won + rake = Σ committed,
  and nobody wins more than the pots they are eligible for; a folded seat wins nothing.
- Worked examples (a three-way all-in with two side pots; a short all-in that does not reopen
  betting), computed by hand and reused as fixtures.

### 1.4 Decision points and situations

A decision point is every hero action other than a forced post. AC5 requires that none is dropped.
Each is stored with `scorable = false` and `unscored_reason = "engine_not_available"`.

Situation key columns (`ARCHITECTURE.md` §7.2) that need no evaluator and no ranges: street, pot
type (limped / single-raised / 3-bet / 4-bet+), hero position label and in/out of position, the
line so far in a compact canonical encoding, SPR bucket, facing-size bucket (as a fraction of the
pot), and a board-texture class from ranks and suits only (paired, monotone / two-tone / rainbow,
connectedness). Hand class relative to a range (`MATH.md` §5.1) needs ranges and is left to M3b.
Every key row carries a `classifier_version` (D4).

### 1.5 Storage and migrations

SQLAlchemy 2 typed models for the M3a tables of `ARCHITECTURE.md` §7.2: `venues`, `sessions`,
`players`, `hands`, `hand_players`, `actions`, `decision_points`; one initial Alembic migration.
UUIDs use SQLAlchemy's portable `Uuid` type (native `UUID` on PostgreSQL; on SQLite a 32-character
hex string rather than the `TEXT` with dashes that `ARCHITECTURE.md` §7.1 mentions — §7.1 is
updated in Task 3). The database URL comes from an environment variable whose name does not
contain the project name (`CLAUDE.md` §4); tests use a temporary database per test.

Migration tests on both backends: upgrade from empty to head; downgrade to base and upgrade again;
`alembic check` reports no difference between the models and the migrations.

---

## 2. Tasks

Each task is one PR (D5). "Rules" or "Math" is worked out in the session before the code.

### Task 1 — Hand record and NLHE rules (docs only)

- `MATH.md` §1.5 (this plan's §1.3); `ARCHITECTURE.md` §7.3 expanded into the field-by-field
  record format of this plan's §1.2, including what counts as incomplete and what counts as
  invalid.
- D1 recorded as an ADR.
- Verified by: Henry reviews the rules and the worked examples.
- As implemented: the TDA Rules (2026 v1.1) are the checked source; three conventions they do not
  cover are marked *(house)*, confirmed by Henry. The uncalled bet and the pot levels are computed
  on live chips, with antes in the main pot — computed on totals, a big-blind ante breaks them
  (`MATH.md` §1.5). The feasibility of entered results reduces to $m$ prefix inequalities because
  pot eligibility is nested. Version 1 adds `dealt_in_seats` and `showed` to the sketch of §1.2.
  Scope: ADR-0024.

### Task 2 — `domain`: model, validation, canonical form

- Files: `domain/*`, tests, the committed JSON Schema and its staleness test.
- Tests:
  - AC1: Hypothesis generates random **legal** hands from a small, independently written dealer
    (random seat count, stacks, actions sampled from the rules of Task 1); each passes validation,
    conserves chips and has unique cards.
  - AC1, invalid side: mutations of valid hands (a duplicated card, one chip too many in a pot, an
    action out of turn, a raise below the minimum, an action after a fold) are rejected, each with
    an error whose field path points at the offending field.
  - AC1, incomplete side: unknown villain cards, unknown or approximate stacks and approximate
    amounts are accepted and show up in the derived completeness flags.
  - The worked examples of `MATH.md` §1.5 as exact fixtures.
- Risk addressed: a generator built from the validator's own code would only test that the code
  agrees with itself. The dealer is written separately and kept small; the hand-computed fixtures
  are the external anchor.
- As implemented: `domain/record.py` (frozen Pydantic models), `rules.py` (the betting state
  machine), `pots.py`, `check.py` (validation and canonical form in one replay, since the replay
  that checks a record is also the one that inserts its implicit folds) and `schema.py`; cards are
  pattern-checked strings, so there is no `cards.py`. The dealer (`tests/dealer.py`) differs from
  the checker in mechanism: pending-seat sets, raise rights in the wording of TDA 49-A, pots
  peeled off the smallest contribution. Writing it exposed one gap in `MATH.md` §1.5 — a lone
  active seat that owes nothing does not act — now stated there. Eight bugs injected one at a time
  into `domain` were each caught by the tests (one only after a test was added; see the PR).
  `pydantic` is now an explicit dependency (it was installed through FastAPI).

### Task 3 — `storage`: models and migrations on SQLite and PostgreSQL

- Dependencies and the PostgreSQL CI job (D2), recorded in an ADR; `ARCHITECTURE.md` §7.1 updated.
- Files: `storage/models.py`, `storage/types.py`, `storage/migrations/`, migration tests;
  `.github/workflows/python.yml` gains a PostgreSQL service container.
- Tests: AC2 on both backends (this plan's §1.5).
- As implemented: migration `0001` creates `venues`, `players`, `sessions`, `hands`,
  `hand_seats` (the draft's `hand_players`, renamed because it also holds anonymous seats; it
  carries `won_chips`, so there is no results table) and `actions`. `decision_points` comes with
  its own migration in Task 5, whose columns depend on D4 — which also gives the migration tests
  a second step. SQLAlchemy's `Uuid` already stores UUIDs portably, so `storage/types.py` holds
  only `UTCDateTime`. Besides AC2 (upgrade from empty, downgrade to base and up again,
  `alembic check`), tests cover foreign-key enforcement and UTC timestamps on both backends.
  Dependencies and CI: ADR-0025.

### Task 4 — Record ↔ rows

- Files: `storage/repository.py`, tests.
- Tests: AC4 — for Hypothesis-generated canonical records (Task 2's dealer, plus incomplete
  variants), record → rows → record is the identity, on SQLite and PostgreSQL. Upsert by
  (id, revision) as decided in D3.
- As implemented: `storage/repository.py` has `save_hand` and `load_hand`. They run inside the
  caller's transaction and never commit. `save_hand` stores only canonical records: it runs
  `check` and refuses (`NotCanonicalError`) a record that has issues or differs from its canonical
  form, so the rows always describe a valid hand. The outcome is `created`, `replaced`,
  `unchanged` or `conflict` (D3), with the revision stored afterwards; the stored row is read
  `FOR UPDATE`, so two saves of one hand on PostgreSQL cannot both pass the revision check.
  A replace rewrites the hand's seat and action rows. `played_at` comes back in UTC (the same
  instant, so the record is equal). Venues, sessions and players get their save functions with
  their sync models in Task 6. Tests: AC4 on both backends with records from the dealer, 70% of
  them made incomplete (unknown villain cards and stacks, rough stacks and amounts, implicit
  folds left out), random revisions and `played_at` with random UTC offsets; plus unchanged,
  replace, conflict and refusal cases. Thirteen injected faults in `repository.py` (one field
  dropped or one rule changed at a time) were each caught by the SQLite run.

### Task 5 — `ledger`: decision points and situation keys

- Rules: position labels per table size, line encoding, bucket boundaries and texture classes,
  set together with Henry (D4) and written into `MATH.md` §5.1.
- Files: `ledger/decisions.py`, `ledger/situations.py`, the `decision_points` rows written by the
  repository, tests.
- Tests: AC5 — for generated hands, the number of decision points equals the number of hero
  actions other than posts, and each refers to an existing action; hand-classified fixtures for
  every key column.
- As implemented: Henry accepted the drafted classes as they were (2026-11-08, D4);
  `MATH.md` §5.1 is classifier version 1. `ledger/situations.py` holds the vocabulary and the pure
  rules (position labels, buckets compared exactly as fractions, texture);
  `ledger/decisions.py` replays the canonical record and reads each situation just before hero
  acts. Migration `0002` adds `decision_points` with primary key (hand_id, action_seq), which
  refers to `actions`; its key columns are plain text, so a later classifier version needs no
  migration. `save_hand` writes the decision points with the hand and rewrites them on a
  replace; `load_decision_points` reads them back. Tests: AC5 as properties over dealt hands
  (one point per hero action, columns present exactly where they apply, an incomplete record
  changes only the depth bucket); hand-classified fixtures — the §5.1 worked example, Examples
  1, 3 and 4 of §1.5, a straddled 4-bet pot and a three-way 3-bet pot — and boundary values for
  every bucket; decision points round-trip through the database on both backends. Fifteen
  injected faults in the ledger: fourteen caught at first; the missed one (texture priority)
  led to two more fixtures, after which it and a second priority fault were caught.

### Task 6 — API: sync and reads

- Files: `api/sync.py`, `api/read.py`, `web/openapi.json` regenerated, `web/src/api/schema.d.ts`
  regenerated (`npm run gen:api`); D3 recorded as an ADR.
- Endpoints: `POST /api/v1/sync`; `GET /api/v1/sessions`, `GET /api/v1/sessions/{id}`,
  `GET /api/v1/sessions/{id}/hands`, `GET /api/v1/hands/{id}` (including its decision points).
- Tests: AC3 — the same batch synced twice creates no duplicates and the second response reports
  every item as unchanged; conflicts are reported per item; validation errors come back with the
  field paths of Task 2; a batch with an invalid hand still applies its valid items.
- As implemented: D3 is ADR-0026. Venues, players and sessions have their own models
  (`domain/entities.py`) and save functions with the same revision rules as hands; every save
  first checks references (a hand's session and players, a session's venue) and a session's
  `client_seq`, so these come back as field-level issues rather than database errors. The batch
  model validates each item alone (a wrap validator), keeps the valid ones and remembers the
  others as `invalid` results, so the OpenAPI schema still describes typed lists. Each item is
  saved in its own transaction, in the order venues, players, sessions, hands. Hands are sent as
  entered and stored in canonical form. `create_app` takes an engine (tests) or creates one from
  `DATABASE_URL` on first use, so building the app and exporting the schema need no database.
  Tests on both backends: AC3 as a property (random batches of dealt hands with their sessions
  and players, synced twice), conflicts per item, replace and stale revision, checker and model
  errors with field paths in a mixed batch, references, duplicate `client_seq`, malformed
  batches (422), invalid venues and sessions, and every read endpoint including 404s; revision
  rules for venues, players and sessions in the repository tests. Eleven injected faults in sync,
  reads and the entity saves were each caught.

### Task 7 — Closing M3a

- Acceptance evidence table in this file (§5); `ROADMAP.md`, `CLAUDE.md` status;
  `docs/DEVELOPMENT.md`: database URL, running migrations, running the PostgreSQL tests locally.

---

## 3. Out of scope for M3a

Any engine call or EV (M3b); hand class relative to ranges (M3b); cross-checking entered results
against a showdown evaluation (M3b, needs the M2 evaluator); importing online hand histories (a
later milestone, `source = "import"` is reserved); authentication and deployment (M4a,
`ARCHITECTURE.md` §8); the capture UI and offline queue (M4a); `attributions`,
`calibration_responses`, `opponent_observations` and the solver tables (later milestones).

## 4. Risks and open questions

| Risk | Mitigation |
|---|---|
| NLHE edge cases (short all-in raises, straddles, side pots) implemented wrongly | Rules written and hand-checked first (Task 1); worked examples as exact fixtures; mutation tests |
| Property tests that only check the code against itself | The legal-hand dealer is separate from the validator; exact fixtures are the anchor (Task 2) |
| SQLAlchemy or pg8000 not yet ready for Python 3.15 (wheels, deprecations) | Checked when the dependencies are added in Task 3; `filterwarnings = error` surfaces deprecations; any workaround recorded in the ADR |
| SQLite and PostgreSQL differ (UUIDs, JSON, time zones, case of text) | Every storage test runs on both backends in CI; time stamps stored timezone-aware in UTC |
| PostgreSQL tests silently skipped in CI | CI sets a flag that turns a missing test database into a failure (D2) |
| Record v1 turns out to miss something Henry needs at the table | `schema_version` from day one; M4a's real entries are the test, and a v2 comes with a migration of stored hands |
| Entry speed vs. strict validation | Implicit folds and approximation flags keep the input short without weakening the rules |

---

## 5. Acceptance evidence

Not yet: filled in when M3a closes (Task 7).
