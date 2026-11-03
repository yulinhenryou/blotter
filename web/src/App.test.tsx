import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('shows the engine version reported by the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({ status: 'ok', engine_version: 'solver 0.0.0 (cards 0.0.0)' }),
        ),
      ),
    )
    render(<App />)
    expect(await screen.findByText('solver 0.0.0 (cards 0.0.0)')).toBeInTheDocument()
  })

  it('says so when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))),
    )
    render(<App />)
    expect(await screen.findByText(/Unavailable/)).toBeInTheDocument()
  })
})
