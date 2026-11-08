import { act, render, screen } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { routes } from './routes.tsx'

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
}

function serverAnswers(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response)),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('home', () => {
  it('shows the engine version reported by the API', async () => {
    serverAnswers(Response.json({ status: 'ok', engine_version: 'solver 0.0.0 (cards 0.0.0)' }))
    renderAt('/')
    expect(await screen.findByText(/engine solver 0\.0\.0 \(cards 0\.0\.0\)/)).toBeInTheDocument()
  })

  it('says so when the server is not reachable', async () => {
    serverAnswers(new Response(null, { status: 503 }))
    renderAt('/')
    expect(await screen.findByText(/Not reachable/)).toBeInTheDocument()
  })

  it('links to capture', () => {
    serverAnswers(new Response(null, { status: 503 }))
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Capture' })).toHaveAttribute('href', '/capture')
  })
})

describe('capture', () => {
  it('asks the server only for sync and the pick lists (ADR-0010)', async () => {
    globalThis.indexedDB = new IDBFactory()
    const fetch = vi.fn(() => Promise.resolve(Response.json([])))
    vi.stubGlobal('fetch', fetch)
    renderAt('/capture')
    expect(await screen.findByRole('heading', { name: 'Capture' })).toBeInTheDocument()
    expect(await screen.findByText('All synced')).toBeInTheDocument()
    // Nothing is pending, so no sync request: only the venue and player lists are fetched.
    const urls = fetch.mock.calls.map((call: unknown[]) => String(call[0]))
    expect(urls.sort()).toEqual(['/api/v1/players', '/api/v1/venues'])
  })
})

describe('shell', () => {
  it('shows a page for unknown addresses', () => {
    renderAt('/no/such/page')
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument()
  })

  it('marks the app offline and back online as the connection changes', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    renderAt('/capture')
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
    onLine.mockReturnValue(false)
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByText('Offline')).toBeInTheDocument()
    onLine.mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
  })
})
