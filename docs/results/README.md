# Results

Measured outputs committed to the repository. Every file here is produced by a committed
command; each entry records the command, the commit of the code that produced it, and the
machine. Numbers quoted in `docs/` come from these files.

## M1 — Leduc convergence

Files: `m1-leduc-convergence.csv`, `m1-leduc-convergence.svg`.

Exploitability (chips) and P1's expected value of the average strategy of CFR, CFR+ and
DCFR(1.5, 0, 2) on Leduc hold'em (`docs/MATH.md` §1.3), at 1, 2, 5, 10, … up to 100,000
iterations.

```bash
cargo run --release -p solver --example leduc_convergence -- docs/results/m1-leduc-convergence.csv 100000
uv run --project python --group plots python scripts/plot_leduc_convergence.py docs/results/m1-leduc-convergence.csv docs/results/m1-leduc-convergence.svg
```

- Code: commit `608c3c5` (the CSV was regenerated from a clean checkout of that commit and is
  byte-identical to the committed file).
- Machine: Apple M4, macOS 27.2; rustc 1.99.1 (release profile); CPython 3.15.2, matplotlib
  3.11.2.
- Run time: about 20 s for the CSV (single-threaded; one run, not a benchmark).
- Determinism: a second run and a debug build gave byte-identical CSVs; the plot script writes
  the same SVG for the same CSV.

## M1 — Solver benchmarks (baseline)

Criterion benches in `crates/solver/benches/cfr.rs`: one `Cfr::iterate` call on Kuhn and on
Leduc for each variant (one iteration of CFR+ and DCFR is two alternating passes, one of vanilla
CFR a single simultaneous pass; `docs/MATH.md` §2.3), and one exact exploitability computation
on Leduc (both best responses and the profile's value).

```bash
cargo bench -p solver --bench cfr
```

- Code: commit `a54f2bd`.
- Machine: Apple M4, macOS 27.2, on AC power, other desktop apps open (1-minute load average
  about 1.9 before the run); rustc 1.99.1, `bench` profile (release); criterion 0.8.2 with its
  default settings.
- Two consecutive runs. Values are criterion's point estimates (the middle of its interval);
  the second run's estimates are within 1.1% of the first for every bench.

| Bench | Run 1 | Run 2 | Iterations per second (run 1) |
|---|---|---|---|
| `cfr_iteration/kuhn/cfr` | 236.69 ns | 236.46 ns | 4.22 million |
| `cfr_iteration/kuhn/cfr_plus` | 384.59 ns | 386.00 ns | 2.60 million |
| `cfr_iteration/kuhn/dcfr_1.5_0_2` | 399.08 ns | 400.83 ns | 2.51 million |
| `cfr_iteration/leduc/cfr` | 46.386 µs | 46.139 µs | 21,600 |
| `cfr_iteration/leduc/cfr_plus` | 76.467 µs | 76.257 µs | 13,100 |
| `cfr_iteration/leduc/dcfr_1.5_0_2` | 77.262 µs | 76.231 µs | 12,900 |
| `exploitability/leduc` | 187.90 µs | 186.89 µs | — |

Consistency check: 10^5 iterations of the three variants at these speeds take about 20 s,
in line with the 19.6 s that the Leduc convergence run above took (a single timing with `time`,
not a benchmark).

This is a baseline only: no targets, and no comparison with other solvers (`docs/plans/M1.md`,
Task 7). It is the "before" measurement for any later optimization (`CLAUDE.md` §2.4).
