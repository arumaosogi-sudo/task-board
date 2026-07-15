import { test, expect } from '@playwright/test'
import { uniqueCreds, registerAndVerify, login } from './helpers'

// Critical flow #18 (test-plan P4): register → verify email → login → dashboard.
// Requires the live stack + Mailpit (see README "Testing → E2E"). Not run in CI.
test.describe('Auth', () => {
  test('register → verify email → login → dashboard', async ({ page }) => {
    const creds = uniqueCreds()
    await registerAndVerify(page, creds)
    await login(page, creds)

    // Landed on the dashboard shell.
    await expect(page).toHaveURL(/\/home/)
    // The AppShell brand mark is a stable anchor proving the shell rendered.
    await expect(page.getByRole('link', { name: /Task Board/ }).first()).toBeVisible()
  })

  test('rejects invalid credentials without leaving the sign-in page', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#id').fill('no-such-user@example.com')
    await page.locator('#pw').fill('definitely-wrong')
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()

    // An error banner appears and we are NOT taken to the dashboard.
    await expect(page.getByText(/ไม่สำเร็จ|ไม่ถูกต้อง|ยังไม่ได้ยืนยัน/)).toBeVisible()
    await expect(page).not.toHaveURL(/\/home/)
  })
})
