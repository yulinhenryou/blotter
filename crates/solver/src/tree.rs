//! A [`Game`] flattened into an arena: every node in one `Vec`, children referred to by index.
//!
//! Why an arena instead of nodes that own their children (`Box`) or share them (`Rc<RefCell<_>>`):
//! every algorithm walks the whole tree on every iteration, reads it many times and never changes
//! it. With an arena the tree is one value that is built once and afterwards only borrowed
//! immutably (`&GameTree`), while each algorithm keeps its own mutable state (regrets, strategy
//! sums) in separate `Vec`s addressed by the same indices. Two separate values mean the borrow
//! checker never sees a shared and a mutable borrow of the same thing.
//!
//! Information sets are interned: every distinct key returned by [`Game::node`] gets a dense
//! index `0..n`, so per-information-set data is a plain `Vec` as well.

use std::collections::HashMap;
use std::fmt;

use crate::game::{Action, Game, NodeKind, Player};

/// Index of a node in [`GameTree::nodes`].
pub type NodeId = usize;

/// Index of an information set in [`GameTree::infosets`].
pub type InfosetId = usize;

/// A node of the flattened tree.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Node {
    /// End of the game.
    Terminal {
        /// Net chips won by P1; P2 wins the negative.
        payoff_p1_chips: i64,
    },
    /// Chance node. The probability of an outcome is `weight / total_weight`.
    Chance {
        /// `(weight, child)` pairs; every weight is positive.
        outcomes: Vec<(u32, NodeId)>,
        /// Sum of the weights.
        total_weight: u64,
    },
    /// Decision node. The acting player and the legal actions are stored once on the information
    /// set; `children[k]` follows action `infosets[infoset].actions[k]`.
    Decision {
        /// The information set this node belongs to.
        infoset: InfosetId,
        /// One child per legal action, in the information set's action order.
        children: Vec<NodeId>,
    },
}

/// An information set: decision nodes that the acting player cannot tell apart.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Infoset {
    /// The player who acts here.
    pub player: Player,
    /// The key the game used for this information set (useful for display and tests).
    pub key: String,
    /// Legal actions, identical at every node of the set.
    pub actions: Vec<Action>,
    /// The decision nodes (histories) in this set, in the order they were built.
    pub nodes: Vec<NodeId>,
}

/// A game that cannot be turned into a valid tree.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TreeError {
    /// A chance node with no outcomes.
    EmptyChance,
    /// A chance outcome with weight 0.
    ZeroWeight,
    /// A decision node with no legal actions.
    NoActions {
        /// The information set concerned.
        infoset_key: String,
    },
    /// The same action listed twice at one decision node.
    DuplicateAction {
        /// The information set concerned.
        infoset_key: String,
        /// The repeated action.
        action: Action,
    },
    /// Two nodes share an information-set key but differ in acting player or legal actions.
    InconsistentInfoset {
        /// The information set concerned.
        infoset_key: String,
    },
}

impl fmt::Display for TreeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TreeError::EmptyChance => write!(f, "chance node without outcomes"),
            TreeError::ZeroWeight => write!(f, "chance outcome with weight 0"),
            TreeError::NoActions { infoset_key } => {
                write!(f, "no legal actions at information set {infoset_key:?}")
            }
            TreeError::DuplicateAction {
                infoset_key,
                action,
            } => write!(
                f,
                "action {action:?} listed twice at information set {infoset_key:?}"
            ),
            TreeError::InconsistentInfoset { infoset_key } => write!(
                f,
                "nodes of information set {infoset_key:?} differ in player or legal actions"
            ),
        }
    }
}

impl std::error::Error for TreeError {}

/// A game flattened into an arena.
///
/// Invariant: every child has a smaller [`NodeId`] than its parent (nodes are stored in
/// post-order), so the root is the last node and iterating ids in increasing order visits every
/// node after all of its descendants.
#[derive(Clone, Debug)]
pub struct GameTree {
    nodes: Vec<Node>,
    infosets: Vec<Infoset>,
    root: NodeId,
}

impl GameTree {
    /// Expand `game` from its root and store every node.
    ///
    /// # Errors
    ///
    /// A [`TreeError`] if a chance node is empty or has a zero weight, or a decision node has no
    /// actions, a repeated action, or an information-set key used inconsistently.
    pub fn build<G: Game>(game: &G) -> Result<GameTree, TreeError> {
        let mut builder = Builder {
            game,
            nodes: Vec::new(),
            infosets: Vec::new(),
            index: HashMap::new(),
        };
        let root = builder.add(game.root())?;
        Ok(GameTree {
            nodes: builder.nodes,
            infosets: builder.infosets,
            root,
        })
    }

    /// The root node.
    pub fn root(&self) -> NodeId {
        self.root
    }

    /// The node with index `id`. Ids come from this tree, so they are always in range.
    pub fn node(&self, id: NodeId) -> &Node {
        &self.nodes[id]
    }

    /// All nodes, indexed by [`NodeId`].
    pub fn nodes(&self) -> &[Node] {
        &self.nodes
    }

    /// The information set with index `id`.
    pub fn infoset(&self, id: InfosetId) -> &Infoset {
        &self.infosets[id]
    }

    /// All information sets, indexed by [`InfosetId`].
    pub fn infosets(&self) -> &[Infoset] {
        &self.infosets
    }

    /// The information set whose key is `key`, if any. A linear search: meant for tests and
    /// setup code, not for inner loops.
    pub fn find_infoset(&self, key: &str) -> Option<InfosetId> {
        self.infosets.iter().position(|set| set.key == key)
    }

    /// The children of decision node `id`, one per action of its information set; empty for
    /// terminal and chance nodes.
    pub fn decision_children(&self, id: NodeId) -> &[NodeId] {
        match &self.nodes[id] {
            Node::Decision { children, .. } => children,
            Node::Terminal { .. } | Node::Chance { .. } => &[],
        }
    }

    /// A copy of this tree with every terminal payoff replaced by `payoff(node id)`: same
    /// information structure, different game. Lets property tests run on many zero-sum games.
    #[cfg(test)]
    pub(crate) fn with_payoffs(&self, mut payoff: impl FnMut(NodeId) -> i64) -> GameTree {
        let mut tree = self.clone();
        for (id, node) in tree.nodes.iter_mut().enumerate() {
            if let Node::Terminal { payoff_p1_chips } = node {
                *payoff_p1_chips = payoff(id);
            }
        }
        tree
    }
}

/// State of a [`GameTree::build`] call.
///
/// `'g` is the lifetime of the borrow of the game: the builder holds `&'g G`, so it cannot outlive
/// the game it reads. The builder owns the vectors it fills and hands them over to the tree at the
/// end (a move, not a copy).
struct Builder<'g, G: Game> {
    game: &'g G,
    nodes: Vec<Node>,
    infosets: Vec<Infoset>,
    index: HashMap<String, InfosetId>,
}

impl<G: Game> Builder<'_, G> {
    /// Add the subtree below `state` and return the id of its root.
    ///
    /// Takes `state` by value: the builder consumes each state once it has been expanded.
    fn add(&mut self, state: G::State) -> Result<NodeId, TreeError> {
        let node = match self.game.node(&state) {
            NodeKind::Terminal { payoff_p1_chips } => Node::Terminal { payoff_p1_chips },
            NodeKind::Chance { outcomes } => {
                if outcomes.is_empty() {
                    return Err(TreeError::EmptyChance);
                }
                let mut children = Vec::with_capacity(outcomes.len());
                let mut total_weight = 0u64;
                // `into_iter` moves each `(weight, state)` pair out of the vector, so the child
                // state can be passed on by value without cloning.
                for (weight, next) in outcomes {
                    if weight == 0 {
                        return Err(TreeError::ZeroWeight);
                    }
                    total_weight += u64::from(weight);
                    children.push((weight, self.add(next)?));
                }
                Node::Chance {
                    outcomes: children,
                    total_weight,
                }
            }
            NodeKind::Decision {
                player,
                infoset_key,
                actions,
            } => {
                let labels: Vec<Action> = actions.iter().map(|(action, _)| *action).collect();
                let infoset = self.intern(player, infoset_key, labels)?;
                let mut children = Vec::with_capacity(actions.len());
                for (_, next) in actions {
                    children.push(self.add(next)?);
                }
                Node::Decision { infoset, children }
            }
        };
        // All children are stored by now, so this node's id is larger than theirs.
        let id = self.nodes.len();
        if let Node::Decision { infoset, .. } = &node {
            self.infosets[*infoset].nodes.push(id);
        }
        self.nodes.push(node);
        Ok(id)
    }

    /// Return the index of the information set `key`, creating it on first use.
    fn intern(
        &mut self,
        player: Player,
        key: String,
        actions: Vec<Action>,
    ) -> Result<InfosetId, TreeError> {
        if actions.is_empty() {
            return Err(TreeError::NoActions { infoset_key: key });
        }
        for (k, action) in actions.iter().enumerate() {
            if actions[..k].contains(action) {
                return Err(TreeError::DuplicateAction {
                    infoset_key: key,
                    action: *action,
                });
            }
        }
        if let Some(&id) = self.index.get(&key) {
            let existing = &self.infosets[id];
            if existing.player != player || existing.actions != actions {
                return Err(TreeError::InconsistentInfoset { infoset_key: key });
            }
            return Ok(id);
        }
        let id = self.infosets.len();
        // The map and the information set each need their own `String`, so one copy is cloned.
        self.index.insert(key.clone(), id);
        self.infosets.push(Infoset {
            player,
            key,
            actions,
            nodes: Vec::new(),
        });
        Ok(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A test game given by a plain function from a numeric state to its node.
    struct Scripted(fn(&u32) -> NodeKind<u32>);

    impl Game for Scripted {
        type State = u32;
        fn root(&self) -> u32 {
            0
        }
        fn node(&self, state: &u32) -> NodeKind<u32> {
            (self.0)(state)
        }
    }

    fn decision(key: &str, actions: Vec<(Action, u32)>) -> NodeKind<u32> {
        NodeKind::Decision {
            player: Player::P1,
            infoset_key: key.to_string(),
            actions,
        }
    }

    /// Chance (weights 1 and 2) to two P1 nodes in the same information set, each with two
    /// terminal children.
    fn small(state: &u32) -> NodeKind<u32> {
        match state {
            0 => NodeKind::Chance {
                outcomes: vec![(1, 1), (2, 2)],
            },
            1 | 2 => decision("x", vec![(Action::Check, 3), (Action::Bet, 4)]),
            3 => NodeKind::Terminal { payoff_p1_chips: 1 },
            _ => NodeKind::Terminal {
                payoff_p1_chips: -1,
            },
        }
    }

    #[test]
    fn builds_small_tree() {
        let tree = GameTree::build(&Scripted(small)).unwrap();
        // 1 chance + 2 decision + 4 terminal nodes.
        assert_eq!(tree.nodes().len(), 7);
        assert_eq!(tree.root(), 6);
        assert_eq!(tree.infosets().len(), 1);
        let set = tree.infoset(0);
        assert_eq!(set.key, "x");
        assert_eq!(set.actions, vec![Action::Check, Action::Bet]);
        assert_eq!(set.nodes.len(), 2);
        match tree.node(tree.root()) {
            Node::Chance { total_weight, .. } => assert_eq!(*total_weight, 3),
            other => panic!("root should be a chance node, got {other:?}"),
        }
    }

    #[test]
    fn children_precede_parents() {
        let tree = GameTree::build(&Scripted(small)).unwrap();
        for (id, node) in tree.nodes().iter().enumerate() {
            let children: Vec<NodeId> = match node {
                Node::Terminal { .. } => vec![],
                Node::Chance { outcomes, .. } => outcomes.iter().map(|&(_, c)| c).collect(),
                Node::Decision { children, .. } => children.clone(),
            };
            assert!(children.iter().all(|&c| c < id));
        }
    }

    #[test]
    fn rejects_empty_chance() {
        let game = Scripted(|_| NodeKind::Chance { outcomes: vec![] });
        assert_eq!(GameTree::build(&game).unwrap_err(), TreeError::EmptyChance);
    }

    #[test]
    fn rejects_zero_weight() {
        let game = Scripted(|s| match s {
            0 => NodeKind::Chance {
                outcomes: vec![(0, 1)],
            },
            _ => NodeKind::Terminal { payoff_p1_chips: 0 },
        });
        assert_eq!(GameTree::build(&game).unwrap_err(), TreeError::ZeroWeight);
    }

    #[test]
    fn rejects_no_actions() {
        let game = Scripted(|_| decision("x", vec![]));
        assert!(matches!(
            GameTree::build(&game),
            Err(TreeError::NoActions { .. })
        ));
    }

    #[test]
    fn rejects_duplicate_action() {
        let game = Scripted(|s| match s {
            0 => decision("x", vec![(Action::Bet, 1), (Action::Bet, 2)]),
            _ => NodeKind::Terminal { payoff_p1_chips: 0 },
        });
        assert!(matches!(
            GameTree::build(&game),
            Err(TreeError::DuplicateAction {
                action: Action::Bet,
                ..
            })
        ));
    }

    #[test]
    fn rejects_inconsistent_infoset() {
        // Two nodes share the key "x" but offer different actions.
        let game = Scripted(|s| match s {
            0 => NodeKind::Chance {
                outcomes: vec![(1, 1), (1, 2)],
            },
            1 => decision("x", vec![(Action::Check, 3), (Action::Bet, 3)]),
            2 => decision("x", vec![(Action::Check, 3)]),
            _ => NodeKind::Terminal { payoff_p1_chips: 0 },
        });
        assert!(matches!(
            GameTree::build(&game),
            Err(TreeError::InconsistentInfoset { .. })
        ));
    }
}
