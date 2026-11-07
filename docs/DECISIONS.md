# Architecture Decision Records

Decisions that shape the project, recorded so that later sessions do not re-litigate them.

**Statuses:** *Proposed* (awaiting Henry), *Accepted*, *Superseded by ADR-xxxx*, *Rejected*.
Changing an Accepted decision requires a new ADR that supersedes it, agreed with Henry first.

---

## Template

```markdown
## ADR-XXXX: <short title>

- Status: Proposed | Accepted | Superseded by ADR-YYYY | Rejected
- Date: YYYY-MM-DD
- Deciders: Henry (+ Claude as proposer)

### Context
What problem or force requires a decision? What constraints apply?

### Decision
What we will do, stated precisely.

### Alternatives considered
- Option — why not chosen.

### Consequences
What becomes easier, what becomes harder, what we must now watch.

### Verification (if applicable)
How we will know the decision works (test, benchmark, measurement).
```

---

## Index

| ADR | Title | Status |
|---|---|---|
| 0001 | Record architecture decisions | Accepted |
| 0002 | Monorepo with three independent sub-projects | Accepted |
| 0003 | Rust EV engine limited to heads-up turn/river subgames with CFR+ / DCFR | Accepted |
| 0004 | Rust ↔ Python boundary: PyO3 + maturin; JSON specs, NumPy arrays | Accepted |
| 0005 | Python service layer: FastAPI, NumPy/SciPy/pandas, uv | Accepted |
| 0006 | Storage: SQLite first, PostgreSQL-portable via SQLAlchemy 2 + Alembic | Accepted |
| 0007 | Front end: React + TS + Vite PWA with offline-first capture | Accepted |
| 0008 | Bayesian tooling: SciPy closed-form/EB for serving, PyMC + ArviZ offline | Accepted |
| 0009 | Reference solvers as external test oracles only; no AGPL code | Accepted |
| 0010 | Post-game only; capture mode shows no analysis | Accepted |
| 0011 | Provisional project name, centrally defined | Accepted |
| 0012 | Units: integer chips in storage, bb for analysis | Accepted |
| 0013 | Python package layout: maturin mixed project, import name `review` | Accepted |
| 0014 | Project license: dual MIT / Apache-2.0 | Accepted |
| 0015 | Two independent CFR implementations, cross-validated | Accepted |
| 0016 | Roadmap ordering adjustments | Accepted |
| 0017 | Repository visibility: private until M0 closes | Superseded by 0019 |
| 0018 | Toolchain and dependency versions pinned in M0 | Accepted |
| 0019 | Public repository with rewritten commit identities | Accepted |
| 0020 | Exact rationals in tests: `num-rational` as a dev-dependency | Accepted |
| 0021 | Property tests: `proptest` as a dev-dependency, fixed seeds | Accepted |
| 0022 | Plots: matplotlib in a separate uv dependency group | Accepted |
| 0023 | M1 tolerances set from measured runs | Accepted |
| 0024 | Hand record version 1: scope and rule source | Accepted |

All records below dated 2026-11-03. Proposals 0004 (data format), 0006 (SQLAlchemy + Alembic),
0007 (details), 0008, 0012, 0013, 0015 and 0016 were accepted by Henry on 2026-11-03; ADR-0014
(license) was decided the same day.

---

## ADR-0001: Record architecture decisions

- Status: Accepted

**Context.** A long-running project developed across many sessions loses the reasons behind
decisions. **Decision.** Significant decisions are recorded here with the template above.
**Consequences.** Before proposing a change of direction, check this file; any change supersedes
an ADR explicitly.

## ADR-0002: Monorepo with three independent sub-projects

- Status: Accepted

**Decision.** One repository with `crates/` (Rust workspace), `python/` (uv project), `web/`
(npm project), plus `docs/` and `scripts/`. Each sub-project builds and tests independently; CI
has one path-filtered workflow per sub-project.
**Alternatives.** Separate repositories — cross-layer changes (e.g. a spec field added in Rust and
used in Python and TS) would need coordinated releases.
**Consequences.** Atomic cross-layer changes; three toolchains to install locally.

## ADR-0003: Rust EV engine limited to heads-up turn/river subgames with CFR+ / DCFR

- Status: Accepted

**Context.** The product needs per-combo action EVs for reviewed decisions, not a general-purpose
solver. **Decision.** Rust engine implementing CFR+ and Discounted CFR over heads-up subgames rooted
at the turn or river, with a limited bet-size abstraction; the actually played line is always in
the tree. Hand evaluation, ranges and trees in Rust. Criterion benchmarks from the start;
optimizations justified by measurement.
**Alternatives.** Wrapping an existing open-source solver — the mature ones are AGPL-3.0 (see
ADR-0009) and building the engine is also a learning goal. Pure-Python CFR — too slow for hold'em
subgames.
**Consequences.** Preflop/flop/multiway decisions are unscored early on; EVs are conditional on
assumed ranges (documented in `MATH.md` §1.4, §3.3).

## ADR-0004: Rust ↔ Python boundary

- Status: Accepted

**Decision.** PyO3 + maturin; a single native module `review._engine`. Format: versioned
JSON specs parsed with serde; bulk numeric results as NumPy arrays; GIL released during solves;
typed `.pyi` stubs; small exception hierarchy.
**Alternatives.** `#[pyclass]` types for every spec field — more Rust boilerplate and harder schema
evolution. A separate solver process with an HTTP/gRPC interface — more moving parts for a
single-user app.
**Consequences.** One schema source (Rust) with a mirrored Pydantic model, protected by a
round-trip test.

## ADR-0005: Python service layer

- Status: Accepted

**Decision.** Python with NumPy, SciPy, pandas for statistics; FastAPI for the HTTP API; uv for
environments and dependencies; ruff, mypy (strict), pytest. Python version pinned in M0 to the
newest version supported by all dependencies.

## ADR-0006: Storage

- Status: Accepted

**Decision.** SQLite as the initial database. SQLAlchemy 2.0 for all access and Alembic
for migrations; UUIDv7 keys (client-generated for offline capture); integer chip amounts; UTC
timestamps; JSON columns only for data never filtered in hot paths. Migrations tested against
both SQLite and PostgreSQL in CI from M3a.
**Alternatives.** SQLModel (thin layer over SQLAlchemy + Pydantic; younger, less control); raw SQL
(PostgreSQL migration becomes manual).

## ADR-0007: Front end

- Status: Accepted

**Details.** TanStack Query; React Router; CSS Modules with design tokens as CSS custom
properties; headless accessible primitives where needed; D3 modules for scales/shapes with React
rendering SVG; `vite-plugin-pwa`; IndexedDB offline queue; TS types generated from OpenAPI; npm;
Vitest + Testing Library; Playwright for e2e from M4a.
**Alternatives.** Tailwind (fast, but fine-grained typographic restraint is easier with tokens and
plain CSS); visx / Recharts for charts (less control over style); pnpm (faster, one more tool).

## ADR-0008: Bayesian tooling

- Status: Accepted

**Decision.** Tier 1 (serving path): conjugate and empirical-Bayes models implemented
with NumPy/SciPy. Tier 2 (offline modeling and validation): PyMC + ArviZ as an optional dependency
group. Comparison with NumPyro, Stan (CmdStanPy) and Bambi in `ARCHITECTURE.md` §5.2.
**Why.** Tier 1 is fast, deterministic and fully derivable — matching the goal of understanding
every formula. Tier 2 checks the approximations and handles models without closed forms. PyMC is
preferred over NumPyro (JAX adds a second paradigm) and Stan (a third language next to Rust and
Python).

## ADR-0009: Reference solvers as external test oracles only

- Status: Accepted

**Context.** TexasSolver and postflop-solver are licensed AGPL-3.0 (checked 2026-11-03;
postflop-solver's development was suspended by its author in October 2023).
**Decision.** They may be run as separate programs to produce reference outputs for fixed spots,
stored as test fixtures with solver name, version, settings and date. Their code is never copied,
vendored, linked, or transcribed; our algorithms are implemented from the published papers.
`cargo deny` checks dependency licenses in CI.

## ADR-0010: Post-game only; capture mode shows no analysis

- Status: Accepted

**Decision.** The product is for review and learning after play. No real-time assistance of any
kind. Architecturally: capture routes never request or render EV, strategy or opponent-model
output; an e2e test asserts this. Stated in README.

## ADR-0011: Provisional project name, centrally defined

- Status: Accepted

**Decision.** The working name "Blotter" is provisional. It appears only in the locations listed
in `CLAUDE.md` §4 (rename checklist). Code identifiers are functional (`cards`, `solver`, `ledger`,
`attribution`, …) and never carry the project name. A CI script enforces this from M0.

## ADR-0012: Units

- Status: Accepted

**Decision.** Store chip amounts as integers in the smallest unit of the session's
stakes, with the big-blind size stored per session. All analysis and display in bb. Field names
carry units (`_chips`, `_bb`, `_pct_pot`).
**Why.** Integer storage avoids floating-point drift in chip conservation checks; bb makes results
comparable across stakes.

## ADR-0013: Python package layout

- Status: Accepted

**Decision.** One Python distribution built by maturin in mixed mode: Python sources in
`python/src/review/`, native module `review._engine` built from `crates/bindings`. Distribution name
= project name (rename location); import name = `review` (functional: the product reviews play).
**Alternatives.** Two packages (pure-Python statistics + a separate native-engine package in a uv
workspace) — cleaner isolation but more packaging to learn; can be split later if build times hurt.

## ADR-0014: Project license — dual MIT / Apache-2.0

- Status: Accepted

**Context.** The repository may be public. The reference solvers are AGPL-3.0, but we use them only
as external test oracles (ADR-0009), so their license does not constrain ours.

**Decision.** All code in the repository is licensed under **MIT OR Apache-2.0**, at the user's
option — the common convention in the Rust ecosystem. SPDX expression `MIT OR Apache-2.0` in
`Cargo.toml` (`[workspace.package]`), `python/pyproject.toml` and `web/package.json`. License texts
in `LICENSE-MIT` and `LICENSE-APACHE` at the repository root, taken verbatim from the canonical
sources (not reproduced from memory). The README states the dual license and the standard
contribution clause (contributions are dual-licensed unless stated otherwise).

**Alternatives considered.**
- MIT only — simpler, but no explicit patent grant.
- Apache-2.0 only — patent grant, but MIT is the more familiar choice for small reuses.
- AGPL-3.0 — would require source disclosure for network use and would limit reuse.
- No license for now — keeps the repository effectively closed.

**Consequences.**
- `cargo deny` allow-list must include only licenses compatible with distribution under
  MIT OR Apache-2.0; copyleft dependencies (GPL, AGPL, LGPL) are denied.
- The same rule applies to Python and npm dependencies, checked by review when they are added
  (automated checks optional, later).
- Fonts and other assets keep their own licenses (e.g. SIL OFL for Libre Baskerville), recorded
  next to the files.
- Copyright holder: **Henry Ou** (`Copyright (c) 2026 Henry Ou` in `LICENSE-MIT`).

## ADR-0015: Two independent CFR implementations, cross-validated

- Status: Accepted

**Decision.** A small tabular CFR over a generic game trait (Kuhn, Leduc) as the
readable reference, and a vector-form public-tree CFR for hold'em subgames. Both must agree on
Leduc.
**Why.** Independent implementations catch each other's bugs; the tabular version is the best
vehicle for learning the algorithm and Rust together.
**Cost.** Extra code to maintain (the tabular part is small).

## ADR-0016: Roadmap ordering adjustments

- Status: Accepted

**Decision** (details in `ROADMAP.md`): (A) pull a capture-only slice
(hand record, storage, phone entry) forward to right after M1 so real data starts accumulating
early; (B) split turn subgames out of M2 into a later M2b.

## ADR-0017: Repository visibility — private until M0 closes

- Status: Superseded by ADR-0019 (originally accepted: Henry delegated the choice to Claude,
  2026-11-03)

**Context.** The GitHub repository `yulinhenryou/blotter` was created on 2026-11-03. Henry left the
choice between public and private to Claude.

**Decision.** Private for now. Revisit when M0 closes: the license files are in place, CI is green,
and the README describes only verified state.

**Why.** Making a repository public cannot really be undone: content may be cloned, cached or
indexed. Going from private to public later is one click. Until the license files exist, the README
says all rights are reserved, which does not fit a public repository. The design documents also
describe the first user personally; Henry should review them before they are public.

**Consequences.** GitHub Actions minutes on private repositories are limited by the account's
plan. Keep CI path-filtered and cached; check usage when M0's workflows land.

## ADR-0018: Toolchain and dependency versions pinned in M0

- Status: Accepted (follows the rule in ADR-0005 and `docs/plans/M0.md` §0.3; deviations below
  are flagged for Henry)
- Date: 2026-11-03

**Decision.** Versions as of 2026-11-03:

| Layer | Pinned | Where |
|---|---|---|
| Rust | rustc / cargo 1.99.1, edition 2024; PyO3 0.30.1; maturin ≥ 1.16; criterion 0.8.2 | `rust-toolchain.toml`, `Cargo.toml`, `python/pyproject.toml` |
| Python | 3.15 (uv-managed); FastAPI ≥ 0.162, uvicorn ≥ 0.54; dev: pytest 9.2, mypy 2.4, ruff 0.17, hypothesis, httpx2 | `python/.python-version`, `python/pyproject.toml`, `python/uv.lock` |
| Web | Node 26 (Active LTS) in CI; React 19.3, Vite 8.3, Vitest 4.1, ESLint 10 + typescript-eslint 8.72, Prettier 3.9, openapi-typescript 7.13; **TypeScript 5.9.3** | `web/.nvmrc`, `web/package.json`, `web/package-lock.json` |

**Evidence for Python 3.15.** NumPy 2.5.4, SciPy 1.18.1, pandas 3.1.0, PyMC 6.4.0 and ArviZ 1.3.0
installed from wheels and imported on CPython 3.15.2, macOS arm64 (checked 2026-11-03). PyO3 0.30.1
builds the native module for 3.15 and the tests pass.

**Deviations from the latest releases (for Henry's attention).**
- **TypeScript 5.9.3, not 7.0.** typescript-eslint 8.72 supports TypeScript `<6.1` and
  openapi-typescript 7.13 requires TypeScript `^5`. 5.9 is the newest version that satisfies both.
  Revisit when both support TypeScript 7.
- **ESLint, not oxlint.** The current Vite template ships oxlint instead of ESLint. ESLint is kept
  because it was specified and its type-aware rules (typescript-eslint `strictTypeChecked`) have
  no full oxlint equivalent yet. Switching to oxlint would be a change of direction and needs
  Henry's decision.
- **`astral-sh/setup-uv` pinned to a full version** (`v10.3.3`): the action publishes no
  floating major tag, so `@v10` does not resolve. Other actions use major tags.
- **httpx2 instead of httpx** in the dev group: Starlette's `TestClient` deprecates `httpx` in
  favor of `httpx2`, and pytest is configured to treat warnings as errors.

**Known issue accepted.** `npm audit` reports 15 moderate advisories, all in the transitive
dependency `minimatch` of the lint tooling (dev only, never shipped to the browser). The only
automatic fix is a breaking downgrade of typescript-eslint. Revisit when upstream releases a fix.

**Verified behavior.** `uv run` rebuilds the native module automatically after Rust edits
(`[tool.uv] cache-keys`), checked by changing `solver::engine_version` and observing the new value
from Python.

## ADR-0019: Public repository with rewritten commit identities

- Status: Accepted (Henry, 2026-11-04)
- Date: 2026-11-04

**Context.** M0 closed on 2026-11-04, which was the revisit point of ADR-0017. Henry decided to
make the repository public. Seven commits in the private history carried a personal e-mail
address as author and committer. Rewriting `main` alone would not remove it: GitHub keeps
read-only `refs/pull/<n>/head` references for every pull request (#1–#3), and they still point to
the original commits.

**Decision.**
- Rewrite the author and committer identity of those commits to `Henry Ou` with Henry's GitHub
  no-reply address (`git filter-branch --env-filter`). Trees are unchanged: the rewritten `main`
  has the same tree as before.
- Rename the original repository to `yulinhenryou/blotter-private-archive` and keep it private
  (not deleted). It holds PRs #1–#3 and the M0 CI runs.
- Create a new public repository `yulinhenryou/blotter` and push the rewritten `main` to it.
- The local clone sets `user.name` / `user.email` to the no-reply identity.

**Commit mapping** (archive → public) for hashes cited in the docs: merge of PR #1 `ba66add` →
`245c99a`; merge of PR #3 `625bb34` → `a90b919`.

**Consequences.** PR numbers and CI run links from M0 refer to the archive repository, which is
private. Merge-commit messages in the public history mention PR numbers of the archive, not of the
public repository. New PRs in the public repository start again at #1.

## ADR-0020: Exact rationals in tests — `num-rational` as a dev-dependency

- Status: Accepted (Henry, 2026-11-04: M1 plan decision D1)
- Date: 2026-11-04

**Context.** M1 AC3 asks for best-response values checked exactly against hand computations, and
the Kuhn equilibrium should have exploitability exactly 0 and value exactly −1/18. Floating point
cannot represent 1/18 or 1/3.

**Decision.** Evaluation, best response and exploitability are generic over a small `Value` trait
(`crates/solver/src/value.rs`), implemented for `f64` in library code and for
`num_rational::Ratio<i64>` in test code only. `num-rational` 0.4.2 (MIT OR Apache-2.0), with
`default-features = false, features = ["std"]` (no big-integer support needed), is a
dev-dependency of `solver`: it is not part of any build that ships.

**Consequences.** Generic code is monomorphized per type, so the `f64` path costs nothing extra.
`Ratio<i64>` can overflow on large games; it is only used on Kuhn-sized test cases.

## ADR-0021: Property tests — `proptest` as a dev-dependency, fixed seeds

- Status: Accepted (Henry, 2026-11-04: M1 plan §0.1 names `proptest` as a new dev-dependency)
- Date: 2026-11-05

**Context.** `CLAUDE.md` §8 asks for property tests of solver invariants (strategy rows sum to 1,
regrets finite, CFR+ regrets non-negative; M1 AC5). `CLAUDE.md` §8 also asks for tests with
fixed seeds, so a failure seen in CI can be reproduced locally.

**Decision.** `proptest` 1.12.0 (MIT OR Apache-2.0), with `default-features = false,
features = ["std"]`, is a dev-dependency of `solver`. Disabling the defaults drops the `fork` and
`timeout` features (process forking via `rusty-fork` and `tempfile`), which these tests do not
need. Every `proptest!` block sets `rng_seed: RngSeed::Fixed(…)` in its config, so every run
checks the same cases.

**Consequences.** Eleven crates (`proptest` and its dependencies) are added to `Cargo.lock`, all for tests only; `cargo deny`
accepts their licenses. A fixed seed trades fresh random cases on every run for
reproducibility. Changing a seed is an explicit, reviewable edit.

## ADR-0022: Plots — matplotlib in a separate uv dependency group

- Status: Accepted (Henry, 2026-11-04: M1 plan decision D2)
- Date: 2026-11-06

**Context.** M1 AC4 asks for the Leduc convergence plot, generated by a script from real runs
(`CLAUDE.md` §8). Plots are documentation, not part of the product or of CI.

**Decision.** `scripts/plot_leduc_convergence.py` uses matplotlib (≥ 3.11.2; the Matplotlib
License, a permissive PSF-style license) in a new uv dependency group `plots` in
`python/pyproject.toml`. The group is not a default group: `uv sync` and CI do not install it;
`uv run --group plots …` does. Its dependencies, as locked: contourpy, cycler, fonttools,
kiwisolver, numpy, pillow, pyparsing, python-dateutil (all BSD, MIT, MIT-CMU or Apache-2.0 per
their package metadata, checked 2026-11-06). The script writes SVG without a date stamp and
with a fixed `svg.hashsalt`, so the same CSV always gives the same file.

**Consequences.** `python/uv.lock` grows by these packages; nothing that ships depends on them.
Colors come from a palette checked for color-vision deficiency; series are also told apart by
marker and direct label.

## ADR-0023: M1 tolerances set from measured runs

- Status: Accepted (Henry, 2026-11-05 and 2026-11-06: values merged with PR #6 and PR #7 after
  review; recorded here as `ROADMAP.md` requires for thresholds marked **[set after first
  measurement]**)
- Date: 2026-11-06

**Context.** M1 AC1 and AC2 leave their tolerances to be set after a first measurement. They were
set in `docs/MATH.md` §2.2 (vanilla CFR) and §2.4 (CFR+, DCFR) from deterministic runs recorded
there, about two to three times the measured values.

**Decision.** At $T = 10^4$ iterations on Kuhn poker, the average strategy must satisfy:

| Variant | exploitability ≤ | \|u₁ + 1/18\| ≤ | P(bet \| Q) ≤ | structure deviation ≤ |
|---|---|---|---|---|
| CFR | 3e-3 | 2e-5 | 1e-3 | 0.02 |
| CFR+ | 2e-5 | 5e-9 | 5e-7 | 1e-4 |
| DCFR(1.5, 0, 2) | 5e-5 | 1e-8 | 2e-10 | 3e-4 |

"Structure deviation" covers $P(\text{bet} \mid K) - 3\,P(\text{bet} \mid J)$,
$P(\text{call} \mid Q, pb) - P(\text{bet} \mid J) - 1/3$ and P2's two mixing probabilities minus
1/3 (`MATH.md` §1.2); the same tolerance bounds how far below 1 the probabilities of the strict
choices of §1.2, Step 1 (fold J and call K facing a bet, P2 bets K after a check) may be. In
addition, exploitability must fall strictly at $T = 10, 100, 10^3,
10^4$, and $|u_1 + 1/18| \le 2e$ at each of these checkpoints.

**Consequences.** The tests (`crates/solver/src/cfr.rs`) are deterministic, so a tolerance failure
means the computation changed, not noise. AC2 is tested as the difference
$P(\text{bet} \mid K) - 3\,P(\text{bet} \mid J) \to 0$ rather than the ratio named in
`ROADMAP.md`: the ratio is undefined when $P(\text{bet} \mid J) = 0$, which is an equilibrium.

## ADR-0024: Hand record version 1 — scope and rule source

- Status: Accepted (Henry, 2026-11-07: scope as M3a plan decision D1 = (a); the three *(house)*
  conventions of `MATH.md` §1.5 confirmed as matching the cardrooms Henry plays in)
- Date: 2026-11-07

**Context.** M3a stores captured hands and must reject impossible ones (`ROADMAP.md` → M3a, AC1).
That needs a precise statement of which games a record can describe and which betting rules it is
checked against. Henry plays live and online no-limit hold'em cash games.

**Decision.** Record version 1 (`ARCHITECTURE.md` §7.3) describes no-limit hold'em cash games
with 2–10 seats: small and big blind, any number of straddles posted by the consecutive seats
after the big blind, and optional antes (per player, or one big-blind ante). Rake is derived from
the pot and the entered results, never entered. Not in version 1: run-it-twice, bomb pots,
tournaments, other games, dead buttons, missed-blind and new-player posts, forced bets posted
all-in for less, Mississippi or button straddles. Each can be added behind a new
`schema_version`.

The rules (`MATH.md` §1.5) follow the Poker TDA Rules, 2026 version 1.1 (rules 36-C, 45-A, 49-A,
49-B, 67-A, checked 2026-11-07), in particular: a raise is at least the largest prior full bet or
raise of the round; an all-in, or several short all-ins together, totalling less than a full raise
does not reopen the betting for a player who has already acted. Three conventions are not in the
TDA text and are marked *(house)*: the minimum opening bet postflop is one big blind; straddles are
at least twice the previous forced bet; preflop, the last forced bet counts as a full bet, so the
minimum raise is to twice the big blind or twice the last straddle.

**Alternatives.** (b) Run-it-twice in version 1 — several boards and split results per board;
deferred because it changes the board, the results and the showdown model at once. A cash-game
rulebook (e.g. Robert's Rules of Poker) as the primary source — not checked directly; the TDA text
was available and agrees on the rules used, as far as secondary sources show.

**Consequences.** Hands outside the scope cannot be recorded yet; if Henry meets them often at the
table, that is the signal for version 2. The TDA rules are written for tournaments: if Henry's
cardrooms play a house rule that differs (for example on straddles), the validator would reject a
real hand, so the *(house)* conventions are listed explicitly; Henry confirmed all three on
2026-11-07. A rejected real hand is the signal to revisit them.
