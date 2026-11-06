//! Exploitability of the average strategy against iterations, on Leduc hold'em, for CFR, CFR+
//! and DCFR (`docs/MATH.md` §1.3, §2.2–2.4). Writes CSV.
//!
//! Usage (from the repository root; release mode, since debug builds are far slower):
//!
//! ```text
//! cargo run --release -p solver --example leduc_convergence -- OUTPUT.csv [MAX_ITERATIONS]
//! ```
//!
//! Exploitability is measured at 1, 2, 5, 10, 20, 50, … iterations up to `MAX_ITERATIONS`
//! (default 10000). Columns: `variant`, `iterations`, `exploitability_chips`, `value_p1_chips`
//! (P1's expected payoff under the average strategy).

use std::error::Error;
use std::fs::File;
use std::io::{BufWriter, Write};

use solver::best_response::exploitability;
use solver::cfr::{Cfr, Variant};
use solver::games::leduc::Leduc;
use solver::tree::GameTree;

/// `main` may return a `Result`: if it is an `Err`, the program prints the error and exits with a
/// failure status. `Box<dyn Error>` holds any error type, so `?` works on I/O errors, parse errors
/// and the solver's own errors alike.
fn main() -> Result<(), Box<dyn Error>> {
    // `skip(1)` drops the program name.
    let mut args = std::env::args().skip(1);
    let output = args
        .next()
        .ok_or("usage: leduc_convergence OUTPUT.csv [MAX_ITERATIONS]")?;
    let max_iterations: u64 = match args.next() {
        Some(text) => text.parse()?,
        None => 10_000,
    };

    let tree = GameTree::build(&Leduc)?;
    // `BufWriter` collects small writes in memory and passes them to the file in large blocks;
    // without it, every `writeln!` would be a separate system call.
    let mut csv = BufWriter::new(File::create(&output)?);
    writeln!(
        csv,
        "variant,iterations,exploitability_chips,value_p1_chips"
    )?;

    for (name, variant) in [
        ("cfr", Variant::Vanilla),
        ("cfr_plus", Variant::CfrPlus),
        ("dcfr_1.5_0_2", Variant::DCFR),
    ] {
        let mut cfr = Cfr::with_variant(&tree, variant)?;
        for checkpoint in checkpoints(max_iterations) {
            cfr.run(checkpoint - cfr.iterations());
            let result = exploitability(&tree, &cfr.average_strategy())?;
            // `{:e}` writes full precision in scientific notation, e.g. `1.234e-5`.
            writeln!(
                csv,
                "{name},{checkpoint},{:e},{:e}",
                result.exploitability, result.value_p1
            )?;
            eprintln!("{name:>13} {checkpoint:>9} {:.6e}", result.exploitability);
        }
    }
    // Dropping a `BufWriter` flushes it but ignores errors; `flush` reports them.
    csv.flush()?;
    eprintln!("wrote {output}");
    Ok(())
}

/// 1, 2, 5, 10, 20, 50, … up to `max`, and `max` itself if it is not on that grid.
fn checkpoints(max: u64) -> Vec<u64> {
    let mut points = Vec::new();
    let mut decade = 1;
    'grid: loop {
        for step in [1, 2, 5] {
            let point = step * decade;
            if point > max {
                break 'grid;
            }
            points.push(point);
        }
        decade *= 10;
    }
    if points.last() != Some(&max) {
        points.push(max);
    }
    points
}
