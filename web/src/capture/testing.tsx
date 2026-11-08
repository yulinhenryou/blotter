// Helpers for the capture screen tests: the app on an in-memory store, a fake server and a clock
// the test moves, and a `tap` that counts taps (docs/CAPTURE.md §5 counts them the same way: one
// touch of a button, a card, a seat or a key).

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { makeRoutes } from '../app/routes.tsx'
import type { Store } from '../store/db.ts'
import { FakeServer } from '../testing/fakeServer.ts'
import { freshStore, T0 } from '../testing/fixtures.ts'
import type { CaptureDeps } from './context.ts'
import { startSession, type NewSession } from './data.ts'

export interface Harness {
  readonly db: Store
  readonly server: FakeServer
  readonly deps: CaptureDeps
  /** Move the clock by some seconds. */
  readonly advance: (seconds: number) => void
  readonly taps: { count: number }
}

export async function harness(): Promise<Harness> {
  const db = await freshStore()
  const server = new FakeServer()
  let time = T0.getTime()
  const deps: CaptureDeps = {
    openDb: () => Promise.resolve(db),
    transport: server,
    now: () => new Date(time),
    // The sample time is drawn at 0.5 of the window: 30 minutes after the session starts.
    uniform: () => 0.5,
  }
  return {
    db,
    server,
    deps,
    advance: (seconds) => {
      time += seconds * 1000
    },
    taps: { count: 0 },
  }
}

/** Render the app at `path`, replacing whatever a previous call rendered. */
export function renderApp(h: Harness, path: string): void {
  cleanup()
  render(
    <RouterProvider router={createMemoryRouter(makeRoutes(h.deps), { initialEntries: [path] })} />,
  )
}

/** One tap on an element, counted. */
export function tap(h: Harness, element: HTMLElement): void {
  h.taps.count += 1
  fireEvent.click(element)
}

/** Tap the button with this name, inside the group or region with `within` as its name. */
export function tapButton(h: Harness, name: string | RegExp, inside?: string): void {
  const scope = inside === undefined ? screen : within(screen.getByRole('group', { name: inside }))
  tap(h, scope.getByRole('button', { name }))
}

/** Tap a sequence of number-pad keys ("30✓"), each counted. */
export function typeOnPad(h: Harness, pad: string, keys: string): void {
  const group = within(screen.getByRole('group', { name: pad }))
  for (const key of keys) {
    tap(h, group.getByRole('button', { name: key === '✓' ? 'OK' : key }))
  }
}

/** Tap cards in a picker ("As Kh"), each counted. */
export function tapCards(h: Harness, picker: string, cards: string): void {
  const region = within(screen.getByRole('region', { name: picker }))
  for (const card of cards.split(' ')) tap(h, region.getByRole('button', { name: cardLabel(card) }))
}

const RANK: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten' }
const SUIT: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }

function cardLabel(card: string): string {
  const rank = card.slice(0, 1)
  return `${RANK[rank] ?? rank} of ${SUIT[card.slice(1)] ?? ''}`
}

/** Tap a seat on the table map. */
export function tapSeat(h: Harness, seat: number): void {
  tap(h, screen.getByRole('button', { name: new RegExp(`^Seat ${String(seat)}(,|$)`) }))
}

/** Start a session directly in the store (the New session screen has its own test). */
export async function seedSession(h: Harness, input: Partial<NewSession> = {}): Promise<string> {
  const session = await startSession(
    h.db,
    {
      venue: { name: 'Casino', kind: 'live' },
      smallBlind: 1,
      bigBlind: 3,
      straddles: [],
      ante: null,
      rake: { percent: 5, capChips: 10, noFlopNoDrop: true },
      tableSize: 9,
      heroSeat: 7,
      emptySeats: [],
      buyIn: 300,
      startedAt: h.deps.now(),
      ...input,
    },
    h.deps.now(),
    h.deps.uniform,
  )
  return session.id
}

/** Tap "New hand" on the session screen and wait for the hand screen. */
export async function newHand(h: Harness): Promise<void> {
  tap(h, await screen.findByRole('button', { name: 'New hand' }))
  await screen.findByRole('group', { name: "Hero's position" })
}

/** Tap "Save" and wait until the session screen says so. */
export async function save(h: Harness): Promise<void> {
  tap(h, screen.getByRole('button', { name: 'Save' }))
  await screen.findByText(/saved\./)
}

/**
 * Retry an assertion until it holds (or 5 s pass). Background work — a sync after a save, a draft
 * write — takes a machine-dependent number of ticks, so tests wait for its outcome, never for a
 * fixed number of ticks.
 */
export async function eventually(check: () => void | Promise<void>): Promise<void> {
  await waitFor(check, { timeout: 5000 })
}

/** Let pending store writes and effects finish. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
