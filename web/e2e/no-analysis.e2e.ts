// Capture shows no analysis (ADR-0010; M4a acceptance criterion 4). Structurally, an ESLint rule
// lets src/capture/ import only rules, store, sync and design; this test is the behavioral half:
// on every capture route, the page asks the server for nothing but sync and the pick lists, and
// shows no EV, strategy or opponent output.

import { expect, test } from '@playwright/test'

import { CAPTURE_API, quickHand, startSession, uniqueVenue } from './helpers.ts'

// Words any analysis output would carry. The capture screens contain none of them today, so a
// match means analysis has reached a capture route.
const ANALYSIS = [
  /\bEV\b/,
  /\bequity\b/i,
  /\bstrategy\b/i,
  /\bsolver\b/i,
  /\bexploit/i,
  /\bGTO\b/,
  /\bVPIP\b/,
  /\bPFR\b/,
  /\bwin rate\b/i,
  /\bleak/i,
  /\bmistake/i,
  /\bdecision point/i,
  /\bscor(e|ed|ing)\b/i,
]

test('capture routes ask only for sync and pick lists, and show no analysis (AC4)', async ({
  page,
  baseURL,
}) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))

  const sessionId = await startSession(page, uniqueVenue('No analysis'))
  await quickHand(page, '7c 2d')
  const handId = await page
    .getByRole('link', { name: /^#1/ })
    .getAttribute('href')
    .then((href) => href?.split('/').pop())
  expect(handId).toMatch(/^[0-9a-f-]{36}$/)

  const routes = [
    '/capture',
    '/capture/session/new',
    `/capture/session/${sessionId}`,
    `/capture/session/${sessionId}/settings`,
    `/capture/hand/${String(handId)}`,
    '/capture/attention',
    '/capture/times',
  ]
  for (const route of routes) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const text = await page.locator('body').innerText()
    for (const word of ANALYSIS) {
      expect(text, `${route} shows ${String(word)}`).not.toMatch(word)
    }
  }

  // Every request goes to this server; the API ones only to the capture endpoints.
  expect(requests.length).toBeGreaterThan(0)
  for (const url of requests) {
    const { origin, pathname } = new URL(url)
    if (origin !== baseURL) throw new Error(`a request left the server: ${url}`)
    if (pathname.startsWith('/api/')) expect(CAPTURE_API).toContain(pathname)
  }
  // The sync itself was among them: the test saw the API, not just the static files.
  expect(requests.map((u) => new URL(u).pathname)).toContain('/api/v1/sync')
})
