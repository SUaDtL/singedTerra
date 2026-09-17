import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoLobby } from './support';

test.use({ storageState: { cookies: [], origins: [] } });

const SURFACE = '[data-battle-console-surface]';
const ANGLE = '[data-semantic-key="node:output:Angle:43"]';
const POWER = '[data-semantic-key="node:output:Power:52"]';

async function readNumber(locator: Locator): Promise<number> {
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
    const current = await readNumber(output);
    if (current === target) return;
    await (current < target ? increase : decrease).click();
    await expect.poll(() => readNumber(output)).not.toBe(current);
  }
  throw new Error(`${kind} did not reach ${target}`);
}

type CampaignWeaponName = 'Baby Missile' | 'Missile' | 'Cluster Bomb' | 'Sandhog' | 'Shield';

async function equip(page: Page, weapon: CampaignWeaponName): Promise<void> {
  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const armory = page.getByRole('dialog', { name: 'Armory', exact: true });
  const card = armory.locator('[data-battle-console-armory-item]').filter({
    has: page.getByRole('heading', { name: weapon, exact: true }),
  });
  const equipButton = card.getByRole('button', { name: 'Equip', exact: true });
  if (await equipButton.count()) await equipButton.click();
  await page.keyboard.press('Escape');
  await expect(armory).toHaveCount(0);
}

async function fire(
  page: Page,
  weapon: Exclude<CampaignWeaponName, 'Shield'>,
  angle: number,
  power: number,
) {
  await equip(page, weapon);
  await setReadout(page, 'angle', angle);
  await setReadout(page, 'power', power);
  await page.getByRole('button', { name: `Fire ${weapon}`, exact: true }).click();
}

async function fireEquipped(
  page: Page,
  weapon: Exclude<CampaignWeaponName, 'Shield'>,
  angle: number,
  power: number,
) {
  await setReadout(page, 'angle', angle);
  await setReadout(page, 'power', power);
  await page.getByRole('button', { name: `Fire ${weapon}`, exact: true }).click();
}

async function waitForHumanTurn(page: Page): Promise<void> {
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1', {
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /^Fire /u })).toBeEnabled({ timeout: 30_000 });
}

async function checkpoint(page: Page): Promise<Locator> {
  const panel = page.getByRole('dialog', { name: 'Campaign checkpoint', exact: true });
  await expect(panel).toBeVisible({ timeout: 30_000 });
  return panel;
}

async function startCampaignRun(page: Page, kit: 'assault' | 'breach'): Promise<void> {
  await gotoLobby(page);
  await page.getByRole('combobox', { name: 'Ash Road loadout', exact: true })
    .selectOption(kit);
  await page.getByRole('button', { name: 'Start Ash Road', exact: true }).click();
  await expect(page.locator(SURFACE)).toHaveAttribute('data-active-commander', 'p1');
  const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
  if (await briefing.isVisible()) {
    await briefing.getByRole('button', { name: 'Enter battle', exact: true }).click();
  }
}

for (const route of [
  { id: 'high', kit: 'breach', routeButton: 'Take High Road', middle: 'high-road' },
  { id: 'salvage', kit: 'assault', routeButton: 'Enter Salvage Pit', middle: 'salvage-pit' },
] as const) {
  test(`public ${route.id} route reaches Relay Ridge through real checkpoint state`, async ({ page }) => {
    test.setTimeout(180_000);
    await startCampaignRun(page, route.kit);

    await fire(page, 'Missile', 24, 74);
    await waitForHumanTurn(page);
    await fire(page, 'Missile', 44, 84);
    let panel = await checkpoint(page);
    await panel.getByRole('button', { name: route.routeButton, exact: true }).click();
    await panel.getByRole('button', { name: 'Retain loadout', exact: true }).click();
    await panel.getByRole('button', { name: 'Continue Ash Road', exact: true }).click();
    await expect(page.locator(`[data-campaign-checkpoint="${route.middle}"]`)).toHaveCount(0);
    await waitForHumanTurn(page);

    if (route.id === 'high') {
      await equip(page, 'Shield');
      await page.getByRole('button', { name: 'Fire Shield', exact: true }).click();
      await waitForHumanTurn(page);
      await page.getByRole('button', {
        name: 'Select next weapon, current Shield', exact: true,
      }).click();
      await fireEquipped(page, 'Baby Missile', 180, 100);
      await waitForHumanTurn(page);
      await fireEquipped(page, 'Baby Missile', 180, 100);
    } else {
      await fire(page, 'Cluster Bomb', 13, 78);
      await waitForHumanTurn(page);
      await fire(page, 'Cluster Bomb', 13, 96);
    }
    panel = await checkpoint(page);
    await expect(panel).toHaveAttribute('data-campaign-checkpoint', route.middle);
    if (route.id === 'high') {
      await panel.getByRole('button', { name: 'Repair hull · 2', exact: true }).click();
    } else {
      await panel.getByRole('button', { name: 'Refill missile · 1', exact: true }).click();
    }
    await panel.getByRole('button', { name: 'Continue Ash Road', exact: true }).click();
    await waitForHumanTurn(page);

    if (route.id === 'high') {
      await fire(page, 'Sandhog', 68, 94);
      await waitForHumanTurn(page);
      await fire(page, 'Sandhog', 72, 94);
    } else {
      await fire(page, 'Missile', 64, 88);
      await waitForHumanTurn(page);
      await fire(page, 'Missile', 36, 72);
    }
    panel = await checkpoint(page);
    await expect(panel).toHaveAttribute('data-campaign-checkpoint', 'relay-ridge');
    await expect(panel.getByText('Chapter complete', { exact: true })).toBeVisible();
    await expect(panel.getByRole('list', { name: 'Carried kit' })).toContainText(
      route.id === 'high' ? 'sandhog · 0 / 2' : 'missile · 1 / 3',
    );
  });
}
