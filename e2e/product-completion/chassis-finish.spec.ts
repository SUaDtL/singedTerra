import { expect, test } from '@playwright/test';

test('AC-02 commander stays inside its inset and readings do not paint patches', async ({ page }, testInfo) => {
  test.skip(!['ultrawide', 'wide', 'standard'].includes(testInfo.project.name), 'Illustrated console');
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  await page.locator('#st-splash').click();
  const root = (await page.locator('[data-battle-console-semantic-tree]').boundingBox())!;
  const scale = root.width / 1388;
  const portrait = (await page.locator('[data-battle-console-portrait]').boundingBox())!;
  expect.soft((portrait.x - root.x) / scale).toBeGreaterThanOrEqual(96);
  expect.soft((portrait.y - root.y) / scale).toBeGreaterThanOrEqual(60);
  expect.soft((portrait.x + portrait.width - root.x) / scale).toBeLessThanOrEqual(210);
  expect.soft((portrait.y + portrait.height - root.y) / scale).toBeLessThanOrEqual(123);
  for (const key of ['node:span:P1:10', 'node:span:100 health remaining:11']) {
    const paint = await page.locator(`[data-semantic-key="${key}"]`).evaluate(e => ({ image: getComputedStyle(e).backgroundImage, color: getComputedStyle(e).backgroundColor }));
    expect.soft(paint).toEqual({ image: 'none', color: 'rgba(0, 0, 0, 0)' });
  }
  await page.screenshot({ path: `test-results/product-completion/${testInfo.project.name}-chassis-console.png`, clip: root });
  if (!await page.locator('.st-hud__match-card').isVisible()) await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  await page.locator('.st-hud__match-card').screenshot({ path: `test-results/product-completion/${testInfo.project.name}-chassis-match.png` });
});
