// Thin HTTP client. The only module that knows about URLs and fetch (docs/ARCHITECTURE.md §1).
// Types come from schema.d.ts, generated from openapi.json: `npm run gen:api`.

import type { components } from './schema'

export type Health = components['schemas']['Health']

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/api/v1/health', { signal })
  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${String(response.status)}`)
  }
  return (await response.json()) as Health
}
