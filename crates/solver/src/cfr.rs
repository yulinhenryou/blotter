//! Counterfactual regret minimization and its variants CFR+ and DCFR (`docs/MATH.md` §2.2–2.4).
//!
//! Every pass runs regret matching (§2.1) at every information set to get the current profile,
//! computes each action's counterfactual regret, folds it into the stored regrets, and adds the
//! own-reach-weighted current strategy to the strategy sums. The output is the normalized strategy
//! sums, the **average strategy**, whose exploitability goes to 0.
//!
//! The three [`Variant`]s differ only in *how* an iteration enters the tables (one `match`, in
//! `Variant::schedule`) and in whether the players update simultaneously or alternately
//! (§2.3).

use std::error::Error;
use std::fmt;

use crate::game::Player;
use crate::regret::regret_matching;
use crate::strategy::Profile;
use crate::tree::{GameTree, Node};

/// Which CFR algorithm a [`Cfr`] runs (`docs/MATH.md` §2.2–2.4).
///
/// An `enum` variant can carry data: `Dcfr` holds its three parameters, the other two hold none.
/// The derived `Copy` is fine because every field is an `f64`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Variant {
    /// Vanilla CFR (Zinkevich et al. 2007, §2.2): simultaneous updates, cumulative regrets,
    /// uniform average.
    Vanilla,
    /// CFR+ (Tammelin 2014; Tammelin et al. 2015, §2.3): alternating updates, regret matching+
    /// (stored regrets floored at 0 after every update), average weighted by $t$.
    CfrPlus,
    /// Discounted CFR (Brown & Sandholm 2019, §2.4): alternating updates; after its update on
    /// iteration $t$ a positive stored regret is multiplied by $t^\alpha / (t^\alpha + 1)$ and a
    /// negative one by $t^\beta / (t^\beta + 1)$; average weighted by $t^\gamma$.
    Dcfr {
        /// Discount exponent for positive regrets, $\ge 0$; $+\infty$ means no discount (from
        /// $t = 2$).
        alpha: f64,
        /// Discount exponent for negative regrets; $-\infty$ means reset to 0 (from $t = 2$).
        beta: f64,
        /// Exponent of the average-strategy weight $t^\gamma$; finite and $\ge 0$.
        gamma: f64,
    },
}

/// How iteration $t$ enters the tables (`docs/MATH.md` §2.4, *One update rule*).
///
/// A stored regret $D$ becomes $x = D + r^t$ and then $x \cdot$ `positive` if $x > 0$, else
/// $x \cdot$ `negative`; the current strategy enters the strategy sums with weight `weight`.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Schedule {
    positive: f64,
    negative: f64,
    weight: f64,
}

impl Variant {
    /// DCFR with the parameters its authors recommend: $\alpha = 3/2$, $\beta = 0$, $\gamma = 2$.
    pub const DCFR: Variant = Variant::Dcfr {
        alpha: 1.5,
        beta: 0.0,
        gamma: 2.0,
    };

    /// Whether the players update one after the other (§2.3) instead of simultaneously.
    fn alternating(self) -> bool {
        !matches!(self, Variant::Vanilla)
    }

    /// The schedule of iteration `t` (1-based). This `match` is the only place where the
    /// variants' update rules differ.
    fn schedule(self, t: u64) -> Schedule {
        // Exact for any realistic iteration count (below 2^53).
        let t = t as f64;
        match self {
            Variant::Vanilla => Schedule {
                positive: 1.0,
                negative: 1.0,
                weight: 1.0,
            },
            Variant::CfrPlus => Schedule {
                positive: 1.0,
                negative: 0.0,
                weight: t,
            },
            Variant::Dcfr { alpha, beta, gamma } => Schedule {
                positive: discount(t, alpha),
                negative: discount(t, beta),
                weight: t.powf(gamma),
            },
        }
    }

    fn validate(self) -> Result<(), InvalidDcfrParameters> {
        match self {
            Variant::Dcfr { alpha, beta, gamma }
                if alpha.is_nan()
                    || alpha < 0.0
                    || beta.is_nan()
                    || !gamma.is_finite()
                    || gamma < 0.0 =>
            {
                Err(InvalidDcfrParameters { alpha, beta, gamma })
            }
            _ => Ok(()),
        }
    }
}

/// DCFR's discount factor $t^x / (t^x + 1)$, written as $1 / (1 + t^{-x})$ so that $x = \pm\infty$
/// give the limits 1 and 0 (for $t \ge 2$) instead of $\infty / \infty$. At $t = 1$ it is $1/2$
/// for every $x$, because $1^x = 1$.
fn discount(t: f64, x: f64) -> f64 {
    1.0 / (1.0 + t.powf(-x))
}

/// DCFR parameters the solver rejects: $\alpha$ is NaN or negative, $\beta$ is NaN, or $\gamma$
/// is not a finite number $\ge 0$.
///
/// $\alpha \ge 0$ keeps the factor of positive regrets in $[1/2, 1]$; the bound of
/// `docs/MATH.md` §2.3 needs it to be positive (Lemma 2). $\gamma$ must give finite,
/// non-decreasing weights $t^\gamma$.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct InvalidDcfrParameters {
    /// The rejected $\alpha$.
    pub alpha: f64,
    /// The rejected $\beta$.
    pub beta: f64,
    /// The rejected $\gamma$.
    pub gamma: f64,
}

impl fmt::Display for InvalidDcfrParameters {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "invalid DCFR parameters alpha={}, beta={}, gamma={}: alpha must be >= 0, beta not \
             NaN, gamma finite and >= 0",
            self.alpha, self.beta, self.gamma
        )
    }
}

impl Error for InvalidDcfrParameters {}

/// Whose tables one pass over the tree updates.
#[derive(Clone, Copy, Debug)]
enum Pass {
    /// Both players' regrets and strategy sums, from the same profile (vanilla CFR).
    Simultaneous,
    /// This player's regrets and the *opponent's* strategy sum (Tammelin 2014, Algorithm 1).
    Alternating(Player),
}

impl Pass {
    fn updates_regrets(self, player: Player) -> bool {
        match self {
            Pass::Simultaneous => true,
            Pass::Alternating(updating) => player == updating,
        }
    }

    fn adds_strategy(self, player: Player) -> bool {
        match self {
            Pass::Simultaneous => true,
            Pass::Alternating(updating) => player != updating,
        }
    }
}

/// Reach probability of one node, split by contributor (`docs/MATH.md` §0).
///
/// `players[i]` is $\pi_i(h)$, the product of player `i`'s own action probabilities on the path,
/// and `chance` is the product of chance's. Keeping them apart gives both the counterfactual reach
/// $\pi_{-i}(h)$ (regrets) and the own reach $\pi_i(h)$ (strategy sums) from one pass.
#[derive(Clone, Copy, Debug)]
struct Reach {
    players: [f64; 2],
    chance: f64,
}

impl Reach {
    const ROOT: Reach = Reach {
        players: [1.0, 1.0],
        chance: 1.0,
    };

    /// $\pi_{-i}(h)$: chance's and the opponent's contributions.
    fn counterfactual(self, player: Player) -> f64 {
        self.players[player.opponent().index()] * self.chance
    }

    /// $\pi_i(h)$: the player's own contribution.
    fn own(self, player: Player) -> f64 {
        self.players[player.index()]
    }
}

/// The state of a CFR run on one [`GameTree`].
///
/// The solver *borrows* the tree (`&'t GameTree`) and *owns* its tables. `'t` says the solver
/// cannot outlive the tree it points to; the tree stays immutable while the solver mutates its own
/// `Vec`s, so there is never a shared and a mutable borrow of the same value. Holding the
/// reference, instead of taking `&GameTree` in every call, also rules out calling
/// [`Cfr::iterate`] with a different tree than the tables were sized for.
#[derive(Clone, Debug)]
pub struct Cfr<'t> {
    tree: &'t GameTree,
    variant: Variant,
    /// Stored regrets, indexed by information set, then action: $R^T(I, a)$ for vanilla CFR, the
    /// regret-like values $Q^T(I, a) \ge 0$ for CFR+, the discounted regrets for DCFR.
    regrets: Vec<Vec<f64>>,
    /// $S^T(I, a) = \sum_t w_t\, \pi_i^{\sigma^t}(I)\, \sigma^t(I, a)$ with the variant's weights.
    strategy_sums: Vec<Vec<f64>>,
    iterations: u64,
    // Scratch space, overwritten on every pass; kept here so iterations do not allocate.
    /// The current profile during a pass.
    current: Vec<Vec<f64>>,
    /// Reach of every node under the current profile.
    reach: Vec<Reach>,
    /// P1's expected payoff from every node on, under the current profile.
    values: Vec<f64>,
    /// One information set's instantaneous regrets $r^t(I, \cdot)$, before the variant's rule.
    instant: Vec<f64>,
    /// Test-only record of $\sum_t w_t\, r^t(I, a)$ and $\sum_t w_t$, for the bound
    /// of `docs/MATH.md` §2.3 that holds for every variant.
    #[cfg(test)]
    audit: Audit,
}

#[cfg(test)]
#[derive(Clone, Debug)]
struct Audit {
    weighted_regrets: Vec<Vec<f64>>,
    weight_sum: f64,
}

impl<'t> Cfr<'t> {
    /// A vanilla CFR solver with all regrets and strategy sums at 0, so the first iteration plays
    /// uniformly.
    pub fn new(tree: &'t GameTree) -> Cfr<'t> {
        Cfr::build(tree, Variant::Vanilla)
    }

    /// A solver running `variant`, with all tables at 0.
    ///
    /// # Errors
    ///
    /// [`InvalidDcfrParameters`] if `variant` is a [`Variant::Dcfr`] whose parameters are out of
    /// range (see there).
    pub fn with_variant(
        tree: &'t GameTree,
        variant: Variant,
    ) -> Result<Cfr<'t>, InvalidDcfrParameters> {
        variant.validate()?;
        Ok(Cfr::build(tree, variant))
    }

    fn build(tree: &'t GameTree, variant: Variant) -> Cfr<'t> {
        let zeros: Vec<Vec<f64>> = tree
            .infosets()
            .iter()
            .map(|set| vec![0.0; set.actions.len()])
            .collect();
        let max_actions = zeros.iter().map(Vec::len).max().unwrap_or(0);
        let n = tree.nodes().len();
        Cfr {
            tree,
            variant,
            regrets: zeros.clone(),
            strategy_sums: zeros.clone(),
            iterations: 0,
            #[cfg(test)]
            audit: Audit {
                weighted_regrets: zeros.clone(),
                weight_sum: 0.0,
            },
            current: zeros,
            reach: vec![Reach::ROOT; n],
            values: vec![0.0; n],
            instant: vec![0.0; max_actions],
        }
    }

    /// The variant this solver runs.
    pub fn variant(&self) -> Variant {
        self.variant
    }

    /// Run `iterations` iterations.
    pub fn run(&mut self, iterations: u64) {
        for _ in 0..iterations {
            self.iterate();
        }
    }

    /// One iteration $t$: one pass for simultaneous updates, two for alternating ones.
    pub fn iterate(&mut self) {
        self.iterations += 1;
        let schedule = self.variant.schedule(self.iterations);
        if self.variant.alternating() {
            // P1 updates against sigma_2^t; P2 then updates against P1's *new* strategy, which is
            // also what enters P1's average (MATH.md §2.3; Tammelin 2014, Algorithm 1).
            self.pass(Pass::Alternating(Player::P1), schedule);
            self.pass(Pass::Alternating(Player::P2), schedule);
        } else {
            self.pass(Pass::Simultaneous, schedule);
        }
        #[cfg(test)]
        {
            self.audit.weight_sum += schedule.weight;
        }
    }

    /// One pass over the tree: current profile, reach, values, then the tables `pass` updates.
    fn pass(&mut self, pass: Pass, schedule: Schedule) {
        // Copy the reference out of `self` (references are `Copy`). Reading the tree through this
        // local does not borrow `self`, so the steps below can mutate `self`'s tables freely.
        let tree = self.tree;
        let n = tree.nodes().len();

        // 1. Current profile by regret matching. `self.regrets` and `self.current` are different
        //    fields, so borrowing one shared and the other mutable at the same time is allowed.
        for (regrets, current) in self.regrets.iter().zip(&mut self.current) {
            regret_matching(regrets, current);
        }

        // 2. Reach probabilities, root first: ids decrease from the root, so every parent is
        //    done before its children. Each child has exactly one parent, so it is written once.
        self.reach[tree.root()] = Reach::ROOT;
        for id in (0..n).rev() {
            let reach = self.reach[id];
            match tree.node(id) {
                Node::Terminal { .. } => {}
                Node::Chance {
                    outcomes,
                    total_weight,
                } => {
                    for &(weight, child) in outcomes {
                        let mut r = reach;
                        r.chance *= f64::from(weight) / *total_weight as f64;
                        self.reach[child] = r;
                    }
                }
                Node::Decision { infoset, children } => {
                    let player = tree.infoset(*infoset).player.index();
                    for (&child, &p) in children.iter().zip(&self.current[*infoset]) {
                        let mut r = reach;
                        r.players[player] *= p;
                        self.reach[child] = r;
                    }
                }
            }
        }

        // 3. P1's expected payoff of every node under the current profile, children first.
        for id in 0..n {
            let value = match tree.node(id) {
                // Exact for any realistic chip count (below 2^53).
                Node::Terminal { payoff_p1_chips } => *payoff_p1_chips as f64,
                Node::Chance {
                    outcomes,
                    total_weight,
                } => {
                    outcomes
                        .iter()
                        .map(|&(weight, child)| f64::from(weight) * self.values[child])
                        .sum::<f64>()
                        / *total_weight as f64
                }
                Node::Decision { infoset, children } => children
                    .iter()
                    .zip(&self.current[*infoset])
                    .map(|(&child, &p)| p * self.values[child])
                    .sum(),
            };
            self.values[id] = value;
        }

        // 4. Regrets and strategy sums, one information set at a time.
        for (id, set) in tree.infosets().iter().enumerate() {
            if pass.updates_regrets(set.player) {
                let sign = match set.player {
                    Player::P1 => 1.0,
                    Player::P2 => -1.0,
                };
                // r^t(I, a) = sum over h in I of pi_{-i}(h) (u_i(h.a) - u_i(h)), in player i's
                // payoffs. It is summed over all of I before the variant's rule is applied: CFR+
                // floors the *sum*, not each history's share.
                let instant = &mut self.instant[..set.actions.len()];
                instant.fill(0.0);
                for &h in &set.nodes {
                    let weight = self.reach[h].counterfactual(set.player);
                    let base = self.values[h];
                    for (r, &child) in instant.iter_mut().zip(tree.decision_children(h)) {
                        *r += weight * sign * (self.values[child] - base);
                    }
                }
                // The update rule of MATH.md §2.4: x = D + r, then scaled by the factor of its
                // sign. Vanilla CFR's factors are 1, so its regrets are plain sums.
                for (stored, &r) in self.regrets[id].iter_mut().zip(instant.iter()) {
                    let x = *stored + r;
                    *stored = x * if x > 0.0 {
                        schedule.positive
                    } else {
                        schedule.negative
                    };
                }
                #[cfg(test)]
                for (w, &r) in self.audit.weighted_regrets[id]
                    .iter_mut()
                    .zip(instant.iter())
                {
                    *w += schedule.weight * r;
                }
            }
            if pass.adds_strategy(set.player) {
                // Own reach is the same at every node of the set (perfect recall), so it is added
                // once per set. Every set has at least one node: it was created by its first node.
                let own = self.reach[set.nodes[0]].own(set.player);
                for (sum, &p) in self.strategy_sums[id].iter_mut().zip(&self.current[id]) {
                    *sum += schedule.weight * own * p;
                }
            }
        }
    }

    /// Number of iterations run so far, $T$.
    pub fn iterations(&self) -> u64 {
        self.iterations
    }

    /// Stored regrets, indexed by information set, then action: the cumulative regrets
    /// $R^T(I, a)$ for vanilla CFR, the regret-like values $Q^T(I, a)$ for CFR+, the discounted
    /// regrets for DCFR (see [`Cfr`]).
    pub fn regrets(&self) -> &[Vec<f64>] {
        &self.regrets
    }

    /// The strategy regret matching gives for the next iteration, $\sigma^{T+1}$. Unlike the
    /// average it carries no convergence guarantee (`docs/MATH.md` §2.2).
    pub fn current_strategy(&self) -> Profile<f64> {
        let rows = self
            .regrets
            .iter()
            .map(|regrets| {
                let mut row = vec![0.0; regrets.len()];
                regret_matching(regrets, &mut row);
                row
            })
            .collect();
        Profile::new_unchecked(self.tree, rows)
    }

    /// The average strategy $\bar\sigma^T$: strategy sums normalized per information set, uniform
    /// where the sum is 0 (sets never reached by their own player's play).
    pub fn average_strategy(&self) -> Profile<f64> {
        let rows = self
            .strategy_sums
            .iter()
            .map(|sums| {
                let total: f64 = sums.iter().sum();
                if total > 0.0 {
                    sums.iter().map(|&s| s / total).collect()
                } else {
                    vec![1.0 / sums.len() as f64; sums.len()]
                }
            })
            .collect();
        Profile::new_unchecked(self.tree, rows)
    }
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    use proptest::test_runner::RngSeed;

    use super::*;
    use crate::best_response::{expected_value, exploitability};
    use crate::games::kuhn::Kuhn;
    use crate::tree::InfosetId;

    const VARIANTS: [Variant; 3] = [Variant::Vanilla, Variant::CfrPlus, Variant::DCFR];

    fn kuhn() -> GameTree {
        GameTree::build(&Kuhn).unwrap()
    }

    fn solver(tree: &GameTree, variant: Variant) -> Cfr<'_> {
        Cfr::with_variant(tree, variant).unwrap()
    }

    fn id(tree: &GameTree, key: &str) -> InfosetId {
        tree.find_infoset(key).unwrap()
    }

    fn assert_row(actual: &[f64], expected: &[f64]) {
        assert_eq!(actual.len(), expected.len());
        for (a, e) in actual.iter().zip(expected) {
            assert!(
                (a - e).abs() <= 1e-15 * e.abs().max(1.0),
                "{actual:?} != {expected:?}"
            );
        }
    }

    fn exploitability_of_average(tree: &GameTree, cfr: &Cfr<'_>) -> f64 {
        exploitability(tree, &cfr.average_strategy())
            .unwrap()
            .exploitability
    }

    /// $\sum_I \max_a x(I, a)^+$ over a table of rows.
    fn sum_of_positive_row_maxima(rows: &[Vec<f64>]) -> f64 {
        rows.iter()
            .map(|row| row.iter().fold(0.0_f64, |m, &r| m.max(r)))
            .sum()
    }

    /// $\frac1{2T} \sum_I \max_a R^T(I, a)^+$: the regret-decomposition bound on the
    /// exploitability of vanilla CFR's average strategy (`docs/MATH.md` §2.2, Theorems 1 and 2).
    fn regret_bound(cfr: &Cfr<'_>) -> f64 {
        sum_of_positive_row_maxima(cfr.regrets()) / (2.0 * cfr.iterations() as f64)
    }

    /// $\sum_I \max_a \big(\sum_t w_t r^t(I, a)\big)^+ / (2 \sum_t w_t)$: the bound of
    /// `docs/MATH.md` §2.3 (Theorem 3) for every variant, from the test-only audit record.
    fn weighted_regret_bound(cfr: &Cfr<'_>) -> f64 {
        sum_of_positive_row_maxima(&cfr.audit.weighted_regrets) / (2.0 * cfr.audit.weight_sum)
    }

    /// $\sum_I \max_a Q^T(I, a) / (T + 1)$: CFR+'s bound from its stored values
    /// (`docs/MATH.md` §2.3, Corollary).
    fn cfr_plus_bound(cfr: &Cfr<'_>) -> f64 {
        sum_of_positive_row_maxima(cfr.regrets()) / (cfr.iterations() as f64 + 1.0)
    }

    #[test]
    fn first_iteration_matches_hand_computation() {
        let tree = kuhn();
        let mut cfr = Cfr::new(&tree);
        cfr.iterate();
        // MATH.md §2.2, first-iteration table. Kuhn's action order: (check, bet), (fold, call).
        let expected: [(&str, [f64; 2]); 6] = [
            ("J/", [-1.0 / 8.0, 1.0 / 8.0]),
            ("Q/", [-1.0 / 8.0, 1.0 / 8.0]),
            ("K/", [-1.0 / 8.0, 1.0 / 8.0]),
            ("J/pb", [1.0 / 12.0, -1.0 / 12.0]),
            ("Q/b", [-1.0 / 12.0, 1.0 / 12.0]),
            ("J/p", [-1.0 / 24.0, 1.0 / 24.0]),
        ];
        for (key, row) in expected {
            assert_row(&cfr.regrets()[id(&tree, key)], &row);
        }
        assert_row(&cfr.strategy_sums[id(&tree, "J/")], &[0.5, 0.5]);
        assert_row(&cfr.strategy_sums[id(&tree, "J/pb")], &[0.25, 0.25]);
        assert_row(&cfr.strategy_sums[id(&tree, "Q/b")], &[0.5, 0.5]);
        // After one iteration P1 opens with a bet on every card.
        let next = cfr.current_strategy();
        for key in ["J/", "Q/", "K/"] {
            assert_row(next.row(id(&tree, key)), &[0.0, 1.0]);
        }
    }

    /// MATH.md §2.3, first-iteration table of CFR+: P1's half of the iteration is vanilla CFR's
    /// P1 regrets floored at 0; P2 then updates against P1's new strategy (bet every card).
    #[test]
    fn cfr_plus_first_iteration_matches_hand_computation() {
        let tree = kuhn();
        let mut cfr = solver(&tree, Variant::CfrPlus);
        cfr.iterate();
        let expected: [(&str, [f64; 2], [f64; 2]); 12] = [
            // P1: Q^1 = (r^1)^+; strategy sums from P1's *new* strategy, own reach under it.
            ("J/", [0.0, 1.0 / 8.0], [0.0, 1.0]),
            ("Q/", [0.0, 1.0 / 8.0], [0.0, 1.0]),
            ("K/", [0.0, 1.0 / 8.0], [0.0, 1.0]),
            ("J/pb", [1.0 / 12.0, 0.0], [0.0, 0.0]),
            ("Q/pb", [0.0, 1.0 / 12.0], [0.0, 0.0]),
            ("K/pb", [0.0, 1.0 / 4.0], [0.0, 0.0]),
            // P2: regrets against "P1 always bets"; strategy sums from sigma_2^1 = uniform.
            ("J/b", [1.0 / 6.0, 0.0], [0.5, 0.5]),
            ("Q/b", [0.0, 1.0 / 6.0], [0.5, 0.5]),
            ("K/b", [0.0, 1.0 / 2.0], [0.5, 0.5]),
            ("J/p", [0.0, 0.0], [0.5, 0.5]),
            ("Q/p", [0.0, 0.0], [0.5, 0.5]),
            ("K/p", [0.0, 0.0], [0.5, 0.5]),
        ];
        for (key, regrets, sums) in expected {
            assert_row(&cfr.regrets()[id(&tree, key)], &regrets);
            assert_row(&cfr.strategy_sums[id(&tree, key)], &sums);
        }
    }

    type Fixture = [(&'static str, [(i64, i64); 2], [(i64, i64); 2]); 12];

    /// Stored regrets and strategy sums after a few iterations, as exact fractions, from an
    /// independent recursive implementation of Tammelin (2014), Algorithm 1 in exact rational
    /// arithmetic (`docs/MATH.md` §2.4, *Cross-check*). Columns: key, regrets, strategy sums.
    #[test]
    fn alternating_variants_match_exact_runs() {
        const CFR_PLUS_T2: Fixture = [
            ("J/", [(1, 3), (1, 8)], [(16, 11), (17, 11)]),
            ("J/p", [(1, 21), (0, 1)], [(3, 2), (3, 2)]),
            ("J/pb", [(1, 12), (0, 1)], [(16, 11), (0, 1)]),
            ("J/b", [(1, 6), (0, 1)], [(5, 2), (1, 2)]),
            ("Q/", [(1, 6), (1, 8)], [(8, 7), (13, 7)]),
            ("Q/p", [(0, 1), (0, 1)], [(3, 2), (3, 2)]),
            ("Q/pb", [(0, 1), (1, 12)], [(0, 1), (8, 7)]),
            ("Q/b", [(1, 33), (1, 6)], [(1, 2), (5, 2)]),
            ("K/", [(0, 1), (1, 8)], [(0, 1), (3, 1)]),
            ("K/p", [(0, 1), (1, 21)], [(3, 2), (3, 2)]),
            ("K/pb", [(0, 1), (1, 4)], [(0, 1), (0, 1)]),
            ("K/b", [(0, 1), (1, 2)], [(1, 2), (5, 2)]),
        ];
        // DCFR(1, 0, 2): factors t/(t+1) and 1/2 and weights t^2 are rational, and negative
        // stored regrets occur, so the sign-dependent discount is exercised.
        const DCFR_1_0_2_T3: Fixture = [
            ("J/", [(35, 192), (-11, 96)], [(49, 4), (7, 4)]),
            ("J/p", [(5, 192), (215, 3328)], [(23, 2), (5, 2)]),
            ("J/pb", [(1, 48), (-17, 96)], [(49, 4), (0, 1)]),
            ("J/b", [(1, 24), (-37, 192)], [(27, 2), (1, 2)]),
            ("Q/", [(5, 96), (1, 32)], [(65, 8), (47, 8)]),
            ("Q/p", [(0, 1), (0, 1)], [(7, 1), (7, 1)]),
            ("Q/pb", [(3, 64), (1, 48)], [(405, 104), (55, 13)]),
            ("Q/b", [(31, 256), (1, 24)], [(1, 2), (27, 2)]),
            ("K/", [(-11, 192), (1, 32)], [(0, 1), (14, 1)]),
            ("K/p", [(-145, 4992), (5, 192)], [(5, 2), (23, 2)]),
            ("K/pb", [(-9, 32), (1, 16)], [(0, 1), (0, 1)]),
            ("K/b", [(-29, 128), (1, 8)], [(1, 2), (27, 2)]),
        ];
        let dcfr_1_0_2 = Variant::Dcfr {
            alpha: 1.0,
            beta: 0.0,
            gamma: 2.0,
        };
        let tree = kuhn();
        for (variant, iterations, fixture) in [
            (Variant::CfrPlus, 2, CFR_PLUS_T2),
            (dcfr_1_0_2, 3, DCFR_1_0_2_T3),
        ] {
            let mut cfr = solver(&tree, variant);
            cfr.run(iterations);
            let ratio = |&(n, d): &(i64, i64)| n as f64 / d as f64;
            for (key, regrets, sums) in fixture {
                let regrets: Vec<f64> = regrets.iter().map(ratio).collect();
                let sums: Vec<f64> = sums.iter().map(ratio).collect();
                assert_row(&cfr.regrets()[id(&tree, key)], &regrets);
                assert_row(&cfr.strategy_sums[id(&tree, key)], &sums);
            }
        }
    }

    #[test]
    fn discount_limits() {
        // At t = 1 every exponent gives 1/2, because 1^x = 1.
        for x in [f64::NEG_INFINITY, -1.0, 0.0, 1.5, f64::INFINITY] {
            assert_eq!(discount(1.0, x), 0.5);
        }
        assert_eq!(discount(2.0, 1.0), 2.0 / 3.0);
        assert_eq!(discount(2.0, 0.0), 0.5);
        assert_eq!(discount(2.0, f64::INFINITY), 1.0);
        assert_eq!(discount(2.0, f64::NEG_INFINITY), 0.0);

        // DCFR(inf, -inf, 1) is CFR+'s update rule from t = 2 on: no NaN, and every stored
        // regret is floored at 0. (At t = 1 both signs are halved instead, so the runs differ.)
        let tree = kuhn();
        let mut cfr = solver(
            &tree,
            Variant::Dcfr {
                alpha: f64::INFINITY,
                beta: f64::NEG_INFINITY,
                gamma: 1.0,
            },
        );
        cfr.run(100);
        assert!(cfr.regrets().iter().flatten().all(|&r| r >= 0.0));
        assert!(exploitability_of_average(&tree, &cfr) <= weighted_regret_bound(&cfr));
    }

    #[test]
    fn rejects_invalid_dcfr_parameters() {
        let tree = kuhn();
        for (alpha, beta, gamma) in [
            (f64::NAN, 0.0, 2.0),
            (-1.0, 0.0, 2.0),
            (f64::NEG_INFINITY, 0.0, 2.0),
            (1.5, f64::NAN, 2.0),
            (1.5, 0.0, -1.0),
            (1.5, 0.0, f64::INFINITY),
            (1.5, 0.0, f64::NAN),
        ] {
            let variant = Variant::Dcfr { alpha, beta, gamma };
            assert!(Cfr::with_variant(&tree, variant).is_err(), "{variant:?}");
        }
        assert!(Cfr::with_variant(&tree, Variant::DCFR).is_ok());
    }

    #[test]
    fn exploitability_bounded_by_regrets_on_kuhn() {
        let tree = kuhn();
        for variant in VARIANTS {
            let mut cfr = solver(&tree, variant);
            for _ in 0..8 {
                cfr.run(125);
                let e = exploitability_of_average(&tree, &cfr);
                assert!(e <= weighted_regret_bound(&cfr) + 1e-12, "{variant:?}");
                match variant {
                    Variant::Vanilla => assert!(e <= regret_bound(&cfr) + 1e-12),
                    Variant::CfrPlus => assert!(e <= cfr_plus_bound(&cfr) + 1e-12),
                    Variant::Dcfr { .. } => {}
                }
            }
        }
    }

    /// Per-variant tolerances of AC1 and AC2, set from the measured runs recorded in MATH.md
    /// §2.2 (vanilla) and §2.4 (CFR+, DCFR), all at T = 10^4. The runs are deterministic.
    struct Expected {
        variant: Variant,
        /// Upper bound on the exploitability at T = 10^4.
        exploitability: f64,
        /// Upper bound on |u_1 + 1/18| at T = 10^4.
        value: f64,
        /// Upper bound on P(bet | Q).
        bet_queen: f64,
        /// Tolerance of the equilibrium-structure checks.
        structure: f64,
    }

    const EXPECTED: [Expected; 3] = [
        // Measured: e = 2.318e-3, |value + 1/18| = 9.16e-6, P(bet | Q) = 3.5e-4, largest
        // structure deviation 0.0107 (P(bet | K) - 3 P(bet | J)).
        Expected {
            variant: Variant::Vanilla,
            exploitability: 3e-3,
            value: 2e-5,
            bet_queen: 1e-3,
            structure: 0.02,
        },
        // Measured: e = 9.089e-6, |value + 1/18| = 1.77e-9, P(bet | Q) = 1.58e-7, largest
        // structure deviation 5.32e-5 (P2's call with Q).
        Expected {
            variant: Variant::CfrPlus,
            exploitability: 2e-5,
            value: 5e-9,
            bet_queen: 5e-7,
            structure: 1e-4,
        },
        // Measured: e = 2.257e-5, |value + 1/18| = 3.86e-9, P(bet | Q) = 7.9e-11, largest
        // structure deviation 1.22e-4 (P1's call with Q).
        Expected {
            variant: Variant::DCFR,
            exploitability: 5e-5,
            value: 1e-8,
            bet_queen: 2e-10,
            structure: 3e-4,
        },
    ];

    /// AC1: the average strategy's exploitability falls between checkpoints and its value
    /// approaches the Kuhn value −1/18.
    #[test]
    fn kuhn_converges_to_value_minus_one_eighteenth() {
        let tree = kuhn();
        for expected in &EXPECTED {
            let mut cfr = solver(&tree, expected.variant);
            let mut previous = f64::INFINITY;
            let mut done = 0;
            for checkpoint in [10u64, 100, 1_000, 10_000] {
                cfr.run(checkpoint - done);
                done = checkpoint;
                let avg = cfr.average_strategy();
                let e = exploitability(&tree, &avg).unwrap().exploitability;
                let value = expected_value(&tree, &avg).unwrap();
                let variant = expected.variant;
                assert!(
                    e < previous,
                    "{variant:?} T={checkpoint}: {e} not below {previous}"
                );
                // Value bound of MATH.md §2.2: |u_1(avg) - v*| <= 2 e(avg), at every T.
                assert!((value + 1.0 / 18.0).abs() <= 2.0 * e);
                previous = e;
            }
            assert!(
                previous <= expected.exploitability,
                "{:?}",
                expected.variant
            );
            let value = expected_value(&tree, &cfr.average_strategy()).unwrap();
            assert!(
                (value + 1.0 / 18.0).abs() <= expected.value,
                "{:?}",
                expected.variant
            );
        }
    }

    /// AC2: the average strategy has the structure of the equilibrium family of MATH.md §1.2.
    #[test]
    fn kuhn_average_strategy_has_equilibrium_structure() {
        let tree = kuhn();
        for expected in &EXPECTED {
            let mut cfr = solver(&tree, expected.variant);
            cfr.run(10_000);
            let avg = cfr.average_strategy();
            // Probability of the second action (bet or call) at `key`.
            let aggressive = |key: &str| avg.row(id(&tree, key))[1];
            let alpha = aggressive("J/");
            let tolerance = expected.structure;
            let variant = expected.variant;

            assert!(aggressive("Q/") <= expected.bet_queen, "{variant:?}");
            assert!(
                (aggressive("K/") - 3.0 * alpha).abs() <= tolerance,
                "{variant:?}"
            );
            assert!((aggressive("Q/pb") - (alpha + 1.0 / 3.0)).abs() <= tolerance);
            assert!(
                (aggressive("Q/b") - 1.0 / 3.0).abs() <= tolerance,
                "{variant:?}"
            );
            assert!(
                (aggressive("J/p") - 1.0 / 3.0).abs() <= tolerance,
                "{variant:?}"
            );
            // Choices that are strict in equilibrium (Step 1 of MATH.md §1.2).
            for (key, action) in [("J/pb", 0), ("K/pb", 1), ("J/b", 0), ("K/b", 1), ("K/p", 1)] {
                let p = avg.row(id(&tree, key))[action];
                assert!(p >= 1.0 - tolerance, "{variant:?} {key}");
            }
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig {
            rng_seed: RngSeed::Fixed(0x5eed_0002),
            cases: 64,
            ..ProptestConfig::default()
        })]

        /// AC5 and the theorems of MATH.md §2.1–2.4 on zero-sum games with Kuhn's information
        /// structure and random payoffs, for every variant (DCFR also with random parameters):
        /// strategy rows are distributions, stored regrets are finite, and the exploitability of
        /// the average strategy (computed independently by best response) is at most the bound
        /// of §2.3 Theorem 3. Variant-specific invariants are checked as well.
        #[test]
        fn rows_regrets_and_bounds(
            payoffs in prop::collection::vec(-5i64..=5, 30),
            iterations in 1u64..=200,
            alpha in 0.0..3.0f64,
            beta in -2.0..2.0f64,
            gamma in 0.0..3.0f64,
        ) {
            let base = kuhn();
            let mut next = payoffs.into_iter();
            // Kuhn has 30 terminals, so `next()` never runs out; 0 would be a valid payoff anyway.
            let tree = base.with_payoffs(|_| next.next().unwrap_or(0));
            let delta = {
                let terminal = tree.nodes().iter().filter_map(|node| match node {
                    Node::Terminal { payoff_p1_chips } => Some(*payoff_p1_chips),
                    _ => None,
                });
                let (lo, hi) = terminal.fold((i64::MAX, i64::MIN), |(lo, hi), u| (lo.min(u), hi.max(u)));
                (hi - lo) as f64
            };
            let t = iterations as f64;
            let random_dcfr = Variant::Dcfr { alpha, beta, gamma };

            for variant in [Variant::Vanilla, Variant::CfrPlus, Variant::DCFR, random_dcfr] {
                let mut cfr = solver(&tree, variant);
                cfr.run(iterations);

                for profile in [cfr.current_strategy(), cfr.average_strategy()] {
                    for row in profile.rows() {
                        prop_assert!(row.iter().all(|&p| p >= 0.0));
                        let sum: f64 = row.iter().sum();
                        prop_assert!((sum - 1.0).abs() <= 1e-12, "row sum {sum}");
                    }
                }
                prop_assert!(cfr.regrets().iter().flatten().all(|r| r.is_finite()));
                let e = exploitability(&tree, &cfr.average_strategy()).unwrap().exploitability;
                let bound = weighted_regret_bound(&cfr);
                prop_assert!(e <= bound + 1e-9, "{variant:?}: exploitability {e} > bound {bound}");

                // Regret-matching bound (MATH.md §2.1; for RM+, Tammelin et al. 2015, Lemma 2).
                let matching_bound = |set: &crate::tree::Infoset| {
                    delta * (set.actions.len() as f64 * t).sqrt() + 1e-9
                };
                match variant {
                    Variant::Vanilla => {
                        for (row, set) in cfr.regrets().iter().zip(tree.infosets()) {
                            let max = row.iter().fold(f64::NEG_INFINITY, |m, &r| m.max(r));
                            prop_assert!(max <= matching_bound(set), "{}: {max}", set.key);
                        }
                        prop_assert!(e <= regret_bound(&cfr) + 1e-9);
                    }
                    Variant::CfrPlus => {
                        let rows = cfr.regrets().iter().zip(&cfr.audit.weighted_regrets);
                        for ((row, weighted), set) in rows.zip(tree.infosets()) {
                            for (&q, &w) in row.iter().zip(weighted) {
                                // AC5 extended: regret-like values are never negative.
                                prop_assert!(q >= 0.0, "{}: Q = {q}", set.key);
                                prop_assert!(q <= matching_bound(set), "{}: Q = {q}", set.key);
                                // sum_t t r^t <= T Q^T (MATH.md §2.3, Lemma 2).
                                prop_assert!(w <= t * q + 1e-9, "{}: {w} > T Q = {}", set.key, t * q);
                            }
                        }
                        prop_assert!(e <= cfr_plus_bound(&cfr) + 1e-9);
                    }
                    Variant::Dcfr { beta, .. } => {
                        // With beta <= 0 negative regrets are at least -Delta (MATH.md §2.4).
                        if beta <= 0.0 {
                            prop_assert!(cfr.regrets().iter().flatten().all(|&r| r >= -delta - 1e-12));
                        }
                    }
                }
            }
        }
    }

    #[test]
    #[ignore = "measurement helper; run with --ignored --nocapture"]
    fn print_kuhn_measurements() {
        let tree = kuhn();
        for variant in VARIANTS {
            println!("{variant:?}");
            let mut cfr = solver(&tree, variant);
            let mut done = 0;
            for checkpoint in [10u64, 100, 1_000, 10_000, 100_000] {
                cfr.run(checkpoint - done);
                done = checkpoint;
                let avg = cfr.average_strategy();
                let e = exploitability(&tree, &avg).unwrap();
                let cur = exploitability(&tree, &cfr.current_strategy())
                    .unwrap()
                    .exploitability;
                let p = |key: &str, k: usize| avg.row(id(&tree, key))[k];
                let strict = [("J/pb", 0), ("K/pb", 1), ("J/b", 0), ("K/b", 1), ("K/p", 1)]
                    .iter()
                    .map(|&(key, k)| p(key, k))
                    .fold(1.0_f64, f64::min);
                println!(
                    "T={checkpoint} e={:.3e} cur_e={:.3e} v+1/18={:.3e} bound={:.3e} | betQ={:.3e} betK-3betJ={:.3e} callQ-betJ-1/3={:.3e} P2callQ-1/3={:.3e} P2bluffJ-1/3={:.3e} min_strict={:.6} alpha={:.4}",
                    e.exploitability,
                    cur,
                    expected_value(&tree, &avg).unwrap() + 1.0 / 18.0,
                    weighted_regret_bound(&cfr),
                    p("Q/", 1),
                    p("K/", 1) - 3.0 * p("J/", 1),
                    p("Q/pb", 1) - p("J/", 1) - 1.0 / 3.0,
                    p("Q/b", 1) - 1.0 / 3.0,
                    p("J/p", 1) - 1.0 / 3.0,
                    strict,
                    p("J/", 1),
                );
                if variant == Variant::CfrPlus {
                    println!("    stored-value bound={:.3e}", cfr_plus_bound(&cfr));
                }
            }
        }
    }
}
