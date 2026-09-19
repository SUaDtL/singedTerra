import { expect, test } from '@playwright/test';
import { gotoLobby, openLocalPreparation, openOnlinePreparation } from './support';

test('Local is directly owned by its selected command item', async ({ page }) => {
  await gotoLobby(page);
  await openLocalPreparation(page);
  await expect(page.locator('button[data-command-item="local-battle"]'))
    .toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-multiplayer-command-view="local-battle"]')).toBeVisible();
});

test('Online and Local replace one another through their command items', async ({ page }, testInfo) => {
  await gotoLobby(page);
  await openOnlinePreparation(page);
  const local = page.locator(
    '.command-center__library-items button[data-command-item="local-battle"]',
  );
  await local.click();
  await expect(local).toBeFocused();
  await expect(page.locator('[data-multiplayer-command-view="local-battle"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('direct-Online-to-Local.png') });
});
