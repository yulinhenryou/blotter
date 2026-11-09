// The capture screens around the hand entry: new session, drafts and their entry times, undo and
// "fold to", incomplete hands (acceptance criterion 3), sync and "Needs attention", conflicts,
// editing a saved hand, known players, entry times and the export.

import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getEntry, listEntries } from '../store/records.ts'
import { listTimings } from '../store/timings.ts'
import type { RecordTypes } from '../store/types.ts'
import type { SyncBatch } from '../sync/batch.ts'
import {
  eventually,
  harness,
  newHand,
  renderApp,
  save,
  seedSession,
  settle,
  tap,
  tapButton,
  tapCards,
  tapSeat,
  typeOnPad,
  type Harness,
} from './testing.tsx'

afterEach(() => {
  vi.restoreAllMocks()
})

async function hands(h: Harness): Promise<RecordTypes['hand'][]> {
  return (await listEntries(h.db, 'hand')).flatMap((e) => (e.kind === 'hand' ? [e.record] : []))
}

/** H2 of CAPTURE.md §5 without the sample: hero UTG folds first, End here, Save. */
async function quickHand(h: Harness, cards = '7c 2d'): Promise<void> {
  await newHand(h)
  tapButton(h, 'UTG', "Hero's position")
  tapCards(h, "Hero's cards", cards)
  typeOnPad(h, "Hero's stack", '✓')
  tapButton(h, 'Fold', 'Actions')
  tapButton(h, 'End here')
  await save(h)
}

describe('new session', () => {
  it('starts a session with the defaults, then offers its choices for the next one', async () => {
    const h = await harness()
    renderApp(h, '/capture')
    tap(h, await screen.findByRole('link', { name: 'New session' }))
    fireEvent.change(await screen.findByLabelText('Venue name'), { target: { value: 'Casino' } })
    fireEvent.change(screen.getByLabelText('Small blind'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Big blind'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText("Hero's seat"), { target: { value: '4' } })
    tapButton(h, 'Start')
    // The first random-sample time is drawn: half-way through 20–40 minutes.
    expect(await screen.findByText(/Next random sample: after/)).toBeInTheDocument()
    const sessions = (await listEntries(h.db, 'session')).flatMap((e) =>
      e.kind === 'session' ? [e.record] : [],
    )
    expect(sessions).toMatchObject([{ small_blind_chips: 2, big_blind_chips: 5, ended_at: null }])

    tap(h, screen.getByRole('link', { name: /Settings/ }))
    tap(h, await screen.findByRole('button', { name: 'End session' }))
    expect(await screen.findByRole('link', { name: 'New session' })).toBeInTheDocument()
    tap(h, screen.getByRole('link', { name: 'New session' }))
    expect(await screen.findByLabelText('Venue')).toHaveDisplayValue('Casino')
    expect(screen.getByLabelText('Small blind')).toHaveValue('2')
    expect(screen.getByLabelText('Big blind')).toHaveValue('5')
    expect(screen.getByLabelText("Hero's seat")).toHaveValue('4')
  })

  it('refuses blinds out of order', async () => {
    const h = await harness()
    renderApp(h, '/capture/session/new')
    fireEvent.change(await screen.findByLabelText('Venue name'), { target: { value: 'Casino' } })
    fireEvent.change(screen.getByLabelText('Small blind'), { target: { value: '5' } })
    tapButton(h, 'Start')
    expect(screen.getByRole('alert')).toHaveTextContent('larger than the big blind')
  })
})

describe('drafts', () => {
  it('keeps a hand left half-entered, resumes it at its step and marks it interrupted', async () => {
    const h = await harness()
    const sessionId = await seedSession(h)
    renderApp(h, `/capture/session/${sessionId}`)
    await newHand(h)
    tapButton(h, 'BTN', "Hero's position")
    tapCards(h, "Hero's cards", 'As Kh')
    typeOnPad(h, "Hero's stack", '✓')
    tapButton(h, 'Raise', 'Actions')
    tapButton(h, '5 bb', 'Sizes')
    tapButton(h, 'Close')
    const link = await screen.findByRole('link', { name: /#1/ })
    expect(link).toHaveTextContent('Draft')
    expect(link).toHaveTextContent('BTN')

    tap(h, link)
    // Back at the actions, with UTG's raise in: seat 2 is to act.
    expect(await screen.findByLabelText('Hand so far')).toHaveTextContent('Seat 2 · UTG+1')
    await eventually(async () => {
      const [timing] = await listTimings(h.db)
      expect(timing).toMatchObject({ interrupted: true, savedAt: null })
    })
  })

  it('discards a draft', async () => {
    const h = await harness()
    const sessionId = await seedSession(h)
    renderApp(h, `/capture/session/${sessionId}`)
    await newHand(h)
    tapButton(h, 'Discard draft')
    expect(await screen.findByText('No hands yet.')).toBeInTheDocument()
  })
})

describe('the action pad', () => {
  it('undoes the last action', async () => {
    const h = await harness()
    renderApp(h, `/capture/session/${await seedSession(h)}`)
    await newHand(h)
    tapButton(h, 'BTN', "Hero's position")
    tapCards(h, "Hero's cards", 'As Kh')
    typeOnPad(h, "Hero's stack", '✓')
    tapButton(h, 'Fold', 'Actions')
    expect(screen.getByLabelText('Hand so far')).toHaveTextContent('Seat 2 · UTG+1')
    tapButton(h, 'Undo')
    expect(screen.getByLabelText('Hand so far')).toHaveTextContent('Seat 1 · UTG')
  })

  it('says why a seat past hero cannot be folded to', async () => {
    const h = await harness()
    renderApp(h, `/capture/session/${await seedSession(h)}`)
    await newHand(h)
    tapButton(h, 'BTN', "Hero's position")
    tapCards(h, "Hero's cards", 'As Kh')
    typeOnPad(h, "Hero's stack", '✓')
    tapSeat(h, 9)
    expect(screen.getByRole('alert')).toHaveTextContent('hero acts before that seat')
  })

  it('keeps the confirm key off for a raise below the minimum, and says why', async () => {
    const h = await harness()
    renderApp(h, `/capture/session/${await seedSession(h)}`)
    await newHand(h)
    tapButton(h, 'BTN', "Hero's position")
    tapCards(h, "Hero's cards", 'As Kh')
    typeOnPad(h, "Hero's stack", '✓')
    tapButton(h, 'Raise', 'Actions')
    typeOnPad(h, 'Raise to', '5')
    const pad = within(screen.getByRole('group', { name: 'Raise to' }))
    expect(pad.getByText('Minimum raise: to 6')).toBeInTheDocument()
    expect(pad.getByRole('button', { name: 'OK' })).toBeDisabled()
  })
})

describe('incomplete hands (acceptance criterion 3)', () => {
  it('saves a showdown with villain cards unknown and approximate stacks', async () => {
    // Blinds 1/3; hero BB (seat 7, button 5, SB 6). Folds to the button, who raises to 9; SB
    // folds; hero calls. Board dealt, checked down. Button's cards unknown, stack ≈ 250.
    const h = await harness()
    renderApp(h, `/capture/session/${await seedSession(h)}`)
    await newHand(h)
    tapButton(h, 'BB', "Hero's position")
    tapCards(h, "Hero's cards", 'Td 9d')
    typeOnPad(h, "Hero's stack", '✓')
    tapSeat(h, 5)
    tapButton(h, 'Raise', 'Actions')
    tapButton(h, '3 bb', 'Sizes')
    tapButton(h, 'Fold', 'Actions')
    tapButton(h, 'Call 9', 'Actions')
    tapCards(h, 'Flop', '2c 5h Js')
    tapButton(h, 'Check', 'Actions')
    tapButton(h, 'Check', 'Actions')
    tapCards(h, 'Turn', 'Qd')
    tapButton(h, 'Check', 'Actions')
    tapButton(h, 'Check', 'Actions')
    tapCards(h, 'River', '3s')
    tapButton(h, 'Check', 'Actions')
    tapButton(h, 'Check', 'Actions')
    tapButton(h, 'Unknown')
    tapButton(h, 'Seat 5 · BTN: enter stack')
    typeOnPad(h, 'Seat 5 · BTN: stack', '250✓')
    tapButton(h, 'Seat 7 · BB', 'Main pot winner')
    await save(h)

    const [hand] = await hands(h)
    expect(hand?.seats.find((s) => s.seat === 5)).toEqual({
      seat: 5,
      player_id: null,
      hole_cards: null,
      showed: false,
      starting_stack_chips: 250,
      stack_approximate: true,
    })
    // Pot 9 + 9 + 1 = 19; rake 5 % = 0.95 → 0: hero wins 19.
    expect(hand?.results).toEqual([{ seat: 7, won_chips: 19 }])
  })
})

describe('sync', () => {
  it("says whether the browser keeps the phone's storage", async () => {
    const h = await harness()
    renderApp(h, '/capture')
    expect(await screen.findByText(/^Storage: the browser may clear it/)).toBeInTheDocument()

    const kept = await harness()
    renderApp(
      { ...kept, deps: { ...kept.deps, persist: () => Promise.resolve('persisted') } },
      '/capture',
    )
    expect(await screen.findByText('Storage: kept by the browser.')).toBeInTheDocument()
  })

  it('sends a saved hand at once, and reports when the server cannot be reached', async () => {
    const h = await harness()
    const sessionId = await seedSession(h)
    renderApp(h, `/capture/session/${sessionId}`)
    await quickHand(h)
    await eventually(() => {
      expect(h.server.stored.hand.size).toBe(1)
    })

    h.server.down = true
    await quickHand(h, '8c 3d')
    await settle()
    renderApp(h, '/capture')
    expect(await screen.findByText('1 waiting to sync')).toBeInTheDocument()

    h.server.down = false
    tapButton(h, 'Sync now')
    expect(await screen.findByText('All synced')).toBeInTheDocument()
    expect(h.server.stored.hand.size).toBe(2)
  })

  it('lists a refused hand under "Needs attention" with the issue in words; an edit resends it', async () => {
    const h = await harness()
    const sessionId = await seedSession(h)
    h.server.refuse = (kind, record) =>
      kind === 'hand' && record.revision === 1
        ? [{ path: ['actions', 2, 'kind'], code: 'example', message: 'refused for the test' }]
        : []
    renderApp(h, `/capture/session/${sessionId}`)
    await quickHand(h)
    expect(await screen.findByText('Refused')).toBeInTheDocument()

    renderApp(h, '/capture')
    tap(h, await screen.findByRole('link', { name: 'Needs attention' }))
    expect(await screen.findByText('Action 3, kind: refused for the test')).toBeInTheDocument()
    tap(h, screen.getByRole('link', { name: 'Hand #1' }))
    expect(await screen.findByRole('alert', { name: 'Refused by the server' })).toBeInTheDocument()

    // Change why it was logged and save again: revision 2 goes out and is accepted.
    tapButton(h, 'Routine', 'Why logged')
    await save(h)
    await eventually(async () => {
      const entry = (await listEntries(h.db, 'hand'))[0]
      expect(entry?.record.revision).toBe(2)
      expect(entry?.state.status).toBe('synced')
    })
  })

  it('keeps the phone version of a hand in conflict', async () => {
    const h = await harness()
    const sessionId = await seedSession(h)
    renderApp(h, `/capture/session/${sessionId}`)
    await quickHand(h)
    const [hand] = await hands(h)
    if (hand === undefined) throw new Error('no hand')
    // The first sync must be over before the server's copy is replaced.
    await eventually(async () => {
      expect((await getEntry(h.db, hand.id))?.state.status).toBe('synced')
    })
    // Another device stored other content at the same revision; the phone edits and resends.
    h.server.stored.hand.set(hand.id, { ...hand, revision: 2, record_reason: 'routine' })
    tap(h, await screen.findByRole('link', { name: /#1/ }))
    // The edit gets revision 2, which the server already holds with other content.
    await screen.findByRole('group', { name: 'Why logged' })
    tapButton(h, 'Random sample', 'Why logged')
    await save(h)
    await eventually(async () => {
      expect((await getEntry(h.db, hand.id))?.state.status).toBe('conflict')
    })

    renderApp(h, '/capture/attention')
    tap(h, await screen.findByRole('button', { name: 'Keep mine' }))
    await eventually(async () => {
      const entry = await getEntry(h.db, hand.id)
      expect(entry?.state.status).toBe('synced')
      expect(entry?.record.revision).toBe(3)
    })
    expect(h.server.stored.hand.get(hand.id)).toMatchObject({
      revision: 3,
      record_reason: 'random_sample',
    })
  })
})

describe('known players and the next hand', () => {
  it("names a seat's player, keeps it for the session and prefills hero's stack", async () => {
    const h = await harness()
    renderApp(h, `/capture/session/${await seedSession(h)}`)
    await newHand(h)
    tapButton(h, 'Name a player', 'Tap a seat to')
    tapSeat(h, 3)
    fireEvent.change(screen.getByLabelText('New nickname'), { target: { value: 'Grinder' } })
    tapButton(h, 'Add')
    expect(await screen.findByRole('button', { name: /^Seat 3,.*Grinder/ })).toBeInTheDocument()
    // Hero on the button; seats 1–6 fold, hero raises to 9, both blinds fold.
    tapButton(h, 'BTN', "Hero's position")
    tapCards(h, "Hero's cards", 'As Kh')
    typeOnPad(h, "Hero's stack", '✓')
    tapButton(h, 'Fold', 'Actions')
    tapButton(h, 'Fold', 'Actions')
    tapButton(h, 'Fold', 'Actions')
    tapButton(h, 'Fold', 'Actions')
    tapButton(h, 'Fold', 'Actions')
    tapButton(h, 'Fold', 'Actions')
    tapButton(h, 'Raise', 'Actions')
    tapButton(h, '3 bb', 'Sizes')
    tapButton(h, 'Fold', 'Actions')
    tapButton(h, 'Fold', 'Actions')
    // Hero wins the blinds: 1 + 3 = 4 (no flop, no rake) and gets 6 back: 300 + 4 = 304.
    await save(h)
    const [hand] = await hands(h)
    const players = (await listEntries(h.db, 'player')).flatMap((e) =>
      e.kind === 'player' ? [e.record] : [],
    )
    expect(players.map((p) => p.display_name)).toEqual(['Grinder'])
    expect(hand?.seats.find((s) => s.seat === 3)?.player_id).toBe(players[0]?.id)

    await newHand(h)
    // The player names load apart from the hand, so they may show a moment later.
    expect(await screen.findByRole('button', { name: /^Seat 3,.*Grinder/ })).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: "Hero's stack" })).getByLabelText(
        "Hero's stack amount",
      ),
    ).toHaveTextContent('304')
  })
})

describe('entry times and export', () => {
  it('lists entry times with the median of uninterrupted entries', async () => {
    const h = await harness()
    renderApp(h, `/capture/session/${await seedSession(h)}`)
    await newHand(h)
    h.advance(45)
    tapButton(h, 'UTG', "Hero's position")
    tapCards(h, "Hero's cards", '7c 2d')
    typeOnPad(h, "Hero's stack", '✓')
    tapButton(h, 'Fold', 'Actions')
    tapButton(h, 'End here')
    await save(h)
    renderApp(h, '/capture/times')
    expect(await screen.findByText('Median of 1 uninterrupted entries: 45 s')).toBeInTheDocument()
  })

  it('exports unsynced records as a sync batch', async () => {
    const h = await harness()
    h.server.down = true
    renderApp(h, `/capture/session/${await seedSession(h)}`)
    await quickHand(h)
    const blobs: Blob[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (b: Blob) => {
        blobs.push(b)
        return 'blob:test'
      },
      revokeObjectURL: () => undefined,
    })
    renderApp(h, '/capture')
    tap(h, await screen.findByRole('button', { name: 'Export unsynced records' }))
    await eventually(() => {
      expect(blobs).toHaveLength(1)
    })
    vi.unstubAllGlobals()
    const [blob] = blobs
    if (blob === undefined) throw new Error('nothing exported')
    const batch = JSON.parse(await blob.text()) as SyncBatch
    expect([batch.venues.length, batch.sessions.length, batch.hands.length]).toEqual([1, 1, 1])
  })
})
