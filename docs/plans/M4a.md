# M4a plan — Phone capture (Web)

Status: **accepted (2026-11-08)**; D1–D4 decided by Henry, D5–D7 decided as recommended when
Henry accepted the plan, the same day (§0.1). Acceptance criteria: `ROADMAP.md` → M4a (criterion
5 reworded by D5 in Task 1).

M4a is where real hands start to accumulate. Henry logs a key hand on an iPhone, at the table or
on a break, in under a minute, with or without a network; the hand waits on the phone and reaches
the server (built in M3a) the next time the phone can reach it. Nothing in M4a evaluates anything:
the capture flow shows no EV, strategy or opponent output (ADR-0010).

The milestone tests the riskiest product assumption — that a 60-second phone entry is possible —
so its last task is a field trial with real hands, whose times are reported whatever they are.

The order mirrors M3a: **the flow on paper before code.** Task 1 specifies every screen, default
and question of the capture flow and counts the taps for worked example hands; the rules engine,
the offline store and the screens then implement that one description.

---

## 0. Before starting

### 0.1 Decisions

Decided by Henry on 2026-11-08: **D1 = (a), D2 = (a), D3 = iPhone, D4 = (a)**, and with the
acceptance of this plan **D5 = (a), D6 = (a), D7 = (a)**; **D8** while specifying the capture flow
in Task 1. The chosen option is first, in bold. D1, D2, D5 and D8 are ADR-0027 to ADR-0030.

| # | Decision | Options | Blocks |
|---|---|---|---|
| D1 | How the phone reaches the server (`ARCHITECTURE.md` §8) | **(a) Decided.** The server runs on Henry's Mac; the phone reaches it through Tailscale (a private network between Henry's own devices). `tailscale serve` gives the Mac an HTTPS address on Henry's `ts.net` name and forwards to the API on `127.0.0.1`, so nothing listens on the local network or the internet and no login system is needed: membership of the private network is the access control. Sync happens only while the Mac is awake; until then hands wait on the phone. **(b)** A small hosted server with authentication | Tasks 3, 8 |
| D2 | Whether the phone knows the betting rules | **(a) Decided.** The rules of `MATH.md` §1.5 (whose turn, legal actions, minimum and maximum amounts, when a street closes, pots) are implemented a second time in TypeScript, so the entry screen offers only legal actions and catches mistakes offline, at the moment of entry. Agreement with the Python implementation is tested on a shared corpus of hands generated in Python (Task 4). The server stays the authority: it still checks every record. **(b)** The phone does free-form entry; errors surface only at sync | Tasks 4, 6 |
| D3 | Henry's phone | **iPhone (Safari, Home Screen web app).** Consequences in §1.6: no background sync (the app syncs while it is open); storage persistence to be checked on the device; WebKit in the end-to-end tests | Tasks 5, 7, 8 |
| D4 | Known opponents | **(a) Decided.** Optional: every seat is anonymous by default; tapping a seat lets Henry pick a known player or type a new nickname. The data serves the opponent models of M7. **(b)** Anonymous seats only in M4a | Task 6 |
| D5 | Acceptance criterion 5, "Lighthouse reports the app as installable" | **(a) Decided.** Reworded: "the production build meets Chrome's installability criteria (a web app manifest with the required fields and a registered service worker, checked by an end-to-end test), and the app is installed on Henry's iPhone and opens offline (checked by hand, recorded with date and iOS version); WCAG AA contrast for all text tokens". Reason: Lighthouse removed its PWA category in version 12 (Lighthouse changelog), so the criterion as written can no longer be checked. **(b)** Keep the wording and pin an old Lighthouse | Tasks 7, 8 |
| D6 | Random-sample protocol (`MATH.md` §4.5) | **(a) Decided.** The app offers `record_reason` on every hand (default `notable`); the random-sample protocol is a written rule Henry follows at the table, drafted together in Task 1 and added to `MATH.md` §4.5, with at most a passive reminder in the session screen (no notifications: a Home Screen web app cannot raise them without a push server). **(b)** Defer the protocol to M5; `random_sample` stays available but unused | Task 1 |
| D7 | Review cadence | **(a) Decided.** As in M3a: one PR per task; each waits for Henry's review and merge. **(b)** Claude merges when CI is green; Henry reviews afterwards | all |
| D8 | Hands where hero folds and the hand goes on (found in Task 1: record version 1 needs the whole hand, so random samples — mostly preflop folds — could not be logged quickly) | **(a) Decided.** Record version 2: a hand may end at hero's fold; hero's net is known, the rake and other seats' results are not (ADR-0030; `MATH.md` §1.5). Adds Task 2 (Python). **(b)** Keep version 1: Henry enters the rest of the hand | Tasks 2, 4 |

### 0.2 Dependencies

New npm packages (versions and licenses from the npm registry on 2026-11-08; exact versions pinned
when each is added and recorded in an ADR, as in M0 and M3a):

| Package | Version | License | Kind | Why |
|---|---|---|---|---|
| `react-router` | 8.5.1 | MIT | runtime | Routing (ADR-0007); also separates capture routes from future review routes (ADR-0010) |
| `idb` | 8.0.4 | ISC | runtime | A small promise wrapper over IndexedDB for the offline store (ADR-0007). Dexie (Apache-2.0) does more than the store needs |
| `vite-plugin-pwa` | 2.0.0 | MIT | dev | Web app manifest and service worker (ADR-0007); brings `workbox-build` / `workbox-window` (MIT) |
| `@fontsource/libre-baskerville` | 5.3.0 | OFL-1.1 (font) | runtime asset | Self-hosted heading font so the offline app renders correctly (`ARCHITECTURE.md` §6). OFL allows bundling the font with software under any license; it is a font file, not linked code |
| `fake-indexeddb` | 6.2.7 | Apache-2.0 | dev | IndexedDB in Vitest (jsdom has none) |
| `@playwright/test` | 1.65.0 | Apache-2.0 | dev | End-to-end tests (ADR-0007: "Playwright for e2e from M4a"); its browsers are downloaded by its installer, in CI and locally |

TanStack Query (ADR-0007) is not needed by the capture flow, which reads the local store, not the
server; it is added with the review screens in M4b. Radix primitives are added only if a dialog or
popover in Task 6 needs one.

Outside the repository: Tailscale on the Mac and the iPhone (D1). It is a program Henry installs,
not a dependency of the code. Checked on 2026-11-08: Tailscale is not installed on the Mac yet.

### 0.3 Rules of engagement for every task

1. The flow, rules or protocol for the task are worked out together in the session first and land
   in the docs in the same PR as the code.
2. Then the code, explained where it is non-trivial. Henry knows JavaScript well, so explanations
   focus on what is new here: React state and effects in a multi-step form, TypeScript's
   discriminated unions for the betting state, IndexedDB transactions, service workers and their
   update cycle, Playwright.
3. Every number in a test or a doc is derived by hand or measured by a committed command.
   Entry times are reported exactly as recorded.

---

## 1. Design

### 1.1 Modules (`web/src/`)

```
api/            # existing: the only code that knows HTTP; generated schema.d.ts
design/         # tokens.css (light and dark), typography, base components (Button, Sheet, ...)
rules/          # NLHE betting rules and pots in TypeScript (D2); pure, no React
  fixtures/     # corpus generated by Python (Task 4); committed
store/          # IndexedDB: drafts, outbox, timings, settings; pure functions + idb
sync/           # outbox -> POST /sync -> per-item status; revision rules
capture/        # the capture routes and screens; imports rules, store, sync, design only
app/            # router, app shell, service-worker registration
```

Dependency direction: `rules` imports nothing from the project; `store` imports `rules` types
only; `sync` imports `store` and `api`; `capture` imports `rules`, `store`, `sync` and `design`. An
ESLint `no-restricted-imports` rule enforces that `capture` imports nothing that could carry
analysis (today nothing like that exists; the rule is there before M4b adds it) — the structural
half of ADR-0010; the end-to-end test is the behavioral half (AC4).

Server-side additions (Python, small): `GET /api/v1/venues` and `GET /api/v1/players`, so a
reinstalled phone can restore its pick lists; optional serving of the built web app by the same
FastAPI process (one origin, so no CORS), enabled by an environment variable whose name does not
contain the project name (`CLAUDE.md` §4); a script that exports the rules corpus (Task 4).

### 1.2 The capture flow

Specified in `CAPTURE.md` (Task 1): screens, defaults, the card picker, what is asked when, and a
tap budget for five worked hands (8 to 37 taps). In short: a session is set up once (venue,
stakes, rake rule, table, hero's seat); a hand starts with hero's position, cards and a confirmed
stack, because logged hands are far apart and cannot inherit them; the actions are entered with
only legal buttons, "fold to …" and size presets; the board when a street closes; at the end,
villain cards and approximate villain stacks (both optional), the winner of each pot with the
amounts proposed from the session's rake rule, and why the hand was logged. When hero folds,
"End here" finishes the record (D8). Drafts never leave the phone (M3a plan §1.2).

### 1.3 Rules in TypeScript (D2)

`rules/` reimplements, from `MATH.md` §1.5 rather than by transcribing the Python line by line:
seat order and forced bets, the betting state machine (whose turn, legal kinds, minimum raise,
raise rights after a short all-in, when a street and the hand end), uncalled bets, side pots and
eligibility, and the feasibility check for results. It does not need the full checker: the server
remains the authority, and anything the phone misses comes back as an `invalid` item.

Agreement is tested on a **corpus** written by a Python script from M3a's independent dealer
(`python/tests/dealer.py`) and checker: for each hand, the state before every action (seat to act,
legal kinds, minimum and maximum amounts), the street ends, and the final pots. A fixed seed and a
fixed number of hands make the corpus reproducible; it is committed under `web/src/rules/fixtures/`
with the command that wrote it, and a Python test fails if it is stale (as for `web/openapi.json`).
Vitest replays every hand through the TypeScript rules and compares. The hand-computed examples of
`MATH.md` §1.5 are in the corpus too, as exact anchors.

### 1.4 Offline store and sync

IndexedDB object stores: `drafts`; `records` (venues, players, sessions, hands as sent, each with
a sync state: `pending`, `synced` with the stored revision, `conflict` or `invalid` with the
server's issues); `timings` (§1.5); `samples` (the random-sample log, `MATH.md` §4.5); `settings`
(including each session's rake rule and seat map, which only the phone needs).

Revision rules (ADR-0026): a record is created with revision 1. Once it has been *sent* at least
once — whether or not the response arrived — any edit increments the revision. Sending the same
revision again is therefore always safe: the server answers `unchanged`. A `conflict` or `invalid`
item stays on the phone, is shown in a "Needs attention" list with the server's issues, and is
never dropped silently.

Sync runs when the app opens, when it comes back online, after a save, and on a manual "Sync now".
It sends all pending records in one batch (sessions with their hands); the response updates each
record's state. Hands are sent as entered; the server stores the canonical form.

Because the Mac may be off for days (D1), the app can also **export every unsynced record as a
JSON file** (the same shape as a sync batch), as a backup that does not depend on the server.

### 1.5 Entry timing (AC1)

For each hand: the time "New hand" was tapped, the time "Save" was tapped, whether the entry was
interrupted (the draft was left and resumed), and the hand id. Stored on the phone only (the hand
record has no field for it, and none is added). A plain "Entry times" screen lists them with the
median of uninterrupted entries; it is about the app, not about poker, so it is not analysis.
AC1 is judged on the uninterrupted entries of the field trial; interrupted ones are reported
separately.

### 1.6 iPhone specifics (D3)

To be checked on Henry's iPhone in Task 8, not assumed:
- Install from Safari's Share menu → "Add to Home Screen"; the app then opens full screen.
- No Background Sync API on Safari: sync runs only while the app is open (§1.4).
- Storage persistence: the app calls `navigator.storage.persist()` and shows the result; Safari's
  eviction rules for website data are the reason the app should be used from the Home Screen and
  the reason for the JSON export.
- Service workers and IndexedDB require a secure origin: `https://` (D1, via `tailscale serve`) or
  `localhost` in development.

### 1.7 Design system foundations

Tokens for color (light and dark, `prefers-color-scheme`), type, space and radius as CSS custom
properties (existing `design/tokens.css`, extended); Libre Baskerville self-hosted for headings
(system Baskerville first on Apple devices), the system UI font for text, `tabular-nums` for every
number. A Vitest test computes the WCAG contrast ratio of every text token against every surface it
is used on, in both modes, and fails below 4.5 : 1 (3 : 1 for large text). Touch targets at least
44 × 44 CSS px.

---

## 2. Tasks

Each task is one PR (D7).

### Task 1 — Capture flow, protocol and deployment (docs only)

- The capture flow of §1.2 made precise: every screen, default, question and error message; the
  card-picker layout; the tap budget for the worked examples.
- `MATH.md` §4.5: the random-sample protocol (D6).
- `ARCHITECTURE.md` §6 (offline store, sync, capture routes) and §8 (deployment, D1) updated.
- ADRs: D1 (deployment), D2 (rules in two languages, cross-tested), D5 (AC5 wording, with the
  `ROADMAP.md` change).
- Verified by: Henry reviews the flow against how he actually logs a hand.
- As implemented: the flow is `docs/CAPTURE.md`, shaped by four answers from Henry (2026-11-08):
  hands are entered both at the table and on breaks, so the button and hero's stack are asked
  every time rather than carried over; villain stacks are remembered as rough numbers; the random
  sample uses a timer (`MATH.md` §4.5); the rake rule is set per session. Writing it showed that
  record version 1 cannot hold a hand that hero folds while it goes on, which most random samples
  are: D8 and Task 2. ADR-0027 (D1), ADR-0028 (D2), ADR-0029 (D5, `ROADMAP.md` criterion 5
  reworded) and ADR-0030 (D8); `MATH.md` §1.5 (hands that end at hero's fold) and §4.5 (the
  protocol); `ARCHITECTURE.md` §6, §7.3 and §8.

### Task 2 — Record version 2: hands that end at hero's fold (Python)

- `domain`: `schema_version` 1 or 2, `ends_at_hero_fold`; the checker stops the replay at hero's
  fold, requires empty results and no later board card, derives hero's net and a `null` rake
  (`MATH.md` §1.5, ADR-0030); the JSON Schema regenerated.
- `storage`: migration `0003` (the flag; `rake_chips` nullable); the repository and the decision
  points; `ledger` needs no change (every hero decision is in the record), which a test shows.
- `api`: `web/openapi.json` and `web/src/api/schema.d.ts` regenerated.
- Tests: the dealer can stop a hand at hero's fold; the M3a properties (validity, round trip,
  decision points, sync twice) run on such hands too; rejections with field paths (an action after
  hero's fold, a results entry, a later board card, the flag without hero folding last); migration
  step tests 0002 ↔ 0003 on both backends. Injected faults, as in M3a.
- As implemented: `HandRecord` takes `schema_version` 1 or 2 and the canonical form is always 2
  (a version 1 record is a version 2 record without the flag). The checker reports the four ways
  the flag can be wrong — results given (`results[0]`), an action after hero's fold, hero never
  folding, version 1 — and replays only up to hero's fold; hero's net is minus hero's total, the
  rake `None`, the pots empty. Storage: `hands.ends_at_hero_fold` (default false),
  `hands.rake_chips` nullable, and `hand_seats.won_chips` nullable: in such a hand hero's row holds
  0 and the others `NULL` (unknown, not zero). Migration `0003` sets stored hands to version 2 and
  refuses to downgrade while a hand ends at hero's fold. The migration environment now disposes of
  its engine when a migration fails (the refused downgrade left a connection open). Tests: the
  dealer can make hero one of the folders and cut the hand there (`end_at_hero_fold`); such hands
  are three in ten of the hands in the AC1, AC3, AC4 and AC5 properties of M3a, and their hero net
  must equal the dealer's accounting of the whole hand; two hand-computed fixtures (`MATH.md`
  §1.5 Example 4 cut at hero's fold; the §5.1 example cut at a flop fold); rejections with field
  paths for each misuse; migration tests for the step, the version update and the refused
  downgrade. Fourteen injected faults: thirteen caught at first; the missed one (other seats'
  winnings stored as 0 instead of `NULL`) is caught by a test added for it.

### Task 3 — Foundations: shell, routing, tokens, PWA

- Dependencies (react-router, vite-plugin-pwa, the font) and their ADR.
- App shell and routes (capture routes separate); tokens in light and dark; typography; base
  components; the manifest and service worker (offline app shell); the contrast test.
- FastAPI can serve the built web app (§1.1).
- Tests: component tests for the shell; the contrast test; a build check that the manifest has the
  required fields.
- As implemented: `react-router` 8.5.1, `vite-plugin-pwa` 2.0.0 and `@fontsource/libre-baskerville`
  5.3.0 (ADR-0031). Routes `/`, `/capture` and a not-found page inside one shell
  (`web/src/app/`); the shell shows "Offline" when the browser reports no network, and a banner
  when a new version is ready ("Reload" / "Later"; the page never reloads by itself). Tokens: light
  and dark palettes with their own values, type scale, spacing, radii, a 44 px touch target and a
  focus ring; `Button` and `ButtonLink` base components. The manifest is built from
  `project.json` (`web/manifest.ts`); icons are drawn by `scripts/make_icons.py`. FastAPI serves
  the built app when `WEB_DIST_DIR` is set (`api/app.py`, `WebApp`): unknown paths outside
  `/api/` get `index.html`. Tests: the contrast test reads `tokens.css` and checks every text
  token on every surface (≥ 4.5:1) and the EV marks (≥ 3:1) in both modes; route tests (home with
  and without the server, the capture page makes no request, not found, the offline indicator);
  the manifest's required fields and that its icons exist; six API tests for the static serving.
  Checked in the browser on the production build served by FastAPI (2026-11-08): home, capture
  and not-found pages at phone width in dark mode, the service worker active, and the home and
  `/capture` pages opening with the server stopped.

### Task 4 — Rules in TypeScript

- `web/src/rules/`; the Python corpus exporter and its staleness test; Vitest conformance tests.
- Tests: every corpus hand replayed with identical states, street ends and pots; the `MATH.md` §1.5
  examples exactly; property tests in TypeScript are not added (no new dependency): the corpus is
  the generator.
- Risk addressed: a second implementation that drifts from the first. The corpus is generated from
  the Python dealer and checker, not from the TypeScript code.

### Task 5 — Offline store and sync

- `web/src/store/`, `web/src/sync/`; `idb`, `fake-indexeddb`; `GET /venues` and `GET /players` on
  the server (with tests on both database backends, as in M3a), `web/openapi.json` and the
  generated types regenerated.
- Tests: revision rules (send, lose the response, edit, resend); per-item states from every
  outcome of ADR-0026; a batch that partly fails; the JSON export round-trips into a valid sync
  batch.

### Task 6 — Capture screens

- Session start, new hand (setup, actions, board, end), drafts, known players, entry timings, the
  "Needs attention" list, export.
- Tests: component tests for each step, including incomplete hands (villain cards unknown,
  approximate stacks; AC3) and the worked examples entered through the screens and compared with
  the expected records.

### Task 7 — End-to-end tests and CI

- Playwright tests against the real API (uvicorn with a temporary SQLite database) and the
  production build; a new CI workflow that builds the Python package (with the Rust toolchain),
  the web app and runs them.
- AC2: enter hands offline (`context.setOffline(true)`), reload the app offline, go back online,
  sync; then sync again and check that the server holds each hand once.
- AC3: an incomplete hand saved in the same flow.
- AC4: on every capture route, no request other than `/api/v1/sync`, `/api/v1/venues`,
  `/api/v1/players` and `/api/v1/health`, and no EV, strategy or opponent output on the page.
- AC5 (as reworded in D5): manifest fields and a registered service worker in the production
  build.
- Browsers: WebKit with an iPhone viewport for the flow; Chromium for the service-worker and
  offline tests (Playwright's service-worker support is fullest there). Emulation is not a real
  iPhone: Task 8 checks the device.

### Task 8 — Running it for real

- On Henry's Mac: Tailscale, `tailscale serve`, a start script for the API with the built web app,
  the database location and a backup copy; `DEVELOPMENT.md` gets a "Use on the phone" section.
- On Henry's iPhone: install, open offline, enter and sync a test hand, check storage
  persistence; recorded with the date and the iOS version (AC5).

### Task 9 — Field trial and closing M4a

- Henry enters at least 10 real key hands on the phone. The entry times are reported as recorded
  (AC1), with the interrupted entries separately; what slowed entry down is collected and fixed
  where it is cheap.
- Acceptance evidence table in this file (§5); `ROADMAP.md`, `CLAUDE.md` status.

---

## 3. Out of scope for M4a

Any review screen, EV or solver output (M4b, M3b); hand-history import; editing records on the
server; several users or devices syncing the same data (one phone is assumed; ADR-0026 already
reports conflicts per item if it ever happens); push notifications; a hosted server (D1).

## 4. Risks and open questions

| Risk | Mitigation |
|---|---|
| A 60-second entry is not reachable | The tap budget in Task 1 finds expensive steps before coding; the field trial measures, and the times are reported whatever they are |
| The TypeScript rules drift from the Python rules | Shared corpus generated in Python; staleness test; the server checks every record anyway |
| Hands lost on the phone (storage evicted, phone lost, Mac off for days) | Home Screen install; `navigator.storage.persist()`; JSON export of unsynced records; sync whenever the app opens |
| iPhone behavior differs from Playwright's WebKit | Real-device checks in Task 8, recorded |
| The service worker serves a stale app after an update | An "update available" prompt from `vite-plugin-pwa`; the outbox lives in IndexedDB, not in the cached app, so an update never touches unsynced data |
| Capture accidentally shows analysis later (M4b) | Import rule in ESLint plus the e2e assertion (AC4) |
| The e2e workflow is slow (it builds the Rust extension) | Path filters and caches as in the existing workflows; measured on the first runs, not assumed |
| Record v1 misses something Henry needs at the table | The field trial is the test; a v2 comes with a `schema_version` bump and a migration (M3a risk table) |

---

## 5. Acceptance evidence

Filled in by Task 9.
