// The phone's own settings (a session's rake rule and seat map, ...): JSON values by key. They are
// never synced. A value comes back as `unknown`; the code that wrote it checks its shape on read.

import type { Store } from './db.ts'

export async function putSetting(db: Store, key: string, value: unknown): Promise<void> {
  await db.put('settings', { key, value })
}

export async function getSetting(db: Store, key: string): Promise<unknown> {
  return (await db.get('settings', key))?.value
}
