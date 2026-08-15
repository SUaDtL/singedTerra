import { expect, test } from '@playwright/test';

const OPERATIONS = [
  ['standard', 'Standard Duel', 'A balanced three-round duel.'],
  ['crosswind-range', 'Crosswind Range', 'Wraparound walls turn shifting wind into a ranging test.'],
  ['caldera-run', 'Caldera Run', 'Lava terrain turns every crater into a positional risk.'],
  ['last-light-siege', 'Last Light Siege', 'A best-of-three duel that tightens into sudden death.'],
] as const;

for (const [id, title, briefing] of OPERATIONS) {
  test(`Quick Operation ${title} launches with its identity retained in the match ledger`, async ({ page }) => {
    await page.goto('?e2e=quick-duel-seed');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());

    const operation = page.locator(`[data-operation-id="${id}"]`);
    await operation.click();
    await expect(operation).toBeFocused();
    await expect(operation).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-ui="quick-operation-briefing"]')).toHaveText(briefing);
    await page.getByRole('button', { name: 'Quick Duel vs CPU', exact: true }).click();

    await expect(page.locator('#battle-rail .st-hud__console-solution')).toBeVisible();
    await expect(page.locator('#battle-rail .st-hud__fire-terminal')).toBeVisible();
    await expect(page.locator('#hud [data-ui="quick-operation"]')).toHaveText(`${title} · ${briefing}`);
    const round = page.locator('.st-hud__round');
    await expect(round).toBeVisible();
    await expect(round).toHaveText('Round 1 of 3');
  });
}

test('a selected operation retains its ledger identity through one real salvo', async ({ page }) => {
  await page.goto('?e2e=quick-duel-seed');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  await page.locator('[data-operation-id="crosswind-range"]').click();
  await page.getByRole('button', { name: 'Quick Duel vs CPU', exact: true }).click();

  const briefing = page.locator('[data-ui="first-salvo-briefing"]');
  if (await briefing.isVisible()) {
    await page.getByRole('button', { name: 'Enter battle', exact: true }).click();
    await expect(briefing).toBeHidden();
  }

  await page.locator('#battle-rail .st-hud__primary-action').click();
  await expect(page.locator('#battle-rail .st-hud__fire-terminal'))
    .toHaveAttribute('data-command-mode', /tracking|resolving/);
  await expect(page.locator('#battle-rail .st-hud__fire-terminal'))
    .toHaveAttribute('data-command-mode', 'handoff', { timeout: 30_000 });
  await expect(page.locator('#hud [data-ui="quick-operation"]'))
    .toHaveText('Crosswind Range · Wraparound walls turn shifting wind into a ranging test.');
});

test('selected Quick Operation remains legible in the real After Action report', async ({ page }) => {
  await page.goto('?e2e=victory&quick-operation=last-light-siege');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  await expect(page.locator('.st-hud__overlay--victory')).toBeVisible();
  await expect(page.locator('[data-ui="quick-operation-report"]'))
    .toHaveText('Operation · Last Light Siege — A best-of-three duel that tightens into sudden death.');
  await expect(page.locator('#hud [data-ui="quick-operation"]'))
    .toHaveText('Last Light Siege · A best-of-three duel that tightens into sudden death.');
});
