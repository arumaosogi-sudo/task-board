import { defineConfig, devices } from '@playwright/test'

// E2E config. Deliberately NOT wired into `npm test` or CI — these specs need a live
// stack (Postgres + api + web) and browser binaries (`npx playwright install chromium`).
// `npm run test:e2e:local` boots an isolated stack and runs them; see ops/RUNBOOK.md §7.
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
  // test:e2e:local boots api + web itself. Uncomment to have Playwright start the web
  // dev server instead when driving a single spec by hand:
  // webServer: {
  //   command: 'npm run dev -w @task-board/web',
  //   url: WEB_URL,
  //   reuseExistingServer: !process.env.CI,
  // },
})
