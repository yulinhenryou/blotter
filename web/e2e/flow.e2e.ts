// The capture flow on an iPhone viewport (WebKit), against the real API.

import { expect, test } from '@playwright/test'

import {
  newHand,
  save,
  serverHands,
  startSession,
  tap,
  tapCards,
  tapSeat,
  typeOnPad,
  uniqueVenue,
} from './helpers.ts'

test('an incomplete hand is saved in the same flow and reaches the server (AC3)', async ({
  page,
  request,
}) => {
  // Blinds 1/3; hero in the big blind (seat 7: button 5, SB 6). Folds to the button, who raises
  // to 9; the SB folds; hero calls; checked down. The button's cards are unknown and its stack
  // is about 250. The same hand as the AC3 screen test (src/capture/screens.test.tsx).
  const sessionId = await startSession(page, uniqueVenue('Flow'))
  await newHand(page)
  await tap(page, 'BB', "Hero's position")
  await tapCards(page, "Hero's cards", 'Td 9d')
  // The stack is prefilled from the buy-in, 300; one tap confirms it.
  await typeOnPad(page, "Hero's stack", '✓')
  await tapSeat(page, 5)
  await tap(page, 'Raise', 'Actions')
  await tap(page, '3 bb', 'Sizes')
  await tap(page, 'Fold', 'Actions')
  await tap(page, 'Call 9', 'Actions')
  await tapCards(page, 'Flop', '2c 5h Js')
  await tap(page, 'Check', 'Actions')
  await tap(page, 'Check', 'Actions')
  await tapCards(page, 'Turn', 'Qd')
  await tap(page, 'Check', 'Actions')
  await tap(page, 'Check', 'Actions')
  await tapCards(page, 'River', '3s')
  await tap(page, 'Check', 'Actions')
  await tap(page, 'Check', 'Actions')
  await tap(page, 'Unknown')
  await tap(page, 'Seat 5 · BTN: enter stack')
  // A villain's stack is approximate unless the ≈ key is turned off.
  await typeOnPad(page, 'Seat 5 · BTN: stack', '250✓')
  await tap(page, 'Seat 7 · BB', 'Main pot winner')
  await save(page)

  // The phone sends it after the save; the server checks it and stores it.
  await expect(page.getByRole('link', { name: /^#1/ })).toContainText('Synced')
  const [hand, ...others] = await serverHands(request, sessionId)
  expect(others).toEqual([])
  expect(hand).toMatchObject({
    schema_version: 2,
    revision: 1,
    hero_seat: 7,
    board: { flop: ['2c', '5h', 'Js'], turn: 'Qd', river: '3s' },
    // Pot 9 + 9 + 1 = 19; rake 5 % = 0.95, rounded down to 0: hero wins 19.
    results: [{ seat: 7, won_chips: 19 }],
  })
  expect((hand?.seats as Record<string, unknown>[]).find((s) => s.seat === 5)).toEqual({
    seat: 5,
    player_id: null,
    hole_cards: null,
    showed: false,
    starting_stack_chips: 250,
    stack_approximate: true,
  })
})
