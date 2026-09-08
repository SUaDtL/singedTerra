import { expect, test } from '@playwright/test';

test('AC04 Armory heading sits at the center of its brass nameplate', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'compact', 'Compact header has a separately fitted layout');
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  await page.locator('#st-splash').click();
  await expect(page.locator('[data-battle-console-surface]')).toHaveAttribute('data-battle-console-ready', 'true');
  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Armory', exact: true });
  const box = (await dialog.boundingBox())!;
  const title = (await dialog.getByRole('heading', { name: 'Armory', exact: true }).boundingBox())!;
  const center = (title.y + title.height / 2 - box.y) / box.height;
  expect(center).toBeGreaterThan(.098);
  expect(center).toBeLessThan(.12);
});
