//! Game trees, CFR variants and best-response computation.
//!
//! Placeholder created in M0; CFR on Kuhn and Leduc arrives in M1 (see `docs/ROADMAP.md`).

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
