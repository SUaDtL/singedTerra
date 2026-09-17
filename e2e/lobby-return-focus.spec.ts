import { expect, test } from '@playwright/test';
import { enterBattleIfBriefed, gotoLobby, openLocalPreparation } from './support';

test('returning from a local match restores keyboard focus to its visible preparation tab', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
  });
  await gotoLobby(page);
  await openLocalPreparation(page);
  await page.getByRole('button', { name: 'Deploy local battle', exact: true }).click();
  await enterBattleIfBriefed(page);
  await expect(page.locator('#lobby')).toBeHidden();
  const menuButton = page.locator('#hud .st-hud__menu');
  if (!await menuButton.isVisible()) {
    await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  }
  await menuButton.click();
  await page.getByRole('dialog', { name: 'Command Menu' })
    .getByRole('button', { name: 'Return to Lobby', exact: true }).click();
  const localTab = page.getByRole('tab', { name: 'Local Battle', exact: true });
  await expect(localTab).toBeVisible();
  await expect(localTab).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.getElementById('lobby')?.contains(document.activeElement)))
    .toBe(true);
});
