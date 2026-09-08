import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  const splash = page.locator('#st-splash');
  await expect(splash).toBeVisible();
  await splash.click();
  await expect(splash).toBeHidden();
  await expect(page.locator('[data-battle-console-surface]')).toHaveAttribute('data-battle-console-ready', 'true');
});

test('AC-01 console follows battlefield bounds', async ({ page }) => {
  const field = (await page.locator('#game').boundingBox())!;
  const console = (await page.locator('[data-battle-console-surface]').boundingBox())!;
  expect(Math.abs(console.x - field.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(console.width - field.width)).toBeLessThanOrEqual(2);
  expect(console.y + console.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
});

test('AC-06 settings controls occupy separate contained rows', async ({ page }) => {
  await page.getByRole('button', { name: 'Battle settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Battle Settings', exact: true });
  const heading = (await dialog.getByRole('heading').boundingBox())!;
  const guide = (await dialog.getByRole('switch', { name: 'Trajectory guide' }).boundingBox())!;
  const sound = (await dialog.getByRole('switch', { name: 'Sound', exact: true }).boundingBox())!;
  const close = (await dialog.getByRole('button', { name: 'Close settings', exact: true }).boundingBox())!;
  expect(guide.y).toBeGreaterThan(heading.y + heading.height);
  expect(sound.y).toBeGreaterThanOrEqual(guide.y + guide.height);
  expect(close.y).toBeGreaterThanOrEqual(sound.y + sound.height);
  const box = (await dialog.boundingBox())!;
  for (const rect of [heading, guide, sound, close]) {
    expect(rect.x).toBeGreaterThanOrEqual(box.x);
    expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height);
  }
  await dialog.getByRole('switch', { name: 'Sound', exact: true }).click();
  await expect(dialog.getByRole('switch', { name: 'Sound', exact: true })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Battle settings', exact: true })).toBeFocused();
});

test('AC-07 Match stays inside viewport and title clears menu ink', async ({ page }) => {
  const card = page.locator('#hud .st-hud__match-card');
  if (!await card.isVisible()) await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  const field = (await page.locator('#game').boundingBox())!;
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(field.x);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const menu = (await page.locator('#hud .st-hud__menu svg').boundingBox())!;
  const title = await page.locator('#hud .st-hud__match-title').evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const rect = range.getBoundingClientRect(); return { x: rect.x }; });
  expect(menu.x + menu.width).toBeLessThanOrEqual(title.x + 1);
});

test('AC-04 Armory reaches final item and keeps actions in the frame', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const inventory = page.locator('[data-battle-console-armory-scroll]');
  await inventory.focus();
  await page.keyboard.press('End');
  const last = page.locator('[data-battle-console-armory-item]').last();
  await expect(last.getByRole('heading', { name: 'Parachute', exact: true })).toBeVisible();
  await expect.poll(async () => {
    const item = (await last.boundingBox())!;
    const scroll = (await inventory.boundingBox())!;
    return item.y + item.height <= scroll.y + scroll.height + 1;
  }).toBe(true);
  const lastBox = (await last.boundingBox())!;
  const scrollBox = (await inventory.boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(scrollBox.y + scrollBox.height + 1);
  for (const button of await last.getByRole('button').all()) {
    const action = (await button.boundingBox())!;
    expect(action.x).toBeGreaterThanOrEqual(lastBox.x);
    expect(action.x + action.width).toBeLessThanOrEqual(lastBox.x + lastBox.width);
  }
});

test('AC-01 compact gameplay controls have physical touch targets', async ({ page }, testInfo) => {
  test.skip(!['compact', 'narrow'].includes(testInfo.project.name), 'Reduced stage profiles');
  for (const key of ['move-left', 'move-right', 'weapon-next', 'armory', 'angle-decrease', 'angle-increase', 'power-decrease', 'power-increase', 'settings', 'fire']) {
    const button = page.locator(`[data-battle-console-target-key="${key}"]`);
    const box = (await button.boundingBox())!;
    expect(box.width, `${key} width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${key} height`).toBeGreaterThanOrEqual(44);
  }
});

test('AC-03/05/08 movement, settings, fire and turn progression remain coherent', async ({ page }, testInfo) => {
  const fuel = page.locator('[data-semantic-key="node:span:100 fuel remaining:19"]');
  await expect(fuel).toHaveText('100');
  const fontBefore = await fuel.evaluate(e => getComputedStyle(e).font);
  await page.screenshot({ path: `test-results/product-completion/${testInfo.project.name}-console.png` });
  await page.getByRole('button', { name: 'Move tank right, 8 fuel maximum', exact: true }).click();
  await expect(fuel).toHaveText('92');
  expect(await fuel.evaluate(e => getComputedStyle(e).font)).toBe(fontBefore);
  await page.screenshot({ path: `test-results/product-completion/${testInfo.project.name}-fuel92.png` });
  await page.getByRole('button', { name: 'Battle settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Battle Settings', exact: true });
  await dialog.getByRole('switch', { name: 'Sound', exact: true }).click();
  await expect(dialog.getByRole('switch', { name: 'Sound', exact: true })).toHaveAttribute('aria-checked', 'false');
  await page.screenshot({ path: `test-results/product-completion/${testInfo.project.name}-settings.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.locator('[data-semantic-key="node:output:Wind:58"]').click();
  await page.getByRole('button', { name: 'Battle settings', exact: true }).click();
  await expect(dialog.getByRole('switch', { name: 'Sound', exact: true })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const armory = page.getByRole('dialog', { name: 'Armory', exact: true });
  await page.screenshot({ path: `test-results/product-completion/${testInfo.project.name}-armory.png` });
  const missile = page.locator('[data-battle-console-armory-item]').filter({ has: page.getByRole('heading', { name: 'Missile', exact: true }) });
  await missile.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(missile.getByRole('button', { name: 'Equipped', exact: true })).toBeDisabled();
  const owned = missile.locator('[data-battle-console-owned]');
  const initialOwned = Number((await owned.textContent())!.split(' ')[0]);
  const bundle = Number((await missile.locator('[data-battle-console-bundle]').textContent())!.split(' ')[0]);
  const budget = armory.locator('[data-battle-console-credits]');
  const initialCredits = Number((await budget.textContent())!.replace(/[^\d]/g, ''));
  const buyMissile = missile.getByRole('button', { name: /^Buy \$/ });
  const price = Number((await buyMissile.textContent())!.replace(/[^\d]/g, ''));
  expect(initialCredits).toBeGreaterThanOrEqual(price);
  await buyMissile.click();
  await expect(owned).toHaveText(`${initialOwned + bundle} ammo`);
  await expect(budget).toHaveText(`$${(initialCredits - price).toLocaleString()}`);
  await expect(missile.getByRole('button', { name: 'Equipped', exact: true })).toBeDisabled();
  if (await armory.isVisible()) await page.keyboard.press('Escape');
  const host = page.locator('[data-battle-console-surface]');
  const commander = await host.getAttribute('data-active-commander');
  await page.getByRole('button', { name: 'Aim barrel right', exact: true }).click();
  await page.getByRole('button', { name: 'Increase power', exact: true }).click();
  await page.getByRole('button', { name: 'Fire Missile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fire Missile', exact: true })).toBeDisabled();
  await expect.poll(() => host.getAttribute('data-active-commander'), { timeout: 30_000 }).not.toBe(commander);
  await expect(page.locator('#game')).toHaveCount(1);
  await page.screenshot({ path: `test-results/product-completion/${testInfo.project.name}-next-turn.png` });
});
