//! Python bindings for the engine crates, built by maturin as the native module
//! `review._engine`.
//!
//! This crate only converts types between Rust and Python; all logic lives in `cards` and
//! `solver` (see `docs/ARCHITECTURE.md` §4).

use pyo3::prelude::*;

/// Return the engine version string, e.g. `"solver 0.0.0 (cards 0.0.0)"`.
#[pyfunction]
fn version() -> String {
    solver::engine_version()
}

/// The native module `review._engine`.
#[pymodule]
fn _engine(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(version, m)?)?;
    Ok(())
}
