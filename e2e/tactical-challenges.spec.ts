import { expect, test } from '@playwright/test';

const CASES = [
  { id: 'crosswind-range', moves: 0, result: 'First Strike achieved — CPU damaged on salvo 1' },
  { id: 'caldera-run', moves: 2, result: 'Set the Position achieved — opening shot landed after changing firing position' },
  { id: 'caldera-run', moves: 0, result: 'Set the Position not achieved — change firing position and land the opening shot' },
] as const;

for (const scenario of CASES) {
  test(`P04 ${scenario.id} with ${scenario.moves} moves resolves its objective from a real human shot`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto('?e2e=quick-duel-seed');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());
    await page.locator('[data-ui="other-quick-duels"] > summary').click();
    await page.locator(`[data-operation-id="${scenario.id}"]`).click();
    await expect(page.locator('[data-ui="quick-operation-objective"]')).toHaveAttribute('data-content-version', '2');
    await page.getByRole('button', { name: 'Quick Duel vs CPU', exact: true }).click();
    await page.getByRole('button', { name: 'Enter battle', exact: true }).click();

    const angle = page.locator('[data-semantic-key="node:output:Angle:43"]');
    const power = page.locator('[data-semantic-key="node:output:Power:52"]');
    await expect(angle).toHaveText('45°');
    await expect(power).toHaveText('50');
    for (let move = 0; move < scenario.moves; move += 1) {
      await page.getByRole('button', { name: 'Move tank right, 8 fuel maximum', exact: true }).click();
    }
    for (let click = 0; click < 15; click += 1) {
      await page.getByRole('button', { name: 'Aim barrel left', exact: true }).click();
    }
    for (let click = 0; click < 50; click += 1) {
      await page.getByRole('button', { name: 'Increase power', exact: true }).click();
    }
    await expect(angle).toHaveText('30°');
    await expect(power).toHaveText('100');
    await page.getByRole('button', { name: 'Fire Baby Missile', exact: true }).click();
    await expect(page.locator('[data-battle-console-surface]'))
      .toHaveAttribute('data-battle-console-phase', /firing|resolving/);

    const result = page.locator('#hud [data-ui="field-order"]');
    await expect(result).toHaveText(scenario.result, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
    await expect(result).toBeVisible();
    await expect(result).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('tactical-objective-result.png') });
    await page.getByRole('button', { name: 'Close match ledger', exact: true }).click();
  });
}
