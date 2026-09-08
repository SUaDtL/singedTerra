import { expect, test } from '@playwright/test';

test('AC-02 instrument readings occupy the actual glass recess without text patches', async ({ page }, testInfo) => {
  test.skip(!['ultrawide', 'wide', 'standard'].includes(testInfo.project.name), 'Illustrated dial profiles');
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  await page.locator('#st-splash').click();
  await expect(page.locator('#st-splash')).toBeHidden();
  const root = page.locator('[data-battle-console-semantic-tree]');
  const rect = (await root.boundingBox())!;
  const scale = rect.width / 1388;
  for (const [key, x, width] of [['node:output:Angle:43', 574, 69], ['node:output:Power:52', 719, 69], ['node:output:Wind:58', 867, 73]] as const) {
    const reading = page.locator(`[data-semantic-key="${key}"]`);
    const box = (await reading.boundingBox())!;
    expect(Math.abs(box.x - rect.x - x * scale), key).toBeLessThan(1);
    expect(Math.abs(box.y - rect.y - 121 * scale), key).toBeLessThan(1);
    expect(Math.abs(box.width - width * scale), key).toBeLessThan(1);
    const paint = await reading.evaluate(e => ({ background: getComputedStyle(e).backgroundImage, color: getComputedStyle(e).backgroundColor }));
    expect(paint).toEqual({ background: 'none', color: 'rgba(0, 0, 0, 0)' });
  }
  const clip = { x: rect.x + 540 * scale, y: rect.y + 30 * scale, width: 430 * scale, height: 166 * scale };
  await page.screenshot({ path: `test-results/product-completion/${testInfo.project.name}-instruments-initial.png`, clip });
  for (let step = 0; step < 12; step++) await page.getByRole('button', { name: 'Aim barrel right', exact: true }).click();
  for (let step = 0; step < 8; step++) await page.getByRole('button', { name: 'Increase power', exact: true }).click();
  await page.screenshot({ path: `test-results/product-completion/${testInfo.project.name}-instruments-adjusted.png`, clip });
});
