# Vision

> Working name: **Blotter** (provisional). Elsewhere in `docs/` it is called "the project".

**A trading blotter for your poker decisions.**

A trader writes every trade on a blotter. At the end of the day the desk runs P&L attribution:
which part of the result came from genuine edge, and which part from market noise. A good desk
does not judge a trader by one day's P&L, and does not believe a strategy works until the
evidence is strong enough.

Poker players rarely get that discipline. Results are dominated by card variance for tens of
thousands of hands. Memory favors dramatic hands. Self-assessment is shaped by recent outcomes.
This project applies the desk's discipline to poker decisions: **record each decision, price it,
attribute the result, and only believe a conclusion when the statistics support it.**

## 1. What it is, and what it is not

It is a **post-game review and learning tool** built around measurement:

- a ledger of decisions priced in big blinds of expected value,
- an attribution of results into decision quality and card variance,
- leak detection that reports how strong the evidence is,
- training that measures how well-calibrated the player's intuition is,
- opponent and bankroll models that carry their uncertainty all the way into recommendations.

It is **not another GTO solver**. Strong open-source solvers already exist (TexasSolver,
postflop-solver and its GUIs WASM Postflop / Desktop Postflop) and so do commercial study and
review tools. Here the solver is plumbing: an EV engine for heads-up turn and river spots. The
value of the product lies in the statistics on top.

## 2. Target users

**Primary (first) user: a live cash-game regular who reviews their own play.** Concretely, Henry:
about two years of live and online No-Limit Hold'em, theory background (*The Theory of Poker*,
*Modern Poker Theory*), comfortable with equilibrium concepts, wants numbers that can be trusted.

What this user needs that existing tools under-serve:

- **Live-first capture.** Live players have no hand-history files. They need to log a key hand
  on a phone, between sessions or on a break, in under a minute, even when information is
  incomplete (villain's cards not shown, stack sizes approximate).
- **Honest feedback from small samples.** A live player sees roughly an order of magnitude fewer
  hands than an online player. With small samples, the most important output is often
  "not enough evidence yet — here is how many more decisions would settle it".
- **Models of specific regulars.** Live games have recurring opponents. Observations about them
  accumulate slowly and should be combined with population tendencies in a principled way.

Secondary users later: online players who can import hand histories; coaches reviewing a
student's ledger. Neither is an early priority.

## 3. The five pillars

### 3.1 Decision Ledger

Every decision is an entry, like a trade:

| Field | Example |
|---|---|
| Situation | River, single-raised pot, hero in position, board K♠7♦2♣T♥3♠, pot 20 bb, stack 80 bb |
| Assumptions | Range presets for both players, bet-size abstraction, solver version and achieved exploitability |
| Available actions | check, bet 33%, bet 75%, bet 150%, all-in |
| EV of each action | for hero's actual combo, in bb |
| Action taken | bet 75% |
| EV loss | best EV − EV of the action taken (bb), with a noise floor from solver error |

The ledger is the foundation for everything else: aggregation by situation, trends over time, and
the inputs to attribution and leak detection. Decisions the engine cannot price yet (preflop,
flop, multiway) are still recorded — marked *unscored*, never silently dropped.

### 3.2 Luck/Skill Attribution

The realized result of a hand is split into components:

- **Decision EV** — equity gained or lost through betting decisions (hero's and villain's);
- **Card variance** — equity gained or lost through the cards dealt.

The method follows published work: the equity-change definition of luck and skill studied by
Guo, Khuu, Zhu, Rosenthal and Schoenberg, the DIVAT/MIVAT/AIVAT family of value-assessment and
variance-reduction estimators from the University of Alberta poker group, and variance-
decomposition approaches to skill versus chance. Formulas, assumptions and sources are in
`MATH.md` §4. Aggregated over sessions, this answers: *"Was this a bad month, or bad play?"* —
with an interval, not a verdict.

### 3.3 Statistically Honest Leak Detection

Leaks are defined per *situation class* (e.g. "river, facing a large bet, bluff-catcher,
single-raised pot"). For each class we estimate the player's typical EV loss and frequency
deviations, using hierarchical / empirical Bayes shrinkage so that classes with few samples are
pulled toward the player's overall level instead of producing noisy extremes. Because many
classes are examined at once, multiple-comparison control (e.g. Benjamini–Hochberg false
discovery rate) is applied.

Each reported leak comes with:

- an **evidence strength** (posterior probability / adjusted significance),
- an **effect size** in bb per decision and bb per 100 hands of exposure,
- **samples needed**: how many more decisions in this class would confirm or dismiss it.

The principle: **"insufficient evidence" is a valid and frequent answer. A false positive is a
defect.**

### 3.4 Calibration Training

During review, before the model's answer is revealed, the player commits a judgment: their
equity estimate, the probability villain is bluffing, whether a call is +EV and how confident
they are. The commitment is locked; then the answer is shown. Over time the product tracks Brier
score, its decomposition (reliability / resolution), calibration curves and error distributions.
The question this pillar answers: *"How good is my intuition, and where is it biased?"*

A design note we keep explicit: most answers are *model* answers (computed under range
assumptions), so calibration against them measures agreement with the model, not with reality.
Questions that resolve against actual outcomes (cards shown at showdown) are tracked separately,
with their own selection bias noted.

### 3.5 Risk-Aware Exploitation & Bankroll

- **Opponent models** for recurring live opponents: population statistics as the prior, updated
  with observed hands, reported with credible intervals.
- **Exploitation only with evidence.** A deviation from equilibrium is suggested (for study, after
  the session) only when the posterior evidence for the opponent's tendency is strong enough, and
  always together with **the cost if the read is wrong** — the EV given up if the opponent
  actually plays close to equilibrium or at the pessimistic end of the credible interval.
- **Bankroll management from the posterior.** Risk of ruin and Kelly-style stake guidance are
  computed by integrating over the posterior distribution of the win rate, not by plugging in a
  point estimate. A player whose win rate is uncertain is told so, and the advice is correspondingly
  conservative.

## 4. Principles

1. **Honesty over impressiveness.** Every number has an uncertainty and a provenance. The product
   never shows a precise-looking EV without the assumptions it depends on.
2. **Evidence thresholds are explicit.** What counts as "confirmed" is a documented, testable rule.
3. **Post-game only.** The product is for review and learning after play. It does not provide
   real-time assistance, and the capture flow never shows strategy or EV.
4. **Fast capture, careful analysis.** Entry is optimized for speed and tolerance of missing data;
   analysis is optimized for correctness.
5. **Restraint in design.** Visual language inspired by Apple and LoveFrom: generous white space,
   a restrained palette, careful alignment, a Baskerville-style serif for headings, tabular
   figures for every number so data-dense pages stay readable. Visualizations are interactive
   and meaningful — a range matrix you can explore, EV as a function of bet size, a calibration
   curve with its uncertainty band — rather than static tables.
6. **Privacy by default.** Hand records and notes about real opponents are personal data. They
   stay on infrastructure the user controls; there is no telemetry.

## 5. Non-goals

- **No real-time assistance (RTA).** The product is not to be used during play and is not
  designed for it. No overlay, no live advice, no in-hand lookups.
- **No speed race with full-tree solvers.** We do not compete with PioSolver, TexasSolver or
  similar tools on full-tree solve speed, and we do not solve preflop or full game trees.
- **No multiway pots early.** Early milestones cover heads-up situations only. Multiway hands can
  be recorded but are unscored.
- **Not a training-site content library.** No pre-solved libraries, no course material.

## 6. How it differs from existing tools

| | Open-source solvers (TexasSolver, postflop-solver + GUIs) | Commercial study / review tools | This project |
|---|---|---|---|
| Core output | Equilibrium strategies for a spot | Strategies, drills, aggregated reports | Ledger of priced decisions, attribution, evidence-graded leaks |
| Unit of analysis | One spot | Spot / hand / database | Decision → hand → session → career, with uncertainty at each level |
| Uncertainty | Solver convergence | Mostly point estimates | Intervals and evidence strength everywhere; explicit "insufficient evidence" |
| Luck vs skill | — | Usually all-in-EV adjustment | Published decompositions (equity-change, value-assessment estimators) |
| Live play | Manual spot setup | Mostly built on online hand histories | Phone-first capture with incomplete information |
| Opponent modeling | — | HUD-style frequencies | Bayesian, population prior, credible intervals, cost-if-wrong |
| Calibration of intuition | — | Quiz-style drills | Proper scoring rules, calibration curves, tracked over time |

The comparison describes categories of tools, not detailed feature audits of specific products.

## 7. Known limitations we accept and document

- **Range assumptions dominate EV accuracy.** Turn and river EVs depend on the ranges assumed at
  the start of the subgame, which we cannot derive without solving earlier streets. We record the
  assumptions, offer sensitivity analysis, and only label a decision a clear mistake when the
  verdict is robust to reasonable range changes.
- **Selection bias in live records.** Live players log the hands they remember or find
  interesting, not a random sample. Statistics over logged hands are conditional on that
  selection; session-level results come from buy-in / cash-out records, not from logged hands.
  `MATH.md` §4.5 treats this explicitly.
- **Limited scope of the engine.** Only heads-up turn and river decisions are priced at first.
