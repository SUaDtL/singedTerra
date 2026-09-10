import { expect, test } from '@playwright/test';

type RenderedBox = Readonly<{ x: number; y: number; width: number; height: number }>;

async function expectOracleToReject(label: string, assertion: () => Promise<void>): Promise<void> {
  let rejected = false;
  try {
    await assertion();
  } catch {
    rejected = true;
  }
  expect(rejected, `${label} must be rejected by the real-control oracle`).toBe(true);
}

async function expectContained(inner: RenderedBox, outer: RenderedBox, label: string): Promise<void> {
  expect(inner.x, `${label} left`).toBeGreaterThanOrEqual(outer.x);
  expect(inner.x + inner.width, `${label} right`).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y, `${label} top`).toBeGreaterThanOrEqual(outer.y);
  expect(inner.y + inner.height, `${label} bottom`).toBeLessThanOrEqual(outer.y + outer.height);
}

async function expectNoSyntheticAppearanceHook(page: import('@playwright/test').Page): Promise<void> {
  expect(await page.evaluate(() => '__battleConsoleVisualTest__' in window)).toBe(false);
  await expect(page.locator('[data-battle-console-appearance-key]')).toHaveCount(0);
}

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

test('AC-010/011/012 compact font oracle rejects an actual unreadable control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'compact', 'Compact physical-font control');
  await expectNoSyntheticAppearanceHook(page);
  const fuel = page.locator('[data-battle-console-compact-chassis] [data-semantic-key="node:span:100 fuel remaining:19"]');
  const expectReadableFuel = async () => {
    const physicalSize = await fuel.evaluate(element => {
      const chassis = element.closest<HTMLElement>('[data-battle-console-compact-chassis]')!;
      return Number.parseFloat(getComputedStyle(element).fontSize)
        * chassis.getBoundingClientRect().width / 1388;
    });
    expect(physicalSize, 'Fuel remains physically readable').toBeGreaterThanOrEqual(13.99);
  };

  await expectReadableFuel();
  const mutation = await page.addStyleTag({
    content: '[data-battle-console-compact-chassis] [data-semantic-key="node:span:100 fuel remaining:19"] { font-size: 1px !important; }',
  });
  await expectOracleToReject('Unreadable fuel text', expectReadableFuel);
  await mutation.evaluate(element => element.remove());
  await expectReadableFuel();
});

test('AC-010/011/012 real containment, disabled and focus oracles reject broken controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'standard', 'One representative full-console profile');
  await expectNoSyntheticAppearanceHook(page);

  const settingsTrigger = page.getByRole('button', { name: 'Battle settings', exact: true });
  await settingsTrigger.click();
  const settingsDialog = page.getByRole('dialog', { name: 'Battle Settings', exact: true });
  const sound = settingsDialog.getByRole('switch', { name: 'Sound', exact: true });
  const expectSoundContained = async () => {
    await expectContained((await sound.boundingBox())!, (await settingsDialog.boundingBox())!, 'Sound control');
  };

  await expectSoundContained();
  const containmentMutation = await page.addStyleTag({
    content: '[role="dialog"][aria-label="Battle Settings"] [role="switch"][aria-label="Sound"] { transform: translateX(200vw) !important; }',
  });
  await expectOracleToReject('Escaped settings control', expectSoundContained);
  await containmentMutation.evaluate(element => element.remove());
  await expectSoundContained();

  await page.keyboard.press('Escape');
  await expect(settingsTrigger).toBeFocused();
  await page.locator('#game').evaluate(element => {
    element.setAttribute('tabindex', '-1');
    (element as HTMLElement).focus();
  });
  await expectOracleToReject('Lost settings return focus', async () => expect(settingsTrigger).toBeFocused());
  await settingsTrigger.focus();
  await expect(settingsTrigger).toBeFocused();

  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const missile = page.locator('[data-battle-console-armory-item]').filter({
    has: page.getByRole('heading', { name: 'Missile', exact: true }),
  });
  await missile.getByRole('button', { name: 'Equip', exact: true }).click();
  const equipped = missile.getByRole('button', { name: 'Equipped', exact: true });
  await expect(equipped).toBeDisabled();
  await equipped.evaluate(button => { (button as HTMLButtonElement).disabled = false; });
  await expectOracleToReject('Enabled equipped action', async () => expect(equipped).toBeDisabled());
  await equipped.evaluate(button => { (button as HTMLButtonElement).disabled = true; });
  await expect(equipped).toBeDisabled();
});
