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
