// The frame of the capture routes: opens the phone's store, asks the browser to keep it, and syncs
// when the app opens and whenever it comes back online (docs/plans/M4a.md §1.4). Screens get the
// store and the sync function from the context.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router'

import type { Persistence, Store } from '../store/db.ts'
import { autoSync, serialized, syncOnce, type SyncReport } from '../sync/sync.ts'
import { CaptureContext, defaultDeps, type Capture, type CaptureDeps } from './context.ts'

export function CaptureRoot({ deps = defaultDeps }: { deps?: CaptureDeps }) {
  const [db, setDb] = useState<Store | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [report, setReport] = useState<SyncReport | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [storage, setStorage] = useState<Persistence | null>(null)

  useEffect(() => {
    let current = true
    deps
      .openDb()
      .then((opened) => {
        if (current) setDb(opened)
        else opened.close()
      })
      .catch((error: unknown) => {
        if (current) setFailed(error instanceof Error ? error.message : String(error))
      })
    void deps.persist().then((answer) => {
      if (current) setStorage(answer)
    })
    return () => {
      current = false
    }
  }, [deps])

  const changed = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  const sync = useMemo(() => {
    if (db === null) return null
    const run = serialized(() => syncOnce(db, deps.transport, deps.now))
    return async () => {
      setSyncing(true)
      try {
        const result = await run()
        setReport(result)
        return result
      } finally {
        setSyncing(false)
        changed()
      }
    }
  }, [db, deps, changed])

  useEffect(() => (sync === null ? undefined : autoSync(sync)), [sync])

  const capture = useMemo<Capture | null>(
    () =>
      db === null || sync === null
        ? null
        : { db, deps, version, changed, sync, report, syncing, storage },
    [db, deps, version, changed, sync, report, syncing, storage],
  )

  if (failed !== null) {
    return (
      <p role="alert">
        The phone&apos;s storage could not be opened ({failed}). Hands cannot be saved until it can.
      </p>
    )
  }
  if (capture === null) return <p aria-busy="true">Opening…</p>
  return (
    <CaptureContext.Provider value={capture}>
      <Outlet />
    </CaptureContext.Provider>
  )
}
