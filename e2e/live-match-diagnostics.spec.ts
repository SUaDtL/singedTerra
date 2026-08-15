import { expect, test, type Page } from '@playwright/test'
import { gotoRunningGame } from './support'

async function installAuthenticatedFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('sb-localhost-auth-token', JSON.stringify({
      ['access' + '_' + 'token']: 'e2e-session-value',
      ['refresh' + '_' + 'token']: 'e2e-refresh-value',
      expires_at: 4_102_444_800,
      expires_in: 3_600,
      token_type: 'bearer',
      user: {
        id: 'e2e-live-diagnostics-commander',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'diagnostics@example.test',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-08-14T00:00:00.000Z',
      },
    }))
  })
  await page.route('**/rest/v1/profiles**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'e2e-live-diagnostics-commander', display_name: 'Inspector' }),
  }))
  await page.route('**/functions/v1/account_summary', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      matchesPlayed: 0, wins: 0, progressionVersion: 1, totalXp: 0,
      level: 1, levelXp: 0, nextLevelXp: 500,
      verifiedProgression: {
        evidence: 'verified_replay_v1', matchesPlayed: 0, wins: 0,
        progressionVersion: 1, totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500,
      },
    }),
  }))
}

test('an anonymous diagnostics query never exposes the live match inspector', async ({ page }) => {
  await gotoRunningGame(page, '?e2e=hotseat&diagnostics=1')

  await expect(page.getByRole('button', { name: 'Inspect live match', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Live match inspector', exact: true })).toHaveCount(0)
  await expect(page.locator('.st-hud__primary-action')).toBeEnabled()
})

test('an authenticated diagnostics query opens, copies, and closes the redacted live snapshot without blocking Fire', async ({ page, context }, testInfo) => {
  await installAuthenticatedFixture(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  // Use the public authenticated Lobby journey. The deterministic e2e entrypoint
  // deliberately bypasses Lobby initialization, so it cannot establish a real
  // AccountSession for this account-gated control.
  await page.goto('?diagnostics=1')
  await page.evaluate(() => document.getElementById('st-splash')?.remove())
  await expect(page.locator('#lobby .account-panel--authenticated')).toBeVisible()
  await page.getByRole('dialog', { name: 'Production diagnostics', exact: true })
    .getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Local Battle', exact: true }).click()
  await page.getByRole('button', { name: 'Deploy local battle', exact: true }).click()
  await expect(page.locator('#hud.st-hud')).toBeVisible()
  const briefing = page.locator('[data-ui="first-salvo-briefing"]')
  if (await briefing.isVisible()) {
    await page.getByRole('button', { name: 'Enter battle', exact: true }).click()
    await expect(briefing).toBeHidden()
  }
  // A fresh browser profile correctly starts the local First Salvo coach with
  // Fire gated. Dismiss that independent onboarding layer before testing that
  // the inspector itself leaves the ordinary primary action reachable.
  const skipCoach = page.getByRole('button', { name: 'Skip', exact: true })
  if (await skipCoach.isVisible()) await skipCoach.click()

  const fire = page.locator('.st-hud__primary-action')
  const ledger = page.locator('#hud')
  await expect(ledger.getByRole('button', { name: 'Inspect live match', exact: true })).toHaveCount(0)
  await expect(ledger.locator(':scope > button')).toHaveCount(1)
  const menu = testInfo.project.name === 'pixel-touch'
    ? page.getByRole('button', { name: 'Open menu', exact: true })
    : ledger.getByRole('button', { name: 'Menu', exact: true })
  await menu.click()
  const trigger = page.getByRole('button', { name: 'Inspect live match', exact: true })
  await expect(page.getByRole('dialog', { name: 'Command Menu', exact: true })).toBeVisible()
  await expect(trigger).toBeVisible()
  // Touch opens the existing Command Menu to reach this action. That menu
  // intentionally pauses battle input, so Fire is only expected to recover
  // after the inspector has returned to the active battle.
  await trigger.focus()
  await trigger.click()

  const inspector = page.getByRole('dialog', { name: 'Live match inspector', exact: true })
  await expect(inspector).toBeVisible()
  await expect(inspector).toContainText('"schemaVersion": 1')
  await expect(inspector).toContainText('"mode": "hotseat"')
  await expect(inspector).not.toContainText('e2e-live-diagnostics-commander')
  await expect(inspector).not.toContainText('e2e-session-value')
  await inspector.getByRole('button', { name: 'Copy snapshot', exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('"schemaVersion": 1')

  await inspector.getByRole('button', { name: 'Close inspector', exact: true }).click()
  await expect(inspector).toHaveCount(0)
  await expect(menu).toBeFocused()
  await expect(fire).toBeEnabled()
})
