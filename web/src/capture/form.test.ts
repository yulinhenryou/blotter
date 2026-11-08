// The pure parts of the capture screens: position labels, the hand form (phases, fold to, undo,
// hero's fold, the board), sizes, pots and the proposed amounts won. Every expected number is
// worked out by hand in the comment next to it.

import { describe, expect, it } from 'vitest'

import type { Move, Result } from '../rules/index.ts'
import { idFor } from '../testing/fixtures.ts'
import {
  act,
  addBoardCard,
  endHere,
  foldTo,
  keepEntering,
  payoutOf,
  phaseOf,
  proposeWon,
  rakeFor,
  replay,
  stackProblem,
  toRecord,
  toggleWinner,
  undo,
  villainsForStacks,
  type HandForm,
} from './form.ts'
import { buttonFor, clockwiseLabels, labelsBySeat, preflopLabels } from './positions.ts'
import { presets, sizeMove } from './sizes.ts'

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.violation.message)
  return result.value
}

/** A form after setup: nine seats, blinds 1/3, hero in seat 7 with 300. */
function ready(position: string, overrides: Partial<HandForm> = {}): HandForm {
  return {
    formVersion: 1,
    id: idFor(100),
    sessionId: idFor(1),
    clientSeq: 1,
    tableSize: 9,
    heroSeat: 7,
    sessionStakes: { small_blind_chips: 1, big_blind_chips: 3, straddles_chips: [], ante: null },
    straddled: false,
    rake: { percent: 5, capChips: 10, noFlopNoDrop: true },
    dealtIn: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    heroPosition: position,
    heroCards: ['As', 'Kh'],
    heroStack: 300,
    heroStackApprox: false,
    heroStackConfirmed: true,
    playedAt: null,
    players: [],
    moves: [],
    board: [],
    keepEntering: false,
    endsAtHeroFold: false,
    villains: [],
    winners: [],
    won: null,
    reason: null,
    ...overrides,
  }
}

const raise = (to: number, all_in = false): Move => ({ kind: 'raise', amount_to_chips: to, all_in })
const call = (to: number, all_in = false): Move => ({ kind: 'call', amount_to_chips: to, all_in })
const bet = (to: number): Move => ({ kind: 'bet', amount_to_chips: to })
const FOLD: Move = { kind: 'fold' }
const CHECK: Move = { kind: 'check' }

function play(form: HandForm, ...moves: Move[]): HandForm {
  return moves.reduce((f, m) => must(act(f, m)), form)
}

function toActNow(form: HandForm): number | null {
  const phase = phaseOf(form)
  return phase.kind === 'act' ? phase.legal.seat : null
}

describe('position labels (MATH.md §5.1)', () => {
  it('labels the examples of MATH.md', () => {
    expect(preflopLabels(6).join(' ')).toBe('LJ HJ CO BTN SB BB')
    expect(preflopLabels(9).join(' ')).toBe('UTG UTG+1 UTG+2 LJ HJ CO BTN SB BB')
    expect(preflopLabels(4).join(' ')).toBe('CO BTN SB BB')
    expect(preflopLabels(3).join(' ')).toBe('BTN SB BB')
    expect(preflopLabels(2).join(' ')).toBe('BTN BB')
    expect(preflopLabels(10).join(' ')).toBe('UTG UTG+1 UTG+2 UTG+3 LJ HJ CO BTN SB BB')
  })

  it('finds the button that gives hero each label, for every table and hero seat', () => {
    // labelsBySeat(button) and buttonFor(label) must be inverses: hero gets the label asked for.
    const tables = [
      [1, 2],
      [2, 5, 9],
      [1, 3, 4, 8],
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ]
    for (const dealtIn of tables) {
      for (const hero of dealtIn) {
        for (const label of clockwiseLabels(dealtIn.length)) {
          const button = buttonFor(dealtIn, hero, label)
          expect(button).not.toBeNull()
          expect(labelsBySeat(dealtIn, button ?? 0).get(hero)).toBe(label)
        }
      }
    }
  })

  it('has no button for a label the table size does not have', () => {
    expect(buttonFor([1, 2, 3, 4, 5, 6], 1, 'UTG')).toBeNull()
    expect(buttonFor([1, 2, 3], 4, 'BTN')).toBeNull()
  })
})

describe('phases', () => {
  it('stays in setup until position, cards and the confirmed stack are in', () => {
    expect(phaseOf(ready('BTN', { heroPosition: null })).kind).toBe('setup')
    expect(phaseOf(ready('BTN', { heroCards: ['As'] })).kind).toBe('setup')
    expect(phaseOf(ready('BTN', { heroStackConfirmed: false })).kind).toBe('setup')
    // Hero on the button in seat 7: seat 8 is SB, 9 BB, so seat 1 (UTG) acts first.
    expect(toActNow(ready('BTN'))).toBe(1)
  })

  it('reports a stack that cannot post the blind', () => {
    const phase = phaseOf(ready('BB', { heroStack: 2 }))
    expect(phase.kind === 'setup' && phase.problem?.code).toBe('forced_bet_short')
  })

  it('asks for the board when a street closes, then lets the next street start', () => {
    // UTG raises to 15, folds to hero, who calls; SB folds, BB calls: the flop is due.
    const form0 = play(must(foldTo(play(ready('BTN'), raise(15)), 7)), call(15), FOLD, call(15))
    let form = form0
    expect(phaseOf(form)).toMatchObject({ kind: 'board', street: 'flop', missing: 3 })
    form = addBoardCard(addBoardCard(form, 'Ks'), '7d')
    expect(phaseOf(form)).toMatchObject({ kind: 'board', missing: 1 })
    expect(addBoardCard(form, 'Ks')).toBe(form) // a used card is refused
    form = addBoardCard(form, '2c')
    // On the flop the BB (seat 9) acts first.
    expect(toActNow(form)).toBe(9)
  })

  it('asks the remaining board one street at a time after an all-in', () => {
    // Three dealt in, blinds 1/2, hero BB with 200: A (button, unknown stack) all-in 50,
    // B (SB) all-in 120, hero calls (MATH.md §1.5 Example 1).
    let form = ready('BB', {
      tableSize: 3,
      heroSeat: 3,
      dealtIn: [1, 2, 3],
      sessionStakes: { small_blind_chips: 1, big_blind_chips: 2, straddles_chips: [], ante: null },
      heroStack: 200,
    })
    form = play(form, raise(50, true), raise(120, true), call(120))
    expect(phaseOf(form)).toMatchObject({ kind: 'board', street: 'flop', missing: 3 })
    for (const card of ['2c', '3c', '4c']) form = addBoardCard(form, card)
    expect(phaseOf(form)).toMatchObject({ kind: 'board', street: 'turn', missing: 1 })
    form = addBoardCard(form, '5d')
    expect(phaseOf(form)).toMatchObject({ kind: 'board', street: 'river', missing: 1 })
    form = addBoardCard(form, '9h')
    expect(phaseOf(form)).toMatchObject({ kind: 'end', showdown: true })
  })
})

describe('fold to', () => {
  it('folds every seat from the one to act up to the tapped one', () => {
    const form = must(foldTo(ready('BTN'), 7))
    expect(form.moves.map((m) => [m.seat, m.move.kind])).toEqual([
      [1, 'fold'],
      [2, 'fold'],
      [3, 'fold'],
      [4, 'fold'],
      [5, 'fold'],
      [6, 'fold'],
    ])
    expect(toActNow(form)).toBe(7)
  })

  it('never folds hero on the way', () => {
    const result = foldTo(ready('BTN'), 9)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.violation.code).toBe('hero_in_between')
  })

  it('refuses a seat the betting does not reach', () => {
    // UTG raises, folds to hero, hero calls; SB and BB are left to act. Seat 3 folded.
    let form = play(must(foldTo(play(ready('BTN'), raise(15)), 7)), call(15))
    expect(foldTo(form, 3).ok).toBe(false)
    form = must(foldTo(form, 9))
    expect(toActNow(form)).toBe(9)
  })
})

describe('undo', () => {
  it('removes the last move and the board entered after it', () => {
    let form = play(must(foldTo(play(ready('BTN'), raise(15)), 7)), call(15), FOLD, call(15))
    for (const card of ['Ks', '7d', '2c']) form = addBoardCard(form, card)
    expect(form.board).toHaveLength(3)
    // The BB's call closed the preflop; undoing it drops the flop too.
    const back = undo(form)
    expect(back.board).toEqual([])
    expect(back.moves).toHaveLength(form.moves.length - 1)
    expect(toActNow(back)).toBe(9)
  })

  it('keeps the flop when the undone move was made on it', () => {
    let form = play(must(foldTo(play(ready('BTN'), raise(15)), 7)), call(15), FOLD, call(15))
    for (const card of ['Ks', '7d', '2c']) form = addBoardCard(form, card)
    form = play(form, CHECK)
    expect(undo(form).board).toEqual(['Ks', '7d', '2c'])
  })

  it('reopens the setup before the first move', () => {
    expect(phaseOf(undo(ready('BTN'))).kind).toBe('setup')
  })
})

describe("hero's fold", () => {
  it('offers End here while the hand goes on, and Keep entering continues it', () => {
    // Hero UTG (seat 7 with the button in seat 4) folds first.
    const form = play(ready('UTG'), FOLD)
    expect(phaseOf(form).kind).toBe('heroFolded')
    expect(phaseOf(endHere(form))).toMatchObject({ kind: 'end', showdown: false })
    expect(phaseOf(keepEntering(form)).kind).toBe('act')
  })

  it('ends the hand by itself when hero folds to the last villain', () => {
    // Hero opens on the button, the BB raises, hero folds: only the BB is left.
    let form = play(must(foldTo(ready('BTN'), 7)), raise(9))
    form = play(must(foldTo(form, 9)), raise(27), FOLD)
    expect(phaseOf(form)).toMatchObject({ kind: 'end', showdown: false })
  })

  it('writes a record that stops at the fold, with no results (ADR-0030)', () => {
    // H2 of CAPTURE.md §5: hero in the hijack; UTG opens to 9, folds to hero, hero folds.
    let form = ready('HJ')
    form = play(form, raise(9))
    form = endHere(play(must(foldTo(form, 7)), FOLD))
    const record = must(toRecord(form, 'random_sample'))
    // HJ is seat 7, so the button is seat 9: SB 1, BB 2, UTG 3.
    expect(record.button_seat).toBe(9)
    expect(record.actions.map((a) => [a.seat, a.kind, a.amount_to_chips])).toEqual([
      [1, 'post_small_blind', 1],
      [2, 'post_big_blind', 3],
      [3, 'raise', 9],
      [4, 'fold', null],
      [5, 'fold', null],
      [6, 'fold', null],
      [7, 'fold', null],
    ])
    expect(record).toMatchObject({
      ends_at_hero_fold: true,
      results: [],
      record_reason: 'random_sample',
      board: { flop: null, turn: null, river: null },
    })
  })
})

describe('pots and amounts won (MATH.md §1.5)', () => {
  it('takes rake only after a flop when "no flop, no drop", rounded down and capped', () => {
    const rule = { percent: 5, capChips: 10, noFlopNoDrop: true }
    expect(rakeFor(203, rule, false)).toBe(0)
    expect(rakeFor(91, rule, true)).toBe(4) // 4.55 rounded down
    expect(rakeFor(226, rule, true)).toBe(10) // 11.3 → 11, capped at 10
    expect(rakeFor(226, null, true)).toBe(0)
  })

  it('takes the rake from the main pot first and gives odd chips left of the button', () => {
    // Example 1: main pot 150 (A, B, C), side pot 140 (B, C); rake 5 from the main pot.
    const pots = [
      { chips: 150, eligible: [1, 2, 3] },
      { chips: 140, eligible: [2, 3] },
    ]
    const order = [2, 3, 1] // the button is seat 1
    expect(proposeWon(pots, [[1], [3]], 5, order)).toEqual(
      new Map([
        [1, 145],
        [3, 140],
      ]),
    )
    // A split of 145 between 1 and 3: 72 each, the odd chip to seat 3 (left of the button first).
    expect(proposeWon(pots, [[1, 3], [3]], 5, order)).toEqual(
      new Map([
        [3, 73 + 140],
        [1, 72],
      ]),
    )
  })

  it('needs a winner for each pot and refuses amounts the pots cannot pay', () => {
    let form = ready('BB', {
      tableSize: 3,
      heroSeat: 3,
      dealtIn: [1, 2, 3],
      sessionStakes: { small_blind_chips: 1, big_blind_chips: 2, straddles_chips: [], ante: null },
      heroStack: 200,
      rake: null,
    })
    form = play(form, raise(50, true), raise(120, true), call(120))
    for (const card of ['2c', '3c', '4c', '5d', '9h']) form = addBoardCard(form, card)
    const phase = phaseOf(form)
    if (phase.kind !== 'end') throw new Error('not at the end')
    expect(payoutOf(form, phase.state).problem).toBe('Tap the winner of the main pot')
    form = toggleWinner(toggleWinner(form, 0, 1), 1, 3)
    const payout = payoutOf(form, phase.state)
    expect(payout.problem).toBeNull()
    expect(payout.won).toEqual(
      new Map([
        [1, 150],
        [3, 140],
      ]),
    )
    // Example 1's infeasible entry: A 160 from a main pot of 150.
    const bad = {
      ...form,
      won: [
        { seat: 1, chips: 160 },
        { seat: 3, chips: 130 },
      ],
    }
    expect(payoutOf(bad, phase.state).problem).toBe(
      'Seats in the main pot only are given more than it holds (150)',
    )
  })

  it('shows the rule’s rake before the winners are tapped, and what typed amounts leave after', () => {
    let form = ready('BB', {
      tableSize: 3,
      heroSeat: 3,
      dealtIn: [1, 2, 3],
      sessionStakes: { small_blind_chips: 1, big_blind_chips: 2, straddles_chips: [], ante: null },
      heroStack: 200,
      rake: { percent: 5, capChips: null, noFlopNoDrop: true },
    })
    form = play(form, raise(50, true), raise(120, true), call(120))
    for (const card of ['2c', '3c', '4c', '5d', '9h']) form = addBoardCard(form, card)
    const phase = phaseOf(form)
    if (phase.kind !== 'end') throw new Error('not at the end')
    // 290 in the pots, 5 % rounded down: 14, whether or not a winner is tapped yet.
    expect(payoutOf(form, phase.state).rake).toBe(14)
    form = toggleWinner(toggleWinner(form, 0, 1), 1, 3)
    expect(payoutOf(form, phase.state).rake).toBe(14)
    const typed = {
      ...form,
      won: [
        { seat: 1, chips: 140 },
        { seat: 3, chips: 140 },
      ],
    }
    expect(payoutOf(typed, phase.state).rake).toBe(10)
  })

  it("asks villains' stacks only of seats that put chips in voluntarily and are not all-in", () => {
    let form = play(ready('BTN'), raise(15))
    form = play(must(foldTo(form, 7)), call(15), FOLD, call(15))
    const replayed = must(replay(form))
    // UTG (1) raised, BB (9) called; SB (8) only posted and folded.
    expect(villainsForStacks(form, replayed.state)).toEqual([1, 9])
    // UTG put in 15 and is not all-in: a stack of 15 would have made it all-in.
    expect(stackProblem(replayed.state, 1, 15)).toMatch(/must be more/)
    expect(stackProblem(replayed.state, 1, 16)).toBeNull()
  })
})

describe('sizes (CAPTURE.md §1.5)', () => {
  it('offers the preflop open sizes in big blinds, rounded to whole chips', () => {
    const phase = phaseOf(ready('BTN'))
    if (phase.kind !== 'act') throw new Error('no one to act')
    // Blinds 1/3: 2, 2.5, 3, 4, 5 bb = 6, 7.5 → 8, 9, 12, 15 chips; the minimum raise is to 6.
    expect(
      presets(phase.state, phase.legal, 'raise', 0).map((p) => [p.label, p.to, p.problem]),
    ).toEqual([
      ['2 bb', 6, null],
      ['2.5 bb', 8, null],
      ['3 bb', 9, null],
      ['4 bb', 12, null],
      ['5 bb', 15, null],
    ])
  })

  it('offers re-raises as multiples and postflop bets as fractions of the pot', () => {
    let form = play(ready('BTN'), raise(15))
    let phase = phaseOf(form)
    if (phase.kind !== 'act') throw new Error('no one to act')
    expect(presets(phase.state, phase.legal, 'raise', 1).map((p) => p.to)).toEqual([45, 60])
    form = play(must(foldTo(form, 7)), call(15), FOLD, call(15))
    for (const card of ['Ks', '7d', '2c']) form = addBoardCard(form, card)
    phase = phaseOf(form)
    if (phase.kind !== 'act') throw new Error('no one to act')
    // Pot 3 × 15 + 1 = 46: ⅓ 15.3 → 15, ½ 23, ⅔ 30.7 → 31, ¾ 34.5 → 35, pot 46.
    expect(presets(phase.state, phase.legal, 'bet', 0).map((p) => p.to)).toEqual([
      15, 23, 31, 35, 46,
    ])
  })

  it('explains a typed amount below the minimum or above the stack', () => {
    const form = play(ready('BTN'), raise(12))
    const phase = phaseOf(must(foldTo(form, 7)))
    if (phase.kind !== 'act') throw new Error('no one to act')
    // Facing 12 after a raise of 9 over the big blind: the minimum re-raise is to 21.
    expect(sizeMove(phase.state, phase.legal, 'raise', 20, false).problem).toBe(
      'Minimum raise: to 21',
    )
    expect(sizeMove(phase.state, phase.legal, 'raise', 301, false).problem).toBe(
      'Seat 7 can go to at most 300',
    )
    // Hero's whole stack is an all-in raise even below nothing else.
    expect(sizeMove(phase.state, phase.legal, 'raise', 300, false).move).toEqual(raise(300, true))
  })

  it('treats an all-in for no more than the bet, with an unknown stack, as a call', () => {
    // UTG (stack unknown) faces hero's bet; "All-in to 10" is a call all-in for less.
    let form = play(ready('BTN'), raise(9))
    form = play(must(foldTo(form, 7)), call(9), FOLD, FOLD)
    for (const card of ['Ks', '7d', '2c']) form = addBoardCard(form, card)
    form = play(form, CHECK, bet(20))
    const phase = phaseOf(form)
    if (phase.kind !== 'act') throw new Error('no one to act')
    expect(phase.legal.seat).toBe(1)
    expect(sizeMove(phase.state, phase.legal, 'raise', 10, true).move).toEqual(call(10, true))
  })
})
