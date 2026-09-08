import { expect, test } from '@playwright/test';

test('AC01 dialog focus preserves internal commander and Pixi registration', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  await page.locator('#st-splash').click();
  await expect(page.locator('[data-battle-console-surface]')).toHaveAttribute('data-battle-console-ready', 'true');
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
    await page.getByRole('button', { name: opener, exact: true }).click();
    const dialog = page.getByRole('dialog', { name, exact: true });
    await expect(dialog).toBeVisible();
    expect(await geometry()).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await geometry()).toEqual(before);
  }
});
