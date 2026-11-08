import { useEffect, useState } from 'react'

import { fetchHealth } from '../api/client.ts'
import { ButtonLink } from '../design/Button.tsx'
import styles from './Home.module.css'

type ServerStatus =
  { kind: 'loading' } | { kind: 'ready'; version: string } | { kind: 'error'; message: string }

export function Home() {
  const [server, setServer] = useState<ServerStatus>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then((health) => {
        setServer({ kind: 'ready', version: health.engine_version })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setServer({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      })
    return () => {
      controller.abort()
    }
  }, [])

  return (
    <>
      <h1 className={styles.title}>{__APP_NAME__}</h1>
      <p className={styles.tagline}>{__APP_TAGLINE__}</p>
      <ButtonLink to="/capture" variant="primary">
        Capture
      </ButtonLink>
      <dl className={styles.status}>
        <dt>Server</dt>
        <dd className="numeric" aria-live="polite">
          {server.kind === 'loading' && 'Connecting…'}
          {server.kind === 'ready' && `Connected · engine ${server.version}`}
          {server.kind === 'error' && `Not reachable (${server.message})`}
        </dd>
      </dl>
      <p className={styles.note}>Early development. For post-game review only.</p>
    </>
  )
}
