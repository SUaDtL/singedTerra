import { expect, test } from '@playwright/test';

test('online garage action hierarchy stays inside the stage', async ({ page }) => {
  await page.goto('.');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await page.getByRole('button', { name: 'Local Battle', exact: true }).click();
  await expect(page.locator('.lobby-garage')).toHaveCount(2);

  await page.getByRole('button', { name: 'Back to deployment choices', exact: true }).click();
  await page.getByRole('button', { name: 'Play Online', exact: true }).click();
  await expect(page.locator('.lobby-garage')).toHaveCount(1);

  const fit = await page.locator('.lobby-card').evaluate((card) => ({
    clientHeight: card.clientHeight,
    scrollHeight: card.scrollHeight,
    overflowY: getComputedStyle(card).overflowY,
  }));
  expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight + 1);
  // Online preparation is a fixed-stage composition. Scroll belongs only to
  // genuinely dense inner data surfaces, never to the whole lobby card.
  expect(fit.overflowY).toBe('hidden');
});
