"""Uncalled bets, main and side pots, feasibility of results (``docs/MATH.md`` §1.5).

Everything is computed on live chips $v_i$; antes are dead and go into the main pot.
"""

from collections.abc import Mapping, Set
from dataclasses import dataclass


@dataclass(frozen=True)
class Pot:
    """A pot and the seats that can win it. Pot 1 is the main pot."""

    chips: int
    eligible: frozenset[int]


def return_uncalled(live: Mapping[int, int]) -> tuple[dict[int, int], int | None, int]:
    """Return the unmatched part of the largest live total to its seat (TDA 67-A).

    Parameters
    ----------
    live
        Live chips $v_i$ per seat, folded seats included.

    Returns
    -------
    tuple
        The live totals after the return $v'_i$, the seat that got chips back (or ``None``) and
        the amount $u = v_{(1)} - v_{(2)}$.
    """
    after = dict(live)
    ranked = sorted(after, key=after.__getitem__, reverse=True)
    if len(ranked) < 2:
        return after, None, 0
    top, second = ranked[0], ranked[1]
    excess = after[top] - after[second]
    if excess == 0:
        return after, None, 0
    after[top] -= excess
    return after, top, excess


def side_pots(antes: Mapping[int, int], live: Mapping[int, int], folded: Set[int]) -> list[Pot]:
    r"""Split antes and live totals (after the uncalled bet is returned) into pots.

    Pot $k$ collects, from every seat, its live chips between levels $L_{k-1}$ and $L_k$, where
    the levels are the distinct live totals of the non-folded seats; the antes go into pot 1.
    Its eligible seats are the non-folded seats with $v'_i \ge L_k$.
    """
    in_hand = {s: v for s, v in live.items() if s not in folded}
    levels = sorted(set(in_hand.values()))
    pots: list[Pot] = []
    previous = 0
    for k, level in enumerate(levels):
        chips = sum(min(v, level) - min(v, previous) for v in live.values())
        if k == 0:
            chips += sum(antes.values())
        eligible = frozenset(s for s, v in in_hand.items() if v >= level)
        pots.append(Pot(chips=chips, eligible=eligible))
        previous = level
    return pots


def first_infeasible_prefix(pots: list[Pot], won: Mapping[int, int]) -> int | None:
    r"""Find the first $j$ (1-based) with $\sum_{t_i \le j} w_i > \sum_{k \le j} P_k$.

    Returns ``None`` if there is none. $t_i$ is the last pot seat $i$ is eligible for.
    Eligibility is nested, so these $m$ inequalities are necessary and sufficient for the results
    to be payable from the pots (``MATH.md`` §1.5, results and conservation). Seats eligible for
    no pot must win nothing; the caller checks that separately.
    """
    last_pot = {s: k for k, pot in enumerate(pots, start=1) for s in pot.eligible}
    available = 0
    for j, pot in enumerate(pots, start=1):
        available += pot.chips
        needed = sum(w for s, w in won.items() if s in last_pot and last_pot[s] <= j)
        if needed > available:
            return j
    return None
