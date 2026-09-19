import { expect, test } from '@playwright/test';
import { gotoLobby, selectCommandWorkspace } from './support';

const OPERATIONS = [
  ['standard', 'Standard Duel', 'A balanced three-round duel.'],
  ['first-salvo', 'First Salvo', 'A one-round duel that starts with the essentials.'],
  ['crosswind-range', 'Crosswind Range', 'Wraparound walls turn shifting wind into a ranging test.'],
  ['caldera-run', 'Caldera Run', 'Lava terrain turns every crater into a positional risk.'],
  ['last-light-siege', 'Last Light Siege', 'A best-of-three duel that tightens into sudden death.'],
  ['lean-arsenal', 'Lean Arsenal', 'Level 0 restocks only. Preserve your opening kit.'],
] as const;

for (const [id, title, briefing] of OPERATIONS) {
  test(`Quick Operation ${title} launches with its identity retained in the match ledger`, async ({ page }, testInfo) => {
    await gotoLobby(page);
    await selectCommandWorkspace(page, 'Skirmishes', id);

    const operation = page.locator(`[data-skirmish-command-view][data-operation-id="${id}"]`);
    await expect(operation).toBeVisible();
    await expect(operation.locator('[data-battlefield-projection]')).toBeVisible();
    await expect(page.locator(
      `.command-center__library-items [data-command-item="${id}"]`,
    )).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-ui="quick-operation-briefing"]')).toHaveText(briefing);
    const objective = page.locator('[data-ui="quick-operation-objective"]');
    if (id === 'last-light-siege') {
      await expect(objective).toBeVisible();
      await expect(objective).toHaveText('Hold the Field · Win the duel.');
      await expect(objective).toHaveAttribute('data-content-version', '1');
      await expect(objective).toHaveAttribute('data-field-order-id', 'hold-the-field');
      await page.screenshot({ path: testInfo.outputPath('last-light-lobby.png') });
      await expect(objective).toBeInViewport();
    } else if (id !== 'standard' && id !== 'first-salvo') {
      const expected = {
        'crosswind-range': ['First Strike · Damage the CPU within your first three salvos.', 'first-strike'],
        'caldera-run': ['Set the Position · Change firing position, then damage the CPU with your first salvo.', 'set-the-position'],
        'lean-arsenal': ['Make It Count · Win the best-of-three duel with Level 0 restocks only.', 'make-it-count'],
      }[id];
      await expect(objective).toBeVisible();
      await expect(objective).toHaveText(expected[0]);
      await expect(objective).toHaveAttribute('data-content-version', '2');
      await expect(objective).toHaveAttribute('data-field-order-id', expected[1]);
    } else {
      await expect(objective).toBeHidden();
    }
    await page.getByRole('button', { name: `Start ${title}`, exact: true }).click();

    await expect(page.locator('[data-console-owner="preact"]')).toBeVisible();
    const entry = page.getByRole('button', { name: 'Enter battle', exact: true });
    if (await entry.isVisible()) await entry.click();
    await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
    await expect(page.locator('#hud [data-ui="quick-operation"]')).toHaveText(`${title} · ${briefing}`);
    if (id === 'last-light-siege') {
      const liveObjective = page.locator('#hud [data-ui="field-order"]');
      await expect(liveObjective)
        .toHaveText('Hold the Field · Win the duel. · Awaiting duel outcome');
      await expect(page.locator('#hud [data-ui="quick-operation"]'))
        .toHaveAttribute('data-content-version', '1');
      await expect(liveObjective).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('last-light-live.png') });
    }
    const round = page.locator('.st-hud__round');
    await expect(round).toBeVisible();
    await expect(round).toHaveText(id === 'first-salvo' ? 'Single round' : 'Round 1 of 3');
  });
}

test('a selected operation retains its ledger identity through one real salvo', async ({ page }) => {
  await gotoLobby(page);
  await selectCommandWorkspace(page, 'Skirmishes', 'crosswind-range');
  await page.getByRole('button', { name: 'Start Crosswind Range', exact: true }).click();

  const briefing = page.getByRole('dialog', { name: 'First salvo briefing' });
  await expect(briefing).toBeVisible();
  await briefing.getByRole('button', { name: 'Enter battle', exact: true }).click();
  await expect(briefing).toBeHidden();

  await page.getByRole('button', { name: /^Fire / }).click();
  await expect(page.getByText(/^(Tracking shot|Resolving impact)$/)).toBeVisible();
  await expect(page.locator('[data-console-owner="preact"]').getByText('CPU 1', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  await expect(page.locator('#hud [data-ui="quick-operation"]'))
    .toHaveText('Crosswind Range · Wraparound walls turn shifting wind into a ranging test.');
});

test('terminal fixture presents the selected practice result and restarts its real Last Light config', async ({ page }, testInfo) => {
  await page.goto('?e2e=victory&quick-operation=last-light-siege');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  await expect(page.locator('.st-hud__overlay--victory')).toBeVisible();
  await expect(page.locator('[data-ui="quick-operation-report"]'))
    .toHaveText('Operation · Last Light Siege — A best-of-three duel that tightens into sudden death.');
  await expect(page.locator('[data-ui="quick-operation-report"]'))
    .toHaveAttribute('data-operation-id', 'last-light-siege');
  await expect(page.locator('[data-ui="quick-operation-report"]'))
    .toHaveAttribute('data-content-version', '1');
  await expect(page.locator('.st-hud__victory-field-order'))
    .toHaveText('Hold the Field achieved — duel won.');
  await expect(page.locator('#hud [data-ui="quick-operation"]'))
    .toHaveText('Last Light Siege · A best-of-three duel that tightens into sudden death.');
  await page.screenshot({ path: testInfo.outputPath('last-light-terminal.png') });

  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await expect(page.locator('[data-console-owner="preact"]')).toBeVisible();
  const entry = page.getByRole('button', { name: 'Enter battle', exact: true });
  if (await entry.isVisible()) await entry.click();
  await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  await expect(page.locator('#hud [data-ui="field-order"]'))
    .toHaveText('Hold the Field · Win the duel. · Awaiting duel outcome');
  await expect(page.locator('#hud [data-ui="quick-operation"]'))
    .toHaveAttribute('data-operation-id', 'last-light-siege');
  await expect(page.locator('.st-hud__round')).toHaveText('Round 1 of 3');
  await expect(page.getByRole('listitem', { name: /CPU 1/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('last-light-restart.png') });
});
