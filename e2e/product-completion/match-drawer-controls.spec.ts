import { expect, test } from '@playwright/test';

test('Match drawer controls sit inside the nameplate without painted button boxes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'ultrawide', 'Persistent dock has no close control');
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  await page.locator('#st-splash').click();
  await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  const card = (await page.locator('.st-hud__match-card').boundingBox())!;
  for (const [name, icon, center] of [['Menu', 'menu', .22], ['Close match ledger', 'close', .78]] as const) {
    const button = page.getByRole('button', { name, exact: true });
    const skin = await button.evaluate(e => ({ bg: getComputedStyle(e).backgroundImage, border: getComputedStyle(e).borderTopWidth }));
    expect.soft(skin).toEqual({ bg: 'none', border: '0px' });
    const glyph = button.locator(`svg[data-icon="${icon}"]`);
    await expect(glyph).toBeVisible();
    const box = (await glyph.boundingBox())!;
    expect.soft(Math.abs(box.x + box.width / 2 - card.x - card.width * center)).toBeLessThan(1);
    expect.soft(box.y).toBeGreaterThanOrEqual(card.y + card.height * 45 / 1231);
    expect.soft(box.y + box.height).toBeLessThanOrEqual(card.y + card.height * 143 / 1231);
  }
  await page.locator('.st-hud__match-card').screenshot({ path: `test-results/product-completion/${testInfo.project.name}-drawer-controls.png` });
  await page.getByRole('button', { name: 'Close match ledger', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open match ledger', exact: true })).toBeFocused();
});
