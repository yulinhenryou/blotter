// Installability of the production build (M4a acceptance criterion 5, as reworded by D5):
// a web app manifest with the required fields and a registered service worker. Chromium only:
// it can also report the browser's own verdict.

import { expect, test } from '@playwright/test'

import { serviceWorkerActive } from './helpers.ts'

test("the production build meets Chrome's installability criteria (AC5)", async ({
  page,
  request,
}) => {
  await page.goto('/')

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).not.toBeNull()
  const response = await request.get(new URL(String(href), page.url()).pathname)
  expect(response.ok()).toBe(true)
  const manifest = (await response.json()) as {
    name?: string
    short_name?: string
    start_url?: string
    display?: string
    prefer_related_applications?: boolean
    icons?: { src: string; sizes: string; type?: string }[]
  }
  expect(manifest.name).toBeTruthy()
  expect(manifest.short_name).toBeTruthy()
  expect(manifest.start_url).toBe('/')
  expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display)
  expect(manifest.prefer_related_applications ?? false).toBe(false)
  const sizes = (manifest.icons ?? []).flatMap((icon) => icon.sizes.split(' '))
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  for (const icon of manifest.icons ?? []) {
    expect((await request.get(new URL(icon.src, page.url()).pathname)).ok()).toBe(true)
  }

  // A registered, activated service worker.
  await serviceWorkerActive(page)
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(new URL(scope).pathname).toBe('/')

  // Chrome's own check (DevTools protocol): no installability errors.
  const cdp = await page.context().newCDPSession(page)
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[]
  }
  expect(installabilityErrors).toEqual([])
})
