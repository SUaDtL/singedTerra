import { expect, test } from '@playwright/test';
import {
  gotoVerifiedFixtureLobby,
  installVerifiedNetworkFixture,
  verifiedCareer,
} from './verified-challenge-fixture';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Verified Career presentation with an explicit mocked network fixture', () => {
  test('binds 600 combined XP to the authenticated account while preserving the 400 replay subtotal', async ({ page }, testInfo) => {
    const fixture = await installVerifiedNetworkFixture(page, {
      career: verifiedCareer(3, 1, true),
    });
    await gotoVerifiedFixtureLobby(page);

    const trigger = page.locator('.account-panel__account-trigger');
    await expect(trigger).toHaveAccessibleName(/Commander Ranger, R-02 Gunner, Level 2, 400 XP to Level 3/);
    await expect(trigger).toContainText('R-02 / Gunner');
    await expect(trigger).toContainText('Level 2');
    await trigger.click();

    const account = page.getByRole('dialog', { name: 'Player account', exact: true });
    await expect(account).toBeVisible();
    await expect(account.getByRole('region', { name: 'Verified Career', exact: true }))
      .toContainText('600 verified XP · Replay 400 XP · Challenges 200 XP');
    await expect(account.getByRole('region', { name: 'Verified Career', exact: true }))
      .toContainText('Crosswind Qualification medal earned');
    await expect(account.locator('.account-panel__progress')).toContainText(/Level\s*2/);
    await expect(account.locator('.account-panel__xp-value')).toHaveText('100 / 500 XP');
    const accountBox = await account.boundingBox();
    expect(accountBox).not.toBeNull();
    expect(accountBox!.x).toBeGreaterThanOrEqual(-1);
    expect(accountBox!.y).toBeGreaterThanOrEqual(-1);
    expect(accountBox!.x + accountBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(accountBox!.y + accountBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    await page.screenshot({ path: testInfo.outputPath('verified-career-600-xp.png') });
    expect(fixture.requests.career).toBeGreaterThanOrEqual(1);
    expect(fixture.requests.start).toHaveLength(0);
  });

  test('does not invent combined totals or a medal when Verified Career is unavailable', async ({ page }, testInfo) => {
    await installVerifiedNetworkFixture(page, { careerUnavailable: true });
    await gotoVerifiedFixtureLobby(page);

    const trigger = page.locator('.account-panel__account-trigger');
    await expect(trigger).toHaveAccessibleName(/Commander Ranger, R-01 Cadet, Level 1, 100 XP to Level 2/);
    await expect(trigger).toContainText('Level 1');
    await trigger.click();

    const account = page.getByRole('dialog', { name: 'Player account', exact: true });
    await expect(account.locator('.account-panel__verified-career-unavailable'))
      .toHaveText('Verified Career unavailable');
    await expect(account).not.toContainText('600 verified XP');
    await expect(account).not.toContainText('Crosswind Qualification medal earned');
    await page.screenshot({ path: testInfo.outputPath('verified-career-unavailable.png') });
  });
});
