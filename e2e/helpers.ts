// Shared E2E helpers. These drive the *real* stack (Postgres + api + web) and read
// verification emails out of Mailpit (the dev SMTP catcher, HTTP API on :8025).
// Nothing here runs without that stack up — see README "Testing → E2E".
import { type Page, expect } from '@playwright/test'

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025'

export interface TestCreds {
  email: string
  username: string
  password: string
}

/** A fresh, collision-proof account for a single test run. */
export function uniqueCreds(): TestCreds {
  const n = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  return {
    email: `e2e_${n}@example.com`,
    username: `e2e_${n}`.slice(0, 20),
    password: 'Passw0rd!23',
  }
}

/** Poll Mailpit for the newest message addressed to `to`, return HTML+text body. */
async function fetchLatestEmailBody(to: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent('to:' + to)}`)
    if (search.ok) {
      const data = (await search.json()) as { messages?: { ID: string }[] }
      const newest = data.messages?.[0]
      if (newest) {
        const msg = await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`)
        const body = (await msg.json()) as { HTML?: string; Text?: string }
        return `${body.HTML ?? ''}\n${body.Text ?? ''}`
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No email for ${to} within ${timeoutMs}ms — is Mailpit running at ${MAILPIT_URL}?`)
}

/** Pull the raw verification token out of the latest verify-email message. */
export async function extractVerifyToken(to: string): Promise<string> {
  const body = await fetchLatestEmailBody(to)
  const match = body.match(/verify-email\?token=([^"'&\s<]+)/)
  if (!match) throw new Error('verify-email token not found in email body')
  return decodeURIComponent(match[1])
}

/** Register a brand-new account and complete email verification via Mailpit. */
export async function registerAndVerify(page: Page, creds: TestCreds): Promise<void> {
  await page.goto('/signup')
  await page.locator('#em').fill(creds.email)
  await page.locator('#pw').fill(creds.password)
  await page.locator('#pw2').fill(creds.password)
  await page.locator('#un').fill(creds.username)
  await page.getByRole('checkbox').check()
  // Submit stays disabled until the debounced username check reports "available".
  const submit = page.getByRole('button', { name: 'สร้างบัญชี' })
  await expect(submit).toBeEnabled({ timeout: 8_000 })
  await submit.click()
  await expect(page).toHaveURL(/\/verify-email/)

  const token = await extractVerifyToken(creds.email)
  await page.goto(`/verify-email?token=${encodeURIComponent(token)}`)
}

/** Sign in with verified credentials; resolves once the dashboard has loaded. */
export async function login(page: Page, creds: TestCreds): Promise<void> {
  await page.goto('/login')
  await page.locator('#id').fill(creds.email)
  await page.locator('#pw').fill(creds.password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page).toHaveURL(/\/home/)
}
