//! Game trees, CFR variants and best-response computation.
//!
//! M1 (see `docs/plans/M1.md`): a generic game description ([`game`]), its flattened tree
//! ([`tree`]), small validation games ([`games`]), strategy profiles ([`strategy`]) and exact best
//! response and exploitability ([`best_response`]), generic over the number type ([`value`]);
//! regret matching ([`regret`]) and vanilla CFR ([`cfr`]).

pub mod best_response;
pub mod cfr;
pub mod game;
pub mod games;
pub mod regret;
pub mod strategy;
pub mod tree;
pub mod value;

/// Version of this crate, read from `Cargo.toml` at compile time.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Version string of the whole engine, e.g. `"solver 0.0.0 (cards 0.0.0)"`.
///
/// This is the value that travels through the Python bindings and the HTTP API to the web app
/// in M0, proving that all layers are connected.
pub fn engine_version() -> String {
    format!("solver {VERSION} (cards {})", cards::VERSION)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_version_names_both_crates() {
        let v = engine_version();
        assert!(v.starts_with("solver "));
        assert!(v.contains("(cards "));
    }
}
