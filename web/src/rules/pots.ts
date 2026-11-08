// Uncalled bets, main and side pots, and whether entered results can be paid
// (docs/MATH.md §1.5, "Uncalled bets and pots" and "Results and conservation").
//
// Everything is computed on live chips v_i; antes are dead and go into the main pot.

import type { BettingState } from './betting.ts'

/** A pot and the seats that can win it. Pot 1 (index 0) is the main pot. */
export interface Pot {
  readonly chips: number
  /** Seat numbers, ascending. */
  readonly eligible: readonly number[]
}

export interface Settlement {
  /** The unmatched part of the largest live total, returned to its seat (TDA 67-A). */
  readonly uncalled: { readonly seat: number; readonly chips: number } | null
  /** Live chips per seat after that return, v'_i. */
  readonly live: ReadonlyMap<number, number>
  readonly pots: readonly Pot[]
}

/** Return the uncalled bet and split what is left into pots. */
export function settle(state: BettingState): Settlement {
  const live = new Map(state.seats.map((s) => [s.seat, s.live]))

  // v(1) >= v(2): the two largest live totals over all seats, folded ones included.
  const ranked = [...live].sort((a, b) => b[1] - a[1])
  const [first, second] = ranked
  let uncalled: Settlement['uncalled'] = null
  if (first !== undefined && second !== undefined && first[1] > second[1]) {
    uncalled = { seat: first[0], chips: first[1] - second[1] }
    live.set(first[0], second[1])
  }

  const inHand = state.seats.filter((s) => !s.folded).map((s) => s.seat)
  const levels = [...new Set(inHand.map((s) => live.get(s) ?? 0))].sort((a, b) => a - b)
  const antes = state.seats.reduce((sum, s) => sum + s.ante, 0)
  const pots: Pot[] = []
  let previous = 0
  for (const level of levels) {
    // From every seat, the chips it put in between the previous level and this one.
    let chips = pots.length === 0 ? antes : 0
    for (const v of live.values()) chips += Math.min(v, level) - Math.min(v, previous)
    const eligible = inHand.filter((s) => (live.get(s) ?? 0) >= level).sort((a, b) => a - b)
    pots.push({ chips, eligible })
    previous = level
  }
  return { uncalled, live, pots }
}

/**
 * The first j (1-based) at which the seats eligible only for pots 1..j win more than those pots
 * hold, or `null` if the results can be paid. Eligibility is nested, so these prefix conditions are
 * necessary and sufficient (MATH.md §1.5, a Hall-type condition). With j equal to the number of
 * pots it says the total won exceeds the total in the pots. Seats eligible for no pot (folded) are
 * not counted here: they must win nothing, which the caller checks.
 */
export function firstInfeasiblePrefix(
  pots: readonly Pot[],
  won: ReadonlyMap<number, number>,
): number | null {
  // t_i: the last pot seat i is eligible for (1-based).
  const lastPot = new Map<number, number>()
  pots.forEach((pot, k) => {
    for (const seat of pot.eligible) lastPot.set(seat, k + 1)
  })
  let available = 0
  let needed = 0
  for (let j = 1; j <= pots.length; j++) {
    available += pots[j - 1]?.chips ?? 0
    for (const [seat, chips] of won) if (lastPot.get(seat) === j) needed += chips
    if (needed > available) return j
  }
  return null
}
