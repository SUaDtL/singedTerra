import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  enterBattleIfBriefed,
  gotoLobby,
  openStandardSkirmishWorkspace,
  selectCommandWorkspace,
} from './support';

async function openReturningSkirmish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
  });
  await gotoLobby(page);
  await openStandardSkirmishWorkspace(page);
}

async function assertReachableTarget(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width, 'real control must retain its physical hitbox').toBeGreaterThanOrEqual(44);
  expect(box!.height, 'real control must retain its physical hitbox').toBeGreaterThanOrEqual(44);
}

test('Skirmishes selects each operation through the library with one owned launch action', async ({ page }, testInfo) => {
  await openReturningSkirmish(page);
  const workspace = page.locator('.command-center__workspace-host');
  const view = workspace.locator('[data-skirmish-command-view]');

  for (const [id, name, fact] of [
    ['standard', 'Standard Duel', '3 rounds'],
    ['crosswind-range', 'Crosswind Range', 'Wrap walls'],
    ['caldera-run', 'Caldera Run', 'Lava hazard'],
    ['last-light-siege', 'Last Light Siege', 'Sudden death, turn 12'],
  ] as const) {
    await selectCommandWorkspace(page, 'Skirmishes', id);
    await expect(view.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(view.locator('.campaign-command__equipment')).toContainText(fact);
    const primary = view.locator('[data-command-primary]');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText(`Start ${name}`);
    await assertReachableTarget(primary);
  }

  const geometry = await workspace.evaluate((owner) => {
    const view = owner.querySelector<HTMLElement>('[data-skirmish-command-view]');
    if (!view) throw new Error('Missing selected Skirmish view');
    const outer = owner.getBoundingClientRect();
    const inner = view.getBoundingClientRect();
    return {
      horizontalOverflow: owner.scrollWidth - owner.clientWidth,
      contained: inner.left >= outer.left - 1 && inner.right <= outer.right + 1,
    };
  });
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(geometry.contained).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('skirmish-library-selected.png') });
});

test('imported challenge remains a selected owned Skirmish workspace', async ({ page }, testInfo) => {
  await page.goto('./#challenge=ST1-CW-16');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  const item = page.locator('.command-center__item[data-command-item="imported-challenge"]');
  const workspace = page.locator('.command-center__workspace-host');
  const challenge = workspace.locator('[data-skirmish-command-view][data-ui="seed-challenge"]');
  await expect(item).toHaveAttribute('aria-current', 'true');
  await expect(challenge.getByRole('heading', { name: 'Crosswind Range', exact: true }))
    .toBeVisible();
  await expect(challenge.locator('[data-ui="seed-challenge-objective"]')).toBeVisible();
  await expect(challenge.locator('[data-ui="seed-challenge-seed"]')).toHaveText('Seed · 42');
  await expect(challenge.locator('[data-command-primary]')).toHaveCount(1);
  await assertReachableTarget(challenge.locator('[data-command-primary]'));
  expect(await workspace.evaluate((owner) => owner.scrollWidth - owner.clientWidth))
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('skirmish-imported-challenge.png') });
});

test('keyboard item selection launches the selected operation into the existing HUD', async ({ page }, testInfo) => {
  await openReturningSkirmish(page);
  const caldera = page.locator('.command-center__item[data-command-item="caldera-run"]');
  await caldera.focus();
  await caldera.press('Enter');
  await expect(caldera).toBeFocused();
  await expect(caldera).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-skirmish-command-view] h2')).toHaveText('Caldera Run');
  await page.getByRole('button', { name: 'Start Caldera Run', exact: true }).press('Enter');
  await enterBattleIfBriefed(page);
  await expect(page.locator('[data-console-owner="preact"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Fire / })).toBeEnabled();
  await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  await expect(page.locator('#hud [data-ui="quick-operation"]'))
    .toHaveText('Caldera Run · Lava terrain turns every crater into a positional risk.');
  await page.screenshot({ path: testInfo.outputPath('skirmish-to-hud.png') });
});
