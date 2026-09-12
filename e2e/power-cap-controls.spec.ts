import { expect, test } from '@playwright/test';

test('Battery purchase drives keyboard, touch control, pointer gauge, and a shot above 100', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'one causal controls journey; responsive contracts run separately');
  test.setTimeout(45_000);
  await page.goto('./');
  const splash = page.locator('#st-splash');
  await expect(splash).toBeVisible();
  await splash.click();
  await expect(splash).toBeHidden();
  await page.getByRole('button', { name: 'Local Battle', exact: true }).click();
  await page.getByRole('button', { name: 'Deploy local battle', exact: true }).click();

  const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
  await briefing.waitFor({ state: 'visible', timeout: 500 }).catch(() => undefined);
  if (await briefing.isVisible()) {
    await briefing.getByRole('button', { name: 'Enter battle', exact: true }).click();
  }
  const power = page.locator('[data-semantic-key="node:output:Power:52"]');
  await expect(page.locator('[data-battle-console-surface]'))
    .toHaveAttribute('data-battle-console-ready', 'true');
  await expect(power).toBeVisible();
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible()) await skip.click();

  await expect(power).toHaveAccessibleName('Power 50 of 100');

  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const armory = page.getByRole('dialog', { name: 'Armory', exact: true });
  const battery = armory.locator('[data-battle-console-armory-item]')
    .filter({ has: page.getByRole('heading', { name: 'Battery', exact: true }) });
  await expect(armory.locator('[data-battle-console-credits]')).toHaveText('$8,000');
  await battery.getByRole('button', { name: 'Buy $5,000', exact: true }).click();
  await expect(armory.locator('[data-battle-console-credits]')).toHaveText('$3,000');
  await armory.getByRole('button', { name: 'Close Armory', exact: true }).click();
  await expect(power).toHaveAccessibleName('Power 50 of 200');

  const canvas = page.locator('#game');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(
    bounds!.x + bounds!.width * 0.95,
    bounds!.y + bounds!.height * 0.1,
  );
  await expect(power).toHaveText('200');
  await expect(power).toHaveAccessibleName('Power 200 of 200');

  await page.keyboard.press('ArrowDown');
  await expect(power).toHaveAccessibleName('Power 198 of 200');
  await page.getByRole('button', { name: 'Increase power', exact: true }).click();
  await expect(power).toHaveAccessibleName('Power 199 of 200');
  await page.getByRole('button', { name: 'Increase power', exact: true }).click();
  await expect(power).toHaveAccessibleName('Power 200 of 200');

  const console = page.locator('[data-battle-console-surface]');
  await page.locator('button[data-battle-console-action="fire"]').click();
  await expect(console).toHaveAttribute('data-battle-console-phase', /firing|resolving/);
  await page.keyboard.down('f');
  await expect(page.locator('[data-semantic-key="node:span:P1:10"]')).toHaveText('Player 2', { timeout: 20_000 });
  await page.keyboard.up('f');
  await expect(power).toHaveAccessibleName('Power 50 of 100');
});
