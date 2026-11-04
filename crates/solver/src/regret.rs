//! Regret matching (`docs/MATH.md` §2.1).
//!
//! Given cumulative regrets $R(a)$ for the actions of one decision, regret matching plays each
//! action with probability proportional to its positive part $R(a)^+ = \max(R(a), 0)$, and
//! uniformly when no regret is positive. Whatever the sequence of action values, the regret it
//! accumulates grows at most like $\Delta\sqrt{|A|\,T}$ (§2.1), which is what CFR builds on.

/// Write the regret-matching distribution for cumulative regrets `regrets` into `strategy`.
///
/// `strategy[k]` becomes $R(k)^+ / \sum_j R(j)^+$, or $1/n$ for every `k` if no regret is
/// positive.
///
/// The output is a `&mut [f64]` the caller owns, not a new `Vec`: CFR calls this once per
/// information set per iteration and reuses the same rows, so nothing is allocated in the loop.
/// Both slices must have the same length; regrets must be finite (CFR's regrets are sums of
/// finite counterfactual values, and the property tests check this).
pub fn regret_matching(regrets: &[f64], strategy: &mut [f64]) {
    debug_assert_eq!(regrets.len(), strategy.len());
    debug_assert!(regrets.iter().all(|r| r.is_finite()));
    let positive_sum: f64 = regrets.iter().map(|&r| r.max(0.0)).sum();
    if positive_sum > 0.0 {
        // `iter_mut` hands out one `&mut f64` per entry; `*p = …` writes through it.
        for (p, &r) in strategy.iter_mut().zip(regrets) {
            *p = r.max(0.0) / positive_sum;
        }
    } else {
        // No positive regret (including the first iteration, when all regrets are 0). The
        // `as` conversion is exact for any realistic number of actions.
        strategy.fill(1.0 / strategy.len() as f64);
    }
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    use proptest::test_runner::RngSeed;

    use super::*;

    fn matched(regrets: &[f64]) -> Vec<f64> {
        let mut strategy = vec![f64::NAN; regrets.len()];
        regret_matching(regrets, &mut strategy);
        strategy
    }

    #[test]
    fn proportional_to_positive_regret() {
        // The example of MATH.md §2.1.
        assert_eq!(matched(&[3.0, -1.0, 1.0]), vec![0.75, 0.0, 0.25]);
    }

    #[test]
    fn uniform_without_positive_regret() {
        assert_eq!(matched(&[0.0, 0.0]), vec![0.5, 0.5]);
        assert_eq!(matched(&[-2.0, 0.0, -1.0, -5.0]), vec![0.25; 4]);
    }

    proptest! {
        // A fixed seed makes every run (local and CI) check the same cases (CLAUDE.md §8).
        #![proptest_config(ProptestConfig {
            rng_seed: RngSeed::Fixed(0x5eed_0001),
            ..ProptestConfig::default()
        })]

        /// AC5 for regret matching itself: a probability distribution for any finite regrets,
        /// with zero weight exactly on the actions without positive regret (unless none has any).
        #[test]
        fn always_a_distribution(regrets in prop::collection::vec(-1e6..1e6f64, 1..8)) {
            let strategy = matched(&regrets);
            prop_assert!(strategy.iter().all(|&p| p >= 0.0));
            let sum: f64 = strategy.iter().sum();
            prop_assert!((sum - 1.0).abs() <= 1e-12, "sum = {sum}");
            if regrets.iter().any(|&r| r > 0.0) {
                for (&p, &r) in strategy.iter().zip(&regrets) {
                    prop_assert_eq!(p > 0.0, r > 0.0);
                }
            }
        }
    }
}
