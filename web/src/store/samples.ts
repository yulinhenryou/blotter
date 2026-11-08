// The random-sample log of docs/MATH.md §4.5: the phone draws a time uniformly between 20 and 40
// minutes ahead; the next hand dealt after it is logged with `record_reason = random_sample`, or
// marked missed. The log of times and outcomes gives the miss rate.

import type { Store } from './db.ts'
import { newId } from './ids.ts'
import type { Sample } from './types.ts'

export const SAMPLE_MIN_MINUTES = 20
export const SAMPLE_MAX_MINUTES = 40

/** A uniform number in [0, 1) from the browser's cryptographic generator. */
export function cryptoUniform(): number {
  const [word = 0] = crypto.getRandomValues(new Uint32Array(1))
  return word / 2 ** 32
}

/**
 * The next sample time: `from` plus a uniform draw in [20, 40) minutes.
 *
 * @param uniform  A draw from [0, 1). A parameter so tests can fix it; `cryptoUniform` at the table.
 */
export function nextDueAt(from: Date, uniform: () => number = cryptoUniform): Date {
  const u = uniform()
  if (!(u >= 0 && u < 1)) throw new RangeError('uniform() must return a number in [0, 1)')
  const minutes = SAMPLE_MIN_MINUTES + (SAMPLE_MAX_MINUTES - SAMPLE_MIN_MINUTES) * u
  return new Date(from.getTime() + minutes * 60_000)
}

/** Draw and store the next sample time of a session. */
export async function drawSample(
  db: Store,
  sessionId: string,
  now: Date = new Date(),
  uniform: () => number = cryptoUniform,
): Promise<Sample> {
  const sample: Sample = {
    id: newId(now),
    sessionId,
    dueAt: nextDueAt(now, uniform).toISOString(),
    outcome: 'open',
    handId: null,
    closedAt: null,
  }
  await db.put('samples', sample)
  return sample
}

/** Record what came of a sample time: the hand logged for it, or missed. */
export async function closeSample(
  db: Store,
  id: string,
  outcome: { readonly kind: 'logged'; readonly handId: string } | { readonly kind: 'missed' },
  now: Date = new Date(),
): Promise<Sample> {
  const tx = db.transaction('samples', 'readwrite')
  const sample = await tx.store.get(id)
  if (sample === undefined) throw new Error(`no sample ${id}`)
  if (sample.outcome !== 'open') throw new Error(`sample ${id} is already ${sample.outcome}`)
  const closed: Sample = {
    ...sample,
    outcome: outcome.kind,
    handId: outcome.kind === 'logged' ? outcome.handId : null,
    closedAt: now.toISOString(),
  }
  await Promise.all([tx.store.put(closed), tx.done])
  return closed
}

/** A session's sample times, the earliest first. */
export async function listSamples(db: Store, sessionId: string): Promise<Sample[]> {
  const samples = await db.getAllFromIndex('samples', 'session', sessionId)
  return samples.sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}
