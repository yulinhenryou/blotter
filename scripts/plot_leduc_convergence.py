"""Plot Leduc exploitability against iterations from the CSV of the Rust example.

Usage (from the repository root):
    uv run --project python --group plots python scripts/plot_leduc_convergence.py \
        docs/results/m1-leduc-convergence.csv docs/results/m1-leduc-convergence.svg

The CSV comes from `cargo run --release -p solver --example leduc_convergence`. The SVG is
written without a date stamp and with fixed element ids, so the same CSV always gives the same
file.
"""

import csv
import sys
from pathlib import Path

import matplotlib

# The non-interactive SVG backend is chosen before pyplot is imported.
matplotlib.use("svg")
import matplotlib.pyplot as plt

# Display names, colors and markers per variant, in a fixed order. The colors are the first three
# categorical slots of the validated default palette of the `dataviz` guidance; markers and
# direct labels carry identity as well, so the chart does not rely on color alone.
SERIES = {
    "cfr": ("CFR", "#2a78d6", "o"),
    "cfr_plus": ("CFR+", "#eb6834", "s"),
    "dcfr_1.5_0_2": ("DCFR(1.5, 0, 2)", "#1baf7a", "^"),
}
SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK_SECONDARY = "#52514e"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"


def read_series(path: Path) -> dict[str, tuple[list[int], list[float]]]:
    """Read the CSV into iterations and exploitability per variant, in file order."""
    series: dict[str, tuple[list[int], list[float]]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            iterations, exploitability = series.setdefault(row["variant"], ([], []))
            iterations.append(int(row["iterations"]))
            exploitability.append(float(row["exploitability_chips"]))
    return series


def plot(series: dict[str, tuple[list[int], list[float]]], target: Path) -> None:
    """Draw exploitability against iterations on log-log axes and write an SVG."""
    plt.rcParams["svg.hashsalt"] = "leduc-convergence"
    fig, ax = plt.subplots(figsize=(7.5, 4.8), facecolor=SURFACE)
    ax.set_facecolor(SURFACE)
    for variant, (iterations, exploitability) in series.items():
        name, color, marker = SERIES[variant]
        ax.plot(
            iterations,
            exploitability,
            color=color,
            linewidth=2,
            marker=marker,
            markersize=5,
            label=name,
        )
        # Direct label at the last point.
        ax.annotate(
            name,
            (iterations[-1], exploitability[-1]),
            xytext=(6, 0),
            textcoords="offset points",
            va="center",
            color=INK_SECONDARY,
            fontsize=9,
        )
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Iterations", color=INK_SECONDARY)
    ax.set_ylabel("Exploitability of the average strategy (chips)", color=INK_SECONDARY)
    ax.set_title("Leduc hold'em: CFR, CFR+ and DCFR", color=INK, loc="left")
    ax.grid(True, which="major", color=GRID, linewidth=0.6)
    ax.tick_params(colors=INK_SECONDARY, which="both")
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color(AXIS)
    ax.legend(frameon=False, labelcolor=INK_SECONDARY, loc="lower left")
    # Room on the right for the direct labels.
    ax.set_xlim(right=max(max(iterations) for iterations, _ in series.values()) * 6)
    fig.tight_layout()
    fig.savefig(target, format="svg", metadata={"Date": None})


def main() -> None:
    """Read the CSV named on the command line and write the SVG."""
    if len(sys.argv) != 3:
        sys.exit("usage: plot_leduc_convergence.py INPUT.csv OUTPUT.svg")
    source, target = Path(sys.argv[1]), Path(sys.argv[2])
    plot(read_series(source), target)
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
