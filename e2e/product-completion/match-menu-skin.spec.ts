import { expect, test } from '@playwright/test';

test('Match caption and menu icon fit the painted header', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  if (await page.locator('#st-splash').isVisible()) await page.locator('#st-splash').press('Space');
  const menu = page.locator('#hud .st-hud__menu');
  if (!await menu.isVisible()) await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  const card = (await page.locator('#hud .st-hud__match-card').boundingBox())!;
  const title = await page.locator('#hud .st-hud__match-title').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const bounds = range.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  // Painted nameplate interior in the 904x1231 source frame: y45..143.
  expect(title.y).toBeGreaterThanOrEqual(card.y + card.height * 45 / 1231);
  expect(title.y + title.height).toBeLessThanOrEqual(card.y + card.height * 143 / 1231);
  expect(Math.abs(title.x + title.width / 2 - (card.x + card.width / 2))).toBeLessThanOrEqual(1);
  await expect(menu).toHaveAccessibleName('Menu');
  const icon = menu.locator('svg[data-icon="menu"]');
  await expect(icon).toBeVisible();
  const glyph = (await icon.boundingBox())!;
  expect(glyph.y).toBeGreaterThanOrEqual(card.y + card.height * 45 / 1231);
  expect(glyph.y + glyph.height).toBeLessThanOrEqual(card.y + card.height * 143 / 1231);
});
