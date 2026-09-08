import { test, expect } from '@playwright/test';
import { gotoRunningGame } from './support';

// The replacement Armory keeps descriptions with their inventory cards; the
// retired hover dossier is no longer a second presentation of the same weapon.
test.describe('weapon intel battlefield composition', () => {
  test('buys a finite weapon inside the sole Armory dialog', async ({ page }) => {
    await gotoRunningGame(page);
    await page.getByRole('button', { name: 'Open Armory' }).click();
    const armory = page.getByRole('dialog', { name: 'Armory', exact: true });
    const missile = armory.locator('article').filter({ has: page.getByRole('heading', { name: 'Missile', exact: true }) });
    const ammo = missile.locator('[data-battle-console-owned]');
    const credits = armory.getByLabel('Available credits');
    await expect(ammo).toHaveText('4 ammo');
    await expect(credits).toHaveText('$8,000');
    await missile.getByRole('button', { name: 'Buy $1,875', exact: true }).click();
    await expect(ammo).toHaveText('9 ammo');
    await expect(credits).toHaveText('$6,125');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('dialog', { name: 'Store' })).toHaveCount(0);
  });

  test('exposes each inventory description and equips with the active input mode', async ({ page }, testInfo) => {
    await gotoRunningGame(page);
    const open = page.getByRole('button', { name: 'Open Armory' });
    if (testInfo.project.name === 'pixel-touch') await open.tap();
    else await open.click();
    const armory = page.getByRole('dialog', { name: 'Armory', exact: true });
    await expect(armory).toHaveAttribute('aria-modal', 'true');
    const cards = armory.locator('article');
    expect(await cards.count()).toBeGreaterThan(10);
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole('heading')).toBeVisible();
      await expect(card.locator('p')).not.toBeEmpty();
      const fit = await card.evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }));
      expect(fit.scroll).toBeLessThanOrEqual(fit.width + 1);
    }
    const missile = cards.filter({ has: page.getByRole('heading', { name: 'Missile', exact: true }) });
    await expect(missile.locator('p')).toContainText('Reliable direct-hit blast');
    await missile.getByRole('button', { name: 'Equip', exact: true }).click();
    await expect(missile.getByRole('button', { name: 'Equipped', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(armory).toHaveCount(0);
    await expect(open).toBeFocused();
    await expect(page.getByRole('button', { name: 'Select next weapon, current Missile', exact: true })).toBeVisible();
    const fit = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(fit.width).toBeLessThanOrEqual(fit.viewport);
  });
});
