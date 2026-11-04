//! Exact best response, expected value and exploitability (`docs/MATH.md` §1.1, §2.7).
//!
//! The best response is computed over **information sets**, not tree nodes: the responding player
//! cannot tell the histories of an information set apart, so one action is chosen for all of
//! them, the one that maximizes the opponent-reach-weighted sum of action values (§2.7). With
//! perfect recall, information sets are decided from the deepest to the shallowest, counting
//! depth as the number of the responder's own earlier decisions.
//!
//! All values are expected chips; P2's values are the negatives of P1's payoffs.

use crate::game::Player;
use crate::strategy::{Profile, StrategyError};
use crate::tree::{GameTree, InfosetId, Node};
use crate::value::Value;

/// A best response of one player to the other player's strategy.
#[derive(Clone, Debug, PartialEq)]
pub struct BestResponse<V> {
    /// The responding player.
    pub player: Player,
    /// The responder's expected payoff when playing the best response: $b_i(\sigma_{-i})$.
    pub value: V,
    /// For each information set: the index of the chosen action if the responder acts there,
    /// `None` for the opponent's information sets. Ties go to the lowest action index. Where the
    /// opponent's strategy gives every history of an information set reach 0, all actions tie
    /// and the choice there does not affect `value`.
    pub actions: Vec<Option<usize>>,
}

/// Exploitability of a profile and its ingredients (convention of `docs/MATH.md` §1.1).
#[derive(Clone, Debug, PartialEq)]
pub struct Exploitability<V> {
    /// P1's expected payoff under the profile itself, $u_1(\sigma)$.
    pub value_p1: V,
    /// $[b_1(\sigma_2), b_2(\sigma_1)]$: each player's best-response value.
    pub best_response_values: [V; 2],
    /// $e(\sigma) = (b_1(\sigma_2) + b_2(\sigma_1)) / 2$; zero exactly at a Nash equilibrium.
    pub exploitability: V,
}

/// P1's expected payoff when both players follow `profile`.
///
/// # Errors
///
/// A [`StrategyError`] if `profile` does not fit `tree`.
pub fn expected_value<V: Value>(tree: &GameTree, profile: &Profile<V>) -> Result<V, StrategyError> {
    profile.validate(tree)?;
    Ok(node_values(tree, profile, None)[tree.root()])
}

/// The best response of `player` to the opponent's part of `profile` (`player`'s own rows are
/// ignored).
///
/// # Errors
///
/// A [`StrategyError`] if `profile` does not fit `tree`.
pub fn best_response<V: Value>(
    tree: &GameTree,
    profile: &Profile<V>,
    player: Player,
) -> Result<BestResponse<V>, StrategyError> {
    profile.validate(tree)?;
    let reach = opponent_reach(tree, profile, player);
    let sign = player_sign::<V>(player);
    let mut chosen: Vec<Option<usize>> = vec![None; tree.infosets().len()];
    // Deepest level first: when a level is decided, every information set below it already is.
    for level in levels(tree, player).iter().rev() {
        // `&chosen` lends the decisions so far; the borrow ends when `node_values` returns, so
        // `chosen` can be updated right after.
        let values = node_values(tree, profile, Some((player, &chosen)));
        for &infoset in level {
            chosen[infoset] = Some(best_action(tree, infoset, &reach, &values, sign));
        }
    }
    let values = node_values(tree, profile, Some((player, &chosen)));
    Ok(BestResponse {
        player,
        value: sign * values[tree.root()],
        actions: chosen,
    })
}

/// Both best responses, the profile's value and its exploitability.
///
/// # Errors
///
/// A [`StrategyError`] if `profile` does not fit `tree`.
pub fn exploitability<V: Value>(
    tree: &GameTree,
    profile: &Profile<V>,
) -> Result<Exploitability<V>, StrategyError> {
    let value_p1 = expected_value(tree, profile)?;
    let b1 = best_response(tree, profile, Player::P1)?.value;
    let b2 = best_response(tree, profile, Player::P2)?.value;
    Ok(Exploitability {
        value_p1,
        best_response_values: [b1, b2],
        exploitability: V::from_ratio(1, 2) * (b1 + b2),
    })
}

/// `+1` for P1 and `-1` for P2: multiplies a P1 payoff into `player`'s payoff.
fn player_sign<V: Value>(player: Player) -> V {
    match player {
        Player::P1 => V::from_ratio(1, 1),
        Player::P2 => V::from_ratio(-1, 1),
    }
}

/// For every node, the expected P1 payoff of the subtree below it.
///
/// Information sets of `fixed.0` use the decisions in `fixed.1` (a pure strategy); undecided ones
/// get value 0, which is never read because they are not below any information set that is being
/// decided (see [`best_response`]). All other information sets use `profile`.
///
/// Nodes are stored in post-order, so one pass in index order sees every child before its parent.
fn node_values<V: Value>(
    tree: &GameTree,
    profile: &Profile<V>,
    fixed: Option<(Player, &[Option<usize>])>,
) -> Vec<V> {
    let mut values: Vec<V> = Vec::with_capacity(tree.nodes().len());
    for node in tree.nodes() {
        let value = match node {
            Node::Terminal { payoff_p1_chips } => V::from_ratio(*payoff_p1_chips, 1),
            Node::Chance {
                outcomes,
                total_weight,
            } => outcomes.iter().fold(V::zero(), |acc, &(weight, child)| {
                acc + V::from_ratio(i64::from(weight), *total_weight) * values[child]
            }),
            Node::Decision { infoset, children } => match fixed {
                Some((player, chosen)) if tree.infoset(*infoset).player == player => {
                    match chosen[*infoset] {
                        Some(k) => values[children[k]],
                        None => V::zero(),
                    }
                }
                _ => children
                    .iter()
                    .zip(profile.row(*infoset))
                    .fold(V::zero(), |acc, (&child, &p)| acc + p * values[child]),
            },
        };
        values.push(value);
    }
    values
}

/// For every node, $\pi_{-i}(h)$: the probability of reaching it from the root when `player` is
/// assumed to play towards it, i.e. the product of chance and opponent probabilities only.
///
/// Walks ids downwards (root first), so each parent is done before its children.
fn opponent_reach<V: Value>(tree: &GameTree, profile: &Profile<V>, player: Player) -> Vec<V> {
    let n = tree.nodes().len();
    let mut reach = vec![V::zero(); n];
    reach[tree.root()] = V::from_ratio(1, 1);
    for id in (0..n).rev() {
        let r = reach[id];
        match tree.node(id) {
            Node::Terminal { .. } => {}
            Node::Chance {
                outcomes,
                total_weight,
            } => {
                for &(weight, child) in outcomes {
                    reach[child] = r * V::from_ratio(i64::from(weight), *total_weight);
                }
            }
            Node::Decision { infoset, children } => {
                let own = tree.infoset(*infoset).player == player;
                let row = profile.row(*infoset);
                for (k, &child) in children.iter().enumerate() {
                    reach[child] = if own { r } else { r * row[k] };
                }
            }
        }
    }
    reach
}

/// `player`'s information sets grouped by depth: `levels[d]` holds those reached after `d` of
/// `player`'s own decisions.
///
/// With perfect recall every node of an information set has the same depth, since the player
/// remembers their own past actions.
fn levels(tree: &GameTree, player: Player) -> Vec<Vec<InfosetId>> {
    let n = tree.nodes().len();
    let mut depth = vec![0usize; n];
    for id in (0..n).rev() {
        let d = depth[id];
        match tree.node(id) {
            Node::Terminal { .. } => {}
            Node::Chance { outcomes, .. } => {
                for &(_, child) in outcomes {
                    depth[child] = d;
                }
            }
            Node::Decision { infoset, children } => {
                let step = usize::from(tree.infoset(*infoset).player == player);
                for &child in children {
                    depth[child] = d + step;
                }
            }
        }
    }
    let mut levels: Vec<Vec<InfosetId>> = Vec::new();
    for (id, set) in tree.infosets().iter().enumerate() {
        if set.player != player {
            continue;
        }
        // Every information set has at least one node: it is created by its first node.
        let d = depth[set.nodes[0]];
        debug_assert!(
            set.nodes.iter().all(|&h| depth[h] == d),
            "perfect recall violated at information set {:?}",
            set.key
        );
        if levels.len() <= d {
            levels.resize_with(d + 1, Vec::new);
        }
        levels[d].push(id);
    }
    levels
}

/// The action maximizing $\sum_{h \in I} \pi_{-i}(h)\, v_i(h \cdot a)$ at information set `infoset`
/// (lowest index on ties).
fn best_action<V: Value>(
    tree: &GameTree,
    infoset: InfosetId,
    reach: &[V],
    values: &[V],
    sign: V,
) -> usize {
    let set = tree.infoset(infoset);
    let mut best: Option<(usize, V)> = None;
    for k in 0..set.actions.len() {
        let q = set.nodes.iter().fold(V::zero(), |acc, &h| {
            acc + reach[h] * values[tree.decision_children(h)[k]]
        });
        let q = sign * q;
        // Strict `>`: a later action replaces the current best only if it is strictly better.
        if best.is_none_or(|(_, b)| q > b) {
            best = Some((k, q));
        }
    }
    best.map_or(0, |(k, _)| k)
}

#[cfg(test)]
mod tests {
    use num_rational::Ratio;

    use super::*;
    use crate::game::Action;
    use crate::games::kuhn::Kuhn;

    type Q = Ratio<i64>;

    fn q(num: i64, den: i64) -> Q {
        Q::new(num, den)
    }

    fn kuhn() -> GameTree {
        GameTree::build(&Kuhn).unwrap()
    }

    /// A Kuhn profile from `(information-set key, [p(first action), p(second action)])` pairs.
    /// Action order: opening and after a check `[Check, Bet]`; facing a bet `[Fold, Call]`.
    fn kuhn_profile(tree: &GameTree, rows: &[(&str, [Q; 2])]) -> Profile<Q> {
        Profile::from_fn(tree, |set| {
            let (_, row) = rows
                .iter()
                .find(|(key, _)| *key == set.key)
                .unwrap_or_else(|| panic!("no row for {}", set.key));
            row.to_vec()
        })
        .unwrap()
    }

    /// The equilibrium family of `docs/MATH.md` §1.2 for a given α ∈ [0, 1/3].
    fn equilibrium(tree: &GameTree, alpha: Q) -> Profile<Q> {
        let one = q(1, 1);
        let third = q(1, 3);
        let zero = q(0, 1);
        kuhn_profile(
            tree,
            &[
                // P1 opening: J bets α, Q checks, K bets 3α.
                ("J/", [one - alpha, alpha]),
                ("Q/", [one, zero]),
                ("K/", [one - alpha * 3, alpha * 3]),
                // P1 facing check–bet: J folds, Q calls α + 1/3, K calls.
                ("J/pb", [one, zero]),
                ("Q/pb", [one - (alpha + third), alpha + third]),
                ("K/pb", [zero, one]),
                // P2 after a check: J bets 1/3, Q checks, K bets.
                ("J/p", [one - third, third]),
                ("Q/p", [one, zero]),
                ("K/p", [zero, one]),
                // P2 facing a bet: J folds, Q calls 1/3, K calls.
                ("J/b", [one, zero]),
                ("Q/b", [one - third, third]),
                ("K/b", [zero, one]),
            ],
        )
    }

    /// The action `response` chooses at information set `key`.
    fn chosen(tree: &GameTree, response: &BestResponse<Q>, key: &str) -> Action {
        let id = tree.find_infoset(key).unwrap();
        tree.infoset(id).actions[response.actions[id].unwrap()]
    }

    #[test]
    fn against_uniform_matches_hand_computation() {
        // Hand computation in docs/MATH.md §2.7.
        let tree = kuhn();
        let uniform = Profile::<Q>::uniform(&tree);
        let e = exploitability(&tree, &uniform).unwrap();
        assert_eq!(e.value_p1, q(1, 8));
        assert_eq!(e.best_response_values, [q(1, 2), q(5, 12)]);
        assert_eq!(e.exploitability, q(11, 24));
    }

    #[test]
    fn best_response_actions_against_uniform() {
        use Action::*;
        let tree = kuhn();
        let uniform = Profile::<Q>::uniform(&tree);
        let br1 = best_response(&tree, &uniform, Player::P1).unwrap();
        // K is indifferent between checking and betting (both 3/2): the tie goes to Check.
        for (key, action) in [
            ("J/", Bet),
            ("Q/", Bet),
            ("K/", Check),
            ("J/pb", Fold),
            ("Q/pb", Call),
            ("K/pb", Call),
        ] {
            assert_eq!(chosen(&tree, &br1, key), action, "P1 at {key}");
        }
        let br2 = best_response(&tree, &uniform, Player::P2).unwrap();
        for (key, action) in [
            ("J/p", Bet),
            ("Q/p", Bet),
            ("K/p", Bet),
            ("J/b", Fold),
            ("Q/b", Call),
            ("K/b", Call),
        ] {
            assert_eq!(chosen(&tree, &br2, key), action, "P2 at {key}");
        }
        // Each best response decides exactly its own six information sets.
        assert_eq!(br1.actions.iter().flatten().count(), 6);
        assert_eq!(br2.actions.iter().flatten().count(), 6);
    }

    #[test]
    fn closed_form_equilibrium_has_zero_exploitability() {
        let tree = kuhn();
        for alpha in [q(0, 1), q(1, 6), q(1, 3)] {
            let e = exploitability(&tree, &equilibrium(&tree, alpha)).unwrap();
            assert_eq!(e.value_p1, q(-1, 18), "alpha = {alpha}");
            assert_eq!(
                e.best_response_values,
                [q(-1, 18), q(1, 18)],
                "alpha = {alpha}"
            );
            assert_eq!(e.exploitability, q(0, 1), "alpha = {alpha}");
        }
    }

    #[test]
    fn weights_histories_by_opponent_reach() {
        // P1 bets only with K; facing check–bet, J folds and Q, K call (hand computation in
        // docs/MATH.md §2.7). P2 holding Q and facing a bet only meets K (P1's J never bets),
        // so P2 must fold. Summing the two histories without the reach weights would call
        // (+2 against J, −2 against K) and give b2 = 0 instead of 1/6.
        let tree = kuhn();
        let one = q(1, 1);
        let zero = q(0, 1);
        let p1_value_bets = kuhn_profile(
            &tree,
            &[
                ("J/", [one, zero]),
                ("Q/", [one, zero]),
                ("K/", [zero, one]),
                ("J/pb", [one, zero]),
                ("Q/pb", [zero, one]),
                ("K/pb", [zero, one]),
                // P2's rows are ignored by P2's best response.
                ("J/p", [one, zero]),
                ("Q/p", [one, zero]),
                ("K/p", [one, zero]),
                ("J/b", [one, zero]),
                ("Q/b", [one, zero]),
                ("K/b", [one, zero]),
            ],
        );
        let br2 = best_response(&tree, &p1_value_bets, Player::P2).unwrap();
        assert_eq!(br2.value, q(1, 6));
        assert_eq!(chosen(&tree, &br2, "Q/b"), Action::Fold);
        assert_eq!(chosen(&tree, &br2, "K/p"), Action::Bet);
    }

    #[test]
    fn perturbed_equilibrium_is_exploitable() {
        let tree = kuhn();
        let eq = equilibrium(&tree, q(0, 1));
        // P1 now always bets Q; P2's strategy is unchanged.
        let q_open = tree.find_infoset("Q/").unwrap();
        let mut rows = eq.rows().to_vec();
        rows[q_open] = vec![q(0, 1), q(1, 1)];
        let perturbed = Profile::new(&tree, rows).unwrap();
        let e = exploitability(&tree, &perturbed).unwrap();
        assert!(e.exploitability > q(0, 1));
        // P1's best response only depends on P2's (unchanged) strategy.
        assert_eq!(e.best_response_values[0], q(-1, 18));
    }

    #[test]
    fn f64_agrees_with_rationals() {
        let tree = kuhn();
        let e = exploitability(&tree, &Profile::<f64>::uniform(&tree)).unwrap();
        assert!((e.value_p1 - 1.0 / 8.0).abs() < 1e-12);
        assert!((e.best_response_values[0] - 1.0 / 2.0).abs() < 1e-12);
        assert!((e.best_response_values[1] - 5.0 / 12.0).abs() < 1e-12);
        assert!((e.exploitability - 11.0 / 24.0).abs() < 1e-12);
    }

    /// A game with a single one-action decision, so its profiles have one row.
    struct OneDecision;

    impl crate::game::Game for OneDecision {
        type State = bool;
        fn root(&self) -> bool {
            false
        }
        fn node(&self, done: &bool) -> crate::game::NodeKind<bool> {
            if *done {
                crate::game::NodeKind::Terminal { payoff_p1_chips: 0 }
            } else {
                crate::game::NodeKind::Decision {
                    player: Player::P1,
                    infoset_key: "x".to_string(),
                    actions: vec![(Action::Check, true)],
                }
            }
        }
    }

    #[test]
    fn rejects_a_profile_for_another_tree() {
        let other = GameTree::build(&OneDecision).unwrap();
        let wrong = Profile::<f64>::uniform(&other);
        assert!(matches!(
            exploitability(&kuhn(), &wrong),
            Err(StrategyError::WrongRowCount {
                expected: 12,
                found: 1
            })
        ));
    }
}
