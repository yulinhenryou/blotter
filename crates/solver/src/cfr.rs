//! Vanilla counterfactual regret minimization (`docs/MATH.md` §2.2).
//!
//! Every iteration runs regret matching (§2.1) at every information set to get the current
//! profile $\sigma^t$, then adds each action's counterfactual regret to the cumulative regrets
//! $R(I, a)$ and the player's own-reach-weighted strategy to the strategy sums $S(I, a)$. The
//! output is the normalized strategy sums, the **average strategy**: its exploitability is the
//! players' average overall regret (Theorem 1 of §2.2), which goes to 0.
//!
//! Updates are simultaneous: both players' regrets in iteration $t$ are computed from the same
//! $\sigma^t$. CFR+ and DCFR (Task 5) change the update rules, not the passes.

use crate::game::Player;
use crate::regret::regret_matching;
use crate::strategy::Profile;
use crate::tree::{GameTree, Node};

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

/// The state of a vanilla CFR run on one [`GameTree`].
///
/// The solver *borrows* the tree (`&'t GameTree`) and *owns* its tables. `'t` says the solver
/// cannot outlive the tree it points to; the tree stays immutable while the solver mutates its own
/// `Vec`s, so there is never a shared and a mutable borrow of the same value. Holding the
/// reference, instead of taking `&GameTree` in every call, also rules out calling
/// [`Cfr::iterate`] with a different tree than the tables were sized for.
#[derive(Clone, Debug)]
pub struct Cfr<'t> {
    tree: &'t GameTree,
    /// $R^T(I, a)$, indexed by information set, then action.
    regrets: Vec<Vec<f64>>,
    /// $S^T(I, a) = \sum_t \pi_i^{\sigma^t}(I)\, \sigma^t(I, a)$.
    strategy_sums: Vec<Vec<f64>>,
    iterations: u64,
    // Scratch space, overwritten on every iteration; kept here so iterations do not allocate.
    /// $\sigma^t$ during iteration $t$.
    current: Vec<Vec<f64>>,
    /// Reach of every node under $\sigma^t$.
    reach: Vec<Reach>,
    /// $u_1(\sigma^t, h)$ for every node: P1's expected payoff from the node on.
    values: Vec<f64>,
}

impl<'t> Cfr<'t> {
    /// A solver with all regrets and strategy sums at 0, so the first iteration plays uniformly.
    pub fn new(tree: &'t GameTree) -> Cfr<'t> {
        let zeros: Vec<Vec<f64>> = tree
            .infosets()
            .iter()
            .map(|set| vec![0.0; set.actions.len()])
            .collect();
        let n = tree.nodes().len();
        Cfr {
            tree,
            regrets: zeros.clone(),
            strategy_sums: zeros.clone(),
            iterations: 0,
            current: zeros,
            reach: vec![Reach::ROOT; n],
            values: vec![0.0; n],
        }
    }

    /// Run `iterations` iterations.
    pub fn run(&mut self, iterations: u64) {
        for _ in 0..iterations {
            self.iterate();
        }
    }

    /// One iteration of vanilla CFR: four passes over the tree (`docs/MATH.md` §2.2).
    pub fn iterate(&mut self) {
        // Copy the reference out of `self` (references are `Copy`). Reading the tree through this
        // local does not borrow `self`, so the passes below can mutate `self`'s tables freely.
        let tree = self.tree;
        let n = tree.nodes().len();

        // 1. sigma^t by regret matching. `self.regrets` and `self.current` are different fields,
        //    so borrowing one shared and the other mutable at the same time is allowed.
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

        // 3. P1's expected payoff of every node under sigma^t, children first.
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
            let sign = match set.player {
                Player::P1 => 1.0,
                Player::P2 => -1.0,
            };
            // A mutable borrow of one row of `self.regrets` while `self.reach` and `self.values`
            // are read: again disjoint fields.
            let regrets = &mut self.regrets[id];
            for &h in &set.nodes {
                let weight = self.reach[h].counterfactual(set.player);
                let base = self.values[h];
                for (regret, &child) in regrets.iter_mut().zip(tree.decision_children(h)) {
                    // pi_{-i}(h) * (u_i(sigma, h.a) - u_i(sigma, h)), in player i's payoffs.
                    *regret += weight * sign * (self.values[child] - base);
                }
            }
            // Own reach is the same at every node of the set (perfect recall), so it is added
            // once per set. Every set has at least one node: it was created by its first node.
            let own = self.reach[set.nodes[0]].own(set.player);
            for (sum, &p) in self.strategy_sums[id].iter_mut().zip(&self.current[id]) {
                *sum += own * p;
            }
        }

        self.iterations += 1;
    }

    /// Number of iterations run so far, $T$.
    pub fn iterations(&self) -> u64 {
        self.iterations
    }

    /// Cumulative counterfactual regrets $R^T(I, a)$, indexed by information set, then action.
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

    fn kuhn() -> GameTree {
        GameTree::build(&Kuhn).unwrap()
    }

    fn id(tree: &GameTree, key: &str) -> InfosetId {
        tree.find_infoset(key).unwrap()
    }

    fn assert_row(actual: &[f64], expected: &[f64]) {
        assert_eq!(actual.len(), expected.len());
        for (a, e) in actual.iter().zip(expected) {
            assert!((a - e).abs() <= 1e-15, "{actual:?} != {expected:?}");
        }
    }

    /// $\frac1{2T} \sum_I \max_a R^T(I, a)^+$: the regret-decomposition bound on the
    /// exploitability of the average strategy (`docs/MATH.md` §2.2, Theorems 1 and 2).
    fn regret_bound(cfr: &Cfr<'_>) -> f64 {
        let total: f64 = cfr
            .regrets()
            .iter()
            .map(|row| row.iter().fold(0.0_f64, |m, &r| m.max(r)))
            .sum();
        total / (2.0 * cfr.iterations() as f64)
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

    #[test]
    fn exploitability_bounded_by_regrets_on_kuhn() {
        let tree = kuhn();
        let mut cfr = Cfr::new(&tree);
        for _ in 0..8 {
            cfr.run(125);
            let e = exploitability(&tree, &cfr.average_strategy())
                .unwrap()
                .exploitability;
            assert!(e <= regret_bound(&cfr) + 1e-12);
        }
    }

    /// AC1: the average strategy's exploitability falls between checkpoints and its value
    /// approaches the Kuhn value −1/18. Tolerances are set from the measured run recorded in
    /// MATH.md §2.2 (*Measurements*); the run is deterministic.
    #[test]
    fn kuhn_converges_to_value_minus_one_eighteenth() {
        let tree = kuhn();
        let mut cfr = Cfr::new(&tree);
        let mut previous = f64::INFINITY;
        let mut done = 0;
        for checkpoint in [10u64, 100, 1_000, 10_000] {
            cfr.run(checkpoint - done);
            done = checkpoint;
            let avg = cfr.average_strategy();
            let e = exploitability(&tree, &avg).unwrap().exploitability;
            let value = expected_value(&tree, &avg).unwrap();
            assert!(e < previous, "T={checkpoint}: {e} not below {previous}");
            // Value bound of MATH.md §2.2: |u_1(avg) - v*| <= 2 e(avg), at every T.
            assert!((value + 1.0 / 18.0).abs() <= 2.0 * e);
            previous = e;
        }
        // Measured at T = 10^4: e = 2.318e-3, |value + 1/18| = 9.16e-6.
        assert!(previous <= 3e-3);
        let value = expected_value(&tree, &cfr.average_strategy()).unwrap();
        assert!((value + 1.0 / 18.0).abs() <= 2e-5);
    }

    /// AC2: the average strategy has the structure of the equilibrium family of MATH.md §1.2.
    /// Tolerance 0.02 is about twice the largest deviation measured at T = 10^4 (0.0107, for
    /// P(bet | K) - 3 P(bet | J)); see MATH.md §2.2, *Measurements*.
    #[test]
    fn kuhn_average_strategy_has_equilibrium_structure() {
        let tree = kuhn();
        let mut cfr = Cfr::new(&tree);
        cfr.run(10_000);
        let avg = cfr.average_strategy();
        // Probability of the second action (bet or call) at `key`.
        let aggressive = |key: &str| avg.row(id(&tree, key))[1];
        let alpha = aggressive("J/");
        let tolerance = 0.02;

        // Measured 3.5e-4: Q bets only in the first iterations (iteration 2 bets every card).
        assert!(aggressive("Q/") <= 1e-3);
        assert!((aggressive("K/") - 3.0 * alpha).abs() <= tolerance);
        assert!((aggressive("Q/pb") - (alpha + 1.0 / 3.0)).abs() <= tolerance);
        assert!((aggressive("Q/b") - 1.0 / 3.0).abs() <= tolerance);
        assert!((aggressive("J/p") - 1.0 / 3.0).abs() <= tolerance);
        // Choices that are strict in equilibrium (Step 1 of MATH.md §1.2).
        for (key, action) in [("J/pb", 0), ("K/pb", 1), ("J/b", 0), ("K/b", 1), ("K/p", 1)] {
            assert!(avg.row(id(&tree, key))[action] >= 1.0 - tolerance, "{key}");
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig {
            rng_seed: RngSeed::Fixed(0x5eed_0002),
            cases: 64,
            ..ProptestConfig::default()
        })]

        /// AC5 and the theorems of MATH.md §2.1–2.2 on zero-sum games with Kuhn's information
        /// structure and random payoffs: strategy rows are distributions, regrets are finite,
        /// every information set obeys the regret-matching bound, and the exploitability of the
        /// average strategy (computed independently by best response) is at most the
        /// regret-decomposition bound.
        #[test]
        fn rows_regrets_and_bounds(
            payoffs in prop::collection::vec(-5i64..=5, 30),
            iterations in 1u64..=200,
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

            let mut cfr = Cfr::new(&tree);
            cfr.run(iterations);

            for profile in [cfr.current_strategy(), cfr.average_strategy()] {
                for row in profile.rows() {
                    prop_assert!(row.iter().all(|&p| p >= 0.0));
                    let sum: f64 = row.iter().sum();
                    prop_assert!((sum - 1.0).abs() <= 1e-12, "row sum {sum}");
                }
            }
            let t = iterations as f64;
            for (row, set) in cfr.regrets().iter().zip(tree.infosets()) {
                prop_assert!(row.iter().all(|r| r.is_finite()));
                let max = row.iter().fold(f64::NEG_INFINITY, |m, &r| m.max(r));
                let bound = delta * (set.actions.len() as f64 * t).sqrt();
                prop_assert!(max <= bound + 1e-9, "{}: {max} > {bound}", set.key);
            }
            let e = exploitability(&tree, &cfr.average_strategy()).unwrap().exploitability;
            let bound = regret_bound(&cfr);
            prop_assert!(e <= bound + 1e-9, "exploitability {e} > bound {bound}");
        }
    }

    #[test]
    #[ignore = "measurement helper; run with --ignored --nocapture"]
    fn print_kuhn_measurements() {
        let tree = kuhn();
        let mut cfr = Cfr::new(&tree);
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
            println!(
                "T={checkpoint} e={:.3e} cur_e={:.3e} v+1/18={:.3e} bound={:.3e} | betQ={:.3e} betK-3betJ={:.3e} callQ-betJ-1/3={:.3e} P2callQ-1/3={:.3e} P2bluffJ-1/3={:.3e} alpha={:.4}",
                e.exploitability,
                cur,
                expected_value(&tree, &avg).unwrap() + 1.0 / 18.0,
                regret_bound(&cfr),
                p("Q/", 1),
                p("K/", 1) - 3.0 * p("J/", 1),
                p("Q/pb", 1) - p("J/", 1) - 1.0 / 3.0,
                p("Q/b", 1) - 1.0 / 3.0,
                p("J/p", 1) - 1.0 / 3.0,
                p("J/", 1),
            );
        }
    }
}
