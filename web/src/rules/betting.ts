// The betting state machine of no-limit hold'em (docs/MATH.md §1.5, "Legal actions").
//
// The state is immutable: every function returns a new state and leaves its argument unchanged,
// which suits React (a state change is a new object) and makes "undo" a matter of keeping the old
// one. Notation as in MATH.md: `bet` is the current bet B, `fullRaise` the full-raise size F;
// for a seat, `street` is x_i (chips on this street, forced bets included), `live` is v_i (live
// chips in the hand), `ante` is a_i (dead).
//
// Written from MATH.md §1.5, not translated from the Python checker; the two are compared on a
// corpus generated in Python (corpus.test.ts, ADR-0028). The violation codes and the order in
// which they are tested are the server's, so the phone and the server name a mistake the same way.

import { forcedBets, seatOrder } from './seats.ts'
import {
  STREETS,
  type ForcedBet,
  type HandSetup,
  type Move,
  type Play,
  type Result,
  type Street,
  type Violation,
} from './types.ts'

export interface SeatState {
  readonly seat: number
  /** Starting stack, `null` if unknown. */
  readonly stack: number | null
  readonly ante: number
  readonly live: number
  readonly street: number
  readonly folded: boolean
  readonly allIn: boolean
  /** Has acted on this street (a forced bet is not an action). */
  readonly acted: boolean
}

export interface BettingState {
  readonly bigBlind: number
  /** Clockwise, starting with the first seat after the button. */
  readonly seats: readonly SeatState[]
  readonly street: Street
  /** Streets reached so far, in order. */
  readonly reached: readonly Street[]
  readonly bet: number
  readonly fullRaise: number
  /** Index into `seats` where the search for the next seat to act starts. */
  readonly next: number
}

/** A legal range of "to" amounts for a bet or raise; `max` is `null` when the stack is unknown. */
export interface SizeRange {
  readonly min: number
  readonly max: number | null
}

/** What the seat to act may do. Folding is always allowed, so it is not listed. */
export interface LegalActions {
  readonly seat: number
  readonly check: boolean
  /** `allIn` is `null` when the stack is unknown: then only the player knows. */
  readonly call: { readonly to: number; readonly allIn: boolean | null } | null
  readonly bet: SizeRange | null
  readonly raise: SizeRange | null
}

const violation = (code: string, message: string): Violation => ({ code, message })

/** Chips the seat has not committed yet, or `null` if its stack is unknown. */
export function behind(seat: SeatState): number | null {
  return seat.stack === null ? null : seat.stack - seat.ante - seat.live
}

/** Neither folded nor all-in. */
export function isActive(seat: SeatState): boolean {
  return !seat.folded && !seat.allIn
}

/** The state of a seat by seat number. */
export function seatState(state: BettingState, seat: number): SeatState | undefined {
  return state.seats.find((s) => s.seat === seat)
}

/** At most one seat is left in the hand. */
export function handOver(state: BettingState): boolean {
  return state.seats.filter((s) => !s.folded).length <= 1
}

function mustAct(state: BettingState, seat: SeatState): boolean {
  if (!isActive(seat)) return false
  if (seat.street < state.bet) return true
  // Not yet acted, and someone is left to bet against (MATH.md §1.5, "End of a street").
  return !seat.acted && state.seats.filter(isActive).length >= 2
}

/** The seat whose turn it is, or `null` if the street (or the hand) is over. */
export function toAct(state: BettingState): number | null {
  if (handOver(state)) return null
  const n = state.seats.length
  for (let step = 0; step < n; step++) {
    const seat = state.seats[(state.next + step) % n]
    if (seat !== undefined && mustAct(state, seat)) return seat.seat
  }
  return null
}

/** The street's betting is over and another street follows (the board must be dealt). */
export function streetOver(state: BettingState): boolean {
  return !handOver(state) && toAct(state) === null && state.street !== 'river'
}

/** Start the next street: nothing on it yet, first seat after the button, F = big blind. */
export function nextStreet(state: BettingState): BettingState {
  const street = STREETS[STREETS.indexOf(state.street) + 1]
  if (street === undefined) throw new Error('there is no street after the river')
  return {
    ...state,
    street,
    reached: [...state.reached, street],
    seats: state.seats.map((s) => ({ ...s, street: 0, acted: false })),
    bet: 0,
    fullRaise: state.bigBlind,
    next: 0,
  }
}

/**
 * Raise rights (TDA 49-A, as derived in MATH.md §1.5): a seat that has not acted on this street
 * has them; one that has acted has them again only if what it now faces is at least a full raise.
 */
export function hasRaiseRights(state: BettingState, seat: SeatState): boolean {
  return !seat.acted || state.bet - seat.street >= state.fullRaise
}

/** Set up a hand and post its forced bets. */
export function startHand(setup: HandSetup): Result<BettingState> {
  const order = seatOrder(setup.dealt_in_seats, setup.button_seat)
  const bets = forcedBets(setup.stakes, setup.dealt_in_seats, setup.button_seat)
  if (bets === null) {
    return { ok: false, violation: violation('too_many_straddles', 'more straddles than seats') }
  }
  const stacks = new Map(setup.stacks.map((s) => [s.seat, s.chips]))
  let state: BettingState = {
    bigBlind: setup.stakes.big_blind_chips,
    seats: order.map((seat) => ({
      seat,
      stack: stacks.get(seat) ?? null,
      ante: 0,
      live: 0,
      street: 0,
      folded: false,
      allIn: false,
      acted: false,
    })),
    street: 'preflop',
    reached: ['preflop'],
    bet: 0,
    fullRaise: 0,
    next: 0,
  }
  for (const forced of bets) {
    const posted = post(state, forced)
    if (!posted.ok) return posted
    state = posted.value
  }
  return { ok: true, value: state }
}

function post(state: BettingState, forced: ForcedBet): Result<BettingState> {
  const index = state.seats.findIndex((s) => s.seat === forced.seat)
  const seat = state.seats[index]
  if (seat === undefined) throw new Error(`seat ${String(forced.seat)} is not dealt in`)
  const left = behind(seat)
  if (forced.kind === 'post_ante') {
    // Record version 1 has no seat all-in on its ante.
    if (left !== null && forced.chips >= left) {
      return { ok: false, violation: violation('forced_bet_short', 'all-in on the ante') }
    }
    return {
      ok: true,
      value: replaceSeat(state, index, { ...seat, ante: seat.ante + forced.chips }),
    }
  }
  if (left !== null && forced.chips > left) {
    return {
      ok: false,
      violation: violation('forced_bet_short', 'a forced bet posted all-in for less'),
    }
  }
  const updated: SeatState = {
    ...seat,
    street: forced.chips,
    live: seat.live + forced.chips,
    allIn: left === forced.chips,
  }
  // The last live forced bet counts as a full bet: preflop F = B (MATH.md §1.5).
  const bet = Math.max(state.bet, forced.chips)
  return {
    ok: true,
    value: {
      ...replaceSeat(state, index, updated),
      bet,
      fullRaise: bet,
      next: (index + 1) % state.seats.length,
    },
  }
}

/** The actions open to the seat whose turn it is, with their amounts; `null` if no one is to act. */
export function legalActions(state: BettingState): LegalActions | null {
  const seatNumber = toAct(state)
  if (seatNumber === null) return null
  const seat = seatState(state, seatNumber)
  if (seat === undefined) return null
  const { bet, fullRaise } = state
  const left = behind(seat)
  const top = left === null ? null : seat.street + left // everything in

  const size = (least: number): SizeRange =>
    top === null
      ? { min: least, max: null }
      : top > least
        ? { min: least, max: top }
        : { min: top, max: top }

  let call: LegalActions['call'] = null
  if (seat.street < bet) {
    call = top === null ? { to: bet, allIn: null } : { to: Math.min(bet, top), allIn: top <= bet }
  }
  const canRaise = bet > 0 && hasRaiseRights(state, seat) && (top === null || top > bet)
  return {
    seat: seat.seat,
    check: seat.street === bet,
    call,
    bet: bet === 0 ? size(fullRaise) : null,
    raise: canRaise ? size(bet + fullRaise) : null,
  }
}

/**
 * Why `seat` may not make `move` now, or `null` if it may. The caller makes sure it is the seat's
 * turn. The tests run in the server's order (review.domain.rules.Betting.violation), so both
 * report the same code for the same mistake.
 */
export function moveViolation(
  state: BettingState,
  seatNumber: number,
  move: Move,
): Violation | null {
  const seat = seatState(state, seatNumber)
  if (seat === undefined)
    return violation('seat_not_dealt_in', `seat ${String(seatNumber)} is not dealt in`)
  const allIn = move.all_in ?? false
  const { bet, fullRaise } = state

  if (move.kind === 'fold' || move.kind === 'check') {
    if (allIn) return violation('all_in_mismatch', `a ${move.kind} cannot put a seat all-in`)
    if (move.kind === 'check' && seat.street < bet) {
      return violation('check_facing_bet', `cannot check facing a bet of ${String(bet)}`)
    }
    return null
  }

  const to = move.amount_to_chips
  switch (move.kind) {
    case 'call':
      if (seat.street >= bet)
        return violation('nothing_to_call', 'there is no bet to call; check instead')
      if (allIn && !(seat.street < to && to <= bet)) {
        return violation(
          'wrong_call_amount',
          `an all-in call must be above ${String(seat.street)} and at most ${String(bet)}`,
        )
      }
      if (!allIn && to !== bet) return violation('wrong_call_amount', `a call is to ${String(bet)}`)
      break
    case 'bet':
      if (bet > 0)
        return violation('bet_facing_bet', `facing a bet of ${String(bet)}: raise instead`)
      if (to < fullRaise && !allIn) {
        return violation('below_min_bet', `the minimum bet is ${String(fullRaise)} unless all-in`)
      }
      break
    case 'raise':
      if (bet === 0) return violation('raise_without_bet', 'there is no bet to raise: bet instead')
      if (!hasRaiseRights(state, seat)) {
        return violation(
          'no_raise_rights',
          `the betting was not reopened: the raises since this seat acted total less than a full raise of ${String(fullRaise)}`,
        )
      }
      if (to <= bet) return violation('raise_not_above_bet', `a raise must be above ${String(bet)}`)
      if (to < bet + fullRaise && !allIn) {
        return violation(
          'below_min_raise',
          `the minimum raise is to ${String(bet + fullRaise)} unless all-in`,
        )
      }
      break
  }

  const left = behind(seat)
  if (left !== null) {
    const more = to - seat.street
    if (more > left) {
      return violation(
        'exceeds_stack',
        `needs ${String(more)} more chips but the seat has ${String(left)}`,
      )
    }
    if (allIn !== (more === left)) {
      return violation(
        'all_in_mismatch',
        'all_in must be true exactly when the move commits the whole stack',
      )
    }
  }
  return null
}

/** Apply a move that `moveViolation` accepted. */
export function applyMove(state: BettingState, seatNumber: number, move: Move): BettingState {
  const index = state.seats.findIndex((s) => s.seat === seatNumber)
  const seat = state.seats[index]
  if (seat === undefined) throw new Error(`seat ${String(seatNumber)} is not dealt in`)
  const next = (index + 1) % state.seats.length
  if (move.kind === 'fold' || move.kind === 'check') {
    const updated = { ...seat, acted: true, folded: move.kind === 'fold' }
    return { ...replaceSeat(state, index, updated), next }
  }
  const to = move.amount_to_chips
  const updated: SeatState = {
    ...seat,
    acted: true,
    live: seat.live + (to - seat.street),
    street: to,
    allIn: move.all_in ?? false,
  }
  let { bet, fullRaise } = state
  if (move.kind !== 'call') {
    // A full bet or raise sets the new full-raise size; a short all-in leaves it (TDA 45-A, 49-A).
    if (to - bet >= fullRaise) fullRaise = to - bet
    bet = to
  }
  return { ...replaceSeat(state, index, updated), bet, fullRaise, next }
}

/**
 * Start later streets until someone has to act; at the river, or when the hand is over, stop.
 * Used when replaying recorded actions, whose board is already known.
 */
export function advance(state: BettingState): BettingState {
  let s = state
  while (streetOver(s)) s = nextStreet(s)
  return s
}

/** Play one recorded action: check whose turn and street it is, then the move itself. */
export function play(state: BettingState, action: Play): Result<BettingState> {
  const s = advance(state)
  const seat = toAct(s)
  if (seat === null) {
    return { ok: false, violation: violation('hand_over', 'the betting is over') }
  }
  if (action.street !== s.street) {
    return {
      ok: false,
      violation: violation(
        'wrong_street',
        `the action is on the ${action.street}, the hand is on the ${s.street}`,
      ),
    }
  }
  if (action.seat !== seat) {
    return { ok: false, violation: violation('out_of_turn', `it is seat ${String(seat)}'s turn`) }
  }
  const problem = moveViolation(s, seat, action)
  return problem === null
    ? { ok: true, value: applyMove(s, seat, action) }
    : { ok: false, violation: problem }
}

function replaceSeat(state: BettingState, index: number, seat: SeatState): BettingState {
  return { ...state, seats: state.seats.map((s, i) => (i === index ? seat : s)) }
}
