// Position labels (docs/MATH.md §5.1, item 5) and the button derived from hero's position
// (docs/CAPTURE.md §1.4). Labels depend only on the dealt-in seats and the button, never on seat
// numbers.

import { seatOrder } from '../rules/index.ts'

const FROM_START = ['UTG', 'UTG+1', 'UTG+2', 'UTG+3'] as const
const FROM_END = ['LJ', 'HJ', 'CO'] as const

/**
 * The labels clockwise from the first seat after the button, so the button is last:
 * 6 dealt in → `SB BB LJ HJ CO BTN`. Heads-up the button posts the small blind: `BB BTN`.
 * The k = n − 3 seats between the big blind and the button are labelled from the end (CO, HJ,
 * LJ), the rest from the start (UTG, UTG+1, ...), as in the server's `position_labels`.
 */
export function clockwiseLabels(dealtIn: number): string[] {
  if (!Number.isInteger(dealtIn) || dealtIn < 2 || dealtIn > 10) {
    throw new RangeError('a hand has 2 to 10 dealt-in seats')
  }
  if (dealtIn === 2) return ['BB', 'BTN']
  const k = dealtIn - 3
  const tail = FROM_END.slice(FROM_END.length - Math.min(k, FROM_END.length))
  const head = FROM_START.slice(0, k - tail.length)
  return ['SB', 'BB', ...head, ...tail, 'BTN']
}

/** The labels in preflop order of action, as the position row shows them: `UTG ... BTN SB BB`. */
export function preflopLabels(dealtIn: number): string[] {
  const clockwise = clockwiseLabels(dealtIn)
  return dealtIn === 2 ? ['BTN', 'BB'] : [...clockwise.slice(2), 'SB', 'BB']
}

/**
 * The button seat that puts hero in `label`, or `null` if the label does not exist for this many
 * seats or hero is not dealt in. If hero is `p` seats clockwise after the button's neighbour, the
 * button is `p + 1` dealt-in seats counter-clockwise from hero.
 */
export function buttonFor(
  dealtIn: readonly number[],
  heroSeat: number,
  label: string,
): number | null {
  const seats = [...dealtIn].sort((a, b) => a - b)
  const n = seats.length
  const hero = seats.indexOf(heroSeat)
  if (n < 2 || hero < 0) return null
  const p = clockwiseLabels(n).indexOf(label)
  if (p < 0) return null
  return seats[(((hero - p - 1) % n) + n) % n] ?? null
}

/** Every dealt-in seat's label, given the button. */
export function labelsBySeat(dealtIn: readonly number[], button: number): Map<number, string> {
  const order = seatOrder(dealtIn, button)
  const labels = clockwiseLabels(order.length)
  return new Map(order.map((seat, i) => [seat, labels[i] ?? '']))
}
