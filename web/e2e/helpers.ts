// Helpers for the end-to-end tests: they tap the screens by the names a screen reader would hear,
// as the Vitest screen tests do (src/capture/testing.tsx), and read the real server's API.

import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

/** The only API paths the capture routes may call (ADR-0010; M4a plan, Task 7, AC4). */
export const CAPTURE_API = ['/api/v1/sync', '/api/v1/venues', '/api/v1/players', '/api/v1/health']

/** A venue name no other test uses, so tests never depend on each other's data. */
export function uniqueVenue(prefix: string): string {
  return `${prefix} ${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`
}

function group(page: Page, name: string): Locator {
  return page.getByRole('group', { name, exact: true })
}

/** Tap the button `name`, inside the group `inside` when given. */
export async function tap(page: Page, name: string, inside?: string): Promise<void> {
  const scope = inside === undefined ? page : group(page, inside)
  await scope.getByRole('button', { name, exact: true }).click()
}

/** Tap number-pad keys ("250✓"). */
export async function typeOnPad(page: Page, pad: string, keys: string): Promise<void> {
  for (const key of keys) await tap(page, key === '✓' ? 'OK' : key, pad)
}

const RANK: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten' }
const SUIT: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }

/** Tap cards in a picker ("Td 9d"). */
export async function tapCards(page: Page, picker: string, cards: string): Promise<void> {
  const region = page.getByRole('region', { name: picker, exact: true })
  for (const card of cards.split(' ')) {
    const rank = card.slice(0, 1)
    const name = `${RANK[rank] ?? rank} of ${SUIT[card.slice(1)] ?? ''}`
    await region.getByRole('button', { name, exact: true }).click()
  }
}

/** Tap a seat on the table map. */
export async function tapSeat(page: Page, seat: number): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^Seat ${String(seat)}(,|$)`) }).click()
}

/**
 * Start a session through the New session screen: blinds 1/3, hero in seat 7 of 9, buy-in 300,
 * the default rake rule (5 %, no cap, no flop no drop). Returns the session's id.
 */
export async function startSession(page: Page, venue: string): Promise<string> {
  await page.goto('/capture/session/new')
  // Selects by role: a <label> around a <select> also holds the options' text.
  await page
    .getByRole('combobox', { name: 'Venue', exact: true })
    .selectOption({ label: 'New venue…' })
  await page.getByLabel('Venue name').fill(venue)
  await page.getByLabel('Small blind').fill('1')
  await page.getByLabel('Big blind').fill('3')
  await page.getByRole('combobox', { name: "Hero's seat" }).selectOption('7')
  await page.getByLabel('Buy-in (optional)').fill('300')
  await tap(page, 'Start')
  await page.waitForURL(/\/capture\/session\/[0-9a-f-]{36}$/)
  const id = /[0-9a-f-]{36}$/.exec(page.url())?.[0]
  if (id === undefined) throw new Error(`no session id in ${page.url()}`)
  return id
}

/** Tap "New hand" on the session screen and wait for the hand screen. */
export async function newHand(page: Page): Promise<void> {
  await tap(page, 'New hand')
  await expect(group(page, "Hero's position")).toBeVisible()
}

/** Tap "Save" and wait until the session screen says so. */
export async function save(page: Page): Promise<void> {
  await tap(page, 'Save')
  await expect(page.getByText(/^Hand \d+ saved\.$/)).toBeVisible()
}

/** Hero under the gun folds first: "End here", Save (H2 of CAPTURE.md §5 without the sample). */
export async function quickHand(page: Page, cards: string): Promise<void> {
  await newHand(page)
  await tap(page, 'UTG', "Hero's position")
  await tapCards(page, "Hero's cards", cards)
  await typeOnPad(page, "Hero's stack", '✓')
  await tap(page, 'Fold', 'Actions')
  await tap(page, 'End here')
  await save(page)
}

/** Wait until the page's service worker is active (`ready` resolves while it may still be activating). */
export async function serviceWorkerActive(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const worker = (await navigator.serviceWorker.ready).active
    if (worker === null || worker.state === 'activated') return
    await new Promise<void>((resolve) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') resolve()
      })
    })
  })
}

/** The hands the server holds for a session, read through the API. */
export async function serverHands(
  request: APIRequestContext,
  sessionId: string,
): Promise<Record<string, unknown>[]> {
  const response = await request.get(`/api/v1/sessions/${sessionId}/hands`)
  if (response.status() === 404) return []
  expect(response.ok()).toBe(true)
  return (await response.json()) as Record<string, unknown>[]
}
