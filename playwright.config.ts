import { defineConfig, devices } from '@playwright/test'

import { resolveBasePath } from './scripts/base-path'

// A dedicated port so a stale `npm run preview` (4173) is never mistaken for the test build.
const port = 4174
const baseURL = `http://127.0.0.1:${port}${resolveBasePath()}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    // Transitions (e.g. the fading PWA toast) would otherwise race the axe contrast checks.
    reducedMotion: 'reduce',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run build-only && npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
