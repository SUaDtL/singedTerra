import { expect, test } from '@playwright/test';

test('AC01 dialog focus preserves internal commander and Pixi registration', async ({ page, baseURL }) => {
  let releaseDecoration = () => {};
  const decorationRelease = new Promise<void>((resolve) => {
    releaseDecoration = resolve;
  });
  if (baseURL === undefined) throw new Error('Product-completion base URL is required');
  const heldDecorationUrl = new URL('art/battle-console-integrated/canonical-pixi-layer.png', baseURL);
  const isHeldDecorationUrl = (url: URL) => url.href === heldDecorationUrl.href;
  await page.route(isHeldDecorationUrl, async (route) => {
    await decorationRelease;
    await route.continue();
  });
  const decorationRequest = page.waitForRequest((request) => isHeldDecorationUrl(new URL(request.url())));
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  const splash = page.locator('#st-splash');
  await splash.click();
  await expect(splash).toBeHidden();
  const surface = page.locator('[data-battle-console-surface]');
  await expect(surface).toHaveAttribute('data-battle-console-ready', 'true');
  await decorationRequest;
  await expect(surface).toHaveAttribute('data-battle-console-textures-ready', 'false');
  await expect(surface).toHaveAttribute('data-battle-console-pending-resources', '1');
  await expect(surface.locator('[data-battle-console-host="pixi"] canvas')).toHaveCount(0);
  releaseDecoration();
  await expect(surface).toHaveAttribute('data-battle-console-textures-ready', 'true');
  await expect(surface).toHaveAttribute('data-battle-console-pending-resources', '0');
  await expect(surface.locator('[data-battle-console-host="pixi"] canvas')).toHaveCount(1);
  const geometry = () => page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('[data-battle-console-surface]')!;
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const commander = surface.querySelector('[data-battle-console-text-key="commander.health"]')!;
    return {
      surface: bounds(surface),
      commander: bounds(commander),
      pixi: bounds(surface.querySelector('[data-battle-console-host="pixi"] canvas')!),
      scrollLeft: surface.scrollLeft,
      scrollTop: surface.scrollTop,
    };
  });
  const before = await geometry();
  expect(before.scrollLeft).toBe(0);
  expect(before.scrollTop).toBe(0);
  for (const [opener, name] of [['Battle settings', 'Battle Settings'], ['Open Armory', 'Armory']] as const) {
    const openerButton = page.getByRole('button', { name: opener, exact: true });
    await openerButton.click();
    const dialog = page.getByRole('dialog', { name, exact: true });
    await expect(dialog).toBeVisible();
    expect(await geometry()).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(openerButton).toBeFocused();
    expect(await geometry()).toEqual(before);
  }
});
