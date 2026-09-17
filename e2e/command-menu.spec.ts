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
      const header = panel.querySelector<HTMLElement>('.st-hud__command-menu-header')!;
      const headerRect = header.getBoundingClientRect();
      const headerSegments = [...header.children]
        .map((element) => (element as HTMLElement).getBoundingClientRect().toJSON());
      const titleNode = header.querySelector<HTMLElement>('.st-hud__overlay-text')!;
      const title = titleNode.getBoundingClientRect();
      const titleRange = document.createRange();
      titleRange.selectNodeContents(titleNode);
      const titleText = titleRange.getBoundingClientRect();
      const actions = panel.querySelector<HTMLElement>('.st-hud__overlay-btns')!;
      const actionsRect = actions.getBoundingClientRect();
      const actionButtons = [...actions.querySelectorAll<HTMLButtonElement>('.st-hud__restart')];
      const primary = actions.querySelector<HTMLElement>('.st-hud__command-menu-action--primary')!
        .getBoundingClientRect();
      const utilities = [...actions.querySelectorAll<HTMLElement>('.st-hud__command-menu-action--utility')]
        .map((element) => element.getBoundingClientRect().toJSON());
      const exit = panel.querySelector<HTMLElement>('.st-hud__command-menu-exit')!;
      const exitButton = exit.querySelector<HTMLButtonElement>('.st-hud__restart')!;
      const exitRect = exit.getBoundingClientRect();
      const exitButtonRect = exitButton.getBoundingClientRect();
      const exitRange = document.createRange();
      exitRange.selectNodeContents(exitButton);
      const exitText = exitRange.getBoundingClientRect();
      const boxes = [panel, ...panel.querySelectorAll<HTMLElement>('button')]
        .map((element) => element.getBoundingClientRect().toJSON());
      const buttonBoxes = [...panel.querySelectorAll<HTMLElement>('button')]
        .map((element) => ({
          ...element.getBoundingClientRect().toJSON(),
          name: element.getAttribute('aria-label') ?? element.textContent ?? 'unnamed action',
          minHeight: getComputedStyle(element).minHeight,
          battleScale: getComputedStyle(element).getPropertyValue('--battle-ui-scale'),
          storeTarget: getComputedStyle(element).getPropertyValue('--st-store-buy-target'),
          pointerMedia: `coarse=${matchMedia('(pointer: coarse)').matches};fine=${matchMedia('(pointer: fine)').matches}`,
        }));
      return {
        boxes,
        buttonBoxes,
        titleAboveActions: headerRect.bottom <= actionsRect.top,
        actionsAboveExit: actionsRect.bottom <= exitRect.top,
        linkedHeader: headerSegments.every((segment) =>
          Math.abs(segment.top - headerRect.top) <= 1
          && Math.abs(segment.bottom - headerRect.bottom) <= 1),
        primaryDominates: utilities.every((utility) => primary.height > utility.height),
        materialFrame: getComputedStyle(panel).borderImageSource,
        actionMetrics: actionButtons.map((button) => ({
          name: button.getAttribute('aria-label') ?? button.textContent ?? 'unnamed action',
          scrollWidth: button.scrollWidth,
          clientWidth: button.clientWidth,
          scrollHeight: button.scrollHeight,
          clientHeight: button.clientHeight,
        })),
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
    for (const box of geometry.buttonBoxes) {
      expect(box.width, `${box.name} retains a 44px physical target (${box.minHeight}, scale ${box.battleScale}, target ${box.storeTarget}, ${box.pointerMedia})`)
        .toBeGreaterThanOrEqual(43.5);
      expect(box.height, `${box.name} retains a 44px physical target (${box.minHeight}, scale ${box.battleScale}, target ${box.storeTarget}, ${box.pointerMedia})`)
        .toBeGreaterThanOrEqual(43.5);
    }
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport.width + 1);
    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewport.height + 1);
    expect(geometry.panelDisplay).toBe('grid');
    expect(geometry.linkedHeader, 'Menu header segments share one rail').toBe(true);
    expect(geometry.primaryDominates, 'Resume remains the dominant command').toBe(true);
    expect(geometry.materialFrame).not.toBe('none');
    expect(geometry.titleAboveActions, 'Menu heading clears the action group').toBe(true);
    expect(geometry.actionsAboveExit, 'Lobby exit stays separate from in-match actions').toBe(true);
    for (const action of geometry.actionMetrics) {
      expect(action.scrollWidth, `${action.name} stays horizontally contained`)
        .toBeLessThanOrEqual(action.clientWidth);
      expect(action.scrollHeight, `${action.name} stays vertically contained`)
        .toBeLessThanOrEqual(action.clientHeight);
    }
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
    }))).toEqual({ stage: false, hud: false, lobby: true, store: null });
  });
});
