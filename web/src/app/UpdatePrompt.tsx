// Offers a new version of the app when the service worker has one. It waits for a tap, so an
// update never reloads the page in the middle of entering a hand (vite.config.ts).

import { useRegisterSW } from 'virtual:pwa-register/react'

import { Button } from '../design/Button.tsx'
import styles from './AppShell.module.css'

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div role="status" className={styles.banner}>
      <span>A new version is ready.</span>
      <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
      <Button
        variant="quiet"
        onClick={() => {
          setNeedRefresh(false)
        }}
      >
        Later
      </Button>
    </div>
  )
}
