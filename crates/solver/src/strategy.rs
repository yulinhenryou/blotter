//! Behavioral strategy profiles: one probability row per information set (`docs/MATH.md` §1.1).
//!
//! A [`Profile`] holds both players' strategies; row `I` belongs to whoever acts at information set
//! `I`, and entry `k` is the probability of the `k`-th action of that information set.

use std::fmt;

use crate::tree::{GameTree, Infoset, InfosetId};
use crate::value::Value;

/// A strategy profile for a particular [`GameTree`].
#[derive(Clone, Debug, PartialEq)]
pub struct Profile<V> {
    rows: Vec<Vec<V>>,
}

/// A profile that does not fit a tree or is not a probability distribution.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StrategyError {
    /// The profile has a different number of rows than the tree has information sets.
    WrongRowCount {
        /// Information sets in the tree.
        expected: usize,
        /// Rows in the profile.
        found: usize,
    },
    /// A row's length differs from the number of actions at its information set.
    WrongRowLength {
        /// The information set concerned.
        infoset_key: String,
        /// Actions at the information set.
        expected: usize,
        /// Entries in the row.
        found: usize,
    },
    /// A row has a negative entry.
    Negative {
        /// The information set concerned.
        infoset_key: String,
    },
    /// A row does not sum to 1 (exactly, or within [`crate::value::F64_ROW_TOLERANCE`]).
    NotNormalized {
        /// The information set concerned.
        infoset_key: String,
    },
}

impl fmt::Display for StrategyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StrategyError::WrongRowCount { expected, found } => write!(
                f,
                "profile has {found} rows but the tree has {expected} information sets"
            ),
            StrategyError::WrongRowLength {
                infoset_key,
                expected,
                found,
            } => write!(
                f,
                "row for {infoset_key:?} has {found} entries, expected {expected}"
            ),
            StrategyError::Negative { infoset_key } => {
                write!(f, "row for {infoset_key:?} has a negative probability")
            }
            StrategyError::NotNormalized { infoset_key } => {
                write!(f, "row for {infoset_key:?} does not sum to 1")
            }
        }
    }
}

impl std::error::Error for StrategyError {}

impl<V: Value> Profile<V> {
    /// A profile from explicit rows, indexed by [`InfosetId`].
    ///
    /// # Errors
    ///
    /// A [`StrategyError`] if the rows do not fit `tree` or are not probability distributions.
    pub fn new(tree: &GameTree, rows: Vec<Vec<V>>) -> Result<Profile<V>, StrategyError> {
        let profile = Profile { rows };
        profile.validate(tree)?;
        Ok(profile)
    }

    /// A profile from rows that are probability distributions by construction (normalized
    /// sums, regret matching). Checked only in debug builds, so callers inside the crate need no
    /// error path for a case that cannot happen.
    pub(crate) fn new_unchecked(tree: &GameTree, rows: Vec<Vec<V>>) -> Profile<V> {
        let profile = Profile { rows };
        debug_assert_eq!(profile.validate(tree), Ok(()));
        profile
    }

    /// A profile whose row for each information set is `row_for(infoset)`.
    ///
    /// `row_for` is `FnMut`: it is called once per information set, in order, and may update
    /// state it captured (a plain `Fn` could not).
    ///
    /// # Errors
    ///
    /// As [`Profile::new`].
    pub fn from_fn(
        tree: &GameTree,
        row_for: impl FnMut(&Infoset) -> Vec<V>,
    ) -> Result<Profile<V>, StrategyError> {
        let rows = tree.infosets().iter().map(row_for).collect();
        Profile::new(tree, rows)
    }

    /// Every action equally likely at every information set.
    pub fn uniform(tree: &GameTree) -> Profile<V> {
        let rows = tree
            .infosets()
            .iter()
            .map(|set| {
                let n = set.actions.len();
                // Every information set has at least one action (checked when the tree was
                // built), so `n >= 1`.
                vec![V::from_ratio(1, n as u64); n]
            })
            .collect();
        Profile { rows }
    }

    /// The row of information set `infoset`.
    pub fn row(&self, infoset: InfosetId) -> &[V] {
        &self.rows[infoset]
    }

    /// All rows, indexed by [`InfosetId`].
    pub fn rows(&self) -> &[Vec<V>] {
        &self.rows
    }

    /// Check that this profile fits `tree` and that every row is a probability distribution.
    ///
    /// # Errors
    ///
    /// The first [`StrategyError`] found.
    pub fn validate(&self, tree: &GameTree) -> Result<(), StrategyError> {
        let sets = tree.infosets();
        if self.rows.len() != sets.len() {
            return Err(StrategyError::WrongRowCount {
                expected: sets.len(),
                found: self.rows.len(),
            });
        }
        // `zip` walks both slices in step, borrowing each row and its information set.
        for (row, set) in self.rows.iter().zip(sets) {
            if row.len() != set.actions.len() {
                return Err(StrategyError::WrongRowLength {
                    infoset_key: set.key.clone(),
                    expected: set.actions.len(),
                    found: row.len(),
                });
            }
            if row.iter().any(|&p| p < V::zero()) {
                return Err(StrategyError::Negative {
                    infoset_key: set.key.clone(),
                });
            }
            let sum = row.iter().fold(V::zero(), |acc, &p| acc + p);
            if !V::is_one(sum) {
                return Err(StrategyError::NotNormalized {
                    infoset_key: set.key.clone(),
                });
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use num_rational::Ratio;

    use super::*;
    use crate::games::kuhn::Kuhn;

    type Q = Ratio<i64>;

    fn kuhn() -> GameTree {
        GameTree::build(&Kuhn).unwrap()
    }

    #[test]
    fn uniform_is_valid() {
        let tree = kuhn();
        let profile = Profile::<Q>::uniform(&tree);
        assert_eq!(profile.validate(&tree), Ok(()));
        assert!(profile.rows().iter().flatten().all(|&p| p == Q::new(1, 2)));
    }

    #[test]
    fn rejects_wrong_shapes() {
        let tree = kuhn();
        assert_eq!(
            Profile::<f64>::new(&tree, vec![]),
            Err(StrategyError::WrongRowCount {
                expected: 12,
                found: 0
            })
        );
        let err = Profile::<f64>::from_fn(&tree, |_| vec![1.0]).unwrap_err();
        assert!(matches!(
            err,
            StrategyError::WrongRowLength { found: 1, .. }
        ));
    }

    #[test]
    fn rejects_non_distributions() {
        let tree = kuhn();
        let err = Profile::<f64>::from_fn(&tree, |_| vec![1.5, -0.5]).unwrap_err();
        assert!(matches!(err, StrategyError::Negative { .. }));
        let err = Profile::<f64>::from_fn(&tree, |_| vec![0.5, 0.4]).unwrap_err();
        assert!(matches!(err, StrategyError::NotNormalized { .. }));
        // Exact rationals: 1/3 + 2/3 is exactly 1.
        let ok = Profile::<Q>::from_fn(&tree, |_| vec![Q::new(1, 3), Q::new(2, 3)]);
        assert!(ok.is_ok());
    }
}
