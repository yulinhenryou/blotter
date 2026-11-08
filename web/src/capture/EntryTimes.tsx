// Entry times (docs/CAPTURE.md §3, acceptance criterion 1): how long each saved hand took from
// "New hand" to "Save", and the median of the uninterrupted ones. About the app, not about poker.

import { useCallback } from 'react'

import { entrySeconds, listTimings, summarize } from '../store/timings.ts'
import styles from './capture.module.css'
import { useCapture, useLoad } from './context.ts'
import { shortTime } from './format.ts'

export function EntryTimes() {
  const { db } = useCapture()
  const load = useCallback(() => listTimings(db), [db])
  const timings = useLoad(load)
  if (timings === undefined) return <p aria-busy="true">Loading…</p>
  const saved = timings.filter((t) => t.savedAt !== null)
  const summary = summarize(timings)

  return (
    <>
      <h1 className={styles.heading}>Entry times</h1>
      <p role="status">
        {summary.medianSeconds === null
          ? 'No uninterrupted entries yet.'
          : `Median of ${String(summary.uninterrupted)} uninterrupted entries: ${String(Math.round(summary.medianSeconds))} s`}
        {summary.interrupted > 0 && ` · ${String(summary.interrupted)} interrupted, not counted`}
      </p>
      {saved.length > 0 && (
        <table className={styles.section}>
          <thead>
            <tr>
              <th scope="col">Started</th>
              <th scope="col">Seconds</th>
              <th scope="col">Interrupted</th>
            </tr>
          </thead>
          <tbody className="numeric">
            {[...saved].reverse().map((t) => (
              <tr key={t.handId}>
                <td>{shortTime(t.startedAt)}</td>
                <td>{Math.round(entrySeconds(t) ?? 0)}</td>
                <td>{t.interrupted ? 'yes' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
