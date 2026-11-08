// Thin HTTP client. The only module that knows about URLs and fetch (docs/ARCHITECTURE.md §1).
// Types come from schema.d.ts, generated from openapi.json: `npm run gen:api`.

import type { components } from './schema'

type Schemas = components['schemas']
export type Health = Schemas['Health']

/** The server answered with an HTTP error status. (No answer at all rejects with a TypeError.) */
export class HttpError extends Error {
  readonly status: number

  constructor(what: string, status: number) {
    super(`${what} failed: HTTP ${String(status)}`)
    this.name = 'HttpError'
    this.status = status
  }
}

async function json<T>(what: string, response: Response): Promise<T> {
  if (!response.ok) throw new HttpError(what, response.status)
  return (await response.json()) as T
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  return json<Health>('Health check', await fetch('/api/v1/health', { signal }))
}

/** `POST /api/v1/sync`: the one write path (ADR-0026). */
export async function postSync(batch: Schemas['SyncBatch']): Promise<Schemas['SyncResponse']> {
  const response = await fetch('/api/v1/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  })
  return json<Schemas['SyncResponse']>('Sync', response)
}

export async function fetchVenues(): Promise<Schemas['VenueRecord'][]> {
  return json<Schemas['VenueRecord'][]>('Venues', await fetch('/api/v1/venues'))
}

export async function fetchPlayers(): Promise<Schemas['PlayerRecord'][]> {
  return json<Schemas['PlayerRecord'][]>('Players', await fetch('/api/v1/players'))
}
