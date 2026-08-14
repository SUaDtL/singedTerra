import { expect, test } from '@playwright/test';

test('Quick Duel visibly starts the curated best-of-three match', async ({ page }) => {
  await page.goto('?e2e=quick-duel-seed');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  await page.getByRole('button', { name: 'Quick Duel vs CPU', exact: true }).click();

  await expect(page.locator('.st-hud__instruments')).toBeVisible();
  const round = page.locator('.st-hud__round');
  await expect(round).toBeVisible();
  await expect(round).toHaveText('Round 1 of 3');
});
