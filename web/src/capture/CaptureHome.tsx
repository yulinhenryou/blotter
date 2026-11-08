// Capture home (docs/CAPTURE.md §1.1): the open session, past sessions, the sync state with
// "Sync now", and links to entry times and the export of unsynced records. Capture routes never
// request or show analysis (ADR-0010).

import { useCallback } from 'react'
import { Link } from 'react-router'

import { Button, ButtonLink } from '../design/Button.tsx'
import styles from './capture.module.css'
import { useCapture, useLoad } from './context.ts'
import { describeCounts, listSessions, listVenues, syncCounts, unsyncedBatch } from './data.ts'
import { sessionTitle } from './format.ts'

export function CaptureHome() {
  const { db, sync, syncing, report, deps } = useCapture()
  const load = useCallback(
    async () => ({
      sessions: await listSessions(db),
      venues: await listVenues(db),
      counts: await syncCounts(db),
    }),
    [db],
  )
  const data = useLoad(load)
  if (data === undefined) return <p aria-busy="true">Loading…</p>

  const venues = new Map(data.venues.map((v) => [v.id, v]))
  const open = data.sessions.find((s) => s.ended_at == null) ?? null
  const past = data.sessions.filter((s) => s !== open)
  const attention = data.counts.conflict + data.counts.invalid

  const exportUnsynced = async () => {
    const batch = await unsyncedBatch(db)
    const blob = new Blob([JSON.stringify(batch, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `unsynced-${deps.now().toISOString().slice(0, 19).replaceAll(':', '-')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <h1 className={styles.heading}>Capture</h1>

      <section className={styles.section} aria-labelledby="open-session">
        <h2 id="open-session" className={styles.sectionTitle}>
          Session
        </h2>
        {open === null ? (
          <p className={styles.muted}>No open session.</p>
        ) : (
          <div className={styles.spread}>
            <span>{sessionTitle(open, venues.get(open.venue_id ?? ''))}</span>
            <ButtonLink to={`session/${open.id}`} variant="primary">
              Continue
            </ButtonLink>
          </div>
        )}
        <div className={styles.bar}>
          <ButtonLink to="session/new" variant={open === null ? 'primary' : 'secondary'}>
            New session
          </ButtonLink>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sync">
        <h2 id="sync" className={styles.sectionTitle}>
          Sync
        </h2>
        <div className={styles.spread}>
          <span role="status">
            {attention > 0 ? (
              <>
                {describeCounts(data.counts)} · <Link to="attention">Needs attention</Link>
              </>
            ) : (
              describeCounts(data.counts)
            )}
          </span>
          <Button
            disabled={syncing}
            onClick={() => {
              void sync()
            }}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
        {report?.error != null && (
          <p className={styles.muted}>
            Server not reached: {report.error}. Hands wait on the phone.
          </p>
        )}
      </section>

      {past.length > 0 && (
        <section className={styles.section} aria-labelledby="past">
          <h2 id="past" className={styles.sectionTitle}>
            Past sessions
          </h2>
          <ul className={styles.list}>
            {past.map((s) => (
              <li key={s.id}>
                <Link className={styles.item} to={`session/${s.id}`}>
                  {sessionTitle(s, venues.get(s.venue_id ?? ''))}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.bar}>
        <ButtonLink to="times" variant="quiet">
          Entry times
        </ButtonLink>
        <Button
          variant="quiet"
          onClick={() => {
            void exportUnsynced()
          }}
        >
          Export unsynced records
        </Button>
      </div>
    </>
  )
}
