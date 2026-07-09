import { defineConfig, devices } from '@playwright/test'

// E2E scaffold only — NOT wired into `npm test` or CI yet. Running it requires a
// live stack (Postgres + api + web) and browser binaries (`npx playwright install`).
// Kept minimal so the first real end-to-end flow (auth happy-path) can drop in.
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // When a real flow lands, uncomment to auto-boot the web dev server:
  // webServer: {
  //   command: 'npm run dev -w @task-board/web',
  //   url: WEB_URL,
  //   reuseExistingServer: !process.env.CI,
  // },
})
