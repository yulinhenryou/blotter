// Bet and raise sizes on the action pad (docs/CAPTURE.md §1.5): the presets of each spot,
// converted to whole chips, and the check of a typed amount. Amounts are "to" amounts: the seat's
// total on this street after the action, as in the hand record.

import {
  behind,
  moveViolation,
  seatState,
  type BettingState,
  type LegalActions,
  type Move,
} from '../rules/index.ts'

export type SizeKind = 'bet' | 'raise'

export interface SizeOption {
  readonly label: string
  readonly to: number
  /** Why this size cannot be used, or `null`. */
  readonly problem: string | null
}

/** All chips in the middle: antes, earlier streets and this street's bets. */
export function potOf(state: BettingState): number {
  return state.seats.reduce((sum, s) => sum + s.ante + s.live, 0)
}

/** The highest "to" amount the seat to act can reach, or `null` if its stack is unknown. */
export function topOf(state: BettingState, legal: LegalActions): number | null {
  const seat = seatState(state, legal.seat)
  const left = seat === undefined ? null : behind(seat)
  return seat === undefined || left === null ? null : seat.street + left
}

/** Chips as big blinds, for display: "7.5 bb". */
export function inBB(chips: number, bigBlind: number): string {
  const bb = Math.round((chips / bigBlind) * 10) / 10
  return `${String(bb)} bb`
}

/**
 * The move for a typed or preset amount, or why it cannot be made. `allIn` is the "All-in" mode
 * of the pad, needed only when the stack is unknown (with a known stack, the amount says it).
 * An all-in for no more than the current bet is a call for less.
 */
export function sizeMove(
  state: BettingState,
  legal: LegalActions,
  kind: SizeKind,
  to: number,
  allIn: boolean,
): { readonly move: Move | null; readonly problem: string | null } {
  const range = kind === 'bet' ? legal.bet : legal.raise
  const top = topOf(state, legal)
  const seat = String(legal.seat)
  if (!Number.isInteger(to) || to <= 0) return { move: null, problem: 'Enter an amount' }
  if (top !== null && to > top) {
    return { move: null, problem: `Seat ${seat} can go to at most ${String(top)}` }
  }
  const all = top === null ? allIn : to === top
  let move: Move
  if (all && state.bet > 0 && to <= state.bet) {
    move = { kind: 'call', amount_to_chips: to, all_in: true }
  } else {
    if (range === null) return { move: null, problem: `Seat ${seat} cannot ${kind}` }
    if (!all && to < range.min) {
      const what = kind === 'bet' ? 'Minimum bet' : 'Minimum raise: to'
      return { move: null, problem: `${what} ${String(range.min)}` }
    }
    move = { kind, amount_to_chips: to, all_in: all }
  }
  const violation = moveViolation(state, legal.seat, move)
  return violation === null ? { move, problem: null } : { move: null, problem: violation.message }
}

const PREFLOP_OPEN_BB = [2, 2.5, 3, 4, 5]
const PREFLOP_RERAISE = [3, 4]
const POSTFLOP_BET: readonly (readonly [string, number])[] = [
  ['⅓', 1 / 3],
  ['½', 1 / 2],
  ['⅔', 2 / 3],
  ['¾', 3 / 4],
  ['Pot', 1],
]
const POSTFLOP_RAISE = [2.5, 3]

/**
 * The presets for a bet or raise: preflop first raise in big blinds, preflop re-raise as a
 * multiple of the current bet, postflop bet as a fraction of the pot, postflop raise as a
 * multiple of the bet. Each is rounded to the nearest chip; one that is not a legal size carries
 * the reason (the pad shows it disabled). "All-in" is added by the pad.
 *
 * @param voluntaryRaises  Bets and raises made so far on this street (blinds do not count).
 */
export function presets(
  state: BettingState,
  legal: LegalActions,
  kind: SizeKind,
  voluntaryRaises: number,
): SizeOption[] {
  const option = (label: string, exact: number): SizeOption => {
    const to = Math.round(exact)
    return { label, to, problem: sizeMove(state, legal, kind, to, false).problem }
  }
  if (state.street === 'preflop') {
    return voluntaryRaises === 0
      ? PREFLOP_OPEN_BB.map((x) => option(`${String(x)} bb`, x * state.bigBlind))
      : PREFLOP_RERAISE.map((x) => option(`${String(x)}×`, x * state.bet))
  }
  if (kind === 'bet') {
    const pot = potOf(state)
    return POSTFLOP_BET.map(([label, x]) => option(label, x * pot))
  }
  return POSTFLOP_RAISE.map((x) => option(`${String(x)}×`, x * state.bet))
}
