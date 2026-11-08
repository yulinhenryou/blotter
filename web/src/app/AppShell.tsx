// The frame around every screen: the app's name (home), an offline marker and the update
// prompt. Screens render in <Outlet />.

import { Link, Outlet } from 'react-router'

import styles from './AppShell.module.css'
import { UpdatePrompt } from './UpdatePrompt.tsx'
import { useOnline } from './useOnline.ts'

export function AppShell() {
  const online = useOnline()
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.name}>
          {__APP_NAME__}
        </Link>
        {!online && (
          <span role="status" className={styles.offline}>
            Offline
          </span>
        )}
      </header>
      <UpdatePrompt />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
