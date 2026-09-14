import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __SINGED_TERRA_PAGE_RESTORE_EVENTS__?: Array<{
      type: 'pagehide' | 'pageshow';
      persisted: boolean;
    }>;
    __SINGED_TERRA_E2E__?: {
      forwardedActions: { setAngle: number; setPower: number; fire: number };
    };
  }
}

test.use({
  // The default headless shell does not implement Chromium's page cache. This
  // portable Playwright channel selects the installed full Chromium build.
  channel: 'chromium',
  launchOptions: {
    // Playwright adds this switch itself. Removing only that artificial default
    // exercises Chromium's real page cache rather than changing application flags.
    ignoreDefaultArgs: ['--disable-back-forward-cache'],
  },
});

test('retains one usable battle console through two real Chromium BFCache restores', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
    const events: Array<{ type: 'pagehide' | 'pageshow'; persisted: boolean }> = [];
    window.__SINGED_TERRA_PAGE_RESTORE_EVENTS__ = events;
    addEventListener('pagehide', (event) => events.push({ type: 'pagehide', persisted: event.persisted }));
    addEventListener('pageshow', (event) => events.push({ type: 'pageshow', persisted: event.persisted }));
  });
  await page.goto('./?e2e=hotseat&seed=1337');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  const fire = page.locator('[data-battle-console-action="fire"]');
  await expect(fire).toBeVisible();
  await expect(fire).toBeEnabled();

  const matchUrl = page.url();
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    const awayUrl = new URL(matchUrl);
    awayUrl.search = `?t08-away=${cycle}`;
    await page.goto(awayUrl.href);
    await Promise.all([
      page.waitForURL(matchUrl, { waitUntil: 'commit' }),
      page.evaluate(() => history.back()),
    ]);
    await page.waitForFunction(() => (
      window.__SINGED_TERRA_PAGE_RESTORE_EVENTS__?.some(
        (event) => event.type === 'pageshow' && event.persisted,
      ) === true
    ));

    await expect(page.locator('[data-battle-console-surface]')).toHaveCount(1);
    await expect(page.locator('[data-battle-console-host]')).toHaveCount(2);
    await expect(fire).toBeVisible();
    await expect(fire).toBeEnabled();
    await expect(page.locator('#game')).toBeVisible();
    const before = await page.evaluate(() => window.__SINGED_TERRA_E2E__!.forwardedActions);
    const angle = page.getByRole('status', { name: 'Angle', exact: true });
    const priorAngle = await angle.textContent();
    await page.getByRole('button', { name: 'Aim barrel left', exact: true }).click();
    await expect(angle).not.toHaveText(priorAngle ?? '');
    await expect.poll(() => page.evaluate(() => (
      window.__SINGED_TERRA_E2E__?.forwardedActions.setAngle ?? 0
    ))).toBe(before.setAngle + 1);
    await expect.poll(() => page.evaluate(() => (
      window.__SINGED_TERRA_PAGE_RESTORE_EVENTS__?.filter(
        (event) => event.type === 'pageshow' && event.persisted,
      ).length ?? 0
    ))).toBe(cycle);
  }

  const beforeFire = await page.evaluate(() => window.__SINGED_TERRA_E2E__!.forwardedActions.fire);
  await fire.click();
  await expect.poll(() => page.evaluate(() => (
    window.__SINGED_TERRA_E2E__?.forwardedActions.fire ?? 0
  ))).toBe(beforeFire + 1);
});
