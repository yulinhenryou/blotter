//! The number type that evaluation and best response compute with.
//!
//! Library code uses `f64`. Tests also run the same code with exact rationals
//! (`num_rational::Ratio<i64>`, a dev-dependency, ADR-0020), so values such as −1/18 can be
//! checked exactly. Code that is generic over [`Value`] is compiled once per type it is used with
//! (monomorphization), so the generic version is as fast as one written for `f64` directly.

use std::fmt::Debug;
use std::ops::{Add, Mul, Neg, Sub};

/// A number type for game values and probabilities.
///
/// The supertraits (`Copy + PartialOrd + Add<…> + …`) are the operations generic code may use.
/// `Copy` lets values be passed around like plain numbers, without `.clone()`.
pub trait Value:
    Copy
    + Debug
    + PartialOrd
    + Add<Output = Self>
    + Sub<Output = Self>
    + Mul<Output = Self>
    + Neg<Output = Self>
{
    /// The additive identity.
    fn zero() -> Self;

    /// The value `num / den`. `den` must be positive.
    fn from_ratio(num: i64, den: u64) -> Self;

    /// Whether `sum`, the sum of a probability row, counts as 1: exactly for exact types, within
    /// a small tolerance for floating point.
    fn is_one(sum: Self) -> bool;
}

/// Absolute tolerance for `f64` probability rows: rows that differ from 1 by more than this are
/// rejected. Far above accumulated rounding error for rows of a few entries, far below any
/// meaningful probability.
pub const F64_ROW_TOLERANCE: f64 = 1e-9;

impl Value for f64 {
    fn zero() -> f64 {
        0.0
    }

    /// The `as` conversions are exact for integers up to 2^53, far above any chip count or weight
    /// used by these games.
    fn from_ratio(num: i64, den: u64) -> f64 {
        num as f64 / den as f64
    }

    fn is_one(sum: f64) -> bool {
        (sum - 1.0).abs() <= F64_ROW_TOLERANCE
    }
}

#[cfg(test)]
mod rational {
    //! `Value` for exact rationals, available to every test in the crate.
    //!
    //! Rust's orphan rule allows this impl even though `Ratio` comes from another crate: the
    //! trait, `Value`, is defined here.

    use num_rational::Ratio;

    use super::Value;

    impl Value for Ratio<i64> {
        fn zero() -> Ratio<i64> {
            Ratio::from_integer(0)
        }

        fn from_ratio(num: i64, den: u64) -> Ratio<i64> {
            let den = i64::try_from(den).expect("denominator fits in i64");
            Ratio::new(num, den)
        }

        fn is_one(sum: Ratio<i64>) -> bool {
            sum == Ratio::from_integer(1)
        }
    }
}

#[cfg(test)]
mod tests {
    use num_rational::Ratio;

    use super::*;

    #[test]
    fn f64_ratio_and_tolerance() {
        assert_eq!(f64::from_ratio(1, 4), 0.25);
        assert!(f64::is_one(0.1 + 0.2 + 0.7));
        assert!(!f64::is_one(0.99));
    }

    #[test]
    fn rational_is_exact() {
        let third = Ratio::<i64>::from_ratio(1, 3);
        assert!(Ratio::is_one(third + third + third));
        assert_eq!(Ratio::<i64>::from_ratio(-2, 6), -third);
    }
}
