//! Kuhn poker (`docs/MATH.md` §1.2; Kuhn 1950).
//!
//! Three cards J < Q < K, ante 1 each, one card per player, one betting round with a single bet
//! of size 1. P1 acts first. Payoffs are net chips for P1.
//!
//! Betting sequences use the usual Kuhn notation: `p` = pass (check, or fold when facing a bet),
//! `b` = bet (bet, or call when facing a bet). For example `pb` is "P1 checks, P2 bets".

use crate::game::{Action, Game, NodeKind, Player};

/// A Kuhn card. Variants are declared in rank order, so the derived `Ord` gives J < Q < K.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Card {
    /// Jack, the lowest card.
    J,
    /// Queen.
    Q,
    /// King, the highest card.
    K,
}

impl Card {
    /// All cards, lowest first.
    pub const ALL: [Card; 3] = [Card::J, Card::Q, Card::K];
}

/// Every point of the betting round. One variant per sequence, so a state that the rules do not
/// allow (say, a bet after a call) cannot be represented at all.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Seq {
    /// P1 to act.
    Root,
    /// `p`: P1 checked; P2 to act.
    Check,
    /// `b`: P1 bet; P2 to act.
    Bet,
    /// `pb`: P1 checked, P2 bet; P1 to act.
    CheckBet,
    /// `pp`: both checked; showdown for 1.
    CheckCheck,
    /// `pbp`: P1 folded to P2's bet.
    CheckBetFold,
    /// `pbb`: P1 called P2's bet; showdown for 2.
    CheckBetCall,
    /// `bp`: P2 folded to P1's bet.
    BetFold,
    /// `bb`: P2 called P1's bet; showdown for 2.
    BetCall,
}

impl Seq {
    /// The sequence in `p` / `b` notation.
    ///
    /// Returns `&'static str`: string literals live in the compiled program for its whole run, so
    /// the returned reference is valid forever and borrows nothing from `self`.
    pub fn code(self) -> &'static str {
        match self {
            Seq::Root => "",
            Seq::Check => "p",
            Seq::Bet => "b",
            Seq::CheckBet => "pb",
            Seq::CheckCheck => "pp",
            Seq::CheckBetFold => "pbp",
            Seq::CheckBetCall => "pbb",
            Seq::BetFold => "bp",
            Seq::BetCall => "bb",
        }
    }
}

/// A Kuhn state: before the deal, or during betting with both cards known to the game.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KuhnState {
    /// Cards not yet dealt.
    Deal,
    /// Cards dealt (`cards[0]` is P1's, `cards[1]` is P2's) and betting under way.
    Betting {
        /// Each player's card, indexed by [`Player::index`].
        cards: [Card; 2],
        /// The betting so far.
        seq: Seq,
    },
}

/// Kuhn poker. A unit struct: the rules are fixed, so the game holds no data.
#[derive(Clone, Copy, Debug, Default)]
pub struct Kuhn;

impl Game for Kuhn {
    type State = KuhnState;

    fn root(&self) -> KuhnState {
        KuhnState::Deal
    }

    fn node(&self, state: &KuhnState) -> NodeKind<KuhnState> {
        // `*state` copies the state out of the reference; that is allowed because `KuhnState` is
        // `Copy`. Matching on the copy binds `cards` and `seq` by value.
        let (cards, seq) = match *state {
            KuhnState::Deal => return deal(),
            KuhnState::Betting { cards, seq } => (cards, seq),
        };

        // A decision for `player` with two actions. The information-set key is the player's own
        // card plus the public betting so far: it never contains the opponent's card.
        let decide = |player: Player, choices: [(Action, Seq); 2]| NodeKind::Decision {
            player,
            infoset_key: format!("{:?}/{}", cards[player.index()], seq.code()),
            actions: choices
                .into_iter()
                .map(|(action, next)| (action, KuhnState::Betting { cards, seq: next }))
                .collect(),
        };
        let showdown = |stake: i64| NodeKind::Terminal {
            payoff_p1_chips: if cards[0] > cards[1] { stake } else { -stake },
        };

        match seq {
            Seq::Root => decide(
                Player::P1,
                [(Action::Check, Seq::Check), (Action::Bet, Seq::Bet)],
            ),
            Seq::Check => decide(
                Player::P2,
                [
                    (Action::Check, Seq::CheckCheck),
                    (Action::Bet, Seq::CheckBet),
                ],
            ),
            Seq::CheckBet => decide(
                Player::P1,
                [
                    (Action::Fold, Seq::CheckBetFold),
                    (Action::Call, Seq::CheckBetCall),
                ],
            ),
            Seq::Bet => decide(
                Player::P2,
                [(Action::Fold, Seq::BetFold), (Action::Call, Seq::BetCall)],
            ),
            Seq::CheckCheck => showdown(1),
            Seq::CheckBetCall | Seq::BetCall => showdown(2),
            // The folding player loses their ante.
            Seq::CheckBetFold => NodeKind::Terminal {
                payoff_p1_chips: -1,
            },
            Seq::BetFold => NodeKind::Terminal { payoff_p1_chips: 1 },
        }
    }
}

/// The deal: each ordered pair of distinct cards with weight 1, i.e. probability 1/6.
fn deal() -> NodeKind<KuhnState> {
    let mut outcomes = Vec::with_capacity(6);
    for p1 in Card::ALL {
        for p2 in Card::ALL {
            if p1 != p2 {
                let next = KuhnState::Betting {
                    cards: [p1, p2],
                    seq: Seq::Root,
                };
                outcomes.push((1, next));
            }
        }
    }
    NodeKind::Chance { outcomes }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tree::{GameTree, Node};

    /// Play `actions` from the start of betting with `cards` and return P1's payoff.
    fn play(cards: [Card; 2], actions: &[Action]) -> i64 {
        let mut state = KuhnState::Betting {
            cards,
            seq: Seq::Root,
        };
        for &wanted in actions {
            match Kuhn.node(&state) {
                NodeKind::Decision { actions, .. } => {
                    let (_, next) = actions
                        .into_iter()
                        .find(|&(a, _)| a == wanted)
                        .unwrap_or_else(|| panic!("{wanted:?} is not legal here"));
                    state = next;
                }
                other => panic!("expected a decision, got {other:?}"),
            }
        }
        match Kuhn.node(&state) {
            NodeKind::Terminal { payoff_p1_chips } => payoff_p1_chips,
            other => panic!("expected a terminal, got {other:?}"),
        }
    }

    #[test]
    fn payoffs_follow_the_rules() {
        use Action::*;
        use Card::*;
        // P1 holds J, P2 holds K: every one of the five betting sequences.
        assert_eq!(play([J, K], &[Check, Check]), -1);
        assert_eq!(play([J, K], &[Check, Bet, Fold]), -1);
        assert_eq!(play([J, K], &[Check, Bet, Call]), -2);
        assert_eq!(play([J, K], &[Bet, Fold]), 1);
        assert_eq!(play([J, K], &[Bet, Call]), -2);
        // The higher card wins showdowns whoever holds it.
        assert_eq!(play([K, Q], &[Check, Check]), 1);
        assert_eq!(play([Q, J], &[Bet, Call]), 2);
    }

    #[test]
    fn tree_has_the_derived_size() {
        let tree = GameTree::build(&Kuhn).unwrap();
        // MATH.md §1.2: 6 deals × 5 betting sequences = 30 terminal histories; 6 deals × 4
        // decision points = 24 decision nodes; plus the chance root.
        let count = |pred: fn(&Node) -> bool| tree.nodes().iter().filter(|n| pred(n)).count();
        assert_eq!(count(|n| matches!(n, Node::Terminal { .. })), 30);
        assert_eq!(count(|n| matches!(n, Node::Decision { .. })), 24);
        assert_eq!(count(|n| matches!(n, Node::Chance { .. })), 1);
        match tree.node(tree.root()) {
            Node::Chance {
                outcomes,
                total_weight,
            } => {
                assert_eq!(outcomes.len(), 6);
                assert!(outcomes.iter().all(|&(w, _)| w == 1));
                assert_eq!(*total_weight, 6);
            }
            other => panic!("root should be the deal, got {other:?}"),
        }
    }

    #[test]
    fn information_sets_hide_the_opponents_card() {
        let tree = GameTree::build(&Kuhn).unwrap();
        // 12 information sets: per player, 3 cards × 2 decision points.
        assert_eq!(tree.infosets().len(), 12);
        let mut keys: Vec<&str> = tree.infosets().iter().map(|s| s.key.as_str()).collect();
        keys.sort_unstable();
        let mut expected = vec![
            "J/", "Q/", "K/", "J/pb", "Q/pb", "K/pb", // P1
            "J/p", "Q/p", "K/p", "J/b", "Q/b", "K/b", // P2
        ];
        expected.sort_unstable();
        assert_eq!(keys, expected);
        for set in tree.infosets() {
            // A player holding one card faces either of the two other cards: two histories.
            assert_eq!(set.nodes.len(), 2, "information set {}", set.key);
            assert_eq!(set.actions.len(), 2);
            let p1_acts = set.key.len() == 2 || set.key.ends_with("pb");
            let expected_player = if p1_acts { Player::P1 } else { Player::P2 };
            assert_eq!(set.player, expected_player, "information set {}", set.key);
        }
    }
}
