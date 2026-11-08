// Needs attention (docs/CAPTURE.md §1.7): records the server answered with `conflict` or `invalid`,
// with the server's issues in words. A hand opens on its screen; a conflict can be resolved by
// keeping the phone's version (ADR-0026: resolving conflicts is the phone's job).

import { useCallback } from 'react'
import { Link } from 'react-router'

import { Button } from '../design/Button.tsx'
import { listEntries, needsAttention, resolveKeepMine } from '../store/records.ts'
import type { AnyEntry } from '../store/types.ts'
import styles from './capture.module.css'
import { useCapture, useLoad } from './context.ts'
import { issuePlace } from './format.ts'

function title(entry: AnyEntry): string {
  switch (entry.kind) {
    case 'hand':
      return `Hand #${String(entry.record.client_seq)}`
    case 'session':
      return `Session of ${entry.record.started_at.slice(0, 10)}`
    case 'venue':
      return `Venue ${entry.record.name}`
    case 'player':
      return `Player ${entry.record.display_name}`
  }
}

function link(entry: AnyEntry): string | null {
  if (entry.kind === 'hand') return `/capture/hand/${entry.id}`
  if (entry.kind === 'session') return `/capture/session/${entry.id}/settings`
  return null
}

export function NeedsAttention() {
  const { db, deps, changed, sync } = useCapture()
  const load = useCallback(async () => needsAttention(await listEntries(db)), [db])
  const entries = useLoad(load)
  if (entries === undefined) return <p aria-busy="true">Loading…</p>

  return (
    <>
      <h1 className={styles.heading}>Needs attention</h1>
      {entries.length === 0 ? (
        <p className={styles.muted}>Nothing needs attention.</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => {
            const to = link(entry)
            return (
              <li key={entry.id} className={styles.section}>
                <div className={styles.spread}>
                  {to === null ? <span>{title(entry)}</span> : <Link to={to}>{title(entry)}</Link>}
                  <span className={styles.badge}>
                    {entry.state.status === 'conflict' ? 'Conflict' : 'Refused'}
                  </span>
                </div>
                {entry.state.status === 'invalid' ? (
                  <ul>
                    {entry.state.issues.map((issue, i) => (
                      <li key={i}>
                        {issuePlace(issue.path)}: {issue.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.spread}>
                    <span className={styles.muted}>The server holds another version.</span>
                    <Button
                      onClick={() => {
                        void resolveKeepMine(db, entry.id, deps.now()).then(() => {
                          changed()
                          void sync()
                        })
                      }}
                    >
                      Keep mine
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
