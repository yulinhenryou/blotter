// Hands being entered. A draft never leaves the phone (M3a plan §1.2); saving it turns it into a
// hand record (`putRecord`) and deletes the draft. Its body is defined by the capture screens.

import type { Store } from './db.ts'
import type { Draft } from './types.ts'

export async function putDraft(db: Store, draft: Draft): Promise<void> {
  await db.put('drafts', draft)
}

export function getDraft(db: Store, id: string): Promise<Draft | undefined> {
  return db.get('drafts', id)
}

/** Every draft, the most recently changed first. */
export async function listDrafts(db: Store): Promise<Draft[]> {
  const drafts = await db.getAll('drafts')
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deleteDraft(db: Store, id: string): Promise<void> {
  await db.delete('drafts', id)
}
