//! Cards, combos, ranges and hand evaluation.
//!
//! Placeholder created in M0; the real types arrive in M2 (see `docs/ROADMAP.md`).

/// Version of this crate, read from `Cargo.toml` at compile time.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_not_empty() {
        assert!(!VERSION.is_empty());
    }
}
