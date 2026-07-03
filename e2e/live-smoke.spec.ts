import { test, expect } from '@playwright/test';
import {
  gotoRunningGame,
  isCompact,
  findHudLayoutViolations,
  assertInstrumentsHeight,
} from './support';

/**
 * Post-deploy LIVE smoke (closes the loop with issue #104: "merged but stale/
 * clipped in prod"). Tagged @live so it runs ONLY when pointed at the deployed
 * site (E2E_LIVE_URL set); the local suite skips it via grepInvert. It drives the
 * real production URL through the same deterministic ?e2e=hotseat entrypoint and
 * fails loudly if the served bundle renders the instrument cluster crushed or
 * clipped — i.e. if a broken/stale bundle reached users.
 */
test.describe('@live production render smoke', () => {
  test('instrument cluster renders and nothing in #hud is crushed/clipped', async ({ page }) => {
    await gotoRunningGame(page);
    const compact = await isCompact(page);
    await assertInstrumentsHeight(page, compact);
    const violations = await findHudLayoutViolations(page);
    expect(
      violations,
      `LIVE #hud children crushed/clipped: ${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });
});
