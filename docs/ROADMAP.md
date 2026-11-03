# Roadmap

Each milestone ends with explicit **acceptance criteria**. A milestone is done only when every
criterion is met and verified (by CI, a test, or a recorded run with command and commit). Numeric
thresholds that cannot be chosen honestly before a first measurement are marked **[set after
first measurement]** and are recorded in `DECISIONS.md` when fixed.

Current status: **M0 complete** (skeleton and CI; [`plans/M0.md`](plans/M0.md)). Next: M1, not
started; its task-level plan will be `plans/M1.md`.

## Order

Accepted 2026-11-03 (ADR-0016):

```
M0 → M1 → M3a → M4a → M2 → M3b → M4b → M2b → M5 → M6 → M7
```

| Milestone | Layer(s) | Summary |
|---|---|---|
| M0 | all | Monorepo skeleton and CI |
| M1 | Rust | CFR on Kuhn and Leduc, validated |
| M3a | Python | Hand record format, storage, sync API — no solver |
| M4a | Web | Phone capture (PWA, offline) — real hands start accumulating |
| M2 | Rust | Hand evaluation and river subgame |
| M3b | Python | Bindings, decision evaluations, ledger |
| M4b | Web | Review interface and visualizations |
| M2b | Rust | Turn subgames |
| M5 | Python + Web | Attribution and leak statistics |
| M6 | Python + Web | Calibration training |
| M7 | all | Opponent models and bankroll |

**Why this order.** Data accumulates on the calendar, not in code: leak detection needs hundreds of
decisions per situation class, and a live player logs a limited number of hands per session, so
capture (M3a, M4a) starts right after the CFR core (M1). It also tests the riskiest product
assumption — a 60-second phone entry — early, and gives M2 real spots as test cases. Turn
subgames (M2b) come after the review UI because the river alone closes the end-to-end loop, and
the turn's engineering risk (memory, speed) is better tackled with benchmarks and real spots in
hand. The cost, accepted: work switches from Rust to Python/web after M1 before returning to Rust.

---

## M0 — Monorepo skeleton and CI

**Goal:** every layer builds, tests and lints from a clean clone, locally and in CI, before any
feature code exists. Task-level plan: [`plans/M0.md`](plans/M0.md).

Deliverables
- Git repository, `.gitignore`, `LICENSE-MIT` + `LICENSE-APACHE` (dual license, ADR-0014).
- `project.json` with display name and tagline; `scripts/check_project_name.py`.
- Cargo workspace with crates `cards`, `solver`, `bindings` (placeholders); criterion harness with
  one placeholder bench; `rust-toolchain.toml`; `cargo-deny` license policy.
- `python/` uv project, maturin build backend, package `review` with `_engine` built from
  `crates/bindings` exposing `version()`; FastAPI app with `GET /api/v1/health` returning the
  engine version; ruff, mypy (strict), pytest configured.
- `web/` Vite + React + TS app: one page that calls `/api/v1/health`; design tokens stubbed;
  eslint, Prettier, Vitest configured; TS types generated from the committed OpenAPI schema.
- GitHub Actions: `rust.yml`, `python.yml`, `web.yml`, `repo.yml`.
- `docs/DEVELOPMENT.md`: exact setup and day-to-day commands.

Acceptance criteria
1. From a clean clone, the documented commands run all tests and linters for all three layers
   with zero failures on Henry's machine.
2. CI is green on the main branch for all workflows.
3. The Python test suite calls into Rust (`review._engine.version()`) successfully — proves the
   PyO3/maturin bridge end to end.
4. The web page displays the engine version fetched through the API — proves all three layers
   connect.
5. A deliberately introduced violation in each linter (clippy, rustfmt, ruff, mypy, eslint) and a
   stray occurrence of the project name each make CI fail (verified once, then reverted).
6. `cargo bench --no-run` compiles in CI.

---

## M1 — CFR on Kuhn and Leduc (Rust)

**Goal:** a correct, well-understood CFR core, validated against known results.

Deliverables
- Generic tabular extensive-form game trait; Kuhn and Leduc implementations.
- Regret matching; vanilla CFR, CFR+, DCFR; average strategy.
- Best response and exploitability (convention `MATH.md` §1.1).
- `MATH.md` §1.2, §2.1–2.4, §2.7 derivations completed together.
- Script that runs Leduc for each algorithm and writes exploitability vs. iterations to CSV, plus
  a plot generated from it (committed with the command and commit hash).
- Criterion benches: iterations/second on Kuhn and Leduc (baseline only, no targets).

Acceptance criteria
1. Kuhn: first player's value of the average strategy is within a stated tolerance of −1/18
   (tolerance **[set after first measurement]**), and exploitability decreases toward 0.
2. Kuhn: the computed equilibrium satisfies the known structure (e.g. Q never bets first; the
   K-bet / J-bet frequency ratio is 3 within tolerance) — test derived from the hand derivation.
3. Best response verified independently: hand-computed best-response values against the uniform
   random strategy in Kuhn match the implementation exactly (rational arithmetic in the test).
4. Leduc: exploitability decreases with iterations for CFR, CFR+ and DCFR; the plot exists and is
   reproducible from the committed script.
5. Property tests: every strategy row sums to 1; regrets stay finite; CFR+ regrets never negative.
6. Benchmarks recorded locally with machine description; no performance claims beyond those.

---

## M3a — Hand record format and storage (Python, no solver)

**Goal:** a durable, validated home for captured hands, ready for the phone to sync into.

Deliverables
- `domain`: canonical hand record (versioned JSON, Pydantic; JSON Schema exported for the web
  app), validation, incomplete-information flags, `record_reason`.
- `storage`: SQLAlchemy models and Alembic migrations for venues, sessions, players, hands,
  hand_players, actions, decision_points (`ARCHITECTURE.md` §7).
- Decision-point extraction and situation classification (no evaluation yet: every decision is
  stored as unscored, with the reason "engine not available").
- API: sessions, hands, `POST /sync` (idempotent by client-generated UUID).

Acceptance criteria
1. Hand validation: property tests for chip conservation and card uniqueness; invalid records are
   rejected with field-level errors; incomplete records are accepted and flagged.
2. Migrations apply cleanly from empty on SQLite and PostgreSQL in CI; a downgrade/upgrade cycle
   works.
3. Syncing the same batch twice creates no duplicates (test).
4. Hand record → relational rows → hand record round-trips without loss (property test).
5. Every hero decision in a stored hand produces a decision point; none is dropped.

---

## M4a — Phone capture (Web)

**Goal:** Henry logs real hands on a phone, online or offline.

Deliverables
- Mobile-first capture flow: tap-only card picker, position-aware defaults, sizes in bb and pot
  fractions, "unknown" for villain cards and approximate stacks, drafts.
- PWA: installable, offline queue in IndexedDB, sync to `POST /sync`.
- Design system foundations: tokens, typography (serif headings, tabular figures), dark mode.
- Deployment decision for phone access (ADR; `ARCHITECTURE.md` §8).

Acceptance criteria
1. **Entry speed, measured:** Henry enters 10 real key hands on a phone; the median time from
   "new hand" to "saved" is under 60 seconds (times recorded by the app and reported, whatever they
   are).
2. Capture works in airplane mode and syncs without duplicates when back online (e2e test).
3. Incomplete hands (villain cards unknown, approximate stacks) can be saved in the same flow.
4. Capture routes render no EV, strategy or opponent output (e2e test asserts absence).
5. Lighthouse reports the app as installable; WCAG AA contrast for all text tokens.

---

## M2 — Hand evaluation and river subgame (Rust)

**Goal:** solve heads-up river spots and return per-combo action EVs.

Deliverables
- `cards`: card / combo / range types, range-string parser, 7-card evaluator, exact equity.
- Public betting tree with bet-size abstraction and forced (actually played) lines.
- Vector-form CFR (DCFR default), O(N log N) showdown with card removal (`MATH.md` §2.5–2.6),
  best response / exploitability in % pot, per-combo action values (§2.8).
- JSON `SubgameSpec` / `SolveResult` with schema version.
- Criterion benches: evaluator, showdown evaluation, full river solve on fixed spots.

Acceptance criteria
1. Evaluator: exhaustive enumeration of all 2,598,960 five-card hands reproduces the standard
   category counts; 7-card evaluation agrees with best-of-21 five-card evaluation on a large random
   sample (property test).
2. Range parser round-trips and rejects malformed input with clear errors.
3. Vector-form CFR on Leduc agrees with the M1 tabular implementation (strategies and values within
   tolerance).
4. A toy river game with a closed-form solution (polarized bettor vs. bluff-catcher; derived
   together) is reproduced within tolerance.
5. On at least three fixed river spots — taken from Henry's captured hands where possible —
   strategies and EVs agree with an independent open-source solver run externally, within
   tolerances **[set after first measurement]**; reference outputs are stored as fixtures with
   solver name, version, settings and date. No reference-solver code is used or linked.
6. Reported exploitability of returned solutions is below a target **[set after first
   measurement]** for the fixture spots.

---

## M3b — Bindings, evaluations and the Decision Ledger (Python)

**Goal:** from a stored hand to provenance-tracked decision evaluations.

Deliverables
- PyO3 API (`ARCHITECTURE.md` §4): solve with the GIL released, equity, range parsing; `.pyi` stubs.
- Range presets; spec building from hand records; solve cache by spec hash.
- `ledger`: evaluation of river decisions, EV loss with noise floor (`MATH.md` §3); storage tables
  `solves`, `evaluations`, `evaluation_actions`, `range_presets`, `jobs`.
- API: `POST /hands/{id}/evaluate` (background job), `GET /jobs/{id}`, `GET /ledger`.
- Backfill: evaluate all previously captured, scorable river decisions.

Acceptance criteria
1. Spec round-trip: Pydantic → JSON → Rust → JSON → Pydantic is identity (property test).
2. End to end: a river decision from a hand record produces an evaluation whose EVs equal a direct
   engine call on the same spec; provenance fields are populated.
3. Decisions the engine cannot score (preflop, flop, turn until M2b, multiway) keep an explicit
   unscored reason.
4. `mypy --strict` passes including the native-module boundary.
5. The API stays responsive while a solve runs (test: health endpoint answers during a solve).

---

## M4b — Review interface (Web)

**Goal:** review captured hands with meaningful, interactive visualizations.

Deliverables
- Hand replayer; ledger view with filters; decision detail with EV of every action and the
  assumptions behind it.
- Interactive 13×13 range matrix with per-combo drill-down; EV-vs-bet-size curve.

Acceptance criteria
1. Range matrix and EV curve render real solver output for a stored hand.
2. Every displayed EV shows (or links to) its provenance: ranges, abstraction, exploitability.
3. Component tests for the visualizations; keyboard navigation for the range matrix.

---

## M2b — Turn subgames (Rust)

**Goal:** extend the engine to subgames rooted at the turn.

Deliverables
- River chance layer in the tree; turn solves through the same vector-form CFR.
- Memory and time measured on fixed turn spots; parallelization across river cards only if the
  measurements justify it.
- Ledger integration: turn decisions become scorable.

Acceptance criteria
1. On at least three fixed turn spots, results agree with an independent open-source solver run
   externally, within tolerances **[set after first measurement]**.
2. Benchmarks for turn solves recorded with machine, commit and command; any optimization PR shows
   before/after numbers.
3. Previously captured turn decisions are backfilled with evaluations.

---

## M5 — Attribution and leak statistics

Deliverables
- Per-hand and per-session luck/skill attribution (`MATH.md` §4), variants A/B labeled.
- Situation taxonomy, hierarchical EV-loss model, BH/BY FDR control, evidence tiers, samples
  needed (`MATH.md` §5).
- Simulation harness with synthetic players and planted leaks.
- UI: session attribution view, leak report.

Acceptance criteria
1. Telescoping identity: components sum to the realized net result exactly for every stored hand
   (property test) and match hand-computed examples.
2. On simulated data, chance-node luck terms have mean indistinguishable from zero (test with
   stated tolerance) for variant A.
3. Simulation study: empirical FDR at or below the nominal $q$ within Monte Carlo error; interval
   coverage near nominal; shrinkage beats raw means in MSE. Results reported exactly as measured.
4. Every leak shown in the UI carries evidence tier, effect size with interval, and samples needed;
   classes without enough data say "insufficient evidence".
5. The selection-bias handling (`record_reason`, random-sample protocol) is implemented and the UI
   states which subset a statistic uses.

---

## M6 — Calibration training

Deliverables
- Prompt-before-reveal flow for the question types in `MATH.md` §6.1.
- Brier score, decomposition, skill score; reliability diagram with bands; continuous-error views.

Acceptance criteria
1. Answers cannot be changed after reveal (server-enforced; tested).
2. Scores match hand-computed values on fixture data, including the Murphy decomposition identity.
3. Model-resolved and showdown-resolved questions are scored and displayed separately.
4. Bins with too few answers are shown as insufficient rather than plotted as points.

---

## M7 — Opponent models and bankroll

Deliverables
- Beta-Binomial opponent stats with empirical-Bayes population priors; credible intervals.
- Node-locked solves (villain strategy partially fixed) for exploit evaluation; deviation rule with
  cost-if-wrong (`MATH.md` §7.2).
- Win-rate posterior, Bayesian risk of ruin, Kelly-style stake guidance (`MATH.md` §8).

Acceptance criteria
1. Simulation: posterior intervals for opponent stats achieve near-nominal coverage.
2. No exploit suggestion is displayed without its posterior probability and cost-if-wrong; with
   little data, the system recommends the equilibrium action (tested).
3. Risk of ruin matches the closed form for known $(\mu, \sigma)$ and is bounded below by
   $P(\mu \le 0 \mid \text{data})$ in the Bayesian version (tested).
4. Kelly guidance from the posterior is never more aggressive than plug-in Kelly at the posterior
   mean (tested on fixtures) — or, if the chosen rule allows otherwise, that is documented.

---

## Possible later milestones (not scheduled)

Flop subgames; hand-history import for online play; multiway heuristics. Each would need its own
ADR because it widens scope.
