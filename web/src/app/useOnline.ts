// Whether the browser believes it has a network connection. "Online" does not mean the server
// is reachable (the Mac may be asleep, docs/ARCHITECTURE.md §8); sync reports that separately.

import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine)
}
