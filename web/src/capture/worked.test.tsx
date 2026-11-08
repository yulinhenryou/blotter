// The worked hands of docs/CAPTURE.md §5, entered through the screens tap by tap. Each test
// compares the saved record with the record written out by hand below, and the number of taps
// with the tap budget of §5 (a tap: one touch of a button, card, seat or key).

import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { listEntries } from '../store/records.ts'
import type { RecordTypes } from '../store/types.ts'
import {
  harness,
  newHand,
  renderApp,
  save,
  seedSession,
  tapButton,
  tapCards,
  tapSeat,
  typeOnPad,
  type Harness,
} from './testing.tsx'

type HandRecord = RecordTypes['hand']
type Action = HandRecord['actions'][number]
type Seat = HandRecord['seats'][number]
type Street = Action['street']

function action(
  street: Street,
  seat: number,
  kind: Action['kind'],
  to: number | null = null,
  allIn = false,
): Action {
  return {
    street,
    seat,
    kind,
    amount_to_chips: to,
    ante_chips: null,
    all_in: allIn,
    amount_approximate: false,
  }
}

const pre = (seat: number, kind: Action['kind'], to: number | null = null, allIn = false) =>
  action('preflop', seat, kind, to, allIn)

function seat(n: number, fields: Partial<Seat> = {}): Seat {
  return {
    seat: n,
    player_id: null,
    hole_cards: null,
    showed: false,
    starting_stack_chips: null,
    stack_approximate: false,
    ...fields,
  }
}

const folds = (street: Street, ...seats: number[]) => seats.map((s) => action(street, s, 'fold'))

async function savedHand(h: Harness): Promise<HandRecord> {
  const hands = (await listEntries(h.db, 'hand')).flatMap((e) =>
    e.kind === 'hand' ? [e.record] : [],
  )
  expect(hands).toHaveLength(1)
  const [hand] = hands
  if (hand === undefined) throw new Error('no hand saved')
  return hand
}

/** The fields every record of these tests shares. */
function base(h: Harness, sessionId: string, handId: string) {
  return {
    id: handId,
    revision: 1,
    schema_version: 2 as const,
    source: 'manual' as const,
    session_id: sessionId,
    client_seq: 1,
    played_at: h.deps.now().toISOString(),
    board: { flop: null, turn: null, river: null },
    ends_at_hero_fold: false,
    record_reason: 'notable' as const,
  }
}

/** Start at the session screen of a seeded session; returns the session id. */
async function atSession(h: Harness, input: Parameters<typeof seedSession>[1] = {}) {
  const sessionId = await seedSession(h, input)
  renderApp(h, `/capture/session/${sessionId}`)
  return sessionId
}

describe('worked hands (CAPTURE.md §5)', () => {
  it('H1: MATH.md §5.1 example, played to the river — 37 taps', async () => {
    // Live 1/3, nine dealt in, hero on the button (seat 7) with 300. UTG opens to 15, folds to
    // hero, hero calls, SB folds, BB calls. Flop K♠7♦2♣: BB checks, UTG bets 30, hero calls, BB
    // folds. Turn 4♥: UTG checks, hero bets 60, UTG calls. River 9♣: both check; UTG shows Q♥Q♣,
    // hero wins. Seats: button 7, SB 8, BB 9, UTG 1.
    const h = await harness()
    const sessionId = await atSession(h)
    await newHand(h)
    tapButton(h, 'BTN', "Hero's position")
    tapCards(h, "Hero's cards", 'As Kh')
    typeOnPad(h, "Hero's stack", '✓') // prefilled with the buy-in, 300
    expect(h.taps.count).toBe(5)

    tapButton(h, 'Raise', 'Actions')
    tapButton(h, '5 bb', 'Sizes')
    tapSeat(h, 7) // fold to hero
    tapButton(h, 'Call 15', 'Actions')
    tapButton(h, 'Fold', 'Actions') // SB
    tapButton(h, 'Call 15', 'Actions') // BB
    expect(h.taps.count).toBe(11)

    tapCards(h, 'Flop', 'Ks 7d 2c')
    tapButton(h, 'Check', 'Actions') // BB
    tapButton(h, 'Bet', 'Actions') // UTG
    typeOnPad(h, 'Bet', '30✓')
    tapButton(h, 'Call 30', 'Actions') // hero
    tapButton(h, 'Fold', 'Actions') // BB
    expect(h.taps.count).toBe(21)

    tapCards(h, 'Turn', '4h')
    tapButton(h, 'Check', 'Actions') // UTG
    tapButton(h, 'Bet', 'Actions') // hero
    typeOnPad(h, 'Bet', '60✓')
    tapButton(h, 'Call 60', 'Actions') // UTG
    expect(h.taps.count).toBe(28)

    tapCards(h, 'River', '9c')
    tapButton(h, 'Check', 'Actions') // UTG
    tapButton(h, 'Check', 'Actions') // hero
    expect(h.taps.count).toBe(31)

    // The end screen asks for UTG's cards by itself (showdown).
    tapCards(h, 'Seat 1 · UTG: cards', 'Qh Qc')
    tapButton(h, 'Seat 7 · BTN', 'Main pot winner')
    tapButton(h, 'Seat 1 · UTG: same as hero')
    tapButton(h, 'Seat 9 · BB: same as hero')
    // Pot 3 × 15 + 1 + 2 × 30 + 2 × 60 = 226; rake 5 % = 11.3 → 11, capped at 10: hero wins 216.
    expect(screen.getByText('Seat 7 · BTN wins 216')).toBeInTheDocument()
    await save(h)
    expect(h.taps.count).toBe(37)

    const hand = await savedHand(h)
    expect(hand).toEqual({
      ...base(h, sessionId, hand.id),
      table_size: 9,
      button_seat: 7,
      hero_seat: 7,
      dealt_in_seats: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      stakes: { small_blind_chips: 1, big_blind_chips: 3, straddles_chips: [], ante: null },
      seats: [
        seat(1, {
          hole_cards: ['Qh', 'Qc'],
          showed: true,
          starting_stack_chips: 300,
          stack_approximate: true,
        }),
        seat(2),
        seat(3),
        seat(4),
        seat(5),
        seat(6),
        seat(7, { hole_cards: ['As', 'Kh'], starting_stack_chips: 300 }),
        seat(8),
        seat(9, { starting_stack_chips: 300, stack_approximate: true }),
      ],
      actions: [
        pre(8, 'post_small_blind', 1),
        pre(9, 'post_big_blind', 3),
        pre(1, 'raise', 15),
        ...folds('preflop', 2, 3, 4, 5, 6),
        pre(7, 'call', 15),
        pre(8, 'fold'),
        pre(9, 'call', 15),
        action('flop', 9, 'check'),
        action('flop', 1, 'bet', 30),
        action('flop', 7, 'call', 30),
        action('flop', 9, 'fold'),
        action('turn', 1, 'check'),
        action('turn', 7, 'bet', 60),
        action('turn', 1, 'call', 60),
        action('river', 1, 'check'),
        action('river', 7, 'check'),
      ],
      board: { flop: ['Ks', '7d', '2c'], turn: '4h', river: '9c' },
      results: [{ seat: 7, won_chips: 216 }],
    })
  })

  it('H2: random sample, hero folds preflop — 11 taps', async () => {
    // Hero in the hijack (seat 7, so the button is seat 9, SB 1, BB 2, UTG 3); UTG opens to 3 bb,
    // folds to hero, hero folds; "End here". The sample is due, so random_sample is the default.
    const h = await harness()
    const sessionId = await seedSession(h)
    h.advance(31 * 60) // the first sample time is 30 minutes after the session started
    renderApp(h, `/capture/session/${sessionId}`)
    await screen.findByText(/Random sample due/)
    await newHand(h)
    tapButton(h, 'HJ', "Hero's position")
    tapCards(h, "Hero's cards", '9s 8s')
    typeOnPad(h, "Hero's stack", '✓')
    tapButton(h, 'Raise', 'Actions')
    tapButton(h, '3 bb', 'Sizes')
    tapSeat(h, 7)
    tapButton(h, 'Fold', 'Actions')
    tap_endHere(h)
    // The default follows the sample once the session's sample time is read from the store.
    expect(
      await screen.findByRole('button', { name: 'Random sample', pressed: true }),
    ).toBeInTheDocument()
    await save(h)
    expect(h.taps.count).toBe(11)

    const hand = await savedHand(h)
    expect(hand).toEqual({
      ...base(h, sessionId, hand.id),
      table_size: 9,
      button_seat: 9,
      hero_seat: 7,
      dealt_in_seats: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      stakes: { small_blind_chips: 1, big_blind_chips: 3, straddles_chips: [], ante: null },
      seats: [1, 2, 3, 4, 5, 6, 8, 9]
        .map((n) => seat(n))
        .toSpliced(6, 0, seat(7, { hole_cards: ['9s', '8s'], starting_stack_chips: 300 })),
      actions: [
        pre(1, 'post_small_blind', 1),
        pre(2, 'post_big_blind', 3),
        pre(3, 'raise', 9),
        ...folds('preflop', 4, 5, 6, 7),
      ],
      results: [],
      ends_at_hero_fold: true,
      record_reason: 'random_sample',
    })
    // Logging the sample closed it and drew the next time: 30 minutes later again.
    expect(await screen.findByText(/Next random sample: after/)).toBeInTheDocument()
  })

  it('H2, hero first to act and folding — 8 taps', async () => {
    const h = await harness()
    await atSession(h)
    await newHand(h)
    tapButton(h, 'UTG', "Hero's position")
    tapCards(h, "Hero's cards", '7c 2d')
    typeOnPad(h, "Hero's stack", '✓')
    tapButton(h, 'Fold', 'Actions')
    tap_endHere(h)
    await save(h)
    expect(h.taps.count).toBe(8)
    const hand = await savedHand(h)
    expect(hand.ends_at_hero_fold).toBe(true)
    expect(hand.actions.map((a) => a.kind)).toEqual(['post_small_blind', 'post_big_blind', 'fold'])
  })

  it('H3: hero opens, calls a 3-bet and folds to a flop bet — 24 taps', async () => {
    // Hero in the cutoff (seat 7: button 8, SB 9, BB 1). Hero opens to 5 bb = 15, BTN and SB
    // fold, BB 3-bets 3× = 45, hero calls. Flop: pot 2 × 45 + 1 = 91; BB bets ½ = 45.5 → 46;
    // hero folds. Only the BB is left, so the hand is over: no "End here" (the budget in
    // CAPTURE.md counted one), but opening the pad for BB's stack is a tap the budget did not
    // count. Same total, 24.
    const h = await harness()
    const sessionId = await atSession(h)
    await newHand(h)
    tapButton(h, 'CO', "Hero's position")
    tapCards(h, "Hero's cards", 'Ah Qh')
    typeOnPad(h, "Hero's stack", '✓')
    tapSeat(h, 7)
    tapButton(h, 'Raise', 'Actions')
    tapButton(h, '5 bb', 'Sizes')
    tapSeat(h, 1)
    tapButton(h, 'Raise', 'Actions')
    tapButton(h, '3×', 'Sizes')
    tapButton(h, 'Call 45', 'Actions')
    tapCards(h, 'Flop', 'Kd 8c 3s')
    tapButton(h, 'Bet', 'Actions')
    tapButton(h, '½', 'Sizes')
    tapButton(h, 'Fold', 'Actions')
    expect(screen.queryByRole('button', { name: 'End here' })).not.toBeInTheDocument()
    tapButton(h, 'Seat 1 · BB: enter stack')
    typeOnPad(h, 'Seat 1 · BB: stack', '450✓')
    // The uncalled 46 goes back to the BB; pot 91, rake 5 % = 4.55 → 4: the BB wins 87.
    expect(screen.getByText('Seat 1 · BB wins 87')).toBeInTheDocument()
    await save(h)
    expect(h.taps.count).toBe(24)

    const hand = await savedHand(h)
    expect(hand).toEqual({
      ...base(h, sessionId, hand.id),
      table_size: 9,
      button_seat: 8,
      hero_seat: 7,
      dealt_in_seats: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      stakes: { small_blind_chips: 1, big_blind_chips: 3, straddles_chips: [], ante: null },
      seats: [
        seat(1, { starting_stack_chips: 450, stack_approximate: true }),
        ...[2, 3, 4, 5, 6].map((n) => seat(n)),
        seat(7, { hole_cards: ['Ah', 'Qh'], starting_stack_chips: 300 }),
        seat(8),
        seat(9),
      ],
      actions: [
        pre(9, 'post_small_blind', 1),
        pre(1, 'post_big_blind', 3),
        ...folds('preflop', 2, 3, 4, 5, 6),
        pre(7, 'raise', 15),
        ...folds('preflop', 8, 9),
        pre(1, 'raise', 45),
        pre(7, 'call', 45),
        action('flop', 1, 'bet', 46),
        action('flop', 7, 'fold'),
      ],
      board: { flop: ['Kd', '8c', '3s'], turn: null, river: null },
      results: [{ seat: 1, won_chips: 87 }],
    })
  })

  it('H4: MATH.md §1.5 Example 1, two all-ins with unknown stacks — 32 taps', async () => {
    // Blinds 1/2, three seats, no rake; hero (seat 3, BB) has 200. A (seat 1, button) raises
    // all-in to 50, B (seat 2, SB) all-in to 120, hero calls 120. Main pot 150 to A, side pot 140
    // to hero (MATH.md: P1 = 150, P2 = 140).
    const h = await harness()
    const sessionId = await atSession(h, {
      smallBlind: 1,
      bigBlind: 2,
      tableSize: 3,
      heroSeat: 3,
      rake: null,
      buyIn: null,
    })
    await newHand(h)
    tapButton(h, 'BB', "Hero's position")
    tapCards(h, "Hero's cards", 'Kc Kd')
    typeOnPad(h, "Hero's stack", '200✓')
    expect(h.taps.count).toBe(8)
    tapButton(h, 'Raise', 'Actions')
    tapButton(h, 'All-in', 'Sizes')
    typeOnPad(h, 'All-in to', '50✓')
    tapButton(h, 'Raise', 'Actions')
    tapButton(h, 'All-in', 'Sizes')
    typeOnPad(h, 'All-in to', '120✓')
    tapButton(h, 'Call 120', 'Actions')
    expect(h.taps.count).toBe(20)
    tapCards(h, 'Flop', '2h 7s Td')
    tapCards(h, 'Turn', 'Jc')
    tapCards(h, 'River', '3h')
    // The picker asks villains in order from the button's left: SB first.
    tapCards(h, 'Seat 2 · SB: cards', 'Qs Qd')
    tapCards(h, 'Seat 1 · BTN: cards', 'Ah Ad')
    tapButton(h, 'Seat 1 · BTN', 'Main pot winner')
    tapButton(h, 'Seat 3 · BB', 'Side pot 1 winner')
    await save(h)
    expect(h.taps.count).toBe(32)

    const hand = await savedHand(h)
    expect(hand).toEqual({
      ...base(h, sessionId, hand.id),
      table_size: 3,
      button_seat: 1,
      hero_seat: 3,
      dealt_in_seats: [1, 2, 3],
      stakes: { small_blind_chips: 1, big_blind_chips: 2, straddles_chips: [], ante: null },
      seats: [
        seat(1, { hole_cards: ['Ah', 'Ad'], showed: true }),
        seat(2, { hole_cards: ['Qs', 'Qd'], showed: true }),
        seat(3, { hole_cards: ['Kc', 'Kd'], starting_stack_chips: 200 }),
      ],
      actions: [
        pre(2, 'post_small_blind', 1),
        pre(3, 'post_big_blind', 2),
        pre(1, 'raise', 50, true),
        pre(2, 'raise', 120, true),
        pre(3, 'call', 120),
      ],
      board: { flop: ['2h', '7s', 'Td'], turn: 'Jc', river: '3h' },
      results: [
        { seat: 1, won_chips: 150 },
        { seat: 3, won_chips: 140 },
      ],
    })
  })

  it('H5: MATH.md §1.5 Example 4, hero folds to an all-in — 20 taps', async () => {
    // Blinds 1/2. Hero F in UTG+1 (seat 7, so the button is seat 3: SB 4, BB 5, UTG 6, G = UTG+2
    // in seat 8). UTG folds, hero raises to 100, G goes all-in for 500 (stack unknown), everyone
    // else folds, hero folds. G gets 400 back and wins 1 + 2 + 100 + 100 = 203; no flop, no rake.
    const h = await harness()
    const sessionId = await atSession(h, { smallBlind: 1, bigBlind: 2 })
    await newHand(h)
    tapButton(h, 'UTG+1', "Hero's position")
    tapCards(h, "Hero's cards", 'Jh Js')
    typeOnPad(h, "Hero's stack", '✓')
    tapSeat(h, 7)
    tapButton(h, 'Raise', 'Actions')
    typeOnPad(h, 'Raise to', '100✓')
    tapButton(h, 'Raise', 'Actions')
    tapButton(h, 'All-in', 'Sizes')
    typeOnPad(h, 'All-in to', '500✓')
    tapSeat(h, 7)
    tapButton(h, 'Fold', 'Actions')
    expect(screen.getByText('Seat 8 · UTG+2 wins 203')).toBeInTheDocument()
    await save(h)
    expect(h.taps.count).toBe(20)

    const hand = await savedHand(h)
    expect(hand).toEqual({
      ...base(h, sessionId, hand.id),
      table_size: 9,
      button_seat: 3,
      hero_seat: 7,
      dealt_in_seats: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      stakes: { small_blind_chips: 1, big_blind_chips: 2, straddles_chips: [], ante: null },
      seats: [1, 2, 3, 4, 5, 6, 8, 9]
        .map((n) => seat(n))
        .toSpliced(6, 0, seat(7, { hole_cards: ['Jh', 'Js'], starting_stack_chips: 300 })),
      actions: [
        pre(4, 'post_small_blind', 1),
        pre(5, 'post_big_blind', 2),
        pre(6, 'fold'),
        pre(7, 'raise', 100),
        pre(8, 'raise', 500, true),
        ...folds('preflop', 9, 1, 2, 3, 4, 5, 7),
      ],
      results: [{ seat: 8, won_chips: 203 }],
    })
  })
})

function tap_endHere(h: Harness): void {
  tapButton(h, 'End here')
}
