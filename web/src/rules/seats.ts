// Seat order and forced bets (docs/MATH.md §1.5, "Forced bets and order of action").

import type { ForcedBet, Stakes } from './types.ts'

/** Dealt-in seats clockwise, starting with the first seat after the button. */
export function seatOrder(dealtIn: readonly number[], button: number): number[] {
  const seats = [...dealtIn].sort((a, b) => a - b)
  return [...seats.filter((s) => s > button), ...seats.filter((s) => s <= button)]
}

/**
 * The forced bets in posting order: antes, small blind, big blind, straddles.
 *
 * Heads-up the button posts the small blind and the other seat the big blind (TDA 36-C);
 * otherwise the two seats after the button do. Straddles are posted by the seats after the big
 * blind. Returns `null` if there are more straddles than seats to post them.
 */
export function forcedBets(
  stakes: Stakes,
  dealtIn: readonly number[],
  button: number,
): ForcedBet[] | null {
  const order = seatOrder(dealtIn, button)
  const headsUp = order.length === 2
  const straddles = stakes.straddles_chips
  if (straddles.length > Math.max(0, order.length - 2)) return null

  // order[0] exists: callers pass at least two dealt-in seats.
  const small = headsUp ? button : (order[0] ?? button)
  const big = headsUp ? (order[0] ?? button) : (order[1] ?? button)
  const bets: ForcedBet[] = []
  const ante = stakes.ante
  if (ante !== null) {
    const posters = ante.kind === 'per_player' ? order : [big]
    for (const seat of posters) bets.push({ seat, kind: 'post_ante', chips: ante.chips })
  }
  bets.push({ seat: small, kind: 'post_small_blind', chips: stakes.small_blind_chips })
  bets.push({ seat: big, kind: 'post_big_blind', chips: stakes.big_blind_chips })
  straddles.forEach((chips, i) => {
    const seat = order[2 + i]
    if (seat !== undefined) bets.push({ seat, kind: 'post_straddle', chips })
  })
  return bets
}
