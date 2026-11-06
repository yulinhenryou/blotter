//! Leduc hold'em (`docs/MATH.md` §1.3; Southey et al. 2005).
//!
//! Six cards, J, Q and K in two suits. Each player antes 1 and receives one private card; a round
//! of betting follows, then one public board card and a second round. Bets and raises are 2 chips
//! in round one and 4 in round two, with at most one bet and one raise per round. P1 acts first
//! in both rounds. At showdown a card that pairs the board wins; otherwise the higher rank wins,
//! and equal ranks split the pot. Payoffs are net chips for P1.
//!
//! Betting is written in the paper's notation: `c` = check or call, `r` = bet or raise,
//! `f` = fold. Information-set keys are `own card/round one` before the board card and
//! `own card/round one/board card/round two` after it, for example `Qh/rc/Ks/c`.

use std::cmp::Ordering;
use std::fmt;

use crate::game::{Action, Game, NodeKind, Player};

/// Chips each player puts in the pot before the deal.
pub const ANTE_CHIPS: i64 = 1;

/// Size of a bet or raise in round one and in round two.
pub const BET_CHIPS: [i64; 2] = [2, 4];

/// Bets plus raises allowed per round: the paper's "two-bet maximum", a bet and one raise.
pub const MAX_BETS_PER_ROUND: usize = 2;

/// A card rank. Variants are declared in rank order, so the derived `Ord` gives J < Q < K.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Rank {
    /// Jack, the lowest rank.
    J,
    /// Queen.
    Q,
    /// King, the highest rank.
    K,
}

/// A suit. The paper does not name its two suits; suits never affect who wins.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Suit {
    /// Written `s`.
    Spades,
    /// Written `h`.
    Hearts,
}

/// One of the six cards.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Card {
    /// The rank.
    pub rank: Rank,
    /// The suit.
    pub suit: Suit,
}

impl Card {
    /// The whole deck.
    pub const DECK: [Card; 6] = [
        Card::new(Rank::J, Suit::Spades),
        Card::new(Rank::J, Suit::Hearts),
        Card::new(Rank::Q, Suit::Spades),
        Card::new(Rank::Q, Suit::Hearts),
        Card::new(Rank::K, Suit::Spades),
        Card::new(Rank::K, Suit::Hearts),
    ];

    /// The card of rank `rank` and suit `suit`.
    ///
    /// A `const fn` can run at compile time, which is what lets [`Card::DECK`] be a constant.
    pub const fn new(rank: Rank, suit: Suit) -> Card {
        Card { rank, suit }
    }
}

/// Writes a card as rank then suit, for example `Qh`.
impl fmt::Display for Card {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let rank = match self.rank {
            Rank::J => 'J',
            Rank::Q => 'Q',
            Rank::K => 'K',
        };
        let suit = match self.suit {
            Suit::Spades => 's',
            Suit::Hearts => 'h',
        };
        write!(f, "{rank}{suit}")
    }
}

/// A hand after the private cards are dealt.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Hand {
    /// Each player's private card, indexed by [`Player::index`].
    pub cards: [Card; 2],
    /// The board card, dealt when round one closes.
    pub board: Option<Card>,
    /// The actions of round one and of round two, in order.
    pub rounds: [Vec<Action>; 2],
}

/// A Leduc state.
///
/// Not `Copy`: a [`Hand`] owns two `Vec`s, and copying a `Vec` means allocating, which Rust only
/// does through an explicit `.clone()`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LeducState {
    /// Private cards not yet dealt.
    Deal,
    /// Private cards dealt.
    Play(Hand),
}

/// Leduc hold'em. A unit struct: the rules are fixed, so the game holds no data.
#[derive(Clone, Copy, Debug, Default)]
pub struct Leduc;

impl Game for Leduc {
    type State = LeducState;

    fn root(&self) -> LeducState {
        LeducState::Deal
    }

    fn node(&self, state: &LeducState) -> NodeKind<LeducState> {
        // `hand` is a `&Hand` borrowed from `state`; nothing is copied here.
        let hand = match state {
            LeducState::Deal => return deal(),
            LeducState::Play(hand) => hand,
        };
        // Round 0 until the board card is dealt, round 1 after; `usize::from(bool)` is 0 or 1.
        let round = usize::from(hand.board.is_some());
        match round_state(&hand.rounds[round]) {
            RoundState::Folded(folder) => {
                // The folding player loses what they put in; the other player wins it.
                let put_in = contributions(&hand.rounds);
                let payoff_p1_chips = match folder {
                    Player::P1 => -put_in[0],
                    Player::P2 => put_in[1],
                };
                NodeKind::Terminal { payoff_p1_chips }
            }
            RoundState::Closed if round == 0 => deal_board(hand),
            RoundState::Closed => showdown(hand),
            RoundState::ToAct {
                player,
                facing_bet,
                bets,
            } => NodeKind::Decision {
                player,
                infoset_key: infoset_key(hand, player),
                actions: legal_actions(facing_bet, bets)
                    .into_iter()
                    .map(|action| {
                        // Each child is a new hand: clone (allocating the betting vectors) and
                        // append the action to the current round.
                        let mut next = hand.clone();
                        next.rounds[round].push(action);
                        (action, LeducState::Play(next))
                    })
                    .collect(),
            },
        }
    }
}

/// Where the betting of one round stands.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RoundState {
    /// The given player folded; the hand is over.
    Folded(Player),
    /// Both players checked, or a call matched a bet: the round is over.
    Closed,
    /// `player` acts next.
    ToAct {
        /// The player to act.
        player: Player,
        /// Whether the last action was a bet or a raise.
        facing_bet: bool,
        /// Bets plus raises so far in this round.
        bets: usize,
    },
}

/// The player who takes the `k`-th action (from 0) of a round: P1 acts first in every round, then
/// the players alternate (Southey et al. 2005, Figure 1).
fn player_at(k: usize) -> Player {
    if k.is_multiple_of(2) {
        Player::P1
    } else {
        Player::P2
    }
}

/// Classify the actions of one round. The paper: "a player calls (as long as the call is not the
/// first action of the round)" ends the round; here a first-action call is a [`Action::Check`].
fn round_state(actions: &[Action]) -> RoundState {
    match actions.last() {
        Some(Action::Fold) => RoundState::Folded(player_at(actions.len() - 1)),
        Some(Action::Call) => RoundState::Closed,
        Some(Action::Check) if actions.len() == 2 => RoundState::Closed,
        last => RoundState::ToAct {
            player: player_at(actions.len()),
            facing_bet: matches!(last, Some(Action::Bet | Action::Raise)),
            bets: actions
                .iter()
                .filter(|a| matches!(a, Action::Bet | Action::Raise))
                .count(),
        },
    }
}

/// The legal actions, in a fixed order. Folding without a bet to face is left out, as in the
/// paper: it is dominated by checking.
fn legal_actions(facing_bet: bool, bets: usize) -> Vec<Action> {
    if !facing_bet {
        vec![Action::Check, Action::Bet]
    } else if bets < MAX_BETS_PER_ROUND {
        vec![Action::Fold, Action::Call, Action::Raise]
    } else {
        vec![Action::Fold, Action::Call]
    }
}

/// Chips each player has put in the pot, ante included, indexed by [`Player::index`].
///
/// A call matches the opponent's total; a bet or raise matches it and adds the round's bet size
/// (the paper: a raise means to "match the other player's total and then put in an additional
/// fixed amount").
fn contributions(rounds: &[Vec<Action>; 2]) -> [i64; 2] {
    let mut put_in = [ANTE_CHIPS; 2];
    for (round, actions) in rounds.iter().enumerate() {
        for (k, action) in actions.iter().enumerate() {
            let me = player_at(k).index();
            let other = player_at(k).opponent().index();
            match action {
                Action::Call => put_in[me] = put_in[other],
                Action::Bet | Action::Raise => put_in[me] = put_in[other] + BET_CHIPS[round],
                Action::Check | Action::Fold => {}
            }
        }
    }
    put_in
}

/// Showdown strength of `card` with board card `board`: a pair beats every unpaired card, then the
/// higher rank wins.
///
/// Tuples compare lexicographically and `false < true`, so `(paired, rank)` encodes exactly that
/// order. Equal tuples (both players hold the same rank, unpaired) split the pot.
fn strength(card: Card, board: Card) -> (bool, Rank) {
    (card.rank == board.rank, card.rank)
}

/// Payoff of a showdown. Both players have put in the same amount (the last action was a call or
/// a check), so the winner wins the loser's contribution.
fn showdown(hand: &Hand) -> NodeKind<LeducState> {
    let put_in = contributions(&hand.rounds);
    debug_assert_eq!(put_in[0], put_in[1]);
    // A showdown is only reached in round two, so the board card is there.
    let Some(board) = hand.board else {
        unreachable!("showdown before the board card is dealt")
    };
    let payoff_p1_chips = match strength(hand.cards[0], board).cmp(&strength(hand.cards[1], board))
    {
        Ordering::Greater => put_in[1],
        Ordering::Less => -put_in[0],
        Ordering::Equal => 0,
    };
    NodeKind::Terminal { payoff_p1_chips }
}

/// What `player` has observed: their own card, all betting, and the board card once dealt. It never
/// contains the opponent's card.
fn infoset_key(hand: &Hand, player: Player) -> String {
    let own = hand.cards[player.index()];
    let [round_one, round_two] = &hand.rounds;
    match hand.board {
        None => format!("{own}/{}", code(round_one)),
        Some(board) => format!("{own}/{}/{board}/{}", code(round_one), code(round_two)),
    }
}

/// A round's actions in `c` / `r` / `f` notation.
fn code(actions: &[Action]) -> String {
    // `collect` builds whatever collection the return type asks for; here a `String` from `char`s.
    actions
        .iter()
        .map(|action| match action {
            Action::Fold => 'f',
            Action::Check | Action::Call => 'c',
            Action::Bet | Action::Raise => 'r',
        })
        .collect()
}

/// The private deal: each ordered pair of distinct cards with weight 1, i.e. probability 1/30.
fn deal() -> NodeKind<LeducState> {
    let mut outcomes = Vec::with_capacity(30);
    for p1 in Card::DECK {
        for p2 in Card::DECK {
            if p1 != p2 {
                let hand = Hand {
                    cards: [p1, p2],
                    board: None,
                    rounds: [Vec::new(), Vec::new()],
                };
                outcomes.push((1, LeducState::Play(hand)));
            }
        }
    }
    NodeKind::Chance { outcomes }
}

/// The board card: each of the four cards not held by a player, with weight 1.
fn deal_board(hand: &Hand) -> NodeKind<LeducState> {
    let outcomes = Card::DECK
        .into_iter()
        .filter(|card| !hand.cards.contains(card))
        .map(|board| {
            let mut next = hand.clone();
            next.board = Some(board);
            (1, LeducState::Play(next))
        })
        .collect();
    NodeKind::Chance { outcomes }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::tree::{GameTree, Node};

    /// Shorthand for the card of rank `rank` and suit `suit` (`'s'` or `'h'`).
    fn card(rank: Rank, suit: char) -> Card {
        let suit = if suit == 's' {
            Suit::Spades
        } else {
            Suit::Hearts
        };
        Card::new(rank, suit)
    }

    /// Play a hand: private `cards`, then round one written as `c` / `r` / `f`, then (if the
    /// round closes) the board card `board` and round two. Returns P1's payoff.
    fn play(cards: [Card; 2], round_one: &str, board: Option<Card>, round_two: &str) -> i64 {
        let mut state = LeducState::Play(Hand {
            cards,
            board: None,
            rounds: [Vec::new(), Vec::new()],
        });
        // `chain` joins the two strings' characters into one sequence of moves.
        let mut moves = round_one.chars().chain(round_two.chars());
        loop {
            state = match Leduc.node(&state) {
                NodeKind::Terminal { payoff_p1_chips } => {
                    assert_eq!(moves.next(), None, "moves left after the hand ended");
                    return payoff_p1_chips;
                }
                NodeKind::Chance { outcomes } => {
                    let wanted = board.expect("the hand reached the board card");
                    outcomes
                        .into_iter()
                        .map(|(_, next)| next)
                        .find(|next| matches!(next, LeducState::Play(h) if h.board == Some(wanted)))
                        .unwrap_or_else(|| panic!("{wanted} cannot be dealt"))
                }
                NodeKind::Decision { actions, .. } => {
                    let wanted = moves.next().expect("the hand needs another move");
                    actions
                        .into_iter()
                        .find(|(action, _)| code(&[*action]) == wanted.to_string())
                        .unwrap_or_else(|| panic!("{wanted} is not legal here"))
                        .1
                }
            };
        }
    }

    #[test]
    fn payoffs_follow_the_rules() {
        use Rank::*;
        let (js, jh, qs, qh, ks, kh) = (
            card(J, 's'),
            card(J, 'h'),
            card(Q, 's'),
            card(Q, 'h'),
            card(K, 's'),
            card(K, 'h'),
        );
        // Folds in round one: the folder loses ante plus bets (MATH.md §1.3).
        assert_eq!(play([js, kh], "rf", None, ""), 1);
        assert_eq!(play([js, kh], "crf", None, ""), -1);
        assert_eq!(play([js, kh], "rrf", None, ""), -3);
        assert_eq!(play([js, kh], "crrf", None, ""), 3);
        // Showdowns: the higher rank wins without a pair...
        assert_eq!(play([ks, qh], "cc", Some(js), "cc"), 1);
        assert_eq!(play([qs, kh], "rc", Some(jh), "rc"), -7);
        // ... a pair with the board beats a higher card ...
        assert_eq!(play([js, kh], "rc", Some(jh), "crc"), 7);
        assert_eq!(play([kh, qs], "cc", Some(qh), "rc"), -5);
        // ... and equal ranks split the pot.
        assert_eq!(play([qs, qh], "rrc", Some(ks), "rrc"), 0);
        // Folds in round two.
        assert_eq!(play([js, kh], "rc", Some(qs), "rf"), 3);
        assert_eq!(play([js, kh], "rc", Some(qs), "rrf"), -7);
        // The largest pot: both rounds bet and raised, 1 + 2·2 + 2·4 = 13 each.
        assert_eq!(play([ks, jh], "rrc", Some(qs), "crrc"), 13);
    }

    #[test]
    fn betting_is_capped_at_a_bet_and_a_raise() {
        let after = |round: &[Action]| -> Vec<Action> {
            match round_state(round) {
                RoundState::ToAct {
                    facing_bet, bets, ..
                } => legal_actions(facing_bet, bets),
                other => panic!("round over: {other:?}"),
            }
        };
        use Action::*;
        assert_eq!(after(&[]), [Check, Bet]);
        assert_eq!(after(&[Check]), [Check, Bet]);
        assert_eq!(after(&[Bet]), [Fold, Call, Raise]);
        assert_eq!(after(&[Check, Bet]), [Fold, Call, Raise]);
        assert_eq!(after(&[Bet, Raise]), [Fold, Call]);
        assert_eq!(after(&[Check, Bet, Raise]), [Fold, Call]);
        assert_eq!(round_state(&[Check, Check]), RoundState::Closed);
        assert_eq!(round_state(&[Bet, Call]), RoundState::Closed);
        assert_eq!(
            round_state(&[Check, Bet, Fold]),
            RoundState::Folded(Player::P1)
        );
    }

    #[test]
    fn tree_has_the_derived_size() {
        let tree = GameTree::build(&Leduc).unwrap();
        // MATH.md §1.3: per round, 6 decision points and 9 ends (4 folds, 5 that continue).
        let count = |pred: fn(&Node) -> bool| tree.nodes().iter().filter(|n| pred(n)).count();
        // 30 deals × (4 folds + 5 continuations × 4 boards × 9 ends).
        assert_eq!(count(|n| matches!(n, Node::Terminal { .. })), 5_520);
        // 30 deals × (6 + 5 × 4 × 6).
        assert_eq!(count(|n| matches!(n, Node::Decision { .. })), 3_780);
        // The deal, plus one board deal per deal and continuing round one: 1 + 30 × 5.
        assert_eq!(count(|n| matches!(n, Node::Chance { .. })), 151);
        match tree.node(tree.root()) {
            Node::Chance {
                outcomes,
                total_weight,
            } => {
                assert_eq!(outcomes.len(), 30);
                assert_eq!(*total_weight, 30);
            }
            other => panic!("root should be the deal, got {other:?}"),
        }
    }

    #[test]
    fn information_sets_have_the_derived_count_and_shape() {
        let tree = GameTree::build(&Leduc).unwrap();
        // MATH.md §1.3: per player, 6 cards × 3 decision points in round one, plus
        // 6 cards × 5 boards × 5 continuing round-one sequences × 3 decision points in round two.
        assert_eq!(tree.infosets().len(), 2 * (18 + 450));
        for player in Player::BOTH {
            let own = tree
                .infosets()
                .iter()
                .filter(|s| s.player == player)
                .count();
            assert_eq!(own, 468, "{player:?}");
        }
        for set in tree.infosets() {
            let parts: Vec<&str> = set.key.split('/').collect();
            let (round, betting) = match parts.as_slice() {
                [_, round_one] => (0, *round_one),
                [_, _, _, round_two] => (1, *round_two),
                _ => panic!("unexpected key {}", set.key),
            };
            // The opponent holds any card but the player's own (5), or, after the board card,
            // any card but the player's own and the board (4).
            let expected_nodes = if round == 0 { 5 } else { 4 };
            assert_eq!(set.nodes.len(), expected_nodes, "{}", set.key);
            // P1 acts at even positions of a round, P2 at odd ones.
            assert_eq!(set.player, player_at(betting.len()), "{}", set.key);
            let expected_actions = match betting {
                "" | "c" => 2,
                "r" | "cr" => 3,
                "rr" | "crr" => 2,
                _ => panic!("unexpected betting {betting:?} in {}", set.key),
            };
            assert_eq!(set.actions.len(), expected_actions, "{}", set.key);
        }
        // Merging suits (which never decide a showdown) leaves 2 × (3 × 3 + 3 × 3 × 5 × 3) = 288
        // rank-level information sets (MATH.md §1.3).
        let by_rank: HashSet<String> = tree
            .infosets()
            .iter()
            .map(|s| s.key.replace(['s', 'h'], ""))
            .collect();
        assert_eq!(by_rank.len(), 288);
    }
}
