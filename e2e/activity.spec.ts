import { test, expect } from '@playwright/test'
import { uniqueCreds, registerAndVerify, login } from './helpers'

// Critical flow (test-plan P4): the consolidated /activity feed and its scope
// toggle. A brand-new account has no revisions, so this asserts the two empty
// states swap correctly when toggling all ↔ mine — exercising the same
// scope-gating the Activity unit test covers, but end-to-end against real data.
test('activity: scope toggle swaps empty-state copy for a fresh user', async ({ page }) => {
  const creds = uniqueCreds()
  await registerAndVerify(page, creds)
  await login(page, creds)

  await page.goto('/activity')
  await expect(page.getByRole('heading', { name: 'กิจกรรม' })).toBeVisible()

  // "all" scope → team-activity empty state.
  await expect(page.getByText('ยังไม่มีความเคลื่อนไหว')).toBeVisible()

  // Toggle to "mine" → personal empty state.
  await page.getByRole('button', { name: 'เฉพาะของฉัน' }).click()
  await expect(page.getByText('คุณยังไม่มีการแก้ไข')).toBeVisible()
})
