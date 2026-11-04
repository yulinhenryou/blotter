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

**Setting.** One decision is repeated in rounds $t = 1, 2, \dots$ with a finite action set $A$. In
round $t$ the learner plays a mixed strategy $\sigma^t$; then a value $v^t(a)$ for every action is
revealed. The values may depend on anything, including $\sigma^t$ (an adversary may choose them).
The learner receives $v^t(\sigma^t) = \sum_a \sigma^t(a)\, v^t(a)$. Instantaneous and cumulative
regret:

$$r^t(a) = v^t(a) - v^t(\sigma^t), \qquad R^T(a) = \sum_{t=1}^T r^t(a), \quad R^0 = 0.$$

**Regret matching** plays each action in proportion to its positive cumulative regret:

$$\sigma^{T+1}(a) = \frac{R^{T,+}(a)}{\sum_{b \in A} R^{T,+}(b)}, \quad x^+ = \max(x, 0),$$

uniform if the denominator is 0. Example: $R = (3, -1, 1)$ gives $\sigma = (3/4, 0, 1/4)$.

**Bound.** If $|r^t(a)| \le \Delta$ for all $t$ and $a$, then

$$\max_a R^T(a) \le \Delta \sqrt{|A|\, T}, \qquad \text{so the average regret } \tfrac1T \max_a R^T(a) \le \Delta \sqrt{|A| / T}.$$

If every $v^t(a)$ lies in an interval of width $\Delta$, the condition holds: $v^t(\sigma^t)$ lies in
the same interval.

*Proof* (potential function $\Phi(R) = \sum_a (R(a)^+)^2$).

1. *Regret matching makes the new regret orthogonal to the old positive regrets:*
   $\sum_a R^{t-1,+}(a)\, r^t(a) = 0$. If $s = \sum_b R^{t-1,+}(b) > 0$, then
   $R^{t-1,+}(a) = s\,\sigma^t(a)$ and $\sum_a \sigma^t(a)\, r^t(a) = v^t(\sigma^t) - v^t(\sigma^t) = 0$.
   If $s = 0$, every term is 0.
2. *For all real $x$, $r$: $\big((x + r)^+\big)^2 \le (x^+ + r)^2$.* If $x \ge 0$, this is
   $\big((x+r)^+\big)^2 \le (x+r)^2$. If $x < 0$, then $(x + r)^+ \le r^+ \le |r| = |x^+ + r|$.
3. With $x = R^{t-1}(a)$ and $r = r^t(a)$:
   $\Phi(R^t) \le \sum_a \big(R^{t-1,+}(a) + r^t(a)\big)^2
   = \Phi(R^{t-1}) + 2\sum_a R^{t-1,+}(a)\, r^t(a) + \sum_a r^t(a)^2 \le \Phi(R^{t-1}) + |A|\,\Delta^2$.
4. So $\Phi(R^T) \le |A|\,\Delta^2\, T$, and $\max_a R^T(a) \le \max_a R^{T,+}(a) \le \sqrt{\Phi(R^T)}
   \le \Delta\sqrt{|A|\,T}$. ∎

The bound holds for *every* sequence of values. This is what CFR needs: the values seen at one
information set keep changing because the strategies everywhere else keep changing (§2.2).

**Test targets.** For any finite regrets, a regret-matching row is non-negative and sums to 1
(property test, `crates/solver/src/regret.rs`). Inside CFR, every information set satisfies the
bound (§2.2).

- References: regret matching is due to Hart & Mas-Colell (2000) (not yet checked against the
  paper). The bound in this form is Zinkevich et al. (2007), Theorem 4 (checked against the NIPS
  proceedings version; that version defers the proof to a full version). The proof above is the
  standard potential-function argument, written out here.

### 2.2 Counterfactual regret minimization (CFR)

**Notation** (as in §2.7). $\pi^\sigma_{-i}(h)$ is the product of chance's and the opponent's
probabilities on the path to $h$, and $\pi^\sigma_i(h)$ is player $i$'s own. With perfect recall,
$\pi^\sigma_i(h)$ is the same for every $h \in I$; write it $\pi^\sigma_i(I)$. $u_i(\sigma, h)$ is
$i$'s expected payoff from $h$ on when everyone plays $\sigma$.

**Counterfactual values** of an information set $I$ of player $i$ and of its actions:

$$v_i(\sigma, I, a) = \sum_{h \in I} \pi^\sigma_{-i}(h)\, u_i(\sigma, h \cdot a), \qquad
v_i(\sigma, I) = \sum_{a} \sigma(I, a)\, v_i(\sigma, I, a) = \sum_{h \in I} \pi^\sigma_{-i}(h)\, u_i(\sigma, h).$$

"Counterfactual": this is the value of $I$ if $i$ had played to reach it. Zinkevich et al. (2007,
eq. 5) divide by $\pi^\sigma_{-i}(I)$ and multiply it back in eqs. 6–7; the products are the
same.

**Algorithm (vanilla CFR, simultaneous updates).** Start with $R^0(I, a) = S^0(I, a) = 0$. For
$t = 1, \dots, T$:

1. At every information set, $\sigma^t(I)$ is regret matching (§2.1) on $R^{t-1}(I, \cdot)$, so
   $\sigma^1$ is uniform.
2. For every information set $I$, of either player $i$, and every action $a$:
   $R^t(I, a) = R^{t-1}(I, a) + v_i(\sigma^t, I, a) - v_i(\sigma^t, I)$ and
   $S^t(I, a) = S^{t-1}(I, a) + \pi^{\sigma^t}_i(I)\, \sigma^t(I, a)$.

The output is the **average strategy** $\bar\sigma^T(I, a) = S^T(I, a) / \sum_b S^T(I, b)$, uniform
where the denominator is 0 (Zinkevich et al. 2007, eq. 4). Both players' updates in iteration $t$
use the same $\sigma^t$ ("simultaneous"); CFR+ alternates (§2.3).

In `crates/solver/src/cfr.rs` one iteration is four passes over the arena (nodes in post-order,
§2.7):

1. regret matching at every information set;
2. reach probabilities, root first (decreasing node index);
3. $u_1(\sigma^t, h)$, children first (increasing node index);
4. for every information set, sums over its nodes.

**Overall regret.** Player $i$'s regret against the sequence actually played is
$R_i^T = \max_{\sigma'_i} \sum_{t=1}^T \big(u_i(\sigma'_i, \sigma^t_{-i}) - u_i(\sigma^t)\big)$.
Zinkevich et al. (eq. 3) divide this by $T$.

**Lemma 1 (the average strategy plays like the average of the iterations).** For every terminal
history $z$: $\pi^{\bar\sigma^T}_i(z) = \frac1T \sum_t \pi^{\sigma^t}_i(z)$.

*Proof.* By perfect recall, $i$'s decisions on the path to $z$ are a fixed list
$(I_1, a_1), \dots, (I_k, a_k)$, with $\pi^\sigma_i(I_1) = 1$ and
$\pi^\sigma_i(I_{j+1}) = \pi^\sigma_i(I_j)\,\sigma(I_j, a_j)$. Let
$x_j = \frac1T \sum_t \pi^{\sigma^t}_i(I_j)\,\sigma^t(I_j, a_j)$, the average own reach of the path
up to and including $a_j$, and $x_0 = 1$. Then $S^T(I_j, a_j) = T x_j$ and
$\sum_b S^T(I_j, b) = \sum_t \pi^{\sigma^t}_i(I_j) = T x_{j-1}$. So
$\bar\sigma^T(I_j, a_j) = x_j / x_{j-1}$, and the product telescopes:
$\pi^{\bar\sigma^T}_i(z) = x_k = \frac1T \sum_t \pi^{\sigma^t}_i(z)$. If some $x_j = 0$, the first
such factor is 0 and both sides are 0. ∎

Since $u_i$ is linear in $i$'s terminal reach probabilities, for every opponent strategy
$\sigma'_{-i}$:

$$u_i(\bar\sigma^T_i, \sigma'_{-i}) = \frac1T \sum_t u_i(\sigma^t_i, \sigma'_{-i}).$$

This is why the sums are weighted by the player's own reach. A plain average of the rows does not
have this property: a row visited rarely would count as much as one visited every time.

**Theorem 1 (exploitability of the average = average regret).** In a two-player zero-sum game,

$$e(\bar\sigma^T) = \frac{R_1^T + R_2^T}{2T}.$$

*Proof.* Let $\bar u = \frac1T \sum_t u_1(\sigma^t)$. By Lemma 1 for P2's average, for every
$\sigma'_1$: $u_1(\sigma'_1, \bar\sigma^T_2) = \frac1T \sum_t u_1(\sigma'_1, \sigma^t_2)$. Taking the
maximum over $\sigma'_1$ gives $b_1(\bar\sigma^T_2) = \bar u + R_1^T / T$. In the same way,
$b_2(\bar\sigma^T_1) = \max_{\sigma'_2} \frac1T \sum_t u_2(\sigma^t_1, \sigma'_2) = -\bar u + R_2^T / T$.
Add the two and halve (convention of §1.1). ∎

Consequences:

- **Zinkevich et al. (2007), Theorem 2.** If $R_i^T / T \le \varepsilon$ for both players, then
  $\bar\sigma^T$ is a $2\varepsilon$-equilibrium. Proof: $u_1(\bar\sigma^T) \ge -b_2(\bar\sigma^T_1)$,
  so P1's gain from deviating is
  $b_1(\bar\sigma^T_2) - u_1(\bar\sigma^T) \le b_1 + b_2 = 2e \le 2\varepsilon$. The same holds for P2.
- **Value bound.** Let $v^*$ be the game value. Then $b_1(\bar\sigma_2) \ge v^* \ge -b_2(\bar\sigma_1)$,
  and $u_1(\bar\sigma)$ lies in the same interval. So $|u_1(\bar\sigma^T) - v^*| \le 2e(\bar\sigma^T)$.
  For Kuhn, this ties the value test (AC1) to the exploitability.

**Theorem 2 (regret decomposition; Zinkevich et al. 2007, Theorem 3).**
$R_i^T \le \sum_{I \in \mathcal{I}_i} R^{T,+}(I)$, where $R^{T,+}(I) = \max_a R^T(I, a)^+$.

*Proof.* Fix $i$.

- *Definitions.* For an information set $I$ of $i$ and a pure strategy $s$ of $i$, let
  $V^t(I, s) = \sum_{h \in I} \pi^{\sigma^t}_{-i}(h)\, u_i\big((s, \sigma^t_{-i}), h\big)$: the
  counterfactual value of $I$ when $i$ plays $s$ from $I$ on. Let $\mathrm{Succ}(I, a)$ be the
  information sets of $i$ reached after $I \cdot a$ before any other decision of $i$.
  $\mathrm{Succ}(\varnothing)$ is those reached before any decision of $i$.
- *Expansion.* For $\tau = s$ or $\tau = \sigma^t_i$,
  $$\sum_{h \in I} \pi^{\sigma^t}_{-i}(h)\, u_i\big((\tau, \sigma^t_{-i}), h \cdot a\big)
  = W^t(I, a) + \sum_{I' \in \mathrm{Succ}(I, a)} V^t(I', \tau).$$
  $W^t(I, a)$ collects the terminals below $I \cdot a$ that are reached without another decision
  of $i$, so it does not depend on $\tau$. The reason: between $h \cdot a$ and $i$'s next
  decision $h'$, only chance and the opponent act, so $\pi_{-i}(h') = \pi_{-i}(h)$ times the
  probability of that path. Perfect recall puts every such $h'$ in some
  $I' \in \mathrm{Succ}(I, a)$, and every $h' \in I'$ arises this way from exactly one
  $h \in I$.
- *One step.* Let $a = s(I)$. Then $V^t(I, s)$ is the left side of the expansion with
  $\tau = s$, and $v_i(\sigma^t, I, a)$ is the left side with $\tau = \sigma^t_i$. So
  $$\sum_t \big(V^t(I, s) - v_i(\sigma^t, I)\big) = R^T(I, a) + \sum_{I' \in \mathrm{Succ}(I, a)} \sum_t \big(V^t(I', s) - V^t(I', \sigma^t_i)\big).$$
- *Induction*, from the deepest information sets up:
  $\sum_t \big(V^t(I, s) - V^t(I, \sigma^t_i)\big) \le \sum_{I'' \in D(I)} R^{T,+}(I'')$, where
  $D(I)$ is $I$ together with all of $i$'s information sets below it. The induction step uses
  $R^T(I, a) \le R^{T,+}(I)$. It also uses that the sets $D(I')$ for the different
  $I' \in \mathrm{Succ}(I, a)$ are disjoint subsets of $D(I) \setminus \{I\}$ (by perfect recall,
  each information set has one own history). All terms are $\ge 0$.
- *Root.* $u_i(s, \sigma^t_{-i}) = W^t_0 + \sum_{I \in \mathrm{Succ}(\varnothing)} V^t(I, s)$, and
  likewise for $\sigma^t_i$. Summing over $t$ gives
  $\sum_t \big(u_i(s, \sigma^t_{-i}) - u_i(\sigma^t)\big) \le \sum_{I \in \mathcal{I}_i} R^{T,+}(I)$.
  The maximum in $R_i^T$ is attained at a pure strategy: $u_i$ is linear in a mixed strategy,
  and every behavioral strategy is equivalent to a mixed one. ∎

**Combined bound.** At information set $I$, CFR is regret matching (§2.1) with values
$v^t(a) = v_i(\sigma^t, I, a)$, and the learner's value is
$v_i(\sigma^t, I) = \sum_a \sigma^t(I, a)\, v^t(a)$. The values lie in an interval of width at most
$\Delta_u \sum_{h \in I} \pi^{\sigma^t}_{-i}(h) \le \Delta_u$, where
$\Delta_u = \max_z u_1(z) - \min_z u_1(z)$. The sum $\sum_{h \in I} \pi_{-i}(h)$ is the probability of
reaching $I$ when $i$ plays towards it, so it is at most 1. Hence

$$\max_a R^T(I, a) \le \Delta_u \sqrt{|A(I)|\, T}, \qquad
e(\bar\sigma^T) \;\le\; \frac{1}{2T} \sum_{i} \sum_{I \in \mathcal{I}_i} R^{T,+}(I)
\;\le\; \frac{\Delta_u \sqrt{A_{\max}}\, \big(|\mathcal{I}_1| + |\mathcal{I}_2|\big)}{2\sqrt{T}}.$$

For Kuhn, $\Delta_u = 4$, $A_{\max} = 2$ and $|\mathcal{I}_1| + |\mathcal{I}_2| = 12$, so
$e \le 24\sqrt2 / \sqrt T$. This is a worst-case guarantee; measured values are below. The middle
inequality can be checked on every run: its left side comes from the best-response code (§2.7)
and its right side from the solver's own regret table.

Nothing above says that the current strategy $\sigma^T$ converges; the guarantees are about
$\bar\sigma^T$.

**Hand computation: the first iteration on Kuhn.** $\sigma^1$ is uniform, so the action values are
those of §2.7, hand computation 1, but with P1 *also* mixing uniformly at its later decisions.
Each deal has probability 1/6. Per history (P1 values; P2's are negated):

- P1 holding J:
  - check: P2 checks w.p. 1/2 ($-1$) or bets ($-1$ fold, $-2$ call) → $-5/4$;
  - bet: P2 folds ($+1$) or calls ($-2$) → $-1/2$.
- P1 holding Q, check: against J, $\tfrac12(1) + \tfrac12\big(\tfrac12(-1) + \tfrac12(2)\big) = 3/4$;
  against K, $-5/4$.

| Information set | $\pi_{-i}(h)$ per history | Action values $v_i(\sigma^1, I, \cdot)$ | $v_i(\sigma^1, I)$ | $R^1(I, \cdot)$ |
|---|---|---|---|---|
| P1 `J/` (check, bet) | 1/6 | $-5/12$, $-1/6$ | $-7/24$ | $(-1/8, +1/8)$ |
| P1 `Q/` (check, bet) | 1/6 | $\tfrac16(\tfrac34 - \tfrac54) = -1/12$, $\tfrac16(\tfrac32 - \tfrac12) = 1/6$ | $1/24$ | $(-1/8, +1/8)$ |
| P1 `K/` (check, bet) | 1/6 | $1/4$, $1/2$ | $3/8$ | $(-1/8, +1/8)$ |
| P1 `J/pb` (fold, call) | 1/12 | $-1/6$, $-1/3$ | $-1/4$ | $(+1/12, -1/12)$ |
| P2 `Q/b` (fold, call) | 1/12 | $-1/6$, $\tfrac1{12}(-2 + 2) = 0$ | $-1/12$ | $(-1/12, +1/12)$ |
| P2 `J/p` (check, bet) | 1/12 | $-1/6$, $-1/12$ | $-1/8$ | $(-1/24, +1/24)$ |

Own reach: P1's opening and every P2 information set have $\pi_i = 1$, so $S^1 = (1/2, 1/2)$ there.
`J/pb` has $\pi_1 = 1/2$ (P1 checked with 1/2), so $S^1 = (1/4, 1/4)$. Regret matching then gives
$\sigma^2(\texttt{J/}) = (0, 1)$: after one iteration, P1 bets every card. The table was
cross-checked outside the repository by an independent recursive implementation in exact
fractions. The in-repository test is `first_iteration_matches_hand_computation`.

**Test targets.**

- The first-iteration table above.
- Theorem 1 with Theorem 2: $e(\bar\sigma^T) \le \frac1{2T}\sum_I R^{T,+}(I)$, and the per-set bound
  $\max_a R^T(I,a) \le \Delta_u\sqrt{|A(I)|\,T}$. These are checked as property tests on games
  with Kuhn's tree and random payoffs.
- Kuhn (AC1, AC2; tolerances under *Measurements*).

**Measurements** (Kuhn, vanilla CFR, average strategy unless noted). Command:
`cargo test -p solver --release print_kuhn_measurements -- --ignored --nocapture`. Code as in the
commit that adds this section (parent `1c53bfb`); rustc 1.99.1, Apple M4. The run is
deterministic, and debug and release builds print identical numbers.

| $T$ | $e(\bar\sigma^T)$ | regret bound $\frac1{2T}\sum_I R^{T,+}(I)$ | $u_1(\bar\sigma^T) + \tfrac1{18}$ | $e(\sigma^{T+1})$, current strategy |
|---|---|---|---|---|
| 10 | 9.621e-2 | 1.087e-1 | 2.036e-2 | 1.910e-1 |
| 100 | 2.567e-2 | 2.692e-2 | −4.317e-4 | 2.283e-1 |
| 1,000 | 7.269e-3 | 7.394e-3 | −1.664e-6 | 2.150e-1 |
| 10,000 | 2.318e-3 | 2.330e-3 | 9.160e-6 | 1.495e-1 |
| 100,000 | 6.762e-4 | 6.762e-4 | 8.545e-7 | 2.675e-1 |

Deviations from the equilibrium family (§1.2) of the average strategy, with
$\alpha = P(\text{bet} \mid J)$:

| $T$ | $P(\text{bet} \mid Q)$ | $P(\text{bet} \mid K) - 3\alpha$ | $P(\text{call} \mid Q, pb) - \alpha - \tfrac13$ | $\eta - \tfrac13$ (P2 calls Q) | $\xi - \tfrac13$ (P2 bluffs J) | $\alpha$ |
|---|---|---|---|---|---|---|
| 10 | 3.333e-1 | 1.190e-1 | 4.417e-1 | 5.587e-1 | −3.333e-2 | 0.1875 |
| 100 | 3.458e-2 | −3.170e-2 | 9.938e-2 | 1.029e-1 | −2.684e-2 | 0.1942 |
| 1,000 | 3.458e-3 | −4.553e-3 | 3.369e-2 | 3.546e-2 | −5.644e-3 | 0.2010 |
| 10,000 | 3.458e-4 | −1.067e-2 | 9.699e-3 | 5.951e-3 | 1.211e-3 | 0.2078 |
| 100,000 | 3.458e-5 | 8.369e-3 | 2.491e-3 | 7.838e-5 | 2.336e-3 | 0.2053 |

Observations from these numbers:

- **Average strategy.** Exploitability falls by roughly $\sqrt{10}$ per factor of 10 in $T$,
  the rate of the bound. The regret bound is within 2% of the measured exploitability from
  $T = 100$ on.
- **Current strategy.** It does not converge (0.15–0.27 throughout).
- **Q never bets.** $P(\text{bet} \mid Q) \approx 0.3458/T$: Q bets only in the first iterations,
  and iteration 2 bets every card.
- **Slow directions.** $P(\text{bet} \mid K) - 3\alpha$ is not monotone, and $\alpha$ settles
  near 0.2. Directions along which exploitability changes little converge slowly.

**Tolerances** (tests in `crates/solver/src/cfr.rs`, all at $T = 10^4$):

- $e \le 3 \times 10^{-3}$ (measured 2.318e-3).
- $|u_1 + \tfrac1{18}| \le 2 \times 10^{-5}$ (measured 9.16e-6). The value bound above,
  $|u_1 + \tfrac1{18}| \le 2e$, is also checked at every checkpoint.
- $P(\text{bet} \mid Q) \le 10^{-3}$.
- Structure deviations $\le 0.02$, about twice the largest measured (0.0107).
- Strictly preferred actions (§1.2, Step 1) have probability $\ge 0.98$.

- Reference: Zinkevich, Johanson, Bowling & Piccione (2007). Checked against the NIPS proceedings
  version: eqs. 3–8 and Theorems 2–4 as cited above. The proofs there are deferred to a full
  version; the proofs here are written out for this project.

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

**Definitions.** Fix the opponent's strategy $\sigma_{-i}$. For a node $h$ let $\pi_{-i}(h)$ be the
product of chance's and the opponent's probabilities on the path to $h$ (player $i$'s own
probabilities are left out: $i$ is assumed to steer towards $h$). For a pure strategy $s_i$ of the
responder, let $v_i(h)$ be $i$'s expected payoff of the subtree below $h$ when $i$ plays $s_i$
and everyone else plays as given; then $u_i(s_i, \sigma_{-i}) = v_i(\text{root})$.

**Why information sets, not nodes.** At an information set $I$ the responder must choose one action
for all $h \in I$. Grouping the terminal histories below $I$ by $h$, the part of $u_i$ that depends
on the choice $a$ at $I$ is

$$Q(I, a) = \sum_{h \in I} \pi_{-i}(h)\, v_i(h \cdot a),$$

(the responder's own reach to $I$ is a common factor and does not change the argmax). The best
response picks $\arg\max_a Q(I, a)$. Maximizing separately at each node $h$ would let the
responder "see" the opponent's private card and overstates $b_i$: against the uniform strategy in
Kuhn, a node-wise P2 gets $1/2$ instead of the correct $5/12$ (below).

**Order of decisions.** $Q(I, a)$ needs $v_i$ below $I$, which depends on $i$'s choices at deeper
information sets but not on those at $I$'s level or above. With perfect recall every node of $I$ has
the same own-depth $d(I)$ — the number of $i$'s decisions before it — and every information set of
$i$ below a node of $I$ has a larger depth. So decide all information sets with the largest depth
first, then the next level, up to depth 0, recomputing $v_i$ once per level. Large games need
faster methods (Johanson et al. 2011); Kuhn and Leduc are small, and the simple version is easier
to check.

**Algorithm** (as implemented in `crates/solver/src/best_response.rs`; nodes are stored in
post-order, children before parents):

1. $\pi_{-i}$ for every node, root first (decreasing node index).
2. $d$ for every node, root first; group $i$'s information sets by depth.
3. For each level from the deepest: compute $v_i$ for every node in one pass in increasing index
   (responder nodes already decided use their action), then set each information set of the level
   to $\arg\max_a Q(I, a)$, lowest action index on ties.
4. $b_i(\sigma_{-i}) = v_i(\text{root})$ with all decisions made.

Exploitability: $e(\sigma) = \tfrac12\big(b_1(\sigma_2) + b_2(\sigma_1)\big)$ (§1.1). The code is
generic over the number type; tests run it with exact rationals.

**Hand computation 1: Kuhn, against the uniform strategy** (every action with probability 1/2).
Values are P1's or P2's net chips; each card of the opponent has probability 1/2.

*P1's best response.* Facing check–bet: J folds ($-1$ beats calling, $-2$); Q calls (against J
$+2$, against K $-2$: average $0 > -1$); K calls. Opening:

| P1 card | Bet | Check | Best |
|---|---|---|---|
| J | $\tfrac12(-2) + \tfrac12(+1) = -\tfrac12$ | P2 checks: $-1$; bets: P1 folds, $-1$ → $-1$ | bet, $-\tfrac12$ |
| Q | against J $\tfrac32$, against K $-\tfrac12$ → $\tfrac12$ | against J $\tfrac12(1) + \tfrac12(2) = \tfrac32$, against K $-\tfrac32$ → $0$ | bet, $\tfrac12$ |
| K | $\tfrac12(2) + \tfrac12(1) = \tfrac32$ | $\tfrac12(1) + \tfrac12(2) = \tfrac32$ | tie, $\tfrac32$ |

$b_1 = \tfrac13\big(-\tfrac12 + \tfrac12 + \tfrac32\big) = \tfrac12$.

*P2's best response.* P1 bets with probability 1/2 and, after check–bet, calls with 1/2.

| P2 card | Facing a bet | After a check | Value $\tfrac12(\text{bet}) + \tfrac12(\text{check})$ |
|---|---|---|---|
| J | fold $-1$ (call: $-2$) | bet $\tfrac12(-2) + \tfrac12(1) = -\tfrac12$ (check: $-1$) | $-\tfrac34$ |
| Q | call: $\tfrac12(2) + \tfrac12(-2) = 0$ (fold: $-1$) | bet: against J $\tfrac32$, against K $-\tfrac12$ → $\tfrac12$ (check: $0$) | $\tfrac14$ |
| K | call $+2$ | bet $\tfrac32$ (check: $1$) | $\tfrac74$ |

$b_2 = \tfrac13\big(-\tfrac34 + \tfrac14 + \tfrac74\big) = \tfrac{5}{12}$.

*Value of uniform against uniform.* With $s = \pm 1$ the sign of P1's showdown: bet gives
$\tfrac12(2s) + \tfrac12 = s + \tfrac12$; check gives $\tfrac12 s + \tfrac12\big(\tfrac12(2s) - \tfrac12\big)
= s - \tfrac14$; average $s + \tfrac18$. Over the six deals $E[s] = 0$, so $u_1 = \tfrac18$.
Exploitability $e = \tfrac12\big(\tfrac12 + \tfrac5{12}\big) = \tfrac{11}{24}$.

**Hand computation 2: why the opponent's reach matters.** P1 bets only with K, checks J and Q;
facing check–bet J folds, Q and K call. P2's best response:

- J: after a check P1 holds Q (K never checks): check $-1$ beats bet $-2$; facing a bet P1 holds K:
  fold $-1$. Value $-1$.
- Q: after a check P1 holds J: check and bet both give $+1$ (tie). Facing a bet P1 holds K, so fold
  ($-1$, not call $-2$). Value $\tfrac12(1) + \tfrac12(-1) = 0$.
- K: after a check P1 holds J or Q: bet ($+1$ against J, which folds; $+2$ against Q, which calls)
  beats check ($+1$, $+1$). Value $\tfrac32$.

$b_2 = \tfrac13\big(-1 + 0 + \tfrac32\big) = \tfrac16$. Summing the histories of "Q facing a bet"
*without* the reach weights would see $+2$ against J and $-2$ against K, call, and get $b_2 = 0$:
the test of this case fails if the weighting is removed.

**Checks.** Both computations, and the zero exploitability of the §1.2 family for
$\alpha \in \{0, 1/6, 1/3\}$, were cross-checked outside the repository by enumerating all
$2^6$ pure strategies of each player with exact fractions; the in-repository tests are
`crates/solver/src/best_response.rs`.

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
  incomplete information. *NIPS 20*, 1729–1736. **(checked)**
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
