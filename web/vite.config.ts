import { readFileSync } from 'node:fs'

import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

import { buildManifest, type ProjectInfo } from './manifest.ts'

// The project name is provisional and defined once, in ../project.json (see CLAUDE.md §4).
// It is read here at build time instead of being imported by app code, so the dev server
// never needs file-system access outside web/.
const project = JSON.parse(
  readFileSync(new URL('../project.json', import.meta.url), 'utf-8'),
) as ProjectInfo

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'project-title',
      transformIndexHtml: (html) => html.replace('%PROJECT_NAME%', project.displayName),
    },
    VitePWA({
      // A new version waits until the user agrees to reload (UpdatePrompt), so an update never
      // interrupts a hand being entered. Unsynced records live in IndexedDB, not in this cache.
      registerType: 'prompt',
      injectRegister: false,
      manifest: buildManifest(project),
      workbox: {
        // The whole app shell, fonts and icons are precached: the app opens with no network.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: '/index.html',
        // API calls must reach the server (or fail), never get the app shell instead.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  define: {
    __APP_NAME__: JSON.stringify(project.displayName),
    __APP_TAGLINE__: JSON.stringify(project.tagline),
  },
  server: {
    // FastAPI dev server: uv run uvicorn --factory review.api.app:create_app --reload
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // CSS is empty in tests by default; the contrast test reads the tokens themselves.
    css: { include: [/tokens\.css/] },
  },
})
