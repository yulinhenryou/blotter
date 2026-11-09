// Text for the capture screens: session titles, times, sync states. Facts only.

import type { Persistence } from '../store/db.ts'
import type { RecordTypes, SyncStatus } from '../store/types.ts'

/** "Casino Wien · 1/3 · 8 Nov 21:00". */
export function sessionTitle(
  session: RecordTypes['session'],
  venue: RecordTypes['venue'] | undefined,
): string {
  const blinds = `${String(session.small_blind_chips)}/${String(session.big_blind_chips)}`
  return [venue?.name ?? 'No venue', blinds, shortTime(session.started_at)].join(' · ')
}

/** "8 Nov 21:00" in the phone's time zone. */
export function shortTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "21:47" in the phone's time zone. */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export const STATUS_TEXT: Readonly<Record<SyncStatus | 'draft', string>> = {
  draft: 'Draft',
  pending: 'Waiting to sync',
  synced: 'Synced',
  conflict: 'Conflict',
  invalid: 'Refused',
}

/**
 * The browser's answer to "keep this app's storage" (M4a plan §1.6). Safari may clear a website's
 * data it has not been asked to keep; it keeps it more readily for an app opened from the Home
 * Screen.
 */
export const STORAGE_TEXT: Readonly<Record<Persistence, string>> = {
  persisted: 'Storage: kept by the browser.',
  not_persisted:
    'Storage: the browser may clear it when space runs low. Open the app from the Home Screen, and export unsynced records if they wait long.',
  unsupported: 'Storage: the browser does not say whether it keeps it.',
}

/** An ISO time as the value of an `<input type="datetime-local">`, in the phone's time zone. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A positive whole number typed in a field, or `null`. */
export function wholeNumber(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** "6 12" or "6, 12" → [6, 12]; "" or "none" → []; `null` if not whole numbers. */
export function parseStraddles(text: string): number[] | null {
  const trimmed = text.trim().toLowerCase()
  if (trimmed === '' || trimmed === 'none') return []
  const parts = trimmed.split(/[\s,]+/).map(wholeNumber)
  return parts.every((n) => n !== null) ? parts : null
}

/**
 * Where an issue of the server points, in words: `['actions', 7, 'amount_to_chips']` →
 * "Action 8, amount to chips". Indexes are shown counting from 1.
 */
export function issuePlace(path: readonly (string | number)[]): string {
  const words = path.map((part, i) => {
    if (typeof part === 'number') return String(part + 1)
    const text = part.replaceAll('_', ' ')
    const singular = typeof path[i + 1] === 'number' ? text.replace(/s$/, '') : text
    return i === 0 ? singular.charAt(0).toUpperCase() + singular.slice(1) : `, ${singular}`
  })
  return words.join(' ').replaceAll(' , ', ', ')
}
