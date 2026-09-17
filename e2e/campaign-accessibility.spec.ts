import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoFuelStopFromPublicEntry, gotoLobby } from './support';

test.use({
  storageState: { cookies: [], origins: [] },
  reducedMotion: 'reduce',
});

const SURFACE = '[data-battle-console-surface]';
const ANGLE = '[data-semantic-key="node:output:Angle:43"]';
const POWER = '[data-semantic-key="node:output:Power:52"]';

async function number(locator: Locator): Promise<number> {
  return Number.parseInt((await locator.innerText()).replace(/[^\d-]/gu, ''), 10);
}

async function setReadout(page: Page, kind: 'angle' | 'power', target: number): Promise<void> {
  const output = page.locator(kind === 'angle' ? ANGLE : POWER);
  const decrease = page.getByRole('button', {
    name: kind === 'angle' ? 'Aim barrel left' : 'Decrease power', exact: true,
  });
  const increase = page.getByRole('button', {
    name: kind === 'angle' ? 'Aim barrel right' : 'Increase power', exact: true,
  });
  for (let step = 0; step < 181; step += 1) {
    const current = await number(output);
    if (current === target) return;
    await (current < target ? increase : decrease).click();
  }
  throw new Error(`${kind} did not reach ${target}`);
}

async function setReadoutWithKeyboard(
  page: Page,
  kind: 'angle' | 'power',
  target: number,
): Promise<void> {
  const output = page.locator(kind === 'angle' ? ANGLE : POWER);
  const decrease = page.getByRole('button', {
    name: kind === 'angle' ? 'Aim barrel left' : 'Decrease power', exact: true,
  });
  const increase = page.getByRole('button', {
    name: kind === 'angle' ? 'Aim barrel right' : 'Increase power', exact: true,
  });
  for (let step = 0; step < 181; step += 1) {
    const current = await number(output);
    if (current === target) return;
    await (current < target ? increase : decrease).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => number(output)).not.toBe(current);
  }
  throw new Error(`${kind} did not reach ${target} through keyboard input`);
}

async function equipMissile(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const armory = page.getByRole('dialog', { name: 'Armory', exact: true });
  const missile = armory.locator('[data-battle-console-armory-item]').filter({
    has: page.getByRole('heading', { name: 'Missile', exact: true }),
  });
  const equip = missile.getByRole('button', { name: 'Equip', exact: true });
  if (await equip.count()) await equip.click();
  await page.keyboard.press('Escape');
}

async function fireMissile(page: Page, angle: number, power: number): Promise<void> {
  await equipMissile(page);
  await setReadout(page, 'angle', angle);
  await setReadout(page, 'power', power);
  await page.getByRole('button', { name: 'Fire Missile', exact: true }).click();
}

async function assertNoPageOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - innerWidth,
    y: document.documentElement.scrollHeight - innerHeight,
  }))).toEqual({ x: 0, y: 0 });
}

test('keyboard-only sound-off reduced-motion play survives campaign asset failure', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.route('**/art/campaign/*.webp', (route) => route.abort('failed'));
  await page.addInitScript(() => {
    window.localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
  });
  if (testInfo.project.name === 'desktop-fine') {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await gotoLobby(page);
  const start = page.getByRole('button', { name: 'Start Ash Road', exact: true });
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Campaign objective', exact: true })).toBeVisible();
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1');

  await page.keyboard.press('m');
  await expect(page.locator('.st-hud__toast')).toContainText('Sound off');
  await page.keyboard.press('q');
  await expect(page.getByRole('button', { name: 'Fire Missile', exact: true })).toBeEnabled();
  await setReadoutWithKeyboard(page, 'angle', 24);
  await setReadoutWithKeyboard(page, 'power', 74);
  await expect(page.locator(ANGLE)).toContainText('24');
  await expect(page.locator(POWER)).toContainText('74');
  await page.getByRole('button', { name: 'Fire Missile', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator(SURFACE)).toHaveAttribute('data-battle-console-phase', /firing|resolving/u);
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p2', { timeout: 30_000 });
  await assertNoPageOverflow(page);

  if (testInfo.project.name !== 'desktop-fine') return;
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1', {
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Fire Missile', exact: true }))
    .toBeEnabled({ timeout: 30_000 });
  await setReadoutWithKeyboard(page, 'angle', 44);
  await setReadoutWithKeyboard(page, 'power', 84);
  await page.getByRole('button', { name: 'Fire Missile', exact: true }).focus();
  await page.keyboard.press('Space');

  const checkpoint = page.getByRole('dialog', { name: 'Campaign checkpoint', exact: true });
  await expect(checkpoint).toBeVisible({ timeout: 30_000 });
  const route = checkpoint.getByRole('button', { name: 'Take High Road', exact: true });
  await route.focus();
  await page.keyboard.press('Enter');
  const retain = checkpoint.getByRole('button', { name: 'Retain loadout', exact: true });
  await retain.focus();
  await page.keyboard.press('Enter');
  const continueButton = checkpoint.getByRole('button', { name: 'Continue Ash Road', exact: true });
  await expect(continueButton).toBeEnabled();
  await continueButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1', {
    timeout: 30_000,
  });
  await expect(checkpoint).toHaveCount(0);
});

test('a committed in-flight campaign shot survives a full reload and resumes from IndexedDB', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'one durable reload proof is sufficient');
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    window.localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
  });
  await gotoFuelStopFromPublicEntry(page);
  await fireMissile(page, 24, 74);
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1');
  await expect(page.locator(SURFACE)).toHaveAttribute(
    'data-battle-console-phase', /firing|resolving/u,
  );
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open('singedterra-campaign', 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction('campaign-runs', 'readonly');
      const get = transaction.objectStore('campaign-runs').get('ash-road-local');
      return await new Promise<number>((resolve, reject) => {
        get.onsuccess = () => resolve(
          (get.result?.payload?.acceptedCommands as unknown[] | undefined)?.length ?? 0,
        );
        get.onerror = () => reject(get.error);
      });
    } finally {
      database.close();
    }
  }), { timeout: 10_000 }).toBeGreaterThanOrEqual(4);
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1');
  await expect(page.locator(SURFACE)).toHaveAttribute(
    'data-battle-console-phase', /firing|resolving/u,
  );

  await page.reload();
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  const resume = page.getByRole('button', { name: 'Resume Ash Road', exact: true });
  await expect(resume).toBeVisible({ timeout: 10_000 });
  await resume.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Campaign objective', exact: true })).toBeVisible();
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1', {
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /^Fire /u })).toBeEnabled({ timeout: 30_000 });

  await fireMissile(page, 44, 84);
  await expect(page.locator('[role="status"][data-campaign-result="success"]'))
    .toBeVisible({ timeout: 30_000 });
  await assertNoPageOverflow(page);
});

test('pixel-touch performs campaign actions through genuine touchscreen taps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-touch', 'requires the touch-enabled browser project');
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    window.localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
  });
  await gotoLobby(page);
  await expect.poll(() => page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    touchPoints: navigator.maxTouchPoints,
  }))).toEqual({ coarse: true, touchPoints: expect.any(Number) });
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Start Ash Road', exact: true }).tap();
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1');

  const angleBefore = await number(page.locator(ANGLE));
  await page.getByRole('button', { name: 'Aim barrel right', exact: true }).tap();
  await expect.poll(() => number(page.locator(ANGLE))).toBe(angleBefore + 1);
  const powerBefore = await number(page.locator(POWER));
  await page.getByRole('button', { name: 'Increase power', exact: true }).tap();
  await expect.poll(() => number(page.locator(POWER))).toBe(powerBefore + 1);

  await page.getByRole('button', { name: 'Fire Baby Missile', exact: true }).tap();
  await expect(page.locator(SURFACE)).toHaveAttribute(
    'data-battle-console-phase', /firing|resolving/u,
  );
  await assertNoPageOverflow(page);
});
