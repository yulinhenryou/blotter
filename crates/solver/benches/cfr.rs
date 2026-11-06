//! Baseline speed of the M1 solver (`docs/plans/M1.md`, Task 7): one CFR iteration on Kuhn and
//! on Leduc for each variant, and one exact exploitability computation on Leduc.
//!
//! Results are recorded only from local runs, with the machine and commit, in
//! `docs/results/README.md`. CI compiles these benches but never runs them: shared runners are
//! too noisy to measure on.
//!
//! ```text
//! cargo bench -p solver --bench cfr
//! ```

// The workspace warns on `expect` (CLAUDE.md §7: none in library code). A bench is a program:
// if building a tree fails, aborting with a message is the right behavior.
#![allow(clippy::expect_used, reason = "benches are programs, not library code")]

use std::hint::black_box;

use criterion::{BenchmarkId, Criterion, Throughput, criterion_group, criterion_main};
use solver::best_response::exploitability;
use solver::cfr::{Cfr, Variant};
use solver::games::kuhn::Kuhn;
use solver::games::leduc::Leduc;
use solver::tree::GameTree;

/// The variants, with the names used in benchmark ids and in the Leduc convergence CSV.
const VARIANTS: [(&str, Variant); 3] = [
    ("cfr", Variant::Vanilla),
    ("cfr_plus", Variant::CfrPlus),
    ("dcfr_1.5_0_2", Variant::DCFR),
];

/// Time of one `Cfr::iterate` call. A solver is created once per variant and keeps iterating:
/// the work per iteration does not depend on the iteration number (only DCFR's discount
/// factors do, which are a few `powf` calls per iteration).
fn bench_iteration(c: &mut Criterion) {
    let trees = [
        ("kuhn", GameTree::build(&Kuhn).expect("Kuhn tree")),
        ("leduc", GameTree::build(&Leduc).expect("Leduc tree")),
    ];
    let mut group = c.benchmark_group("cfr_iteration");
    // One element per measured call, so criterion also reports iterations per second.
    group.throughput(Throughput::Elements(1));
    // `&trees` iterates over references: each `tree` is a `&GameTree` borrowed from the array,
    // which outlives every `Cfr` built from it in the loop.
    for (game, tree) in &trees {
        for (name, variant) in VARIANTS {
            let mut cfr = Cfr::with_variant(tree, variant).expect("valid variant");
            group.bench_function(BenchmarkId::new(*game, name), |b| b.iter(|| cfr.iterate()));
        }
    }
    group.finish();
}

/// Time of one exact exploitability computation (both best responses and the profile's value)
/// on Leduc, as the convergence example does at every checkpoint.
fn bench_exploitability(c: &mut Criterion) {
    let tree = GameTree::build(&Leduc).expect("Leduc tree");
    let mut cfr = Cfr::with_variant(&tree, Variant::CfrPlus).expect("valid variant");
    cfr.run(100);
    let profile = cfr.average_strategy();
    c.bench_function("exploitability/leduc", |b| {
        b.iter(|| exploitability(black_box(&tree), black_box(&profile)).expect("valid profile"))
    });
}

criterion_group!(benches, bench_iteration, bench_exploitability);
criterion_main!(benches);
