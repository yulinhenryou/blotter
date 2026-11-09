// End-to-end tests (M4a Task 7): the production build, served with the real API by FastAPI on a
// fresh temporary SQLite database (scripts/e2e_server.py). Run `npm run build` first.
//
// WebKit with an iPhone viewport runs the capture flow (Henry's phone is an iPhone; emulation is
// not the device, which is checked by hand in Task 8). Chromium runs the service-worker, offline
// and installability tests, where Playwright's service-worker support is fullest.

import { defineConfig, devices } from '@playwright/test'

const PORT = 8765
const ORIGIN = `http://127.0.0.1:${String(PORT)}`

export default defineConfig({
  testDir: './e2e',
  // `*.e2e.ts`, so that Vitest (which collects `*.spec.ts` and `*.test.ts`) leaves them alone.
  testMatch: '**/*.e2e.ts',
  // One server and one SQLite database for the whole run: tests run one at a time, and each
  // creates its own venue, session and hands, so none depends on another's data.
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'webkit-iphone',
      use: { ...devices['iPhone 15'] },
      testMatch: ['flow.e2e.ts', 'no-analysis.e2e.ts'],
    },
    {
      name: 'chromium',
      use: { ...devices['Pixel 7'] },
      testMatch: ['offline.e2e.ts', 'install.e2e.ts', 'no-analysis.e2e.ts'],
    },
  ],
  webServer: {
    command: `uv run --project ../python python ../scripts/e2e_server.py --port ${String(PORT)}`,
    url: `${ORIGIN}/api/v1/health`,
    // Never reuse a server already on the port: it may hold data, or be another program.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
