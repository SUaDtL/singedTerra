import { expect, test } from '@playwright/test';

test('AC-08 semantic controls remain operable when Pixi texture loading fails', async ({ page }) => {
  await page.route('**/canonical-pixi-layer.png', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  await page.locator('#st-splash').click();
  await expect(page.locator('#st-splash')).toBeHidden();
  await expect(page.locator('[data-battle-console-state="fallback"]')).toBeVisible();
  await expect(page.locator('[data-battle-console-pixi]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Move tank right, 8 fuel maximum', exact: true }).click();
  await expect(page.locator('[data-semantic-key="node:span:100 fuel remaining:19"]')).toHaveText('92');
  await page.getByRole('button', { name: 'Battle settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Battle Settings', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Battle settings', exact: true })).toBeFocused();
});
