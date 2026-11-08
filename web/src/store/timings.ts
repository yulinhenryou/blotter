// Entry times (docs/plans/M4a.md §1.5, acceptance criterion 1): when "New hand" was tapped, when
// "Save" was, and whether the entry was interrupted. They stay on the phone; the hand record has no
// field for them. The summary is about the app, not about poker.

import type { Store } from './db.ts'
import type { Timing } from './types.ts'

/** Seconds from "New hand" to "Save", or `null` while the hand is a draft. */
export function entrySeconds(timing: Timing): number | null {
  if (timing.savedAt === null) return null
  return (Date.parse(timing.savedAt) - Date.parse(timing.startedAt)) / 1000
}

/** The median of a list of numbers (the mean of the middle two for an even count), or `null`. */
export function median(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return null
  const upper = sorted[Math.floor(n / 2)] ?? 0
  return n % 2 === 1 ? upper : ((sorted[n / 2 - 1] ?? 0) + upper) / 2
}

export interface TimingSummary {
  /** Saved entries that were not interrupted: the ones acceptance criterion 1 is judged on. */
  readonly uninterrupted: number
  readonly medianSeconds: number | null
  /** Saved entries that were interrupted, reported separately. */
  readonly interrupted: number
}

export function summarize(timings: readonly Timing[]): TimingSummary {
  const saved = timings.filter((t) => t.savedAt !== null)
  const clean = saved.filter((t) => !t.interrupted)
  return {
    uninterrupted: clean.length,
    medianSeconds: median(clean.map((t) => entrySeconds(t) ?? 0)),
    interrupted: saved.length - clean.length,
  }
}

/** "New hand" was tapped. */
export async function startTiming(
  db: Store,
  handId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.put('timings', {
    handId,
    startedAt: now.toISOString(),
    savedAt: null,
    interrupted: false,
  })
}

/** The draft was left and resumed. */
export async function markInterrupted(db: Store, handId: string): Promise<void> {
  const tx = db.transaction('timings', 'readwrite')
  const timing = await tx.store.get(handId)
  if (timing !== undefined) await tx.store.put({ ...timing, interrupted: true })
  await tx.done
}

/** "Save" was tapped. */
export async function finishTiming(
  db: Store,
  handId: string,
  now: Date = new Date(),
): Promise<void> {
  const tx = db.transaction('timings', 'readwrite')
  const timing = await tx.store.get(handId)
  if (timing !== undefined) await tx.store.put({ ...timing, savedAt: now.toISOString() })
  await tx.done
}

/** Every timing, the earliest start first. */
export async function listTimings(db: Store): Promise<Timing[]> {
  const timings = await db.getAll('timings')
  return timings.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}
