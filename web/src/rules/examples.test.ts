// The worked examples of docs/MATH.md §1.5, with the numbers written as the document gives them
// (exact anchors, independent of the corpus), and the rules the corpus does not reach: whose turn
// it is, the street, forced bets that do not fit, and that states are never modified.

import { describe, expect, it } from 'vitest'

import {
  advance,
  firstInfeasiblePrefix,
  legalActions,
  play,
  settle,
  startHand,
  streetOver,
  toAct,
  type BettingState,
  type HandSetup,
  type Play,
  type Stakes,
} from './index.ts'

const BLINDS_1_2: Stakes = {
  small_blind_chips: 1,
  big_blind_chips: 2,
  straddles_chips: [],
  ante: null,
}

function setup(
  button: number,
  stacks: Record<number, number | null>,
  stakes = BLINDS_1_2,
): HandSetup {
  const seats = Object.keys(stacks).map(Number)
  return {
    stakes,
    dealt_in_seats: seats,
    button_seat: button,
    stacks: seats.map((seat) => ({ seat, chips: stacks[seat] ?? null })),
  }
}

function start(s: HandSetup): BettingState {
  const started = startHand(s)
  if (!started.ok) throw new Error(started.violation.code)
  return started.value
}

function playAll(state: BettingState, actions: Play[]): BettingState {
  return actions.reduce((s, action, i) => {
    const next = play(s, action)
    if (!next.ok) throw new Error(`action ${String(i)}: ${next.violation.code}`)
    return next.value
  }, state)
}

const P = 'preflop'
const F = 'flop'

describe('MATH.md §1.5 Example 1: three-way all-in, one side pot', () => {
  // Seat 1 = A (button, 50), seat 2 = B (small blind, 120), seat 3 = C (big blind, 200).
  const begin = start(setup(1, { 1: 50, 2: 120, 3: 200 }))
  const afterA = playAll(begin, [
    { street: P, seat: 1, kind: 'raise', amount_to_chips: 50, all_in: true },
  ])
  const afterB = playAll(afterA, [
    { street: P, seat: 2, kind: 'raise', amount_to_chips: 120, all_in: true },
  ])
  const end = advance(playAll(afterB, [{ street: P, seat: 3, kind: 'call', amount_to_chips: 120 }]))

  it('counts both all-ins as full raises', () => {
    expect([afterA.bet, afterA.fullRaise]).toEqual([50, 48])
    expect([afterB.bet, afterB.fullRaise]).toEqual([120, 70])
  })

  it('deals the board with no more betting', () => {
    expect(end.reached).toEqual(['preflop', 'flop', 'turn', 'river'])
    expect(toAct(end)).toBeNull()
  })

  it('makes a main pot of 150 and a side pot of 140', () => {
    const { uncalled, pots } = settle(end)
    expect(uncalled).toBeNull()
    expect(pots).toEqual([
      { chips: 150, eligible: [1, 2, 3] },
      { chips: 140, eligible: [2, 3] },
    ])
  })

  it('accepts A 150, C 135 and rejects A 160, C 130 at the main pot', () => {
    const { pots } = settle(end)
    expect(
      firstInfeasiblePrefix(
        pots,
        new Map([
          [1, 150],
          [3, 135],
        ]),
      ),
    ).toBeNull()
    expect(
      firstInfeasiblePrefix(
        pots,
        new Map([
          [1, 160],
          [3, 130],
        ]),
      ),
    ).toBe(1)
  })
})

// Examples 2 and 3: A, B, C on the flop as in MATH.md, plus seat 4 (the button) who calls along,
// as in the Python fixtures. Seat 1 = A, 2 = B, 3 = C; everyone limps preflop for 2.
const LIMPS: Play[] = [
  { street: P, seat: 3, kind: 'call', amount_to_chips: 2 },
  { street: P, seat: 4, kind: 'call', amount_to_chips: 2 },
  { street: P, seat: 1, kind: 'call', amount_to_chips: 2 },
  { street: P, seat: 2, kind: 'check' },
]

describe('MATH.md §1.5 Example 2: a short all-in does not reopen the betting', () => {
  const flop = playAll(start(setup(4, { 1: 1000, 2: 152, 3: 1000, 4: 1000 })), [
    ...LIMPS,
    { street: F, seat: 1, kind: 'bet', amount_to_chips: 100 },
    { street: F, seat: 2, kind: 'raise', amount_to_chips: 150, all_in: true },
  ])

  it('keeps F at 100 and lets C raise to at least 250', () => {
    expect([flop.bet, flop.fullRaise]).toEqual([150, 100])
    expect(legalActions(flop)?.raise).toEqual({ min: 250, max: 1000 - 2 })
  })

  it('leaves A only call or fold', () => {
    const backToA = playAll(flop, [
      { street: F, seat: 3, kind: 'call', amount_to_chips: 150 },
      { street: F, seat: 4, kind: 'call', amount_to_chips: 150 },
    ])
    const legal = legalActions(backToA)
    expect(legal?.seat).toBe(1)
    expect(legal?.raise).toBeNull()
    expect(legal?.call).toEqual({ to: 150, allIn: false })
    const raise = play(backToA, { street: F, seat: 1, kind: 'raise', amount_to_chips: 400 })
    expect(raise.ok ? null : raise.violation.code).toBe('no_raise_rights')
  })
})

describe('MATH.md §1.5 Example 3: two short all-ins together reopen it', () => {
  it('gives A raise rights with a minimum raise to 310', () => {
    const backToA = playAll(start(setup(4, { 1: 1000, 2: 152, 3: 212, 4: 1000 })), [
      ...LIMPS,
      { street: F, seat: 1, kind: 'bet', amount_to_chips: 100 },
      { street: F, seat: 2, kind: 'raise', amount_to_chips: 150, all_in: true },
      { street: F, seat: 3, kind: 'raise', amount_to_chips: 210, all_in: true },
      { street: F, seat: 4, kind: 'call', amount_to_chips: 210 },
    ])
    expect(legalActions(backToA)?.raise).toEqual({ min: 310, max: 998 })
    const short = play(backToA, { street: F, seat: 1, kind: 'raise', amount_to_chips: 300 })
    expect(short.ok ? null : short.violation.code).toBe('below_min_raise')
  })
})

describe('MATH.md §1.5 Example 4: uncalled bet', () => {
  // Seats 1 (small blind), 2 (big blind), 3 = F, 4 = G (button, 500). Blind stacks unknown.
  const actions: Play[] = [
    { street: P, seat: 3, kind: 'raise', amount_to_chips: 100 },
    { street: P, seat: 4, kind: 'raise', amount_to_chips: 500, all_in: true },
    { street: P, seat: 1, kind: 'fold' },
    { street: P, seat: 2, kind: 'fold' },
    { street: P, seat: 3, kind: 'fold' },
  ]
  const stacks = { 1: null, 2: null, 3: 1000, 4: 500 }

  it('returns 400 to G and leaves one pot of 203', () => {
    const { uncalled, pots } = settle(playAll(start(setup(4, stacks)), actions))
    expect(uncalled).toEqual({ seat: 4, chips: 400 })
    expect(pots).toEqual([{ chips: 203, eligible: [4] }])
  })

  it('puts a big-blind ante of 2 into the main pot without changing the uncalled bet', () => {
    const stakes: Stakes = { ...BLINDS_1_2, ante: { kind: 'big_blind', chips: 2 } }
    const { uncalled, pots } = settle(playAll(start(setup(4, stacks, stakes)), actions))
    expect(uncalled).toEqual({ seat: 4, chips: 400 })
    expect(pots).toEqual([{ chips: 205, eligible: [4] }])
  })
})

describe('turn order and streets', () => {
  const hand = start(setup(3, { 1: 100, 2: 100, 3: 100 }))

  it('starts preflop after the big blind and refuses anyone else', () => {
    expect(toAct(hand)).toBe(3)
    const early = play(hand, { street: P, seat: 1, kind: 'fold' })
    expect(early.ok ? null : early.violation.code).toBe('out_of_turn')
  })

  it('says when a street is over, and starts the flop with the first seat after the button', () => {
    const closed = playAll(hand, [
      { street: P, seat: 3, kind: 'call', amount_to_chips: 2 },
      { street: P, seat: 1, kind: 'call', amount_to_chips: 2 },
      { street: P, seat: 2, kind: 'check' },
    ])
    expect(streetOver(closed)).toBe(true)
    const wrong = play(closed, { street: P, seat: 1, kind: 'check' })
    expect(wrong.ok ? null : wrong.violation.code).toBe('wrong_street')
    expect(toAct(advance(closed))).toBe(1)
    expect(advance(closed).fullRaise).toBe(2) // the minimum bet is one big blind
  })

  it('heads-up: the button posts the small blind and acts first preflop, last after', () => {
    const headsUp = start(setup(2, { 1: 100, 2: 100 }))
    expect(headsUp.seats.find((s) => s.seat === 2)?.live).toBe(1)
    expect(toAct(headsUp)).toBe(2)
    const flop = advance(
      playAll(headsUp, [
        { street: P, seat: 2, kind: 'call', amount_to_chips: 2 },
        { street: P, seat: 1, kind: 'check' },
      ]),
    )
    expect(toAct(flop)).toBe(1)
  })

  it('refuses any action once one seat is left', () => {
    const over = playAll(hand, [
      { street: P, seat: 3, kind: 'fold' },
      { street: P, seat: 1, kind: 'fold' },
    ])
    const late = play(over, { street: P, seat: 2, kind: 'check' })
    expect(late.ok ? null : late.violation.code).toBe('hand_over')
  })

  it('never modifies a state it is given', () => {
    const before = JSON.stringify(hand)
    playAll(hand, [{ street: P, seat: 3, kind: 'raise', amount_to_chips: 6 }])
    advance(hand)
    expect(JSON.stringify(hand)).toBe(before)
  })
})

describe('forced bets', () => {
  it('posts straddles after the big blind and opens the raise at twice the last one', () => {
    const stakes: Stakes = { ...BLINDS_1_2, straddles_chips: [4] }
    const hand = start(setup(4, { 1: 100, 2: 100, 3: 100, 4: 100 }, stakes))
    expect(toAct(hand)).toBe(4)
    expect(legalActions(hand)?.raise?.min).toBe(8)
  })

  it('refuses more straddles than seats, and a stack too short for its blind', () => {
    const many = startHand(
      setup(3, { 1: 100, 2: 100, 3: 100 }, { ...BLINDS_1_2, straddles_chips: [4, 8] }),
    )
    expect(many.ok ? null : many.violation.code).toBe('too_many_straddles')
    const short = startHand(setup(3, { 1: 100, 2: 1, 3: 100 }))
    expect(short.ok ? null : short.violation.code).toBe('forced_bet_short')
  })

  it('puts a seat all-in when its blind is its whole stack', () => {
    const hand = start(setup(3, { 1: 100, 2: 2, 3: 100 }))
    expect(hand.seats.find((s) => s.seat === 2)?.allIn).toBe(true)
  })
})
