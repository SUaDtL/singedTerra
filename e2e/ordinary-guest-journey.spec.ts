import { expect, test, type Page } from '@playwright/test';

// Deliberately explicit: this test must represent an untouched guest, while the
// configured fixture continues to inherit the project's base URL, device, and
// deny-external-network proxy settings.
test.use({ storageState: { cookies: [], origins: [] } });

const ANGLE = '[data-semantic-key="node:output:Angle:43"]';
const POWER = '[data-semantic-key="node:output:Power:52"]';

async function chooseFoundryPreset(page: Page, player: 1 | 2): Promise<void> {
  await page.getByRole('button', { name: `Apply Foundry preset to Player ${player}`, exact: true }).click();
}

async function fillSetting(page: Page, label: string, value: string): Promise<void> {
  const field = page.locator('#lobby .lobby-field').filter({ hasText: label });
  await field.locator('input').fill(value);
}

async function setInitialSolution(
  page: Page,
  aimControl: string,
  expectedStartingAngle: string,
): Promise<void> {
  const angle = page.locator(ANGLE);
  const power = page.locator(POWER);
  await expect(angle).toHaveText(expectedStartingAngle);
  await expect(power).toHaveText('50');

  const aim = page.getByRole('button', { name: aimControl, exact: true });
  const decreasePower = page.getByRole('button', { name: 'Decrease power', exact: true });
  for (let click = 0; click < 45; click += 1) await aim.click();
  await expect(angle).toHaveText('90°');
  for (let click = 0; click < 50; click += 1) await decreasePower.click();
  await expect(power).toHaveText('0');
}

async function fireAndWaitForSettlement(page: Page, finalShot = false): Promise<void> {
  const surface = page.locator('[data-battle-console-surface]');
  const fire = page.getByRole('button', { name: 'Fire Baby Missile', exact: true });
  const owner = await surface.getAttribute('data-active-commander');
  await expect(fire).toBeEnabled();
  await fire.click();
  await expect(fire).toBeDisabled();
  await expect(surface).toHaveAttribute('data-battle-console-phase', /firing|resolving/);

  if (finalShot) return;
  await expect.poll(() => surface.getAttribute('data-active-commander'), { timeout: 30_000 })
    .not.toBe(owner);
  await expect(fire).toBeEnabled({ timeout: 30_000 });
}

test.describe('ordinary guest journey', () => {
  test('reaches a terminal local match and retry through public controls', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-fine',
      'One Chromium guest critical path; touch and small-window remain covered by their layout journeys.',
    );
    test.setTimeout(150_000);

    // This is intentionally the ordinary root URL: no E2E query, DOM removal,
    // engine hook, or storage mutation may replace a guest-facing action.
    await page.goto('./');
    const splash = page.locator('#st-splash');
    await expect(splash).toBeVisible();
    await splash.click();
    await expect(splash).toBeHidden({ timeout: 5_000 });

    await page.getByRole('button', { name: 'Local Battle', exact: true }).click();
    const customization = page.locator('.lobby-hotseat-customization');
    await expect(customization).toBeVisible();
    if (await customization.getAttribute('open') === null) await customization.locator('summary').click();
    await expect(customization).toHaveAttribute('open', '');
    await chooseFoundryPreset(page, 1);
    await chooseFoundryPreset(page, 2);

    await page.getByRole('button', { name: 'Advanced settings', exact: true }).click();
    await fillSetting(page, 'Wind cap', '0');
    await fillSetting(page, 'Seed', '1337');
    await fillSetting(page, 'Rounds', '1');
    await fillSetting(page, 'Arms level', '4');
    await page.getByRole('dialog', { name: 'Operations Settings', exact: true })
      .getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Deploy local battle', exact: true }).click();

    const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
    await expect(briefing).toBeVisible();
    await briefing.getByRole('button', { name: 'Enter battle', exact: true }).click();
    await expect(briefing).toBeHidden();
    await expect(page.locator(ANGLE)).toHaveText('45°');

    await setInitialSolution(page, 'Aim barrel right', '45°');
    await fireAndWaitForSettlement(page);
    await setInitialSolution(page, 'Aim barrel left', '135°');
    await fireAndWaitForSettlement(page);
    for (let shot = 0; shot < 4; shot += 1) await fireAndWaitForSettlement(page);
    await fireAndWaitForSettlement(page, true);

    const terminal = page.locator('.st-hud__overlay--victory');
    await expect(terminal).toBeVisible({ timeout: 30_000 });
    await expect(terminal.getByRole('heading', { name: 'Player 2 wins', exact: true })).toBeVisible();
    await terminal.screenshot({ path: testInfo.outputPath('ordinary-guest-terminal.png') });

    await terminal.getByRole('button', { name: 'Play again', exact: true }).click();
    await expect(terminal).toBeHidden();
    const surface = page.locator('[data-battle-console-surface]');
    await expect(surface).toHaveAttribute('data-active-commander', 'p1');
    await expect(surface.locator('[data-battle-console-text-key="commander.health"]')).toHaveText('100 HP');
    await expect(page.locator(ANGLE)).toHaveText('45°');
    await expect(page.locator(POWER)).toHaveText('50');
    await expect(page.getByRole('button', { name: 'Fire Baby Missile', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('ordinary-guest-retry.png') });
  });
});
