import { expect, test } from '@playwright/test';

test('Persistent Match never covers the gameplay canvas', async ({ page }) => {
  await page.goto('?e2e=hotseat');
  await page.locator('#st-splash').click();
  const card = page.locator('#hud');
  if (await card.isVisible()) {
    const field = (await page.locator('#game').boundingBox())!;
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(field.x + field.width);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  } else {
    await expect(page.getByRole('button', { name: 'Open match ledger', exact: true })).toBeVisible();
  }
});
