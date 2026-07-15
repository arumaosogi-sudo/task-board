import { test, expect } from '@playwright/test'
import { uniqueCreds, registerAndVerify, login } from './helpers'

// Critical flow (test-plan P4): theme switching. The appearance switcher lives in
// the top-right profile menu and applies the mode via a `data-mode` attribute on
// <html> (see lib/cn.ts applyMode).
test('theme: profile menu toggles dark ↔ light mode', async ({ page }) => {
  const creds = uniqueCreds()
  await registerAndVerify(page, creds)
  await login(page, creds)

  await page.getByRole('button', { name: 'เมนูผู้ใช้' }).click()

  await page.getByRole('button', { name: /มืด/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark')

  await page.getByRole('button', { name: /สว่าง/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light')
})
