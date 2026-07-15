import { test, expect } from '@playwright/test'

// Placeholder E2E — demonstrates the Playwright wiring only.
// Skipped by default: it needs the web app + api running and browsers installed
// (`npx playwright install`). Remove `.skip` once the live stack is available in
// the target environment. First real spec to write: register → verify → login.
test.skip('landing page loads and shows the app shell', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Task Board/i)
})
