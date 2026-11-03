//! Placeholder benchmark so that the criterion harness exists from M0 on.

use std::hint::black_box;

use criterion::{Criterion, criterion_group, criterion_main};

fn bench_engine_version(c: &mut Criterion) {
    c.bench_function("engine_version", |b| {
        b.iter(|| black_box(solver::engine_version()))
    });
}

criterion_group!(benches, bench_engine_version);
criterion_main!(benches);
