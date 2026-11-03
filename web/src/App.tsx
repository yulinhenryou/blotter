import { useEffect, useState } from 'react'

import { fetchHealth } from './api/client.ts'
import styles from './App.module.css'

type EngineStatus =
  { kind: 'loading' } | { kind: 'ready'; version: string } | { kind: 'error'; message: string }

export default function App() {
  const [engine, setEngine] = useState<EngineStatus>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then((health) => {
        setEngine({ kind: 'ready', version: health.engine_version })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setEngine({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      })
    return () => {
      controller.abort()
    }
  }, [])

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{__APP_NAME__}</h1>
      <p className={styles.tagline}>{__APP_TAGLINE__}</p>
      <dl className={styles.status}>
        <dt>Engine</dt>
        <dd className="numeric" aria-live="polite">
          {engine.kind === 'loading' && 'Connecting…'}
          {engine.kind === 'ready' && engine.version}
          {engine.kind === 'error' && `Unavailable (${engine.message})`}
        </dd>
      </dl>
      <p className={styles.note}>Early development. For post-game review only.</p>
    </main>
  )
}
