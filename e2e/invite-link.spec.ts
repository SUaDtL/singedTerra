import { expect, test } from '@playwright/test';

test('a room invite opens a prefilled Join Room flow without auto-joining', async ({ page }) => {
  const joinRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/join_room')) joinRequests.push(request.url());
  });

  await page.goto('?join=ab12');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  await expect(page.getByRole('navigation', { name: 'Choose deployment' })).toHaveCount(0);
  await expect(page.getByRole('tabpanel', { name: 'Play Online preparation' })).toBeVisible();
  await expect(page.locator('.lobby-code-input')).toHaveValue('AB12');
  await expect(page.getByRole('button', { name: 'Join Room' })).toBeVisible();
  expect(joinRequests).toEqual([]);
});
