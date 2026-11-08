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

**Rules** (Southey et al. 2005, §2, checked against the arXiv version 1207.1411). Large enough
to be non-trivial (936 information sets), small enough for exact best responses.

| Rule | Paper | Our implementation (`crates/solver/src/games/leduc.rs`) |
|---|---|---|
| Deck | "two suits with three cards in each suit" | J, Q, K in two suits (named s, h; the paper names none) |
| Ante | "Both players start the first round with 1 already in the pot" | 1 chip each |
| Deal | one private card each in round one; one board card in round two | ordered pairs of distinct cards, probability 1/30 each; the board card uniform over the 4 remaining cards |
| Bet size | "raise amounts of 2 and 4 in the first and second round" | a bet or raise matches the opponent's total and adds 2 (round one) or 4 (round two) |
| Raise cap | "a two-bet maximum" | per round, at most one bet and one raise (Figure 1 draws this tree) |
| Actions | fold / call / raise; "folding when both players have equal money in the pot … we do not include" | without a pending bet: check, bet; facing one: fold, call, raise (raise only below the cap) |
| End of a round | a call that is not the first action of the round | check–check or a call |
| Showdown | "the strongest poker hand with a combination of their private cards and the public board cards" | see below |

**Interpretations** — points the paper leaves implicit:

1. *Who acts first.* Figure 1 shows a single betting round rooted at player 1; we let P1 act first
   in both rounds.
2. *Hand strength.* With one private and one board card, the only poker hands are a pair and a
   high card. A card that pairs the board wins; otherwise the higher rank wins. The players
   cannot both pair the board, since each rank has only two cards.
3. *Ties.* If both players hold the same rank (and so neither pairs the board), the pot is split:
   payoff 0. Kuhn has no ties; Leduc does.

**One round of betting.** Write `c` for check or call, `r` for bet or raise, `f` for fold. From
Figure 1, a round has

- 6 decision points: P1 at ∅, `cr`, `rr`; P2 at `c`, `r`, `crr`.
- 4 folds: `rf`, `rrf`, `crf`, `crrf`.
- 5 sequences that close the round: `cc`, `rc`, `rrc`, `crc`, `crrc`.

Two-action decision points are ∅, `c` (check or bet) and `rr`, `crr` (fold or call: the cap is
reached); `r` and `cr` have three (fold, call, raise).

**Payoffs.** Each player's contribution is the ante plus every call and bet they made. A
folder loses their contribution; at showdown both contributions are equal and the winner wins
the loser's. Examples (P1's payoff): `rrf` (P1 bets, P2 raises, P1 folds) $= -(1 + 2) = -3$;
both rounds `rrc` with P1 winning $= 1 + 2\cdot2 + 2\cdot4 = 13$, the largest pot.

**Counting the tree** (with suits, as dealt). Per deal of private cards there are 6 decision
points and 4 folds in round one, and for each of the 5 continuing sequences and each of the 4
board cards another round with 6 decision points and 9 ends:

| Count | Derivation | Value |
|---|---|---|
| Terminal histories | $30 \times (4 + 5 \times 4 \times 9)$ | 5,520 |
| Decision nodes | $30 \times (6 + 5 \times 4 \times 6)$ | 3,780 |
| Chance nodes | $1 + 30 \times 5$ (the deal; one board deal per deal and continuing sequence) | 151 |

**Information sets.** A player sees their own card, all actions, and the board card once dealt.
Per player:

- Round one: 6 own cards × 3 decision points = 18, each containing 5 histories (the opponent
  holds one of the other 5 cards).
- Round two: 6 own cards × 5 board cards × 5 continuing round-one sequences × 3 decision points
  = 450, each containing 4 histories (one of the other 4 cards).

That is 468 per player and **936 in total**; check: $2 \times (18 \times 5 + 450 \times 4) = 3{,}780$
decision nodes. Suits never decide a showdown, so information sets that differ only in suits are
strategically identical. Merging them leaves $2 \times (3 \times 3 + 3 \times 3 \times 5 \times 3)
= 288$ (round two: 3 own ranks × 3 board ranks, since a board card can share the player's rank).
We solve the game as dealt, with 936 information sets, and do not merge. Both 936 and 288 appear
in the literature for Leduc (found by a web search, not checked against a primary source); the
two derivations above show they describe the same game with and without suit isomorphism.

**Game value.** For any profile $\sigma$, both $u_1(\sigma)$ and the game value $v^*$ lie in
$[-b_2(\sigma_1), b_1(\sigma_2)]$, an interval of width $b_1 + b_2 = 2e(\sigma)$: P1's best
response to $\sigma_2$ earns at least $v^*$, since $v^* = \min_{\sigma_2'} \max_{\sigma_1'}
u_1$; and $\sigma_1$ guarantees P1 at most $v^* = \max_{\sigma_1'} \min_{\sigma_2'} u_1$, so
P2's best response holds P1 to $-b_2(\sigma_1) \le v^*$. So
$|v^* - u_1(\bar\sigma)| \le 2e(\bar\sigma)$ for CFR's average strategy. The recorded run
(`docs/results/README.md`) gives, for CFR+ at $T = 10^5$, $u_1 = -0.0856064$ and
$e = 1.09 \times 10^{-6}$:

$$v^* \in [-0.0856086,\ -0.0856042] \quad \text{chips per hand for P1.}$$

Recent papers found by a web search quote about $-0.0856$; not checked against a primary source.

**Measured convergence** (exploitability $e$ of the average strategy, chips; $u_1$ in brackets).
From `docs/results/m1-leduc-convergence.csv`; command, commit and machine in
`docs/results/README.md`. The runs are deterministic: a repeat run and a debug build gave
byte-identical CSVs.

| $T$ | CFR | CFR+ | DCFR(1.5, 0, 2) |
|---|---|---|---|
| 10 | 0.927 (−0.0368) | 0.520 (−0.2199) | 0.713 (−0.1803) |
| 100 | 0.173 (−0.0916) | 1.34e-2 (−0.0838) | 7.55e-3 (−0.0857) |
| 1,000 | 3.98e-2 (−0.0912) | 2.47e-4 (−0.0856) | 1.98e-4 (−0.0856) |
| 10,000 | 1.04e-2 (−0.0871) | 4.82e-6 (−0.0856) | 8.36e-6 (−0.0856) |
| 100,000 | 2.99e-3 (−0.0863) | 1.09e-6 (−0.0856) | 2.14e-6 (−0.0856) |

Observations, on Leduc only:

- **Vanilla CFR** falls by 3.8× and 3.5× per factor of 10 from $10^3$ to $10^5$, close to the
  $\sqrt{10} \approx 3.2$ of its bound.
- **CFR+ and DCFR** are about 160–200 times less exploitable than CFR at $10^3$ iterations and
  1,200–2,700 times at $10^4$ and $10^5$. DCFR is ahead of CFR+ from 20 to $5 \times 10^3$
  iterations (nearly tied at $5 \times 10^3$); CFR+ is ahead from $10^4$. Brown & Sandholm (2019) found
  DCFR faster on their (larger) benchmark games; we draw no general conclusion from one small
  game.
- **Not monotone.** $e$ rises from 1 to 2 iterations for CFR+ and DCFR, and DCFR's rises
  slightly from $10^4$ to $2 \times 10^4$ (8.36e-6 to 8.59e-6). Only the bound of §2.3 is
  guaranteed to shrink, not $e$ itself.

**Tests** (`games/leduc.rs`, `cfr.rs`): the payoffs above and others, the betting cap, the node
counts, 936 information sets with 5 or 4 histories each and the derived action counts, 288 after
merging suits; AC4 — for each variant, $e$ after 100 iterations is below $e$ after 10 and both
respect the bound of §2.3 (measured values in the table; the counts avoid the first iterations,
where $e$ can rise).

Not done in M1: agreement between two independent CFR implementations on Leduc (M2, ADR-0015).

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

### 1.5 No-limit hold'em: betting rules and pot accounting [M3a]

The rules every stored hand is checked against (`ARCHITECTURE.md` §7.3; validator, test dealer
and decision-point extraction in M3a all implement this section). Scope of record version 1
(ADR-0024): no-limit hold'em cash games with 2–10 seats, small and big blind, straddles, antes.

**Source.** Poker TDA Rules, 2026 version 1.1 (21 Sept 2026) **(checked**, rules 36-C, 45-A,
49-A, 49-B, 67-A, read on pokertda.com on 2026-11-07**)**. The TDA rules are written for
tournaments; for cash games cardrooms follow house rules, which agree with them on the points
used here as far as we know, but no cash-game rulebook was checked. Rules marked *(house)* below
are not in the TDA text; Henry confirmed them as the practice of the cardrooms Henry plays in
(2026-11-07, ADR-0024).

#### Notation

Seats are numbered clockwise; "after seat $i$" means the next seat clockwise among those dealt in.
All amounts are integer chips (ADR-0012). For seat $i$:

| Symbol | Meaning |
|---|---|
| $s_i$ | starting stack (may be unknown) |
| $a_i$ | ante posted (dead money, not part of any street's bet) |
| $x_i$ | chips committed on the current street, blinds and straddles included ("amount to") |
| $v_i$ | live chips committed in the hand: $\sum_{\text{streets}} x_i$ |
| $c_i$ | total committed in the hand: $a_i + v_i$ |
| $w_i$ | chips won (entered, not computed — see below) |

A seat is **folded**, **all-in** ($c_i = s_i$) or **active** (neither). On each street, $B = \max_i
x_i$ is the **current bet** and $F$ the **full-raise size**.

#### Forced bets and order of action

1. Antes are posted first and are dead: they count in $c_i$, never in $x_i$. A big-blind ante is
   one ante posted by the big-blind seat.
2. Non-heads-up, the small blind is the first seat after the button and the big blind the next;
   heads-up, the button posts the small blind (TDA 36-C). Straddles *(house)* are posted by the
   consecutive seats after the big blind, each at least twice the previous forced bet. Forced bets
   are live: they count in $x_i$.
3. Preflop, the first to act is the seat after the last forced bet (big blind or last straddle).
   On later streets it is the first non-folded seat after the button. Heads-up this gives TDA
   36-C — the button acts first preflop and last afterwards — with no special case.
4. Action moves clockwise, skipping folded and all-in seats.

Not in version 1: dead buttons, missed-blind and new-player posts, a forced bet posted all-in for
less than its amount, Mississippi or button straddles.

#### Legal actions

At the start of a street: postflop $B = 0$ and $F = $ the big blind *(house: the minimum opening
bet is one big blind; not stated in the TDA text)*. Preflop $B = $ the last forced bet and $F = B$,
so the minimum raise is to $2B$ — twice the big blind, or twice the last straddle *(house)*.

For the active seat $i$ to act, with $r_i = s_i - c_i$ chips behind:

| Action | Allowed when | New $x_i$ |
|---|---|---|
| fold | always (folding when a check is possible is legal, if unwise) | — |
| check | $x_i = B$ | $x_i$ |
| call | $x_i < B$ | $\min(B,\ x_i + r_i)$ — all-in if short |
| bet | $B = 0$ | $y$ with $y \ge F$, or $y = r_i$ (all-in) |
| raise | $B > 0$ and seat $i$ has **raise rights** | $y$ with $y \ge B + F$, or $B < y = x_i + r_i$ (all-in) |

After a bet or raise to $y$: if $y - B \ge F$ it is a **full** bet or raise and $F \leftarrow y -
B$; otherwise (an all-in short of a full raise) $F$ is unchanged. In both cases $B \leftarrow y$.
Since a full raise is at least the previous $F$, $F$ never decreases, so "the largest prior full
bet or raise" (TDA 45-A) and "the last full valid bet or raise" (TDA 49-A) are the same number.

**Raise rights.** A seat that has not yet acted on this street has them (a forced bet is not an
action, so the big blind and straddlers keep their option). A seat that has acted — after which
$x_i$ was the current bet, or it went all-in — has them again only if $B - x_i \ge F$.

*Why this is TDA 49-A.* The rule: an all-in, or several short all-ins together, totalling less than
a full raise does not reopen the betting for a player who has already acted. Let $x_i$ be what
seat $i$ matched when it last acted. If no full raise has happened since, $F$ is unchanged and $B -
x_i$ is the sum of the short all-ins, so the condition is exactly "they total at least a full
raise". If a full raise of size $F'$ has happened since, then $B - x_i \ge F'$, and $F' $ is the
current $F$ unless a later full raise replaced it by $F'' \le B - x_i$ as well. Either way the seat
has raise rights. Limit poker's 50 % rule (TDA 49-B) does not apply to no-limit.

**End of a street.** An active seat **must act** if $x_i < B$, or if it has not yet acted on this
street and at least one other seat is active. A street ends when at most one seat is not folded,
or when no seat must act. Two consequences: a street that starts with fewer than two active seats
has no betting (the remaining board is dealt), and a lone active seat that owes nothing does not
act, since nobody is left to bet against — for example the big blind when one player has called
all-in for exactly the big blind and everyone else has folded.

**End of the hand.** Either one seat is left (it wins everything after the uncalled bet is
returned), or the river ends with two or more non-folded seats (showdown). The board must then be
complete — five cards — even if the betting stopped earlier because players were all-in.

#### Uncalled bets and pots

Both are computed on **live** chips $v_i$; antes are dead and always go into the main pot. (On
totals $c_i$ a big-blind ante breaks things: a big blind who folds to an all-in bet smaller than
its ante would have the largest total and "get back" chips that were never a bet.)

Let $v_{(1)} \ge v_{(2)}$ be the two largest live totals over **all** seats, folded ones included.
The seat with $v_{(1)}$ gets $u = v_{(1)} - v_{(2)}$ back (TDA 67-A): the part of its last bet or
raise that nobody matched. Write $v'_i$ for the live totals after this return and $c'_i = a_i +
v'_i$.

**Lemma.** After the return, no folded seat has $v'_i$ greater than the largest $v'$ of a non-folded
seat. *Proof.* Every seat active at the end of a street has $x_i = B$, so seats active at the start
of a street have equal live totals from earlier streets. A seat folds only when facing a bet, so at
that moment the seat that made the bet — which acted on this street, so was active at its start —
has a larger live total. If that seat folds later, it does so facing a still larger one. Live totals
never fall, so the chain ends at a non-folded seat whose live total exceeds every folded one. The
return lowers only the top seat, to $v_{(2)}$, which is still at least every folded live total. ∎

**Pots.** Let $L_1 < L_2 < \dots < L_m$ be the distinct values of $v'_i$ over non-folded seats, and
$L_0 = 0$. Pot $k$ is

$$P_k = [k = 1] \sum_{\text{all } i} a_i \;+\; \sum_{\text{all } i} \big(\min(v'_i, L_k) -
\min(v'_i, L_{k-1})\big),$$

and its **eligible** seats are the non-folded seats with $v'_i \ge L_k$. Pot 1 is the main pot.
By the lemma, $\sum_k P_k = \sum_i a_i + \sum_i v'_i = \sum_i c'_i$: every committed chip is in
exactly one pot. Eligibility is nested — each pot's eligible set contains the next one's — so seat
$i$ is eligible for exactly pots $1, \dots, t_i$, where $L_{t_i} = v'_i$. (Version 1 excludes a
seat all-in on its ante, so every non-folded seat is eligible for the main pot.)

#### Results and conservation

Who won is entered, not computed: deciding a showdown needs the hand evaluator (M2), and live
records often lack the losers' cards. The entered $w_i$ must be **feasible**: $w_i = 0$ for folded
seats, and for every $j = 1, \dots, m$

$$\sum_{i:\ t_i \le j} w_i \;\le\; \sum_{k \le j} P_k .$$

*Necessary:* seats eligible only for pots $1..j$ can be paid only from those pots. *Sufficient:*
pay the seats in increasing order of $t_i$, each from the lowest pots with chips left; when the
seats with $t_i = j$ are paid, the chips taken so far are at most $\sum_{k\le j} P_k$ and all of
pots $1..j$ are open to them, so the greedy never runs out. (A Hall-type condition; the nesting
is what makes the $m$ prefix sums enough.)

**Rake** is derived, $\rho = \sum_k P_k - \sum_i w_i$, and must be $\ge 0$; the prefix condition
with $j = m$ says exactly that. With final stacks $f_i = s_i - c'_i + w_i$ and nets $n_i = w_i -
c'_i$:

$$\sum_i f_i + \rho = \sum_i s_i, \qquad \sum_i n_i = -\rho .$$

Hero's net $n_{\text{hero}}$ is derived the same way. A known stack bounds the totals: $c_i \le
s_i$, with equality exactly when the seat is all-in. If a seat is all-in and its stack is unknown,
the stack is derived: $s_i = c_i$.

#### Worked examples (fixtures for M3a Task 2)

Checked by hand and with an independent throwaway script; blinds 1/2 throughout.

**Example 1 — three-way all-in, one side pot.** Button A has 50, small blind B 120, big blind C
200. Preflop: B posts 1, C posts 2; A raises all-in to 50 (full: $50 - 2 = 48 \ge F = 2$, so $F
\leftarrow 48$); B raises all-in to 120 (full: $70 \ge 48$); C calls 120. The street ends; with
fewer than two active seats the board is dealt with no more betting.

- Totals $c = (50, 120, 120)$; $u = 120 - 120 = 0$.
- Levels $L = (50, 120)$: main pot $P_1 = 50 + 50 + 50 = 150$, eligible A, B, C; side pot $P_2 =
  70 + 70 = 140$, eligible B, C. $P_1 + P_2 = 290 = \sum c$.
- Entered result $w_A = 150$, $w_C = 135$: prefix sums $150 \le 150$ and $285 \le 290$, feasible;
  rake $\rho = 5$; nets $(+100, -120, +15)$, sum $-5 = -\rho$.
- Entered result $w_A = 160$, $w_C = 130$: the total is fine ($290 \le 290$) but the first prefix
  fails ($160 > 150$) — A cannot win from the side pot. Rejected, with the error on $w_A$.

**Example 2 — a short all-in does not reopen the betting.** On the flop A bets 100 ($F = 100$). B
goes all-in for 150: $150 - 100 = 50 < 100$, not a full raise, $F$ stays 100, $B = 150$. C has not
acted, so C may raise, to at least $150 + 100 = 250$; C calls 150. Back to A: $B - x_A = 50 < 100$,
so A may only call or fold. A record in which A raises here is rejected, with the error on that
action.

**Example 3 — two short all-ins together reopen it.** As Example 2, but C goes all-in for 210
($210 - 150 = 60 < 100$, again not full). Back to A: $B - x_A = 110 \ge 100$, so A has raise
rights; the minimum raise is to $210 + 100 = 310$, the last full raise being still 100 (TDA 49-A).

**Example 4 — uncalled bet.** Preflop, F raises to 100 and G goes all-in for 500; everyone else,
including the blinds, folds, and F folds. Totals: SB 1, BB 2, F 100, G 500. $u = 500 - 100 = 400$
goes back to G, so $v'_G = 100$. One level, $L_1 = 100$: $P_1 = 1 + 2 + 100 + 100 = 203$, eligible
G only. With $w_G = 203$: $\rho = 0$, $n_G = 203 - 100 = +103$. With a big-blind ante of 2 as well,
the big blind's total is 4 but its live total still 2: $u$ is still 400, and $P_1 = 2 + 203 = 205$.

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

### 2.3 CFR+ and alternating updates

CFR+ (Tammelin 2014; Tammelin, Burch, Johanson & Bowling 2015) changes three things in vanilla
CFR: regret matching$^+$ instead of regret matching, alternating instead of simultaneous updates,
and an average weighted by $t$. Neither algorithm samples; the whole tree is walked every
iteration.

**Regret matching$^+$.** Store *regret-like values* $Q$ instead of regrets:

$$Q^0(a) = 0, \qquad Q^t(a) = \big(Q^{t-1}(a) + r^t(a)\big)^+,$$

and play regret matching on $Q$ (§2.1). Negative regret is forgotten at once, so an action that
becomes good is played again as soon as its regret turns positive. Regret matching must first pay
back all the negative regret it has accumulated. (This is the intuition Tammelin et al. 2015
give. Their Theorem 2 is a *tracking-regret* bound for RM$^+$, which is only a partial
explanation and is not used here.)

**Lemma 1** (Tammelin et al. 2015, Lemma 1). $Q^t(a) - Q^{t-1}(a) \ge r^t(a)$, so
$Q^T(a) \ge R^T(a)$.
*Proof.* $Q^t(a) = \max\big(Q^{t-1}(a) + r^t(a), 0\big) \ge Q^{t-1}(a) + r^t(a)$. Sum over $t$. ∎

**Lemma 2** (Tammelin et al. 2015, Lemma 2). If $|r^t(a)| \le \Delta$, then
$Q^T(a) \le \Delta\sqrt{|A|\,T}$.
*Proof.* As in §2.1, with $\Phi = \sum_a Q(a)^2$. Step 1 still holds:
$\sum_a Q^{t-1}(a)\, r^t(a) = 0$. Step 2 is easier: $Q^{t-1} \ge 0$, so
$\big((Q^{t-1} + r)^+\big)^2 \le (Q^{t-1} + r)^2$. ∎

**Alternating updates.** Iteration $t$ is two passes (Tammelin 2014, Algorithm 1; Burch,
Moravčík & Schmid 2019, eq. 16):

1. P1's pass. The profile is $(\sigma^t_1, \sigma^t_2)$. Update P1's values with the instantaneous
   regrets $r^t$ of this profile. Add $w_t\, \pi_2(I)\, \sigma^t_2(I, a)$ to P2's strategy sums.
2. P2's pass. Regret matching on P1's *new* values gives $\sigma^{t+1}_1$. The profile is
   $(\sigma^{t+1}_1, \sigma^t_2)$. Update P2's values. Add $w_t\, \pi_1(I)\, \sigma^{t+1}_1(I, a)$ to
   P1's strategy sums.

So each player's average is built from exactly the strategies the *other* player's regrets were
computed against. For CFR+, $w_t = t$. In `crates/solver/src/cfr.rs` each pass first computes the
whole profile, then reach, values and updates, as in §2.2. Every history of an information set
therefore sees the same strategy, which is the vector-form semantics of Tammelin's algorithm.

**Why the proof of §2.2 does not carry over.** Theorem 1 of §2.2 needs both players' regrets to
refer to the same profiles. With alternating updates, P1's regret pairs $\sigma^t_1$ with
$\sigma^t_2$, but P2's pairs $\sigma^{t+1}_1$ with $\sigma^t_2$. The original CFR+ correctness proof
(Tammelin et al. 2015, Theorem 3) overlooked this. Farina, Kroer & Sandholm (2019) gave a sequence
of alternating updates with zero regret for both players but constant exploitability (as reported
by Burch et al. 2019, Observation 1). Burch et al. repaired the proof; the next three results
follow their argument, with weights and with a shorter proof of Lemma 4.

**Theorem 3** (Burch et al. 2019, Theorem 1, here with weights $w_t \ge 0$, $W = \sum_t w_t$).
Let

- $R_1^w = \max_{\sigma'_1} \sum_t w_t \big(u_1(\sigma'_1, \sigma^t_2) - u_1(\sigma^t_1, \sigma^t_2)\big)$,
- $R_2^w = \max_{\sigma'_2} \sum_t w_t \big(u_2(\sigma^{t+1}_1, \sigma'_2) - u_2(\sigma^{t+1}_1, \sigma^t_2)\big)$,
- $\bar\sigma_1$ be the own-reach-weighted $w$-average of $\sigma^{t+1}_1$ and $\bar\sigma_2$ that of
  $\sigma^t_2$, as the passes above accumulate them.

Then

$$e(\bar\sigma) = \frac{R_1^w + R_2^w}{2W} - \frac1{2W} \sum_t w_t \Big(u_1(\sigma^{t+1}_1, \sigma^t_2) - u_1(\sigma^t_1, \sigma^t_2)\Big).$$

*Proof.* Lemma 1 of §2.2 holds with weights: replace $\frac1T \sum_t$ by $\frac1W \sum_t w_t$ in
its proof. So $u_1(\sigma'_1, \bar\sigma_2) = \frac1W \sum_t w_t\, u_1(\sigma'_1, \sigma^t_2)$. Taking
the maximum gives $b_1(\bar\sigma_2) = R_1^w / W + \frac1W \sum_t w_t\, u_1(\sigma^t_1, \sigma^t_2)$.
In the same way,
$b_2(\bar\sigma_1) = R_2^w / W - \frac1W \sum_t w_t\, u_1(\sigma^{t+1}_1, \sigma^t_2)$, using
$u_2 = -u_1$. Add the two and halve. ∎

With simultaneous updates, $\sigma^{t+1}_1$ is replaced by $\sigma^t_1$ everywhere, the last sum
vanishes, and $w_t = 1$ gives Theorem 1 of §2.2. With alternating updates the last sum is P1's
*improvement*: how much P1's update gained against the very strategy it was computed from. The
next lemma shows it is never negative.

**Lemma 4** (updates never hurt; the result of Burch et al. 2019, Theorems 5 and 7). Take any of the
update rules of this section and §2.4. The stored value becomes $D' = c(x)\, x$ with
$x = D + r$, where $c(x) > 0$ for $x > 0$ and $c(x) \ge 0$ otherwise. Let $\sigma = \mathrm{RM}(D)$
produce the values $v$, let $r(a) = v(a) - \sigma \cdot v$, and let $\sigma' = \mathrm{RM}(D')$. Then:

(a) **One decision:** $\sigma' \cdot r \ge 0$, i.e. $\sigma' \cdot v \ge \sigma \cdot v$.

(b) **Whole game:** if player $i$ updates every information set this way from the counterfactual
regrets of the profile $(\sigma_i, \sigma_{-i})$, then $u_i(\sigma'_i, \sigma_{-i}) \ge u_i(\sigma_i, \sigma_{-i})$.

*Proof of (a).*

- $\sigma' = \mathrm{RM}(x)$: the positive part of $D'$ is the positive part of $x$, scaled by
  positive factors that are equal across actions (one factor per sign per iteration).
- $\sum_a D^+(a)\, r(a) = 0$. If $D^+ \neq 0$, then $\sigma \propto D^+$ and $\sigma \cdot r = 0$.
  Otherwise every term is 0.
- $y \mapsto y^+$ is non-decreasing, so $x^+(a) - D^+(a)$ has the sign of $r(a)$. Hence
  $\sum_a x^+(a)\, r(a) \ge \sum_a D^+(a)\, r(a) = 0$. If $\sum_a x^+(a) > 0$, divide by it.
- If $x^+ = 0$, then $D^+ = 0$ as well. Otherwise every $a$ with $D(a) > 0$ has
  $r(a) \le -D(a) < 0$, so $\sum_a D^+(a)\, r(a) < 0$, a contradiction. So $\sigma$ and $\sigma'$
  are both uniform, and $\sigma' \cdot r = \sigma \cdot r = 0$. ∎

*Proof of (b)* (a performance-difference identity; Burch et al. instead prove that every action's
counterfactual value does not decrease). Fix $\sigma_{-i}$. Let $\Delta(h) = u_i(\sigma', h) - u_i(\sigma, h)$.

- At a node of $i$:
  $\Delta(h) = \sum_a \sigma'(h, a)\, \Delta(h \cdot a) + \sum_a \big(\sigma'(h, a) - \sigma(h, a)\big)\, u_i(\sigma, h \cdot a)$.
- At other nodes, $\Delta(h)$ is the probability-weighted sum of the children's $\Delta$.
- At terminals it is 0.

Unrolling from the root, each node of $i$ is reached with probability
$\pi^{\sigma'}_i(h)\, \pi_{-i}(h)$. Grouping nodes by information set (perfect recall:
$\pi^{\sigma'}_i(h) = \pi^{\sigma'}_i(I)$) gives

$$u_i(\sigma'_i, \sigma_{-i}) - u_i(\sigma_i, \sigma_{-i}) = \sum_{I \in \mathcal{I}_i} \pi^{\sigma'}_i(I) \sum_a \sigma'(I, a)\, r(I, a),$$

with $r(I, a) = v_i(\sigma, I, a) - v_i(\sigma, I)$ (§2.2). Each inner sum is $\ge 0$ by (a). ∎

DCFR with $\alpha \ge 0$ has a factor of at least $1/2$ on positive values (§2.4). That is why the
solver rejects $\alpha < 0$: with a negative $\alpha$, $t^{-\alpha}$ grows without bound and can overflow, which
makes the factor $1/(1 + t^{-\alpha})$ exactly 0 in floating point.

**Corollary (the bound checked for every variant).** Theorem 2 of §2.2 holds for weighted sums
with the same proof: replace $\sum_t$ by $\sum_t w_t$. With Theorem 3 and Lemma 4:

$$e(\bar\sigma) \;\le\; \frac1{2W} \sum_i \sum_{I \in \mathcal{I}_i} \max_a \Big(\sum_t w_t\, r^t(I, a)\Big)^+ .$$

This holds for vanilla CFR ($w_t = 1$, simultaneous), CFR+ ($w_t = t$) and DCFR ($w_t = t^\gamma$,
any $\alpha \ge 0$ and $\beta$). A test-only record in the solver accumulates
$\sum_t w_t\, r^t(I, a)$ and $\sum_t w_t$. The property test checks the inequality against the
independent best response (§2.7), on games with Kuhn's tree, random payoffs and random DCFR
parameters.

**CFR+'s bound from its stored values.** With $w_t = t$, Lemma 1 and Abel summation ($Q^0 = 0$):

$$\sum_{t=1}^T t\, r^t(a) \;\le\; \sum_{t=1}^T t\,\big(Q^t(a) - Q^{t-1}(a)\big) \;=\; T\,Q^T(a) - \sum_{t=1}^{T-1} Q^t(a) \;\le\; T\,Q^T(a).$$

Tammelin et al. (2015) get the same inequality from their Lemma 3 (bounded sequences with
non-negative partial sums). With $W = T(T+1)/2$, the Corollary becomes

$$e(\bar\sigma^T) \le \frac1{T+1} \sum_I \max_a Q^T(I, a) \le \frac{\Delta_u \sqrt{A_{\max}}\,\big(|\mathcal{I}_1| + |\mathcal{I}_2|\big)}{\sqrt T},$$

the last step by Lemma 2. This is twice the vanilla bound of §2.2, the same rate as Tammelin et
al., Theorem 3, and as Burch et al., Theorem 8. Linear weighting costs a constant factor in the
worst case.

**Hand computation: the first CFR+ iteration on Kuhn.**

*P1's pass* is vanilla's (§2.2) for P1's information sets, floored at 0:

- `J/`, `Q/`, `K/`: $(0, 1/8)$.
- `J/pb`: $(1/12, 0)$.
- `Q/pb`: $(0, 1/12)$, from $(-1/12, 1/12)$.
- `K/pb`: $(0, 1/4)$, from $(-1/4, 1/4)$; facing a bet after checking, K wins 2 by calling and loses
  1 by folding.

P2's strategy sums receive $\sigma^1_2$ = uniform with weight 1 and own reach 1: $(1/2, 1/2)$
everywhere.

*P2's pass.* $\sigma^2_1$ bets every card, so P2's after-check sets `X/p` are unreachable:
$\pi_{-2} = 0$ and their regrets stay $(0, 0)$. At the after-bet sets, every history has
$\pi_{-2} = 1/6$ (chance only), and P2 mixes uniformly. Values are in P2's payoffs, with actions
(fold, call):

| P2 set | Histories (P1's card): fold, call | $v_2(I, \cdot)$ | $v_2(I)$ | $r^1$ | $Q^1$ |
|---|---|---|---|---|---|
| `J/b` | Q: $-1$, $-2$; K: $-1$, $-2$ | $-1/3$, $-2/3$ | $-1/2$ | $(1/6, -1/6)$ | $(1/6, 0)$ |
| `Q/b` | J: $-1$, $+2$; K: $-1$, $-2$ | $-1/3$, $0$ | $-1/6$ | $(-1/6, 1/6)$ | $(0, 1/6)$ |
| `K/b` | J: $-1$, $+2$; Q: $-1$, $+2$ | $-1/3$, $2/3$ | $1/6$ | $(-1/2, 1/2)$ | $(0, 1/2)$ |

P1's strategy sums receive $\sigma^2_1$ with weight 1. At the openings that is $(0, 1)$. The
after-check sets `X/pb` get $(0, 0)$: their own reach under $\sigma^2_1$ is
$P(\text{check}) = 0$. Test: `cfr_plus_first_iteration_matches_hand_computation`.

**Cross-check.** An independent recursive implementation of Tammelin (2014), Algorithm 1, in
exact rational arithmetic (outside the repository) produced every stored value and strategy sum:

- for CFR+ after two iterations;
- for DCFR(1, 0, 2) after three iterations. Its factors $t/(t+1)$ and $1/2$ and weights $t^2$ are
  rational, and negative values occur.

The test `alternating_variants_match_exact_runs` compares the solver with these fractions
(tolerance $10^{-15}$ relative).

**Test targets.**

- The hand table and the cross-check above.
- The Corollary for every variant, and $e \le \sum_I \max_a Q^T(I,a) / (T+1)$ for CFR+.
- AC5 extended: $Q \ge 0$; $Q^T(I, a) \le \Delta_u \sqrt{|A(I)|\,T}$;
  $\sum_t t\, r^t(I, a) \le T\, Q^T(I, a)$.
- Kuhn AC1/AC2. Measurements and tolerances are in §2.4, next to DCFR's.

**Mutation check** (done while writing the tests; not repeated in CI). Seven deliberate bugs
were injected one at a time, and each made at least one test fail:

- P2 updating against P1's old strategy;
- alternating passes adding the updating player's own strategy sums;
- uniform instead of linear CFR+ weights;
- no floor in CFR+;
- DCFR discounting before adding $r^t$;
- weight $t$ instead of $t^\gamma$;
- $\alpha$ and $\beta$ swapped.

Two of the results are instructive:

- **Own strategy sums** pass Kuhn's AC1 and AC2 and are caught only by the Corollary's property
  test and the exact fixtures.
- **P2 against P1's old strategy** passes the Corollary, because it is a different but also sound
  algorithm (simultaneous CFR+). Only the fixtures catch it.

The bounds check soundness; the fixtures check that the code is the algorithm specified.

- References: Tammelin (2014), checked (definitions and Algorithm 1). Tammelin et al. (2015),
  checked (the four changes, Lemmas 1–2 and Theorem 3 with their proofs). Burch, Moravčík &
  Schmid (2019), checked (eq. 16, Theorems 1, 5, 7 and 8).

### 2.4 Discounted CFR (DCFR)

**Definition** (Brown & Sandholm 2019). On every iteration $t$:

- multiply the accumulated positive regrets by $t^\alpha / (t^\alpha + 1)$;
- multiply the negative ones by $t^\beta / (t^\beta + 1)$;
- multiply the contributions to the average strategy by $\big(t / (t+1)\big)^\gamma$.

The authors recommend $\alpha = 3/2$, $\beta = 0$, $\gamma = 2$. All their experiments use
alternating updates, and so does the solver.

*When the discount is applied.* The paper says that multiplying "iteration $t$'s regret and
contribution to the average strategy by $t'/(t'+1)$ on every iteration $t \le t' < T$" weighs
iteration $t$ by $t/T$. So iteration $t$'s own regret is already discounted on iteration $t$:

$$D^t(I, a) = x \cdot \begin{cases} t^\alpha / (t^\alpha + 1) & x > 0 \\ t^\beta / (t^\beta + 1) & x \le 0 \end{cases}, \qquad x = D^{t-1}(I, a) + r^t(I, a).$$

*Average weights.* Contribution $c_t$ ends up multiplied by
$\prod_{t'=t}^{T} \big(t'/(t'+1)\big)^\gamma = \big(t/(T+1)\big)^\gamma$, a telescoping product.
After normalization the average weighs iteration $t$ by $t^\gamma$. The solver adds
$t^\gamma c_t$ directly, which gives the same normalized average without rescaling the table
every iteration. For $\gamma = 2$ and $T = 10^5$ the weights reach $10^{10}$, far below `f64`'s
range.

*Regret weights.* If a regret keeps its sign, iteration $t$ ends up weighted by
$\prod_{t'=t}^{T} 1/(1 + t'^{-\alpha})$.

- $\alpha = 1$ gives $t/(T+1)$: linear weighting. DCFR(1, 1, 1) is Linear CFR (LCFR) in the
  paper.
- For $\alpha > 1$, $\sum_t t^{-\alpha} < \infty$, so the product stays bounded away from 0. Early
  iterations keep a fixed fraction of their weight, and the discount acts mainly in the first
  iterations.
- For $\alpha \le 1$, early iterations' weight goes to 0.

*Negative regrets.* $\beta = 0$ halves them every iteration. $\beta = -\infty$ sets them to 0
(from $t = 2$), as in CFR+.

**One update rule for all variants.** With $x = D + r^t$, the stored value becomes
$x \cdot p_t$ if $x > 0$ and $x \cdot n_t$ otherwise, and the strategy enters the sums with weight
$w_t$:

| Variant | $p_t$ | $n_t$ | $w_t$ | Updates |
|---|---|---|---|---|
| CFR (§2.2) | 1 | 1 | 1 | simultaneous |
| CFR+ (§2.3) | 1 | 0 | $t$ | alternating |
| DCFR($\alpha, \beta, \gamma$) | $1/(1 + t^{-\alpha})$ | $1/(1 + t^{-\beta})$ | $t^\gamma$ | alternating |

This is the single `match` in `Variant::schedule`. Writing the factor as $1/(1 + t^{-x})$ instead of
$t^x/(t^x+1)$ makes $x = \pm\infty$ evaluate to the limits 1 and 0 instead of $\infty/\infty$.

**Which settings recover which variant.**

- CFR+ is DCFR($\infty, -\infty, 1$) except at $t = 1$. There every exponent gives the factor
  $1^x/(1^x + 1) = 1/2$, so DCFR halves both signs instead of flooring. The runs differ from then
  on, so this is a limit, not an identity.
- The paper writes CFR+ $=$ DCFR($\infty, -\infty, 2$) because the paper's CFR+ weighs the average
  by $t^2$: the authors found that faster and used it throughout. The solver's CFR+ keeps
  Tammelin's weight $t$.
- Vanilla CFR is DCFR($\infty, \infty, 0$) apart from the same factor $1/2$ at $t = 1$. Here that
  only halves iteration 1's regret, but DCFR also alternates.

**Lemma 5** ($\beta \le 0$ bounds negative regrets). If $\beta \le 0$, then
$D^t(I, a) \ge -\Delta_u$ for all $t$.
*Proof.* $|r^t(I, a)| \le \Delta_u$ (§2.2, *Combined bound*). By induction, $x \ge -2\Delta_u$. If
$x \le 0$, the factor is $1/(1 + t^{-\beta}) \le 1/2$, because $t^{-\beta} \ge 1$; so
$D^t \ge -\Delta_u$. If $x > 0$, then $D^t > 0$. ∎

Brown & Sandholm use the pre-discount form, $-2\Delta$, in their proof of Theorem 2. A bounded
negative regret means a suboptimal action that becomes good again needs at most a bounded number
of iterations to be played. Their motivating example: three actions with fixed payoffs
$0, 1, -10^6$. CFR+ needs 471,407 iterations to play the best action with probability 1, and
LCFR needs 970 (as reported). A direct re-run outside the repository gives 471,406 and 971
iterations after which the next strategy is pure. The off-by-one differences are counting
conventions, which we did not pin down.

**Convergence.** Brown & Sandholm (2019, Theorem 2) prove that DCFR($3/2, 0, 2$)'s weighted
average is a $6\Delta|\mathcal{I}|\big(\sqrt{|A|} + 1/\sqrt T\big)/\sqrt T$-Nash equilibrium. The
proof (their appendix) bounds each information set's weighted regret for *any* value sequence,
so it applies to each player's regrets under alternating updates too. The link to exploitability
under alternating updates is Theorem 3 with Lemma 4 above. We use their rate as stated and do not
re-derive it. The test checks the Corollary of §2.3, which needs no rate.

**Test targets.**

- The cross-check of §2.3: DCFR(1, 0, 2) against exact fractions.
- Lemma 5 for $\beta \le 0$, and the Corollary of §2.3 with random parameters (property test).
- The limits $\alpha = \infty$, $\beta = -\infty$: no NaN, values floored at 0 from $t = 2$.
- Rejected parameters: $\alpha$ NaN or $< 0$; $\beta$ NaN; $\gamma$ NaN, $< 0$ or infinite.
- Kuhn AC1/AC2.

**Measurements** (Kuhn, average strategy unless noted). Command:
`cargo test -p solver --release print_kuhn_measurements -- --ignored --nocapture`. Code as in the
commit that adds this section (parent `519f769`); rustc 1.99.1, Apple M4. The runs are
deterministic, and debug and release builds print identical numbers. The vanilla rows equal those
of §2.2.

| $T$ | CFR $e$ | CFR+ $e$ | DCFR $e$ | CFR+ Corollary bound | CFR+ stored-value bound | DCFR Corollary bound |
|---|---|---|---|---|---|---|
| 10 | 9.621e-2 | 2.884e-2 | 2.515e-2 | 5.698e-2 | 2.279e-1 | 5.158e-2 |
| 100 | 2.567e-2 | 9.575e-4 | 1.799e-3 | 3.154e-3 | 2.992e-2 | 4.457e-3 |
| 1,000 | 7.269e-3 | 7.130e-5 | 1.518e-4 | 4.376e-4 | 3.920e-3 | 5.236e-4 |
| 10,000 | 2.318e-3 | 9.089e-6 | 2.257e-5 | 9.312e-5 | 6.111e-4 | 8.482e-5 |
| 100,000 | 6.762e-4 | 2.154e-6 | 7.088e-7 | 1.587e-5 | 9.735e-5 | 1.193e-5 |

| $T$ | CFR+ $u_1 + \tfrac1{18}$ | DCFR $u_1 + \tfrac1{18}$ | CFR+ current $e$ | DCFR current $e$ | CFR+ $P(\text{bet} \mid Q)$ | DCFR $P(\text{bet} \mid Q)$ |
|---|---|---|---|---|---|---|
| 10 | 3.573e-3 | 3.846e-3 | 3.897e-2 | 9.933e-2 | 1.436e-1 | 6.877e-2 |
| 100 | 2.601e-5 | 1.871e-5 | 4.062e-2 | 3.042e-2 | 1.564e-3 | 7.825e-5 |
| 1,000 | 1.816e-7 | 4.399e-8 | 1.943e-2 | 2.370e-2 | 1.578e-5 | 7.931e-8 |
| 10,000 | 1.768e-9 | −3.855e-9 | 8.542e-3 | 1.277e-2 | 1.579e-7 | 7.942e-11 |
| 100,000 | 5.924e-11 | 5.357e-12 | 3.519e-3 | 5.831e-3 | 1.579e-9 | 7.943e-14 |

Equilibrium-structure deviations at $T = 10^4$ (§1.2; $\alpha = P(\text{bet} \mid J)$):

| Variant | $P(\text{bet} \mid K) - 3\alpha$ | $P(\text{call} \mid Q, pb) - \alpha - \tfrac13$ | $\eta - \tfrac13$ | $\xi - \tfrac13$ | $\alpha$ |
|---|---|---|---|---|---|
| CFR+ | 1.138e-5 | 4.619e-5 | 5.324e-5 | −4.784e-6 | 0.2226 |
| DCFR | 2.685e-5 | 1.220e-4 | 1.075e-5 | −6.905e-5 | 0.1891 |

Strictly preferred actions have probability $\ge 0.9999995$ for both. The printout shows 1.000000
at six decimals.

Observations from these numbers, on Kuhn only:

- **Speed.** At $T = 10^4$, CFR+ is about 250 times less exploitable than vanilla CFR. DCFR is
  about 100 times less exploitable: behind CFR+ from $T = 100$ to $10^4$, ahead at $T = 10^5$. We
  draw no conclusion beyond Kuhn. Leduc is compared in §1.3.
- **Rates.** CFR+'s $e$ falls faster than $1/\sqrt T$ here: about 13× per decade from $10^2$ to
  $10^3$, then 8× and 4×. The worst-case bound says only $1/\sqrt T$.
- **Q's early bets fade with the weights.** $P(\text{bet} \mid Q) \approx 15.8/T^2$ for CFR+ and
  $79.4/T^3$ for DCFR. The bets come from the first few iterations; their weight relative to
  $W = \sum_t t \approx T^2/2$, or $\sum_t t^2 \approx T^3/3$, shrinks accordingly.
- **Current strategies.** Unlike vanilla CFR's, they become less exploitable (CFR+: 3.5e-3 at
  $10^5$), as Tammelin et al. (2015) observed in other games. There is no guarantee for them.
- **Bounds are looser.** The Corollary bound exceeds CFR+'s exploitability by about 10× at
  $T = 10^4$, and the stored-value bound by about 67×. Vanilla's bound was within 2%. The slack is
  the improvement term of Theorem 3 and the dropped $\sum_{t<T} Q^t$.
- **$\alpha$ drifts.** As for vanilla, the free parameter of the equilibrium family converges
  slowly: 0.2226 → 0.2330 for CFR+ from $10^4$ to $10^5$.

**Tolerances** (tests in `crates/solver/src/cfr.rs`, all at $T = 10^4$; about twice to three
times the measured values):

| Variant | $e \le$ | $\lvert u_1 + \tfrac1{18}\rvert \le$ | $P(\text{bet} \mid Q) \le$ | structure deviation $\le$ |
|---|---|---|---|---|
| CFR | 3e-3 | 2e-5 | 1e-3 | 0.02 |
| CFR+ | 2e-5 | 5e-9 | 5e-7 | 1e-4 |
| DCFR | 5e-5 | 1e-8 | 2e-10 | 3e-4 |

For every variant, AC1 also requires $e$ to fall strictly at $T = 10, 100, 10^3, 10^4$, and
$|u_1 + \tfrac1{18}| \le 2e$ at each checkpoint.

- Reference: Brown & Sandholm (2019), checked against the arXiv version (1809.04040): the
  definition, the recommended parameters, the timing of the discount, the special cases, the
  example, and Theorems 1–2 with their proofs.

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

### 5.1 Situation classes [M3a: classifier v1, draft; M5: use in the model]

> **Status: draft for discussion with Henry (M3a plan, D4).** Nothing here is final until Henry
> has reviewed it; open choices are marked **[Decide together]**. The classifier is versioned
> (`classifier_version = 1`), so changing a boundary later means recomputing the keys, not
> migrating data.

A **decision point** is every hero action other than a forced post (M3a plan §1.4). Its
**situation key** describes what hero faced *before* acting — never the action hero took, which
is what gets evaluated. Every key column below is computed from the canonical record alone (no
ranges, no evaluator). Hand class relative to a range (value / bluff catcher / draw / air) needs
ranges and comes in M3b.

**Why classes are coarse and nested.** A live player logs few hands, and the leak model (§5.2)
needs several decisions per class before it says anything. So the key is designed as three
nested levels; the model pools each level toward the one above it (partial pooling), and a report
can always fall back to a coarser level:

| Level | Columns | Rough number of classes |
|---|---|---|
| 1 | street, spot | 14 (5 preflop, 3 on each later street) |
| 2 | + pot type, players, position group or IP / OOP, initiative | many more, a lot of them rare |
| 3 | + size bucket, depth bucket, texture | finer still; used only where data are dense |

Other columns (position label, line, flags) are stored for filtering and display, not for
pooling.

#### Definitions

Notation as in §1.5: $x_i$ chips committed on the current street, $B$ the current bet. At hero's
decision: $P$ = all chips in the middle (antes, earlier streets and the current street's bets,
after any uncalled bet from an earlier street is returned); $c = B - x_{\text{hero}}$ the amount
hero must call; **in hand** = dealt in and not folded.

1. **street** — `preflop`, `flop`, `turn`, `river`.

2. **spot** — what hero is facing on this street. A *raise* here means a voluntary bet or raise;
   blinds and straddles do not count.
   - Preflop: `unopened` (no voluntary chips yet: hero may fold, limp or raise), `limped` (one or more seats
     called the forced bet, nobody raised; includes the big blind's option), `facing_open`
     (exactly one raise so far), `facing_3bet` (two), `facing_4bet_plus` (three or more).
   - Flop, turn, river: `no_bet` (nobody has bet on this street yet; hero is first, or it was
     checked to hero), `facing_bet` (one bet, no raise), `facing_raise` (at least one raise).

   That makes 5 + 3 × 3 = 14 street × spot combinations (level 1); postflop `facing_raise` is
   the rarest of them. **[Decide together]** whether postflop
   `facing_raise` should split into "hero bet and was raised" and "hero faces bet and raise from
   others".

3. **pot type** — postflop only: the number of voluntary raises in the whole preflop round:
   0 `limped`, 1 `single_raised`, 2 `3bet`, 3 or more `4bet_plus`. A pot nobody raised in which
   only the blinds remain is `limped` too. Preflop the spot already says this.

4. **players** — seats in hand at the decision, hero included: `heads_up` (2), `three_way` (3),
   `four_plus`. The solver (M2) prices heads-up spots only; multiway decisions are stored and
   classified all the same.

5. **position label** — from the dealt-in seats and the button, never from seat numbers. The
   button is `BTN`, the next two seats `SB` and `BB` (heads-up: the button is `BTN` and posts the
   small blind; the other seat is `BB`). The remaining $k = n - 3$ seats, in preflop order of
   action, are labelled from the end — `CO`, `HJ`, `LJ` — and the rest from the start — `UTG`,
   `UTG+1`, `UTG+2`, `UTG+3`. Examples: 6 dealt in → `LJ HJ CO BTN SB BB`; 9 dealt in →
   `UTG UTG+1 UTG+2 LJ HJ CO BTN SB BB`; 4 dealt in → `CO BTN SB BB`.
   **Position group** (used for pooling): `early` (`UTG`…`UTG+3`), `middle` (`LJ`, `HJ`),
   `late` (`CO`, `BTN`), `blinds` (`SB`, `BB`).
   Straddles do not change labels; the hand carries a `straddled` flag instead.
   **[Decide together]** the label names (6-max players often say `UTG` / `MP` for `LJ` / `HJ`),
   the groups, and whether a straddled pot should be its own class rather than a flag.

6. **in position** — postflop only: `ip` if hero is the last seat in hand to act on this street,
   `oop` if hero is the first, `middle` otherwise (multiway only). Preflop the column is empty;
   the position label carries that information.

7. **initiative** — who made the last voluntary raise on the previous street: `hero`, `villain`,
   or `none` (nobody raised there: a limped pot on the flop, or a street checked through).
   Preflop the column is empty. This is what "c-bet" and "donk bet" spots are made of: flop,
   `no_bet`, initiative `hero` is a continuation-bet decision.

8. **depth bucket** — how deep the money is.
   - Effective stack $E$: the smaller of hero's chips behind and the largest chips behind among
     the other seats in hand, measured at the start of the street.
   - Postflop: stack-to-pot ratio $\text{SPR} = E / P_0$, with $P_0$ the pot at the start of the
     street. Buckets: `spr_lt_2` ($< 2$, close to committed), `spr_2_4`, `spr_4_8`,
     `spr_8_plus`.
   - Preflop: $E$ in big blinds, at the start of the hand. Buckets: `bb_lt_40`, `bb_40_100`,
     `bb_100_200`, `bb_200_plus` (live games often play deep).
   - If a stack needed for $E$ is unknown (`null` in the record), the bucket is `unknown`. An
     approximate stack still gets a bucket; the hand's `stacks_approximate` flag says so.
   - **[Decide together]** the boundaries. Lower bounds are inclusive, so SPR exactly 4 is
     `spr_4_8`.

9. **size bucket** — only when hero faces a bet ($c > 0$); empty otherwise.
   - Postflop: $f = c / (P - c)$. For a single bet $b$ into a pot $p$ this is $b / p$, the usual
     "fraction of the pot"; facing a raise it is the extra chips hero must add, relative to the
     pot if hero had matched the earlier bet. It fixes the price: hero needs equity
     $c / (P + c) = f / (1 + 2f)$ to call. Buckets: `small` ($f < 0.4$), `medium`
     ($0.4 \le f < 0.8$), `large` ($0.8 \le f < 1.25$), `overbet` ($f \ge 1.25$).
   - Preflop: the multiple $m = B / B_{\text{prev}}$ of the last raise, where $B_{\text{prev}}$ is
     the bet it raised (the big blind or last straddle for an open). Buckets: `lt_2_5x`,
     `2_5x_3_5x`, `3_5x_5x`, `5x_plus`. Facing only limps, the column is empty.
   - A flag `facing_all_in` is stored when the bet hero faces puts a seat all-in.
   - **[Decide together]** the boundaries, and whether preflop opens in live games (often 5× or
     more) need finer buckets.

10. **texture** — from the board's ranks and suits only; empty preflop. Components:
    - suits on the board: `rainbow` (no two cards share a suit), `two_tone` (some suit appears
      twice, none three times), `flush_possible` (some suit three or more times; on the flop this
      is a monotone board);
    - pairing: `unpaired`, `paired` (one rank twice, no other repeat), `heavily_paired` (two
      pairs, trips or more on the board);
    - high card: `ace`, `broadway` (K, Q, J), `ten_or_lower`;
    - connected: some window of five consecutive ranks (the ace counts low and high) holds three
      or more distinct board ranks — then two hole cards can make a straight.

    Texture class (used for pooling), the first that applies: `paired`, `flush_possible`,
    `connected`, `two_tone`, `dry`. Turn and river add **the new card**, the first that applies:
    `pairs_board` (its rank was already on the board), `completes_flush` (third card of a suit),
    `completes_straight` (the board becomes connected), `overcard` (higher than every earlier
    board card), `blank`. **[Decide together]** the classes and their order of priority.

11. **line** — the betting so far, compact, for display and filtering. Per street, one letter per
    action: `X` check, `B` bet, `R` raise, `C` call, `F` fold; hero's actions in lower case;
    streets separated by `/`. Posts are left out, and so are preflop folds by seats that never put
    voluntary chips in (the same seats a client may leave out, `ARCHITECTURE.md` §7.3). The
    current street ends just before hero's decision.

#### Worked example

Live 1/3, nine dealt in, all stacks 300 at the start. UTG opens to 15, everyone folds to hero on
the button, hero calls, the small blind folds, the big blind calls. Flop K♠7♦2♣: the big blind
checks, UTG bets 30, and hero decides.

| Column | Value | Why |
|---|---|---|
| street, spot | flop, `facing_bet` | one bet on the flop, no raise |
| pot type | `single_raised` | one raise preflop |
| players | `three_way` | BB, UTG, hero |
| position label / group | `BTN` / `late` | |
| in position | `ip` | hero acts last on the flop |
| initiative | `villain` | UTG made the last preflop raise |
| depth | `spr_4_8` | $P_0 = 3 \cdot 15 + 1 = 46$ (the small blind's 1 is dead), $E = 285$, SPR $= 6.2$ |
| size | `medium` | $c = 30$, $P = 76$, $f = 30 / 46 = 0.65$ |
| texture | `dry` | rainbow, unpaired, K high, no window of five holds three of K, 7, 2 |
| line | `RcC/XB` | preflop UTG raise, hero call, BB call (folds by never-in seats and the SB's fold after posting left out); flop BB check, UTG bet |

**[Decide together]** whether the SB's fold belongs in the line: it posted, but put no chips in
voluntarily. The draft leaves it out, like other folds without voluntary chips.

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

Rules of the game
- Poker Tournament Directors Association (2026). *Poker TDA Rules*, version 1.1, 21 September
  2026. pokertda.com. **(checked**, rules 36-C, 45-A, 49-A, 49-B, 67-A, 2026-11-07**)**

Games and equilibrium computation
- Kuhn, H. W. (1950). A simplified two-person poker. *Contributions to the Theory of Games I*.
- Southey, F., Bowling, M., Larson, B., Piccione, C., Burch, N., Billings, D., & Rayner, C.
  (2005). Bayes' Bluff: Opponent Modelling in Poker. *UAI*. **(checked**, arXiv:1207.1411, §2
  and Figure 1**)**
- Hart, S., & Mas-Colell, A. (2000). A simple adaptive procedure leading to correlated equilibrium.
  *Econometrica*.
- Zinkevich, M., Johanson, M., Bowling, M., & Piccione, C. (2007). Regret minimization in games with
  incomplete information. *NIPS 20*, 1729–1736. **(checked)**
- Johanson, M., Waugh, K., Bowling, M., & Zinkevich, M. (2011). Accelerating best response
  calculation in large extensive games. *IJCAI*.
- Johanson, M., Bard, N., Lanctot, M., Gibson, R., & Bowling, M. (2012). Efficient Nash equilibrium
  approximation through Monte Carlo counterfactual regret minimization. *AAMAS*.
- Tammelin, O. (2014). Solving large imperfect information games using CFR+. arXiv:1407.5042.
  **(checked)**
- Tammelin, O., Burch, N., Johanson, M., & Bowling, M. (2015). Solving heads-up limit Texas hold'em.
  *IJCAI*, 645–652. **(checked)**
- Burch, N., Moravčík, M., & Schmid, M. (2019). Revisiting CFR+ and alternating updates. *Journal of
  Artificial Intelligence Research* 64, 429–443. **(checked)**
- Farina, G., Kroer, C., & Sandholm, T. (2019). Online convex optimization for sequential decision
  processes and extensive-form games. *AAAI*. Cited via Burch et al. (2019); not checked.
- Brown, N., & Sandholm, T. (2019). Solving imperfect-information games via discounted regret
  minimization. *AAAI*. **(checked**, arXiv:1809.04040**)**
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
