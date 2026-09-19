import { expect, test } from '@playwright/test';
import { gotoLobby, openLocalPreparation } from './support';

test('keeps battle commands usable when a deployment removes deferred presentation chunks', async ({ page }) => {
  await gotoLobby(page);
  await openLocalPreparation(page);
  const deploy = page.getByRole('button', { name: 'Deploy local battle', exact: true });
  await expect(deploy).toBeVisible();

  // The entry document and its dependencies have loaded. Simulate an atomic
  // static-host deployment removing old chunks before the first battle entry.
  let missingChunks = 0;
  await page.route('**/assets/*.js', async (route) => {
    missingChunks += 1;
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
  });
  await deploy.click();
  await expect(page.locator('[data-console-owner="preact"]')).toBeVisible();
  const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
  if (await briefing.isVisible()) await briefing.getByRole('button', { name: 'Skip', exact: true }).click();
  const skipCoach = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skipCoach.isVisible()) await skipCoach.click();
  const fire = page.locator('[data-battle-console-action="fire"]');
  await expect(fire).toBeVisible();
  await expect(fire).toBeEnabled();
  await fire.click();
  await expect(fire).toBeDisabled();
  expect(missingChunks).toBeGreaterThan(0);
});
