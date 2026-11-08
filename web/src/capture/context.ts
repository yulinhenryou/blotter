// What every capture screen needs: the open store, the clock, the sync function and a change
// counter. The dependencies are passed in (`CaptureDeps`) so tests can use an in-memory database,
// a fake server and a fixed clock.

import { createContext, useContext, useEffect, useState } from 'react'

import { openStore, type Store } from '../store/db.ts'
import { cryptoUniform } from '../store/samples.ts'
import { httpTransport, type SyncReport, type Transport } from '../sync/sync.ts'

export interface CaptureDeps {
  readonly openDb: () => Promise<Store>
  readonly transport: Transport
  readonly now: () => Date
  /** Uniform draws in [0, 1) for the random-sample times. */
  readonly uniform: () => number
}

export const defaultDeps: CaptureDeps = {
  openDb: () => openStore(),
  transport: httpTransport,
  now: () => new Date(),
  uniform: cryptoUniform,
}

export interface Capture {
  readonly db: Store
  readonly deps: CaptureDeps
  /** Increases whenever the store changes; screens reload what they show when it does. */
  readonly version: number
  /** Tell the screens that the store changed. */
  readonly changed: () => void
  /** Sync now; resolves when the run (and any queued one) is over. */
  readonly sync: () => Promise<SyncReport>
  readonly report: SyncReport | null
  readonly syncing: boolean
}

export const CaptureContext = createContext<Capture | null>(null)

export function useCapture(): Capture {
  const capture = useContext(CaptureContext)
  if (capture === null) throw new Error('useCapture outside <CaptureRoot>')
  return capture
}

/**
 * Load something from the store, again whenever it changes. `load` must be stable (wrap it in
 * `useCallback`); `undefined` until the first load finishes.
 */
export function useLoad<T>(load: (db: Store) => Promise<T>): T | undefined {
  const { db, version } = useCapture()
  const [value, setValue] = useState<{ value: T } | undefined>(undefined)
  useEffect(() => {
    let current = true
    void load(db).then((v) => {
      if (current) setValue({ value: v })
    })
    return () => {
      current = false
    }
  }, [db, load, version])
  return value?.value
}

/** The clock, read again every 30 seconds so "due" lines change by themselves. */
export function useNow(now: () => Date): Date {
  const [time, setTime] = useState(now)
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(now())
    }, 30_000)
    return () => {
      clearInterval(timer)
    }
  }, [now])
  return time
}
