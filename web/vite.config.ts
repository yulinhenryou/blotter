import { readFileSync } from 'node:fs'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The project name is provisional and defined once, in ../project.json (see CLAUDE.md §4).
// It is read here at build time instead of being imported by app code, so the dev server
// never needs file-system access outside web/.
interface ProjectInfo {
  displayName: string
  tagline: string
}

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
  },
})
