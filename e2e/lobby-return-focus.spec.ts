import { expect, test } from '@playwright/test';
import { enterBattleIfBriefed, gotoLobby, openLocalPreparation } from './support';

test('returning from a local match restores focus to its selected command item and workspace', async ({ page }) => {
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
  const localItem = page.locator('button[data-command-item="local-battle"]');
  await expect(localItem).toBeVisible();
  await expect(localItem).toHaveAttribute('aria-current', 'true');
  await expect(localItem).toBeFocused();
  await expect(page.locator('[data-multiplayer-command-view="local-battle"]')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.getElementById('lobby')?.contains(document.activeElement)))
    .toBe(true);
});
