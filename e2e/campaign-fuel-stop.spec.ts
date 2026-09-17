import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoFuelStopFromPublicEntry } from './support';

// This suite is the ordinary public journey. It must never acquire campaign
// state from a query parameter, localStorage seed, DOM-only control, or forced
// terminal fixture.
test.use({ storageState: { cookies: [], origins: [] } });

const ANGLE = '[data-semantic-key="node:output:Angle:43"]';
const POWER = '[data-semantic-key="node:output:Power:52"]';
const SURFACE = '[data-battle-console-surface]';

interface FuelStopPath {
  readonly name: 'preserve' | 'detonation';
  readonly weapon: 'Napalm' | 'Missile';
  readonly shots: readonly [
    Readonly<{ angle: number; power: number }>,
    Readonly<{ angle: number; power: number }>,
  ];
  readonly expectedSupplies: number;
  readonly expectedDrumText: '20 / 20' | 'destroyed';
}

const PATHS = Object.freeze([
  Object.freeze({
    name: 'preserve',
    weapon: 'Napalm',
    shots: Object.freeze([
      Object.freeze({ angle: 19, power: 76 }),
      Object.freeze({ angle: 44, power: 74 }),
    ]),
    expectedSupplies: 6,
    expectedDrumText: '20 / 20',
  }),
  Object.freeze({
    name: 'detonation',
    weapon: 'Missile',
    shots: Object.freeze([
      Object.freeze({ angle: 24, power: 74 }),
      Object.freeze({ angle: 44, power: 84 }),
    ]),
    expectedSupplies: 4,
    expectedDrumText: 'destroyed',
  }),
] satisfies readonly FuelStopPath[]);

function readout(page: Page, kind: 'angle' | 'power'): Locator {
  return page.locator(kind === 'angle' ? ANGLE : POWER);
}

async function readNumber(locator: Locator): Promise<number> {
  const value = Number.parseInt((await locator.innerText()).replace(/[^\d-]/gu, ''), 10);
  expect(Number.isFinite(value), 'battle-console readout exposes a finite value').toBe(true);
  return value;
}

async function setReadout(page: Page, kind: 'angle' | 'power', target: number): Promise<void> {
  const output = readout(page, kind);
  const decrease = page.getByRole('button', {
    name: kind === 'angle' ? 'Aim barrel left' : 'Decrease power',
    exact: true,
  });
  const increase = page.getByRole('button', {
    name: kind === 'angle' ? 'Aim barrel right' : 'Increase power',
    exact: true,
  });

  for (let step = 0; step < 181; step += 1) {
    const current = await readNumber(output);
    if (current === target) return;
    const control = current < target ? increase : decrease;
    await expect(control).toBeEnabled();
    await control.click();
    await expect.poll(() => readNumber(output)).not.toBe(current);
  }
  throw new Error(`${kind} did not reach ${target} through its public controls`);
}

async function equipWeapon(page: Page, weapon: FuelStopPath['weapon']): Promise<void> {
  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const armory = page.getByRole('dialog', { name: 'Armory', exact: true });
  await expect(armory).toBeVisible();
  const card = armory.locator('[data-battle-console-armory-item]').filter({
    has: page.getByRole('heading', { name: weapon, exact: true }),
  });
  await card.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Equipped', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(armory).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Fire ${weapon}`, exact: true })).toBeEnabled();
}

async function assertNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - innerWidth,
    y: document.documentElement.scrollHeight - innerHeight,
  }));
  expect(overflow.x, 'campaign journey must not create horizontal page scroll').toBeLessThanOrEqual(1);
  expect(overflow.y, 'campaign journey must not create vertical page scroll').toBeLessThanOrEqual(1);
}

async function assertCanonicalObjects(
  page: Page,
  drumText: FuelStopPath['expectedDrumText'],
): Promise<void> {
  const objective = page.getByRole('region', { name: 'Campaign objective', exact: true });
  await expect(objective).toBeVisible();
  await expect(objective.locator('[data-campaign-fact-id="refinery"]'))
    .toHaveText(/Refinery · protected · 100 \/ 100/u);
  for (const id of ['drum-a', 'drum-b']) {
    const drum = objective.locator(`[data-campaign-fact-id="${id}"]`);
    await expect(drum).toBeVisible();
    await expect(drum).toContainText(drumText);
  }
}

async function failFuelStopNaturallyAndRetry(page: Page): Promise<void> {
  // A level direct Missile from the authored human spawn strikes the nearby
  // protected refinery. This is accepted play, not a terminal-state shortcut.
  await equipWeapon(page, 'Missile');
  await setReadout(page, 'angle', 0);
  await setReadout(page, 'power', 11);
  const fire = page.getByRole('button', { name: 'Fire Missile', exact: true });
  await fire.click();

  const failed = page.locator('[role="status"][data-campaign-result="failure"]');
  await expect(failed).toBeVisible({ timeout: 30_000 });
  await expect(failed).toContainText(/Objective failure/u);
  const supplies = page.getByRole('status', { name: 'Campaign supplies', exact: true });
  await expect(supplies).toHaveText('2 supplies');

  const retry = page.getByRole('button', { name: 'Retry Fuel Stop', exact: true });
  await expect(retry).toBeVisible();
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1');
  await expect(page.locator('[role="status"][data-campaign-result="active"]')).toBeVisible();
  await expect(supplies).toHaveText('2 supplies');
  await assertCanonicalObjects(page, '20 / 20');
}

async function fireRetainedCommitment(
  page: Page,
  path: FuelStopPath,
  shot: FuelStopPath['shots'][number],
  final: boolean,
): Promise<void> {
  await setReadout(page, 'angle', shot.angle);
  await setReadout(page, 'power', shot.power);
  const fire = page.getByRole('button', { name: `Fire ${path.weapon}`, exact: true });
  await expect(fire).toBeEnabled();
  await fire.click();
  await expect(page.locator(SURFACE)).toHaveAttribute('data-battle-console-phase', /firing|resolving/u);
  if (final) return;

  // Observe the real CampaignClient CPU owner, its scheduled shot, and the
  // completed return to the human. A direct state mutation could not satisfy
  // this sequence.
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p2', {
    timeout: 30_000,
  });
  await expect.poll(async () => ({
    owner: await page.locator(SURFACE).getAttribute('data-active-commander'),
    phase: await page.locator(SURFACE).getAttribute('data-battle-console-phase'),
  }), { timeout: 10_000 }).toMatchObject({ owner: 'p2', phase: expect.stringMatching(/firing|resolving/u) });
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1', {
    timeout: 30_000,
  });
  await expect(fire).toBeEnabled({ timeout: 30_000 });
}

for (const path of PATHS) {
  test(`${path.name} path survives exact-checkpoint retry with canonical visible facts`, async ({ page }) => {
    test.setTimeout(150_000);

    await gotoFuelStopFromPublicEntry(page);
    await assertNoPageOverflow(page);
    await assertCanonicalObjects(page, '20 / 20');
    await expect(page.getByRole('status', { name: 'Campaign supplies', exact: true }))
      .toHaveText('2 supplies');

    await failFuelStopNaturallyAndRetry(page);
    await equipWeapon(page, path.weapon);
    await fireRetainedCommitment(page, path, path.shots[0], false);
    await fireRetainedCommitment(page, path, path.shots[1], true);

    const result = page.locator('[role="status"][data-campaign-result="success"]');
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toContainText(/Objective success · objective · 3 commitments/u);
    await assertCanonicalObjects(page, path.expectedDrumText);
    await expect(page.getByRole('status', { name: 'Campaign supplies', exact: true }))
      .toHaveText(`${path.expectedSupplies} supplies`);
    await assertNoPageOverflow(page);
  });
}
