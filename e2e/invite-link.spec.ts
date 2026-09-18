import { expect, test } from '@playwright/test';
import { assertGoldSafeAction } from './support';

test('a room invite opens a prefilled Join Room flow without auto-joining', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const joinRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/join_room')) joinRequests.push(request.url());
  });

  await page.goto('?join=ab12');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  await expect(page.getByRole('navigation', { name: 'Choose deployment' })).toHaveCount(0);
  await expect(page.locator('button[data-command-item="online"]'))
    .toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-multiplayer-command-view="online"]')).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Play Online preparation' })).toHaveCount(0);
  const code = page.locator('.lobby-code-input');
  const online = page.locator(
    '.command-center__library-items button[data-command-item="online"]',
  );
  const primary = page.getByRole('button', { name: 'Join Room' });
  await expect(code).toHaveValue('AB12');
  await code.focus();
  await page.evaluate(() => Promise.resolve());
  await expect(code).toBeFocused();
  await expect(primary).toBeInViewport({ ratio: 1 });
  const primaryBox = await primary.boundingBox();
  expect(primaryBox, 'Invite Join action must render').not.toBeNull();
  expect(primaryBox!.height, 'Invite Join action must remain a deliberate control, not a stretched panel')
    .toBeLessThanOrEqual(96);
  expect(primaryBox!.height, 'Invite Join action must retain a reasonable button proportion')
    .toBeLessThanOrEqual(primaryBox!.width * 0.6);
  await assertGoldSafeAction(
    page,
    '[data-multiplayer-command-view="online"] .lobby-btn.primary',
  );
  const containment = await online.evaluate((item) => {
    const library = item.closest<HTMLElement>('.command-center__library-items');
    if (!library) throw new Error('Online item lost its library');
    const itemBox = item.getBoundingClientRect();
    const libraryBox = library.getBoundingClientRect();
    return {
      item: itemBox.toJSON(),
      library: libraryBox.toJSON(),
    };
  });
  expect(containment.item.left).toBeGreaterThanOrEqual(containment.library.left - 1);
  expect(containment.item.right).toBeLessThanOrEqual(containment.library.right + 1);
  expect(joinRequests).toEqual([]);
});
