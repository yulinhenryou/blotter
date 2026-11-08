// A session (docs/CAPTURE.md §1.3): "New hand" (the entry timer starts on this tap), the random
// sample line, the session's hands newest first with their sync state, and the session's settings.

import { useCallback, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'

import { Button, ButtonLink } from '../design/Button.tsx'
import { getEntry } from '../store/records.ts'
import { Cards } from './CardPicker.tsx'
import styles from './capture.module.css'
import { useCapture, useLoad, useNow } from './context.ts'
import { listVenues, missSample, newHand, openSample, sampleDue, sessionHands } from './data.ts'
import { clock, sessionTitle, STATUS_TEXT } from './format.ts'

export function SessionPage() {
  const { sessionId = '' } = useParams()
  const { db, deps, changed } = useCapture()
  const navigate = useNavigate()
  const location = useLocation()
  const now = useNow(deps.now)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const entry = await getEntry(db, sessionId)
    return {
      session: entry?.kind === 'session' ? entry.record : null,
      venues: await listVenues(db),
      hands: await sessionHands(db, sessionId),
      sample: await openSample(db, sessionId),
    }
  }, [db, sessionId])
  const data = useLoad(load)
  if (data === undefined) return <p aria-busy="true">Loading…</p>
  if (data.session === null) return <p role="alert">This session is not on this phone.</p>
  const { session, sample } = data
  const venue = data.venues.find((v) => v.id === session.venue_id)
  const ended = session.ended_at != null
  const saved = (location.state as { saved?: number } | null)?.saved

  const startHand = async () => {
    setBusy(true)
    const form = await newHand(db, sessionId, deps.now())
    void navigate(`/capture/hand/${form.id}`, { state: { fresh: true } })
  }

  return (
    <>
      <h1 className={styles.heading}>Session</h1>
      <p className={styles.sub}>
        {sessionTitle(session, venue)}
        {ended ? ' · ended' : ''}
      </p>
      {saved !== undefined && (
        <p className={styles.status} role="status">
          Hand {saved} saved.
        </p>
      )}

      {!ended && (
        <>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              void startHand()
            }}
          >
            New hand
          </Button>
          {sample !== null &&
            (sampleDue(sample, now) ? (
              <div className={styles.status} role="status">
                <p>Random sample due — log the next hand you are dealt.</p>
                <Button
                  onClick={() => {
                    void missSample(db, sample, deps.now(), deps.uniform).then(changed)
                  }}
                >
                  Missed it
                </Button>
              </div>
            ) : (
              <p className={styles.muted} role="status">
                Next random sample: after {clock(sample.dueAt)}
              </p>
            ))}
        </>
      )}

      <section className={styles.section} aria-labelledby="hands">
        <h2 id="hands" className={styles.sectionTitle}>
          Hands
        </h2>
        {data.hands.length === 0 ? (
          <p className={styles.muted}>No hands yet.</p>
        ) : (
          <ul className={styles.list}>
            {data.hands.map((hand) => (
              <li key={hand.id}>
                <Link className={styles.item} to={`/capture/hand/${hand.id}`}>
                  <span>
                    #{hand.clientSeq} <Cards cards={hand.cards} /> {hand.position ?? ''}
                  </span>
                  <span className={styles.badge}>
                    {hand.editing ? 'Editing' : STATUS_TEXT[hand.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.bar}>
        <ButtonLink to="settings" variant="quiet">
          {ended ? 'Settings' : 'Settings · End session'}
        </ButtonLink>
      </div>
    </>
  )
}
