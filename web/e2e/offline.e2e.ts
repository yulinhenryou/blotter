// Offline capture and sync (M4a acceptance criterion 2), and the JSON export, in Chromium.

import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import {
  quickHand,
  serverHands,
  serviceWorkerActive,
  startSession,
  tap,
  uniqueVenue,
} from './helpers.ts'

/** Load the app and wait until its service worker controls the page (so it can open offline). */
async function installed(page: Page): Promise<void> {
  await page.goto('/capture')
  await serviceWorkerActive(page)
  // The first visit installs the service worker; it controls the pages loaded after it.
  await page.reload()
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
}

test('hands entered offline survive a reload and sync once when back online (AC2)', async ({
  page,
  context,
  request,
}) => {
  await installed(page)
  await context.setOffline(true)

  // A whole session started and two hands entered with no network.
  const sessionId = await startSession(page, uniqueVenue('Offline'))
  await quickHand(page, '7c 2d')
  await quickHand(page, '8c 3d')

  // The app itself loads with no network (from the service worker), and the hands are there.
  await page.reload()
  const handLinks = page.getByRole('link', { name: /^#\d/ })
  await expect(handLinks).toHaveCount(2)
  for (const link of await handLinks.all()) await expect(link).toContainText('Waiting to sync')
  await page.goto('/capture')
  await expect(page.getByText(/waiting to sync/)).toBeVisible()
  expect(await serverHands(request, sessionId)).toEqual([])

  // Back online: the app syncs by itself.
  await context.setOffline(false)
  await expect(page.getByText('All synced')).toBeVisible()
  const first = await serverHands(request, sessionId)
  expect(first.map((h) => h.client_seq)).toEqual([1, 2])

  // Syncing again, and opening the app again (which syncs), stores nothing twice.
  await tap(page, 'Sync now')
  await expect(page.getByText('All synced')).toBeVisible()
  await page.reload()
  await expect(page.getByText('All synced')).toBeVisible()
  const again = await serverHands(request, sessionId)
  expect(again.map((h) => [h.id, h.revision])).toEqual(first.map((h) => [h.id, h.revision]))
})

test("the phone's JSON export is accepted by the server as a sync batch", async ({
  page,
  context,
  request,
}) => {
  await installed(page)
  await context.setOffline(true)
  const sessionId = await startSession(page, uniqueVenue('Export'))
  await quickHand(page, '9h 4s')
  await page.goto('/capture')

  const download = page.waitForEvent('download')
  await tap(page, 'Export unsynced records')
  const batch = JSON.parse(await readFile(await (await download).path(), 'utf-8')) as Record<
    string,
    unknown[]
  >
  // The venue, the session and the hand; posted by the test, not the phone.
  expect([batch.venues?.length, batch.sessions?.length, batch.hands?.length]).toEqual([1, 1, 1])
  const response = await request.post('/api/v1/sync', { data: batch })
  expect(response.ok()).toBe(true)
  const { items } = (await response.json()) as {
    items: { kind: string; outcome: string; issues: unknown[] }[]
  }
  expect(items.map((i) => [i.kind, i.outcome])).toEqual([
    ['venue', 'created'],
    ['session', 'created'],
    ['hand', 'created'],
  ])
  expect(await serverHands(request, sessionId)).toHaveLength(1)

  // The phone, back online, finds the server already holding its records: nothing is doubled.
  await context.setOffline(false)
  await expect(page.getByText('All synced')).toBeVisible()
  expect(await serverHands(request, sessionId)).toHaveLength(1)
})
