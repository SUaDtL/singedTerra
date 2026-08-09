import { test, expect } from '@playwright/test';
import { gotoRunningGame } from './support';

test.describe('Command Menu navigation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoRunningGame(page);
  });

  test('keeps one named, focus-safe navigation surface fitted across supported controls', async ({
    page,
  }, testInfo) => {
    const store = page.getByRole('button', { name: /Store/ });
    const railMenuTrigger = testInfo.project.name === 'pixel-touch'
      ? page.locator('[data-command="menu"]')
      : page.locator('#hud .st-hud__menu');

    await store.click();
    await expect(page.locator('.st-hud__store')).toBeVisible();
    const menuTrigger = page.locator('[data-command="open-menu"]');
    const handoffBox = await menuTrigger.boundingBox();
    expect(handoffBox).not.toBeNull();
    if (testInfo.project.name === 'pixel-touch') {
      expect(handoffBox!.height).toBeGreaterThanOrEqual(44);
    }
    await menuTrigger.click();

    const menu = page.getByRole('dialog', { name: 'Command Menu' });
    const resume = menu.getByRole('button', { name: 'Resume' });
    const exit = menu.getByRole('group', { name: 'Leave this match' });
    await expect(menu).toBeVisible();
    await expect(page.locator('.st-hud__store')).toBeHidden();
    await expect(resume).toBeFocused();
    await expect(exit.getByRole('button', { name: 'Return to Lobby' })).toBeVisible();
    expect(await page.evaluate(() => ({
      stage: document.getElementById('stage')!.inert,
      hud: document.getElementById('hud')!.inert,
      lobby: document.getElementById('lobby')!.inert,
      store: document.querySelector<HTMLElement>('.st-hud__store')!.inert,
    }))).toEqual({ stage: true, hud: true, lobby: true, store: true });

    const geometry = await menu.evaluate((node) => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const panel = node.querySelector<HTMLElement>('.st-hud__overlay-panel')!;
      const boxes = [panel, ...panel.querySelectorAll<HTMLElement>('button')]
        .map((element) => element.getBoundingClientRect().toJSON());
      return {
        boxes,
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
        viewport,
      };
    });
    for (const box of geometry.boxes) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.top).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
      expect(box.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
    }
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport.width + 1);
    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewport.height + 1);

    await resume.click();
    await expect(menu).toBeHidden();
    await expect(railMenuTrigger).toBeFocused();
    await expect(railMenuTrigger).toBeVisible();
    expect(await page.evaluate(() => ({
      stage: document.getElementById('stage')!.inert,
      hud: document.getElementById('hud')!.inert,
      lobby: document.getElementById('lobby')!.inert,
      store: document.querySelector<HTMLElement>('.st-hud__store')!.inert,
    }))).toEqual({ stage: false, hud: false, lobby: false, store: false });
  });
});
