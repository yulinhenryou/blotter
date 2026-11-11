// The IndexedDB database and its object stores (docs/plans/M4a.md §1.4).
//
// IndexedDB is the browser's transactional key-value store; it survives reloads and app updates
// (the service worker's cache holds the app, not this data). `idb` wraps its event-based API in
// promises and types each store's keys and values through the `CaptureDb` schema below.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { AnyEntry, Draft, RecordKind, Sample, Setting, Timing } from './types.ts'

/** The database's name. Origin-scoped by the browser; it does not carry the project name. */
export const DB_NAME = 'capture'

/**
 * The schema version. Raise it and add a step to `upgrade` whenever a store or index changes;
 * never edit an existing step, since phones run it only once.
 */
export const DB_VERSION = 1

export interface CaptureDb extends DBSchema {
  records: { key: string; value: AnyEntry; indexes: { kind: RecordKind } }
  drafts: { key: string; value: Draft }
  timings: { key: string; value: Timing }
  samples: { key: string; value: Sample; indexes: { session: string } }
  settings: { key: string; value: Setting }
}

export type Store = IDBPDatabase<CaptureDb>

/** Open (and, on first use or after an update, create or upgrade) the database. */
export async function openStore(name: string = DB_NAME): Promise<Store> {
  const db: Store = await openDB<CaptureDb>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('records', { keyPath: 'id' }).createIndex('kind', 'kind')
        db.createObjectStore('drafts', { keyPath: 'id' })
        db.createObjectStore('timings', { keyPath: 'handId' })
        db.createObjectStore('samples', { keyPath: 'id' }).createIndex('session', 'sessionId')
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    },
    blocking() {
      // A newer version of the app wants to upgrade the database: let it, by closing ours. This
      // page then needs a reload, which the update prompt offers. (Called only after `db` is set.)
      db.close()
    },
  })
  return db
}

/**
 * Ask the browser not to evict this origin's data under storage pressure (M4a plan §1.6).
 * Safari grants it more readily to an app opened from the Home Screen.
 */
export type Persistence = 'persisted' | 'not_persisted' | 'unsupported'

export async function requestPersistence(): Promise<Persistence> {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) return 'unsupported'
  try {
    if (await navigator.storage.persisted()) return 'persisted'
    return (await navigator.storage.persist()) ? 'persisted' : 'not_persisted'
  } catch {
    return 'unsupported'
  }
}
