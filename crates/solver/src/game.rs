//! Description of a two-player zero-sum extensive-form game (`docs/MATH.md` §1.1).
//!
//! A game is described by a state type and one function, [`Game::node`], that says what kind of
//! node a state is and which states follow it. Algorithms never walk a [`Game`] directly: it is
//! flattened once into a [`crate::tree::GameTree`], and every algorithm reads that tree.

/// One of the two players. P1 acts first in Kuhn and Leduc.
///
/// `Copy` is derived because a `Player` is a one-byte value: passing it by value is as cheap as
/// passing a reference, and copying it never needs an explicit `.clone()`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Player {
    /// The first player.
    P1,
    /// The second player.
    P2,
}

impl Player {
    /// Both players, in order.
    pub const BOTH: [Player; 2] = [Player::P1, Player::P2];

    /// Position of this player in two-element arrays: 0 for P1, 1 for P2.
    pub fn index(self) -> usize {
        match self {
            Player::P1 => 0,
            Player::P2 => 1,
        }
    }

    /// The other player.
    pub fn opponent(self) -> Player {
        match self {
            Player::P1 => Player::P2,
            Player::P2 => Player::P1,
        }
    }
}

/// A betting action. Kuhn uses the first four; Leduc adds `Raise`. Bet sizes are fixed by each
/// game's rules, so an action does not carry an amount.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Action {
    /// Give up the pot.
    Fold,
    /// Pass without betting when no bet is pending.
    Check,
    /// Match the pending bet.
    Call,
    /// Bet when no bet is pending.
    Bet,
    /// Increase a pending bet.
    Raise,
}

/// What a state is, and the states that follow it.
///
/// `S` is the game's state type. Child states are returned by value (moved into the `Vec`), so the
/// caller owns them and can keep expanding them.
#[derive(Debug)]
pub enum NodeKind<S> {
    /// End of the game.
    Terminal {
        /// Net chips won by P1 (P2 wins the negative, since the game is zero-sum).
        payoff_p1_chips: i64,
    },
    /// Chance deals: each outcome has a positive integer weight; its probability is the weight
    /// divided by the sum of the weights. Integer weights keep probabilities exact (for example
    /// 1/6 for each Kuhn deal) without floating-point rounding.
    Chance {
        /// `(weight, next state)` pairs.
        outcomes: Vec<(u32, S)>,
    },
    /// A player chooses an action.
    Decision {
        /// The player to act.
        player: Player,
        /// Identifies the information set: two states with the same key must be
        /// indistinguishable to `player` (same key ⇒ same player and the same legal actions).
        /// It must therefore contain only what `player` can observe.
        infoset_key: String,
        /// `(action, next state)` pairs, in a fixed order.
        actions: Vec<(Action, S)>,
    },
}

/// A two-player zero-sum extensive-form game with perfect recall.
///
/// Perfect recall (each player remembers their own earlier actions and observations) is assumed by
/// CFR and by the best-response computation; implementations must build information-set keys that
/// include the player's own history.
pub trait Game {
    /// A position in the game. Each implementation chooses its own representation.
    type State;

    /// The initial state.
    fn root(&self) -> Self::State;

    /// Classify `state` and list its successors.
    ///
    /// Takes `state` by shared reference (`&`): the caller keeps ownership, and the method only
    /// reads it to build new child states.
    fn node(&self, state: &Self::State) -> NodeKind<Self::State>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opponent_is_an_involution() {
        for p in Player::BOTH {
            assert_ne!(p, p.opponent());
            assert_eq!(p, p.opponent().opponent());
        }
    }

    #[test]
    fn indices_match_order() {
        assert_eq!(Player::P1.index(), 0);
        assert_eq!(Player::P2.index(), 1);
    }
}
