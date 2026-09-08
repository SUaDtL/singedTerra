import { expect, test } from '@playwright/test';

test('AC04 Armory preloads its frame and retains an opaque chassis during delayed image loading', async ({ page }) => {
  let releaseFrame!: () => void;
  let requested = false;
  const delayed = new Promise<void>(resolve => { releaseFrame = resolve; });
  await page.route('**/battle-armory-frame-*', async route => {
    requested = true;
    await delayed;
    await route.continue();
  });
  try {
    await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
    await page.goto('?e2e=hotseat', { waitUntil: 'domcontentloaded' });
    await page.locator('#st-splash').click();
    await expect(page.locator('[data-battle-console-surface]')).toHaveAttribute('data-battle-console-ready', 'true');
    expect(requested, 'Frame request starts before first Armory open').toBe(true);
    await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Armory', exact: true });
    expect(await dialog.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(23, 21, 24)');
    await expect(dialog.getByRole('button', { name: 'Close Armory', exact: true })).toBeEnabled();
    releaseFrame();
    const image = page.locator('[data-battle-console-armory-frame-preload]');
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await image.evaluate(element => (element as HTMLImageElement).decode());
  } finally {
    releaseFrame();
  }
});
