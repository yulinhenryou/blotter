# Mathematical Models — Outline

Status: **outline**. Each section gives the framework, the definitions we intend to use, the
open questions, and references. Detailed derivations are marked **[Derive]** and will be worked
out together before or during the milestone that implements them (milestone in brackets).

Reference status: entries marked **(checked)** were verified against the source or a reliable
index while writing this outline; all others are cited from memory and must be checked (title,
venue, year, and the exact statement we rely on) before the corresponding derivation is
finalized.

---

## 0. Notation and units

| Symbol | Meaning |
|---|---|
| $N = \{1, 2\}$ | players (heads-up); $c$ denotes chance |
| $H$, $Z \subseteq H$ | histories, terminal histories |
| $\mathcal{I}_i$ | information sets of player $i$ |
| $A(I)$ | legal actions at information set $I$ |
| $\sigma = (\sigma_1, \sigma_2)$ | behavioral strategy profile |
| $\pi^\sigma(h)$, $\pi^\sigma_{-i}(h)$ | reach probability of $h$; contribution of everyone except $i$ (incl. chance) |
| $u_i(z)$ | utility of player $i$ at terminal $z$; zero-sum: $u_1 = -u_2$ |
| bb | big blinds — the unit of every EV in the product |
| $h$ (in poker contexts) | a hole-card combo, one of $\binom{52}{2} = 1326$ |

EVs inside the solver are in pot-relative or bb units; anything stored or displayed is in bb.
Differences of EVs between actions (EV loss) do not depend on the baseline convention (whether
chips already in the pot count as "spent"), which is why EV loss is the ledger's primary metric.

---

## 1. Game formalization [M1, M2]

### 1.1 Extensive-form games with imperfect information

Standard two-player zero-sum extensive form with perfect recall: histories, player function,
chance probabilities, information partitions, utilities. Behavioral strategies; the expected
utility $u_i(\sigma) = \sum_{z \in Z} \pi^\sigma(z)\, u_i(z)$.

- **Best response**: $b_i(\sigma_{-i}) = \max_{\sigma_i'} u_i(\sigma_i', \sigma_{-i})$.
- **Nash equilibrium**: $\sigma$ with $u_i(\sigma) = b_i(\sigma_{-i})$ for both $i$.
- **Exploitability** (convention used throughout):
  $e(\sigma) = \tfrac{1}{2}\big(b_1(\sigma_2) + b_2(\sigma_1)\big) \ge 0$, with equality iff
  $\sigma$ is a Nash equilibrium. (Some papers report the sum, "NashConv"; we always state which.)
  For hold'em subgames we report $e$ as a percentage of the pot at the subgame root.

### 1.2 Kuhn poker

**Rules.** Three cards J < Q < K; each player antes 1 and receives one card (the six deals are
equally likely, probability 1/6 each). One betting round with a single bet of size 1:

- P1 checks or bets.
- After a check, P2 checks (showdown) or bets; facing that bet, P1 folds or calls.
- After a bet, P2 folds or calls.

Utilities are net chips for P1 (P2 gets the negative): showdown after check–check $\pm 1$;
showdown after a called bet $\pm 2$; a fold loses the ante, so the bettor wins $+1$. Each player has
two information sets per card (P1: opening, facing check–bet; P2: after a check, facing a bet),
12 in total; there are 5 betting sequences per deal, so 30 terminal histories.

**Step 1 — dominated choices.** These hold whatever the opponent does:

- Facing a bet, K calls (it always wins the showdown) and J folds (it always loses).
- P2 after a check: K bets (checking wins 1; betting wins at least 1, and 2 if called). Q checks:
  a bet is called only by K (−2 instead of −1) and folded by J (+1, the same as checking).

What remains are five mixing probabilities:

| Symbol | Probability that … |
|---|---|
| $\alpha$ | P1 bets with J |
| $\gamma$ | P1 bets with K |
| $\beta$ | P1 calls with Q after check–bet |
| $\eta$ | P2 calls a bet with Q |
| $\xi$ | P2 bets with J after a check |

We look for an equilibrium in which P1 never bets Q (justified in Step 3). Each mixing probability
is pinned down by the **opponent's** indifference: a player mixes between two actions only if
they have equal expected value. In conditions 1, 2 and 5 the values are sums over the
opponent's possible cards weighted by how often the opponent reaches this point with each card
(unnormalized; normalizing does not change which action is better).

**Step 2 — indifference conditions.**

1. *P2 holds Q and faces a bet* (sets $\gamma$). P1's betting range is J (weight $\alpha$) or K
   (weight $\gamma$). Calling: $2\alpha - 2\gamma$; folding: $-(\alpha + \gamma)$. Equal iff
   $\gamma = 3\alpha$.
2. *P2 holds J after a check* (sets $\beta$). P1's checking range is Q (weight 1) or K (weight
   $1 - \gamma$). Betting: against Q, P1 calls with probability $\beta$, so
   $\beta(-2) + (1-\beta)(+1) = 1 - 3\beta$; against K, $-2$; total $(1 - 3\beta) - 2(1-\gamma)$.
   Checking loses every showdown: $-1 - (1 - \gamma)$. Equal iff $3\beta = 1 + \gamma$, i.e.
   $\beta = \alpha + 1/3$.
3. *P1 holds J* (sets $\eta$). Betting: against Q, $\eta(-2) + (1-\eta)(+1) = 1 - 3\eta$; against
   K, $-2$; value $(-1 - 3\eta)/2$. Checking: against Q, showdown $-1$; against K, P2 bets and P1
   folds, $-1$; value $-1$. Equal iff $\eta = 1/3$.
4. *P1 holds K* (sets $\xi$). Betting: against J, P2 folds, $+1$; against Q, $1 + \eta$; value
   $(2 + \eta)/2$. Checking: against J, P2 bets with $\xi$ and P1 calls, $1 + \xi$; against Q, P2
   checks, $+1$; value $(2 + \xi)/2$. Equal iff $\xi = \eta = 1/3$.
5. *P1 holds Q and faces a bet* (consistency). P2's betting range is K (weight 1) or J (weight
   $\xi$). Calling: $-2 + 2\xi$; folding: $-(1 + \xi)$. Equal iff $\xi = 1/3$ — consistent with 4.

Since $\gamma = 3\alpha$ is a probability, $\alpha \in [0, 1/3]$.

**Result (the equilibrium family).** For every $\alpha \in [0, 1/3]$:

| | J | Q | K |
|---|---|---|---|
| P1 opening | bet $\alpha$ | check | bet $3\alpha$ |
| P1 facing check–bet | fold | call $\alpha + 1/3$ | call |
| P2 after a check | bet $1/3$ | check | bet |
| P2 facing a bet | fold | call $1/3$ | call |

**Step 3 — why P1 never bets Q.** Against P2's strategy above, with P1 holding Q:

- Betting: J folds ($+1$), K calls ($-2$); value $-1/2$.
- Checking: against J, P2 bluffs with $1/3$ (then P1 calls with $\beta$: $3\beta - 1$) and checks
  with $2/3$ ($+1$), giving $\beta + 1/3$; against K, P2 bets and P1 gets $-2\beta - (1 - \beta) =
  -1 - \beta$. Value $\tfrac12\big((\beta + \tfrac13) + (-1 - \beta)\big) = -1/3$, for every
  $\alpha$ (P1 is indifferent between calling and folding with Q, so the value equals that of
  check–fold).

$-1/2 < -1/3$, so betting Q is a strictly worse deviation.

**Verification that the family is an equilibrium.** Every remaining deviation was checked above
or in Step 1: P1's J and K are indifferent (conditions 3, 4), Q strictly prefers checking (Step 3)
and is indifferent facing a bet (condition 5); P2's Q facing a bet and J after a check are
indifferent (conditions 1, 2); the dominated choices of Step 1 are strict, except P2's Q after a
check when $\alpha = 1/3$ (P1 then never checks K, and betting Q ties with checking). When
$\alpha = 0$, P2's facing-bet information sets are never reached, but $\eta = 1/3$ is still
needed: conditions 3 and 4 give $\eta \ge 1/3$ and $\eta \le \xi = 1/3$, so P1 has no profitable
bet.

**Step 4 — the value $-1/18$.** Take $\alpha = 0$: P1 always checks; folds J, calls Q with 1/3
and calls K when bet into.

| P1 / P2 | Play | P1 value |
|---|---|---|
| J / Q | P2 checks; showdown | $-1$ |
| J / K | P2 bets; P1 folds | $-1$ |
| Q / J | P2 bluffs w.p. 1/3 (P1 calls 1/3: $\tfrac13 \cdot 2 + \tfrac23 \cdot (-1) = 0$); checks w.p. 2/3 ($+1$) | $+2/3$ |
| Q / K | P2 bets; P1 calls 1/3 ($-2$), folds 2/3 ($-1$) | $-4/3$ |
| K / J | P2 bluffs w.p. 1/3, P1 calls ($+2$); checks w.p. 2/3 ($+1$) | $+4/3$ |
| K / Q | P2 checks; showdown | $+1$ |

The sum is $-1/3$; times $1/6$, the value for P1 is $\mathbf{-1/18}$. It does not depend on
$\alpha$: P2's strategy is the same for every $\alpha$, and P1 is indifferent between betting and
checking with J and with K, so any $\alpha$ gives P1 the same value.

**Cited, not derived here.** That this family contains *all* of P1's equilibrium strategies, and
that P2's equilibrium strategy is unique, is Kuhn's (1950) result; it is stated the same way in
the Wikipedia article "Kuhn poker" (checked 2026-11-04), which gives no inline source. Not yet
checked against Kuhn's original paper. The test of "P1 never bets Q" (ROADMAP M1, AC2) relies on
it: in a two-player zero-sum game every equilibrium strategy of P1 is a best response to every
equilibrium strategy of P2, and against P2's unique strategy betting Q is strictly worse (Step 3).

**Test targets** (ROADMAP M1): value $-1/18$; at $\alpha = 0$ and $\alpha = 1/6$ the profile above
has exploitability exactly 0 in rational arithmetic; CFR's average strategy approaches the family
(P1: Q never bets, $P(\text{bet} \mid K) - 3\,P(\text{bet} \mid J) \to 0$,
$P(\text{call} \mid Q) - P(\text{bet} \mid J) \to 1/3$; P2: $\eta, \xi \to 1/3$).

### 1.3 Leduc Hold'em

Six cards (two suits of J, Q, K), ante 1, one private card each, one public card, two betting
rounds with fixed bet sizes (2 in round one, 4 in round two) and a cap on raises; a pair with the
board wins, otherwise the higher card. Large enough to be non-trivial (hundreds of information
sets), small enough to compute exact best responses.

- Test target: exploitability $\to 0$ as iterations grow, and agreement between our two
  independent CFR implementations (tabular and vector-form).
- **[Derive]** count the information sets for our exact rule variant; confirm the rule variant
  matches the one in Southey et al. (2005) so published equilibrium values can be compared.

### 1.4 Heads-up hold'em turn / river subgames

A subgame is rooted at the start of the turn or river and specified by: board $B$, pot $P$,
effective stack $S$, the acting order, an action abstraction, and **ranges** $r_1, r_2 \in
[0,1]^{1326}$ — beliefs over each player's combo, zero for combos conflicting with $B$.

- Combos conflicting with each other (card removal) cannot co-occur; reach probabilities and
  showdown values must account for this.
- **The subgame is solved with the ranges fixed by assumption.** This is not a "safe" re-solve of
  a larger game (Burch et al. 2014; Brown & Sandholm 2017): the equilibrium is the equilibrium of
  the subgame *given* those ranges, and all EVs are conditional on them. The product must show
  this assumption and offer sensitivity analysis (§3.3).
- **Action abstraction**: allowed bets/raises as pot fractions plus all-in, with a raise cap. The
  actually played line is always included, so no action translation is needed for the reviewed
  decision itself. (Background on translation: Ganzfried & Sandholm 2013.)

---

## 2. Regret minimization and CFR [M1, M2]

### 2.1 Regret and regret matching

For a repeated decision with actions $A$ and per-round values $v^t(a)$, cumulative regret
$R^T(a) = \sum_{t=1}^T \big(v^t(a) - v^t(\sigma^t)\big)$. Regret matching plays

$$\sigma^{T+1}(a) = \frac{R^{T,+}(a)}{\sum_{b \in A} R^{T,+}(b)}, \quad x^+ = \max(x, 0),$$

uniform if the denominator is 0. Average regret goes to 0 at rate $O(1/\sqrt{T})$.

- **[Derive]** the no-regret bound for regret matching (Blackwell approachability sketch, or the
  direct potential-function proof).
- Reference: Hart & Mas-Colell (2000).

### 2.2 Counterfactual regret minimization (CFR)

Counterfactual value of information set $I$ for player $i$:

$$v_i(\sigma, I) = \sum_{h \in I} \pi^\sigma_{-i}(h) \sum_{z \sqsupseteq h} \pi^\sigma(h, z)\, u_i(z).$$

Immediate counterfactual regret $r^t(I, a) = v_i(\sigma^t_{I \to a}, I) - v_i(\sigma^t, I)$; run
regret matching independently at every information set. The **average strategy** (weighted by the
player's own reach) converges to a Nash equilibrium in two-player zero-sum games: if each player's
average overall regret is at most $\varepsilon$, the average profile is a $2\varepsilon$-equilibrium.

- **[Derive]** the regret decomposition theorem (overall regret ≤ sum of positive immediate
  counterfactual regrets) and the folk theorem linking average regret to exploitability.
- Reference: Zinkevich, Johanson, Bowling & Piccione (2007).

### 2.3 CFR+

Changes: (1) regret-matching$^+$ — cumulative regrets clipped at zero after every update,
$R^{+,T}(I,a) = \max\big(R^{+,T-1}(I,a) + r^T(I,a),\, 0\big)$; (2) alternating updates between
players; (3) linearly weighted averaging of the strategy (weight $t$ on iteration $t$).

- Reference: Tammelin (2014); Tammelin, Burch, Johanson & Bowling (2015).

### 2.4 Discounted CFR (DCFR)

On iteration $t$, multiply accumulated positive regrets by $t^\alpha / (t^\alpha + 1)$, negative
regrets by $t^\beta / (t^\beta + 1)$, and the contributions to the average strategy by
$\big(t / (t+1)\big)^\gamma$. The authors' recommended setting is $\alpha = 3/2$, $\beta = 0$,
$\gamma = 2$; CFR+ and Linear CFR are related special/limiting cases.

- **[Derive]** why discounting early iterations helps; which parameter settings recover which
  variant. **[Measure]** compare CFR, CFR+, DCFR on Leduc (plot from real runs only).
- Reference: Brown & Sandholm (2019).

### 2.5 Vector-form (public-tree) CFR

For hold'em subgames, the tree contains only public actions and chance cards. At each node each
player holds a vector over 1326 combos: own reach probabilities and counterfactual values. One
traversal updates all combos at once. Mathematically identical to tabular CFR over information
sets (an information set = (public node, own combo)); the implementation differs.

- **[Derive]** the equivalence with tabular CFR, so cross-validation on Leduc is meaningful.
- Reference: Johanson, Bard, Lanctot, Gibson & Bowling (2012).

### 2.6 Showdown and fold evaluation with card removal

At a showdown node, the counterfactual value for player $i$'s combo $h$ is
$\sum_{h'} \pi_{-i}(h') \cdot \mathrm{sign}(\text{rank}(h) - \text{rank}(h')) \cdot \tfrac{P}{2}$
over villain combos $h'$ disjoint from $h$ (and from the board). Naively $O(N^2)$ with
$N \le 1326$. Sorting by hand rank and maintaining running sums — total and per card, then adding
back the overlap via inclusion–exclusion — gives $O(N \log N)$ per node (the sort can be done once
per board).

- **[Derive]** the inclusion–exclusion correction precisely (combos sharing one card with $h$
  are subtracted per card, the combo equal to $h$ is added back), and handle ties (split pots).
- Fold nodes: same blocker correction with a constant payoff.

### 2.7 Best response and exploitability

Best response in the public tree: a backward pass where the best-responding player maximizes per
combo at their own nodes. Exploitability as in §1.1.

- Reference: Johanson, Waugh, Bowling & Zinkevich (2011).

### 2.8 Per-combo action values (input to the ledger)

At a hero decision node $n$ and hero combo $h$, the **action value**
$Q(n, a, h)$ = expected hero payoff (bb) from choosing $a$ at $n$ and following $\sigma$
afterwards, given that hero holds $h$, normalized by the villain's reach at $n$ (i.e. against
villain's range at $n$). In an exact equilibrium, every action in the support of $\sigma(n, h)$
has equal $Q$, and actions outside the support have $Q$ no larger.

- **[Derive]** the normalization (counterfactual value ÷ villain reach), and how to handle
  nodes the equilibrium almost never reaches (villain reach ≈ 0 makes $Q$ ill-conditioned).

---

## 3. Decision Ledger metrics [M3b]

### 3.1 EV loss

$$L(n, h) = \max_{a \in A(n)} Q(n, a, h) - Q(n, a_{\text{taken}}, h) \ \ge 0 \quad \text{(bb)}.$$

Reported alongside: EV of every action, the equilibrium frequencies, the assumed ranges and
abstraction, the solve's exploitability.

### 3.2 Noise floor

The solver returns an approximate equilibrium, so small $L$ values are not distinguishable from
zero. Each evaluation stores a noise floor $\epsilon(n, h)$; losses below it are displayed as
"≈ 0" and counted as non-mistakes in leak statistics.

- **[Derive]** a defensible $\epsilon$: candidates are a per-combo local regret at $n$ against the
  average strategy, or a bound derived from subgame exploitability. Prefer a quantity we can
  compute and test.

### 3.3 Sensitivity to range assumptions

Re-solve under perturbed ranges (e.g. alternative presets, or a mixture-weight perturbation) and
mark a decision **robust** if the best action (or the sign/size of the loss beyond the noise
floor) is unchanged across the perturbation set.

- **[Derive]** a perturbation scheme that is cheap (number of re-solves) and interpretable.

### 3.4 Equilibrium vs. model reference

$Q$ computed against the equilibrium is the default reference. Against an opponent model (§7),
$Q$ is computed with villain's strategy partially fixed (node-locking) and hero best-responding.
The two references are stored separately and never mixed in one statistic.

---

## 4. Luck/skill attribution [M5]

### 4.1 Equity-change decomposition (telescoping identity)

Let a hand pass through nodes $h_0, h_1, \dots, h_T$ (deal, actions, board cards, terminal).
Choose a value function $V(h)$ = hero's expected net result at $h$, with $V(h_T)$ = the realized
net result. Then exactly

$$\text{net} = V(h_0) + \sum_{t=0}^{T-1} \big(V(h_{t+1}) - V(h_t)\big),$$

and each increment is attributed by who moved at $h_t$: chance → **luck**; hero → **hero
decision**; villain → **villain decision**. The identity holds for any $V$; the *meaning* of the
decomposition depends entirely on the choice of $V$.

Guo, Khuu, Zhu, Rosenthal & Schoenberg (2019, checked), building on Schoenberg (2018), use
heads-up hold'em with both players' cards known and define a player's equity as win probability
× pot under the assumption of no future betting, and expected profit as that equity minus the cost
of the player's betting actions. Luck is the change in expected profit due to the cards dealt;
skill is the change due to betting decisions. They evaluate gains per betting round (up to four
luck components and four skill components per hand), treat preflop specially because blinds make
contributions asymmetric, and count bets that make the opponent fold entirely as skill. Through
simulations with scripted strategies, they argue these definitions behave as expected.

Known concerns (raised in Schoenberg 2018 and discussed by Guo et al.): a weak player can be
credited with skill gains in particular hands; measured luck and skill can be correlated; and the
"no future betting" equity can misstate the value of a position mid-hand.

- **[Derive]** the exact accounting for bet, call, raise, fold and showdown under this $V$,
  including the preflop special case, and verify the telescoping identity on hand-computed
  examples (these become unit tests).
- **[Derive]** the property that makes "luck" luck: if $V(h) = \mathbb{E}[V(\text{child}) \mid h]$
  at chance nodes (all cards known, $V$ = all-in equity), each luck increment has conditional mean
  zero. Check whether it holds for our exact definition.

### 4.2 Choice of value function

| Variant | $V(h)$ | Pros | Cons |
|---|---|---|---|
| A. All-in equity, full information | win prob × pot − contribution, both hands known | Simple, matches Guo et al.; luck terms zero-mean | Needs villain's cards; ignores future betting |
| B. Range equity, hero's information | as A but villain's hand integrated over villain's range at $h$ | Works when villain's cards are unknown | Villain actions both change equity and reveal information; zero-mean property can break |
| C. Solver value | equilibrium value of the subgame at $h$ | Accounts for future betting (DIVAT-style "baseline" valuation) | Only where the engine can solve (turn/river); expensive; depends on ranges |

Plan: implement A first (exact, testable), use B for hands where villain's cards are unknown with
a clear label, and study C for turn/river nodes.

- References: Billings & Kan (2006) DIVAT; Zinkevich et al. (2006) MIVAT; Burch et al. (2018)
  AIVAT.

### 4.3 Luck-adjusted result and variance reduction

Luck-adjusted result of a hand: $\tilde W = \text{net} - \sum_{t\,\in\,\text{chance}} \big(V(h_{t+1}) - V(h_t)\big)$.
If the luck terms have conditional mean zero, $\tilde W$ is an unbiased estimator of expected net,
with (hopefully much) lower variance. This is the logic of the MIVAT/AIVAT family of estimators.

- AIVAT also applies control-variate corrections at decision nodes of a player whose strategy is
  *known*. For a human hero and a human villain neither strategy is known, so only chance-node
  corrections apply. **[Derive]** what remains unbiased in our setting, and what doesn't under
  variant B.
- Session level: sum over hands; standard errors from the per-hand luck-adjusted values; report
  actual result, luck-adjusted result, and an interval.

### 4.4 Variance-decomposition view

Across sessions (or players), observed results = true skill + noise. With a random-effects model
$X_k = \mu + \eta_k + \varepsilon_k$, the observed variance splits into a skill (between) part and a
luck (within) part; the "share of skill" is the between-component's fraction. For one player,
skill ($\mu n$) overtakes one standard deviation of luck ($\sigma\sqrt{n}$) after
$n^* = \sigma^2/\mu^2$ hands — a useful, honest number to show when $\mu$ is uncertain (computed
over the posterior of $\mu$, §8).

- References: Dreef, Borm & van der Genugten (2004); Levitt & Miles (2014); Potter van Loon,
  van den Assem & van Dolder (2015); Duersch, Lambrecht & Oechssler (2020, checked).
- **[Derive]** how Duersch et al. operationalize the skill share, and whether it applies to a
  single player's longitudinal data.

### 4.5 Selection bias in live records

Live players log selected hands. Let $S = 1$ if a hand is logged. If $S$ depends on the outcome
or on how memorable the hand is, $\mathbb{E}[\,\cdot \mid S = 1] \ne \mathbb{E}[\,\cdot\,]$ for EV
loss, luck and leak statistics.

Mitigations: (1) store `record_reason`; (2) offer a **random-sample protocol** (e.g. log the next
hand that reaches the turn after a timer fires) so a subset is selected independently of outcome;
(3) compute leak statistics separately on the random subset and the notable subset; (4) session
results come from buy-in/cash-out, never from summing logged hands.

- **[Derive]** under what assumptions statistics on the notable subset are still informative
  (e.g. selection depends on the outcome but not on decision quality given the situation).

---

## 5. Leak detection [M5]

### 5.1 Situation classes

A situation key: street, pot type (single-raised / 3-bet / …), position and in/out of position,
line so far, SPR bucket, facing-bet-size bucket, board-texture class, hand class (value / bluff
catcher / draw / air) relative to the range. Classes may be hierarchical (coarse → fine), which
suggests a hierarchical model.

### 5.2 Model for EV loss

For class $j$ with decisions $i = 1..n_j$ and losses $y_{ij} \ge 0$, many of which are ≈ 0:

- **Two-part (hurdle) model**: mistake indicator $m_{ij} = \mathbb{1}[y_{ij} > \epsilon_{ij}]$ with
  rate $p_j$; magnitude given a mistake with mean $\lambda_j$; mean loss $\theta_j = p_j \lambda_j$.
- **Partial pooling**: e.g. $\theta_j \sim \mathcal{N}(\mu, \tau^2)$ with
  $\bar y_j \mid \theta_j \sim \mathcal{N}(\theta_j, s_j^2 / n_j)$. Posterior mean
  $\hat\theta_j = B_j \mu + (1 - B_j)\bar y_j$ with shrinkage factor
  $B_j = \frac{s_j^2/n_j}{s_j^2/n_j + \tau^2}$. Hyperparameters by empirical Bayes (tier 1) or
  full Bayes (tier 2, PyMC).
- Frequency diagnostics (e.g. fold frequency vs equilibrium frequency) are reported as context,
  not as leaks by themselves: a frequency deviation is not necessarily a loss.
- Dependence: decisions within one hand, and overlapping classes, are correlated. **[Derive]**
  how much this matters and whether to cluster by hand.
- References: Efron & Morris (1975); Morris (1983); Gelman et al. (2013, BDA3); Gelman (2006)
  on priors for variance parameters.

### 5.3 What counts as a leak

Hypothesis per class: $H_{0j}: \theta_j \le \delta_j$ versus $H_{1j}: \theta_j > \delta_j$, where
$\delta_j$ is a materiality threshold (absolute bb per decision, or relative to the player's
overall mean). **[Decide together]** the definition of $\delta$.

### 5.4 Multiple comparisons

- **Benjamini–Hochberg**: order p-values $p_{(1)} \le \dots \le p_{(m)}$, find the largest $k$
  with $p_{(k)} \le k q / m$, reject $H_{(1)}, \dots, H_{(k)}$. Controls FDR at level
  $q\, m_0/m \le q$ under independence or positive regression dependence (PRDS).
- **Benjamini–Yekutieli**: replaces $q$ with $q / \sum_{i=1}^m 1/i$ for arbitrary dependence.
- **Bayesian counterpart**: posterior probabilities $P(\theta_j > \delta_j \mid \text{data})$ from
  the hierarchical model; local false sign rate / local fdr ideas (Efron 2010; Stephens 2017).
  Partial pooling already reduces the multiple-comparisons problem (Gelman, Hill & Yajima 2012) but
  does not replace an explicit error-rate statement.
- **[Decide together]** the reporting rule — e.g. "confirmed" requires both the BH rejection at
  $q$ and posterior probability above a threshold; "suggestive" / "insufficient evidence" tiers
  defined precisely.

### 5.5 Evidence strength and samples needed

Under a normal approximation, to conclude $\theta_j > \delta_j$ at one-sided level $\alpha$ when the
current estimate is $\hat\theta_j$ with per-decision SD $s_j$, roughly
$n \gtrsim \big(z_{1-\alpha}\, s_j / (\hat\theta_j - \delta_j)\big)^2$ decisions are needed.

- **[Derive]** a Bayesian preposterior version ("expected number of additional decisions until the
  posterior probability crosses the threshold, if the current estimate is right"), and its
  behavior when $\hat\theta_j \approx \delta_j$ (the answer should become "very many", not blow up).

### 5.6 Validation by simulation

Synthetic players with planted leaks of known size in known classes. Acceptance properties:
empirical FDR ≤ $q$ (up to Monte Carlo error), interval coverage close to nominal, shrinkage
lowers mean squared error versus raw means, and "samples needed" predictions are roughly right.

---

## 6. Calibration [M6]

### 6.1 Question types and what "truth" means

| Kind | User answer | Resolved against |
|---|---|---|
| Equity estimate | number in [0, 1] (optionally an interval) | model equity vs. assumed range |
| "Is calling +EV?" | yes/no + confidence $f \in [0,1]$ | model verdict |
| Villain bluff probability | $f \in [0,1]$ | model frequency (equilibrium or opponent model) |
| "Villain is bluffing here" | $f \in [0,1]$ | actual cards **when shown** (selection-biased: showdowns only) |

Model-resolved questions measure agreement with the model; showdown-resolved questions measure
agreement with reality but on a biased subset. They are scored and displayed separately.

### 6.2 Scores

- **Brier score**: $\mathrm{BS} = \frac{1}{N}\sum_k (f_k - o_k)^2$. **Murphy decomposition** with
  forecasts grouped into $K$ bins: $\mathrm{BS} = \mathrm{REL} - \mathrm{RES} + \mathrm{UNC}$,
  $\mathrm{REL} = \frac{1}{N}\sum_k n_k (\bar f_k - \bar o_k)^2$,
  $\mathrm{RES} = \frac{1}{N}\sum_k n_k (\bar o_k - \bar o)^2$, $\mathrm{UNC} = \bar o(1 - \bar o)$
  (exact when forecasts take only the $K$ values; otherwise within-bin terms appear).
- **Brier skill score** against a reference forecast (e.g. always the base rate).
- **Continuous answers**: absolute error distributions, bias (mean signed error), interval
  coverage; quantile/pinball loss or CRPS if intervals are collected.
- **Reliability diagrams** with consistency bands (Bröcker & Smith 2007) or the isotonic-regression
  CORP approach (Dimitriadis, Gneiting & Jordan 2021).

### 6.3 Protocol integrity

Answers are locked server-side before reveal (`locked_at < revealed_at`); edits after reveal are
impossible. **[Derive]** minimum sample sizes per bin for a meaningful calibration curve, shown in
the UI as "not enough answers yet".

- References: Brier (1950); Murphy (1973); Gneiting & Raftery (2007).

---

## 7. Opponent models and exploitation [M7]

### 7.1 Per-stat Beta-Binomial with population prior

For opponent $p$ and stat $s$ (e.g. fold to river bet, river bluff frequency when shown down):
$k_{ps} \sim \mathrm{Binomial}(n_{ps}, \theta_{ps})$, $\theta_{ps} \sim \mathrm{Beta}(a_s, b_s)$,
posterior $\mathrm{Beta}(a_s + k_{ps},\, b_s + n_{ps} - k_{ps})$. Population hyperparameters
$(a_s, b_s)$ by empirical Bayes (method of moments or maximum marginal likelihood of the
Beta-Binomial) over all observed opponents. Credible intervals from Beta quantiles.

- Some stats are only observable at showdown (bluff frequencies) → selection bias again (§4.5).
- Extensions (tier 2): correlated stats via a multivariate logit-normal hierarchy; player-type
  mixtures.
- Reference: Southey et al. (2005) for Bayesian opponent modeling in poker.

### 7.2 When to recommend a deviation

Let $\Delta(\theta) = \mathrm{EV}(\text{exploit} \mid \theta) - \mathrm{EV}(\text{equilibrium action}
\mid \theta)$. Recommend (for study, after the session) only if
$P(\Delta(\theta) > 0 \mid \text{data}) \ge 1 - \alpha$, and always report:

- expected gain $\mathbb{E}[\Delta \mid \text{data}]$,
- **cost if wrong**: $-\Delta$ at a pessimistic posterior quantile of $\theta$, and $-\Delta$ against
  an equilibrium-playing opponent.

Robust alternatives that interpolate between equilibrium and exploitation:
restricted Nash response (Johanson, Zinkevich & Bowling 2008), data-biased responses
(Johanson & Bowling 2009), safe exploitation (Ganzfried & Sandholm 2015).

- Engine requirement: solve with villain's strategy partially fixed (node-locking) — plan in M7.
- **[Derive]** how a per-stat posterior maps to a modified villain strategy in the subgame.

---

## 8. Bankroll [M7]

### 8.1 Win-rate posterior

Session results $X_k$ over durations $t_k$ (hours or hands): $X_k \sim \mathcal{N}(\mu t_k,
\sigma^2 t_k)$. Conjugate Normal–Inverse-Gamma prior (tier 1) or a Student-t likelihood for heavy
tails (tier 2). Prior choice matters with small samples: **[Decide together]** a skeptical prior
(centered near zero or slightly negative after rake) versus a weakly informative one.

### 8.2 Risk of ruin

Diffusion approximation with drift $\mu > 0$ and variance $\sigma^2$ per unit time: probability of
ever losing a bankroll $B$ is $\exp(-2\mu B / \sigma^2)$; it is 1 if $\mu \le 0$.
**Bayesian risk of ruin** $= \mathbb{E}_{\text{post}}[\mathrm{RoR}(\mu, \sigma)]$, which is at least
$P(\mu \le 0 \mid \text{data})$ — an honest and often sobering number.

- **[Derive]** the diffusion result; discuss the error of the continuous approximation for
  discrete sessions.
- Reference: Chen & Ankenman (2006).

### 8.3 Kelly-style stake guidance

If playing stake $s$ scales drift and variance as $\mu_s = k\mu_1$, $\sigma_s^2 = k^2 \sigma_1^2$,
the log-growth rate is approximately $g(k) = k\mu_1/B - k^2\sigma_1^2/(2B^2)$, maximized at
$k^* = B\mu_1/\sigma_1^2$; equivalently, the full-Kelly bankroll for stake $s$ is
$\sigma_s^2/\mu_s$, and fractional Kelly with fraction $c$ requires $\sigma_s^2/(c\,\mu_s)$.
Plugging in a noisy $\hat\mu$ over-bets; we integrate over the posterior instead.

- **[Derive]** the growth-rate approximation; the decision rule under posterior uncertainty
  (e.g. maximize posterior expected log-growth, or choose $c$ to bound posterior RoR).
- References: Kelly (1956); MacLean, Thorp & Ziemba (2011); Thorp (2006).

---

## References

Games and equilibrium computation
- Kuhn, H. W. (1950). A simplified two-person poker. *Contributions to the Theory of Games I*.
- Southey, F., et al. (2005). Bayes' Bluff: Opponent Modelling in Poker. *UAI*.
- Hart, S., & Mas-Colell, A. (2000). A simple adaptive procedure leading to correlated equilibrium.
  *Econometrica*.
- Zinkevich, M., Johanson, M., Bowling, M., & Piccione, C. (2007). Regret minimization in games with
  incomplete information. *NIPS*.
- Johanson, M., Waugh, K., Bowling, M., & Zinkevich, M. (2011). Accelerating best response
  calculation in large extensive games. *IJCAI*.
- Johanson, M., Bard, N., Lanctot, M., Gibson, R., & Bowling, M. (2012). Efficient Nash equilibrium
  approximation through Monte Carlo counterfactual regret minimization. *AAMAS*.
- Tammelin, O. (2014). Solving large imperfect information games using CFR+. arXiv.
- Tammelin, O., Burch, N., Johanson, M., & Bowling, M. (2015). Solving heads-up limit Texas hold'em.
  *IJCAI*.
- Brown, N., & Sandholm, T. (2019). Solving imperfect-information games via discounted regret
  minimization. *AAAI*.
- Burch, N., Johanson, M., & Bowling, M. (2014). Solving imperfect information games using
  decomposition. *AAAI*.
- Brown, N., & Sandholm, T. (2017). Safe and nested subgame solving for imperfect-information
  games. *NeurIPS*.
- Ganzfried, S., & Sandholm, T. (2013). Action translation in extensive-form games with large action
  spaces. *IJCAI*.

Luck, skill and value assessment
- Guo, Z., Khuu, I., Zhu, K., Rosenthal, J. S., & Schoenberg, F. P. (2019, published online).
  Distinguishing luck from skill through statistical simulation: a case study. *Communications in
  Statistics – Simulation and Computation*. doi:10.1080/03610918.2019.1698746. **(checked)**
- Schoenberg, F. P. (2018). Cited by Guo et al. as the source of the equity-based definitions; full
  reference to be retrieved. See also Schoenberg (2011), *Introduction to Probability with Texas
  Hold'em Examples*.
- Billings, D., & Kan, M. (2006). A tool for the direct assessment of poker decisions (DIVAT).
  *ICGA Journal*.
- Zinkevich, M., Bowling, M., Bard, N., Kan, M., & Billings, D. (2006). Optimal unbiased estimators
  for evaluating agent performance (MIVAT). *AAAI*.
- Burch, N., Schmid, M., Moravčík, M., Morrill, D., & Bowling, M. (2018). AIVAT: A new variance
  reduction technique for agent evaluation in imperfect information games. *AAAI*.
- Dreef, M., Borm, P., & van der Genugten, B. (2004). Measuring skill in games: several approaches
  discussed. *Mathematical Methods of Operations Research*.
- Levitt, S. D., & Miles, T. J. (2014). The role of skill versus luck in poker: evidence from the
  World Series of Poker. *Journal of Sports Economics*.
- Potter van Loon, R. J. D., van den Assem, M. J., & van Dolder, D. (2015). Beyond chance? The
  persistence of performance in online poker. *PLoS ONE*. (title and venue checked)
- Duersch, P., Lambrecht, M., & Oechssler, J. (2020). Measuring skill and chance in games.
  *European Economic Review*. (title and venue checked)

Shrinkage, multiple testing, calibration
- Efron, B., & Morris, C. (1975). Data analysis using Stein's estimator and its generalizations.
  *JASA*.
- Morris, C. N. (1983). Parametric empirical Bayes inference: theory and applications. *JASA*.
- Gelman, A. (2006). Prior distributions for variance parameters in hierarchical models.
  *Bayesian Analysis*.
- Gelman, A., Carlin, J. B., Stern, H. S., Dunson, D. B., Vehtari, A., & Rubin, D. B. (2013).
  *Bayesian Data Analysis* (3rd ed.).
- Gelman, A., Hill, J., & Yajima, M. (2012). Why we (usually) don't have to worry about multiple
  comparisons. *Journal of Research on Educational Effectiveness*.
- Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate. *JRSS B*.
- Benjamini, Y., & Yekutieli, D. (2001). The control of the false discovery rate in multiple testing
  under dependency. *Annals of Statistics*.
- Efron, B. (2010). *Large-Scale Inference*.
- Stephens, M. (2017). False discovery rates: a new deal. *Biostatistics*.
- Brier, G. W. (1950). Verification of forecasts expressed in terms of probability. *Monthly Weather
  Review*.
- Murphy, A. H. (1973). A new vector partition of the probability score. *Journal of Applied
  Meteorology*.
- Bröcker, J., & Smith, L. A. (2007). Increasing the reliability of reliability diagrams. *Weather
  and Forecasting*.
- Gneiting, T., & Raftery, A. E. (2007). Strictly proper scoring rules, prediction, and estimation.
  *JASA*.
- Dimitriadis, T., Gneiting, T., & Jordan, A. I. (2021). Stable reliability diagrams for
  probabilistic classifiers. *PNAS*.

Opponent modeling, exploitation, bankroll
- Johanson, M., Zinkevich, M., & Bowling, M. (2008). Computing robust counter-strategies. *NIPS*
  (2007 conference).
- Johanson, M., & Bowling, M. (2009). Data biased robust counter strategies. *AISTATS*.
- Ganzfried, S., & Sandholm, T. (2015). Safe opponent exploitation. *ACM Transactions on Economics
  and Computation*.
- Kelly, J. L. (1956). A new interpretation of information rate. *Bell System Technical Journal*.
- Chen, B., & Ankenman, J. (2006). *The Mathematics of Poker*.
- Thorp, E. O. (2006). The Kelly criterion in blackjack, sports betting and the stock market. In
  *Handbook of Asset and Liability Management*.
- MacLean, L. C., Thorp, E. O., & Ziemba, W. T. (Eds.) (2011). *The Kelly Capital Growth Investment
  Criterion*.
