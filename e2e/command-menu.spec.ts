import { test, expect } from '@playwright/test';
import { gotoRunningGame } from './support';

test.describe('Command Menu navigation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoRunningGame(page);
    const briefing = page.getByRole('dialog', { name: 'First salvo briefing', exact: true });
    if (await briefing.isVisible()) {
      await page.getByRole('button', { name: 'Enter battle', exact: true }).click();
    }
    const skip = page.getByRole('button', { name: 'Skip', exact: true });
    if (await skip.isVisible()) await skip.click();
  });

  test('keeps one named, focus-safe navigation surface fitted across supported controls', async ({
    page,
  }, testInfo) => {
    const railMenuTrigger = page.locator('#hud .st-hud__menu');
    const matchTrigger = page.getByRole('button', { name: 'Open match ledger', exact: true });
    const matchHardware = page.locator('[data-ui="match-drawer-toggle"]');
    const openedDrawer = !await railMenuTrigger.isVisible();
    if (openedDrawer) {
      await matchTrigger.click();
    }
    await railMenuTrigger.click();
    const launchMenu = page.getByRole('dialog', { name: 'Command Menu' });
    await expect(launchMenu.getByRole('button', { name: /Store/ })).toHaveCount(0);
    const menu = launchMenu;
    const resume = menu.getByRole('button', { name: 'Resume' });
    const exit = menu.getByRole('group', { name: 'Leave this match' });
    await expect(menu).toBeVisible();
    await expect(matchHardware, 'the active modal visually retires the external Match launcher')
      .toBeHidden();
    await expect(resume).toBeFocused();
    await expect(exit.getByRole('button', { name: 'Return to Lobby' })).toBeVisible();
    expect(await page.evaluate(() => ({
      stage: document.getElementById('stage')!.inert,
      hud: document.getElementById('hud')!.inert,
      lobby: document.getElementById('lobby')!.inert,
      store: document.querySelector<HTMLElement>('.st-hud__store')?.inert ?? null,
    }))).toEqual({ stage: true, hud: true, lobby: true, store: null });

    const geometry = await menu.evaluate((node) => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const panel = node.querySelector<HTMLElement>('.st-hud__overlay-panel')!;
      const panelRect = panel.getBoundingClientRect();
      const titleNode = panel.querySelector<HTMLElement>('.st-hud__overlay-text')!;
      const title = titleNode.getBoundingClientRect();
      const titleRange = document.createRange();
      titleRange.selectNodeContents(titleNode);
      const titleText = titleRange.getBoundingClientRect();
      const actions = panel.querySelector<HTMLElement>('.st-hud__overlay-btns')!;
      const actionsRect = actions.getBoundingClientRect();
      const actionButtons = [...actions.querySelectorAll<HTMLButtonElement>('.st-hud__restart')];
      const exit = panel.querySelector<HTMLElement>('.st-hud__command-menu-exit')!;
      const exitButton = exit.querySelector<HTMLButtonElement>('.st-hud__restart')!;
      const exitRect = exit.getBoundingClientRect();
      const exitButtonRect = exitButton.getBoundingClientRect();
      const exitRange = document.createRange();
      exitRange.selectNodeContents(exitButton);
      const exitText = exitRange.getBoundingClientRect();
      const boxes = [panel, ...panel.querySelectorAll<HTMLElement>('button')]
        .map((element) => element.getBoundingClientRect().toJSON());
      return {
        boxes,
        titleAboveActions: title.bottom <= actionsRect.top,
        actionsAboveExit: actionsRect.bottom <= exitRect.top,
        actionTextFits: actionButtons.every((button) => button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight),
        panelDisplay: getComputedStyle(panel).display,
        titleCenterRatio: ((title.top + title.bottom) / 2 - panelRect.top) / panelRect.height,
        titleTextFits:
          titleText.left >= title.left + 8
          && titleText.right <= title.right - 8
          && titleText.top >= title.top + 2
          && titleText.bottom <= title.bottom - 2,
        titleTextFill: titleText.height / title.height,
        actionFillRatios: actionButtons.map((button) => button.getBoundingClientRect().height / actionsRect.height),
        exitButtonFill: exitButtonRect.height / exitRect.height,
        exitTextCenterError: Math.abs(
          (exitText.top + exitText.bottom) / 2 - (exitButtonRect.top + exitButtonRect.bottom) / 2,
        ),
        exitTextFill: exitText.height / exitButtonRect.height,
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
    expect(geometry.panelDisplay).toBe('grid');
    expect(geometry.titleAboveActions, 'Menu heading clears the action group').toBe(true);
    expect(geometry.actionsAboveExit, 'Lobby exit stays separate from in-match actions').toBe(true);
    expect(geometry.actionTextFits, 'Action labels stay inside their controls').toBe(true);
    expect(geometry.exitTextCenterError, 'Lobby exit label is vertically centered').toBeLessThanOrEqual(3);
    await page.screenshot({ path: testInfo.outputPath(`command-menu-fitted-${testInfo.project.name}.png`) });

    await resume.click();
    await expect(menu).toBeHidden();
    await expect(openedDrawer ? matchTrigger : railMenuTrigger).toBeFocused();
    await expect(openedDrawer ? matchTrigger : railMenuTrigger).toBeVisible();
    if (openedDrawer) await expect(railMenuTrigger).toBeHidden();
    expect(await page.evaluate(() => ({
      stage: document.getElementById('stage')!.inert,
      hud: document.getElementById('hud')!.inert,
      lobby: document.getElementById('lobby')!.inert,
      store: document.querySelector<HTMLElement>('.st-hud__store')?.inert ?? null,
    }))).toEqual({ stage: false, hud: false, lobby: false, store: null });
  });
});
