import { test, expect } from '@playwright/test';
import { gotoRunningGame } from './support';

test.describe('weapon intel battlefield composition', () => {
  test('previews tactics through the active input mode and stays inside the arsenal layer', async ({
    page,
  }, testInfo) => {
    await gotoRunningGame(page);
    const hud = page.locator('#hud');
    const drawer = page.locator('.st-hud__strip');
    const panel = page.locator('.st-hud__weapon-intel');
    const before = await hud.evaluate((node) => node.scrollHeight);

    const openArsenal = page.getByRole('button', { name: 'Expand arsenal' });
    if (testInfo.project.name === 'pixel-touch') await openArsenal.tap();
    else await openArsenal.click();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-weapon', 'baby_missile');
    await expect(panel).toContainText('Reliable precision shot');
    const scrollDossierToBottom = () => panel.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
      return node.scrollTop;
    });
    const expectHeadingVisible = async (name: string) => {
      const visibility = await panel.evaluate((node, expectedName) => {
        const heading = node.querySelector<HTMLElement>('.st-hud__weapon-intel-name')!;
        const panelRect = node.getBoundingClientRect();
        const headingRect = heading.getBoundingClientRect();
        return {
          name: heading.textContent,
          scrollTop: node.scrollTop,
          visible: headingRect.top >= panelRect.top && headingRect.bottom <= panelRect.bottom,
        };
      }, name);
      expect(visibility).toEqual({ name, scrollTop: 0, visible: true });
    };
    const missile = page.locator('.st-hud__weapon-btn[data-weapon="missile"]');
    await expect(missile).toBeVisible();
    if (testInfo.project.name === 'pixel-touch') {
      expect(await scrollDossierToBottom()).toBeGreaterThan(0);
      await missile.tap();
      await expect(panel).toHaveAttribute('data-weapon', 'missile');
      await expectHeadingVisible('Missile');
      await expect(page.locator('.st-hud__weapon-value')).toHaveText('Missile');
    } else {
      await page.getByRole('button', { name: 'Collapse arsenal' }).focus();
      await page.keyboard.press('Tab');
      await expect(panel).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('.st-hud__weapon-btn[data-weapon="baby_missile"]')).toBeFocused();
      if (testInfo.project.name === 'small-window') {
        expect(await scrollDossierToBottom()).toBeGreaterThan(0);
      }
      await page.keyboard.press('Tab');
      await expect(missile).toBeFocused();
      await expect(panel).toHaveAttribute('data-weapon', 'missile');
      if (testInfo.project.name === 'small-window') await expectHeadingVisible('Missile');
      await expect(panel).toContainText('Balanced direct attack');

      const dirtBomb = page.locator('.st-hud__weapon-btn[data-weapon="dirt_bomb"]');
      await expect(dirtBomb).toBeVisible();
      await missile.click();
      if (testInfo.project.name === 'small-window') {
        expect(await scrollDossierToBottom()).toBeGreaterThan(0);
      }
      const beforeHover = await panel.boundingBox();
      await dirtBomb.hover();
      const afterHover = await panel.boundingBox();
      expect(afterHover?.y).toBeCloseTo(beforeHover!.y, 0);
      if (testInfo.project.name === 'small-window') {
        expect(afterHover?.height).toBeCloseTo(beforeHover!.height, 0);
      }
      await expect(panel).toHaveAttribute('data-weapon', 'dirt_bomb');
      if (testInfo.project.name === 'small-window') await expectHeadingVisible('Dirt Bomb');
      await expect(panel).toContainText('Raises a mound');
      await missile.hover();
      await expect(panel).toHaveAttribute('data-weapon', 'missile');

      const snapshotPointerLayout = () => page.evaluate(() => {
        const panelNode = document.querySelector<HTMLElement>('.st-hud__weapon-intel')!;
        const gridNode = document.querySelector<HTMLElement>('.st-hud__strip-grid')!;
        const buttons = [...document.querySelectorAll<HTMLElement>('.st-hud__weapon-btn')]
          .filter((node) => getComputedStyle(node).display !== 'none')
          .map((node) => ({
            weapon: node.dataset['weapon'],
            offsetTop: node.offsetTop,
            offsetLeft: node.offsetLeft,
            offsetWidth: node.offsetWidth,
            offsetHeight: node.offsetHeight,
          }));
        return {
          panelHeight: panelNode.offsetHeight,
          gridTop: gridNode.offsetTop,
          gridHeight: gridNode.clientHeight,
          buttons,
        };
      });
      const pointerLayout = await snapshotPointerLayout();
      const visibleWeapons = page.locator('.st-hud__weapon-btn:not(.st-hud__weapon-btn--hidden)');
      for (let index = 0; index < await visibleWeapons.count(); index += 1) {
        const weaponButton = visibleWeapons.nth(index);
        const type = await weaponButton.getAttribute('data-weapon');
        const box = await weaponButton.boundingBox();
        await panel.evaluate((node) => {
          const tracked = node as HTMLElement & {
            weaponIntelObserver?: MutationObserver;
            weaponIntelTransitions?: string[];
          };
          tracked.weaponIntelTransitions = [];
          tracked.weaponIntelObserver?.disconnect();
          tracked.weaponIntelObserver = new MutationObserver((records) => {
            if (records.some((record) => record.type === 'attributes')) {
              tracked.weaponIntelTransitions!.push(tracked.dataset['weapon'] ?? '');
            }
          });
          tracked.weaponIntelObserver.observe(tracked, {
            attributes: true,
            attributeFilter: ['data-weapon'],
          });
        });
        await weaponButton.hover({ position: { x: box!.width / 2, y: Math.min(4, box!.height / 2) } });
        await expect(panel).toHaveAttribute('data-weapon', type!);
        await page.waitForTimeout(50);
        await expect(panel).toHaveAttribute('data-weapon', type!);
        const transitions = await panel.evaluate((node) => {
          const tracked = node as HTMLElement & {
            weaponIntelObserver?: MutationObserver;
            weaponIntelTransitions?: string[];
          };
          tracked.weaponIntelObserver?.disconnect();
          return tracked.weaponIntelTransitions ?? [];
        });
        expect(transitions.length).toBeLessThanOrEqual(1);
        if (transitions.length === 1) expect(transitions[0]).toBe(type);
        expect(await snapshotPointerLayout()).toEqual(pointerLayout);
      }
    }

    const geometry = await page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector<HTMLElement>(selector)!.getBoundingClientRect().toJSON();
      const hudNode = document.querySelector<HTMLElement>('#hud')!;
      const panelNode = document.querySelector<HTMLElement>('.st-hud__weapon-intel')!;
      const targets = [...document.querySelectorAll<HTMLElement>('.st-hud__weapon-btn')]
        .filter((node) => node.getBoundingClientRect().height > 0)
        .map((node) => node.getBoundingClientRect().height);
      const app = document.querySelector<HTMLElement>('#app')!;
      const zoom = Number.parseFloat(getComputedStyle(app).zoom || '1');
      const physicalFontSize = (selector: string) =>
        Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(selector)!).fontSize) * zoom;
      return {
        drawer: rect('.st-hud__strip'),
        panel: rect('.st-hud__weapon-intel'),
        canvas: rect('#game'),
        hudScrollHeight: hudNode.scrollHeight,
        panelClientWidth: panelNode.clientWidth,
        panelScrollWidth: panelNode.scrollWidth,
        panelClientHeight: panelNode.clientHeight,
        panelScrollHeight: panelNode.scrollHeight,
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        targets,
        fonts: {
          name: physicalFontSize('.st-hud__weapon-intel-name'),
          ammo: physicalFontSize('.st-hud__weapon-intel-ammo'),
          label: physicalFontSize('.st-hud__weapon-intel-label'),
          value: physicalFontSize('.st-hud__weapon-intel-value'),
        },
      };
    });

    expect(geometry.panel.left).toBeGreaterThanOrEqual(geometry.drawer.left - 1);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.drawer.right + 1);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.drawer.top - 1);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.drawer.bottom + 1);
    expect(geometry.drawer.left).toBeGreaterThanOrEqual(geometry.canvas.right - 1);
    expect(geometry.hudScrollHeight).toBe(before);
    expect(geometry.panelScrollWidth).toBeLessThanOrEqual(geometry.panelClientWidth + 1);
    if (testInfo.project.name === 'desktop-fine') {
      expect(geometry.panelScrollHeight).toBeLessThanOrEqual(geometry.panelClientHeight + 1);
    } else {
      expect(geometry.panelClientHeight).toBeGreaterThan(0);
    }
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewportHeight);
    if (testInfo.project.name === 'pixel-touch') {
      expect(Math.min(...geometry.targets)).toBeGreaterThanOrEqual(44);
    }
    if (testInfo.project.name === 'pixel-touch' || testInfo.project.name === 'small-window') {
      expect(geometry.fonts.name).toBeGreaterThanOrEqual(11.5);
      expect(geometry.fonts.ammo).toBeGreaterThanOrEqual(9.5);
      expect(geometry.fonts.label).toBeGreaterThanOrEqual(8.5);
      expect(geometry.fonts.value).toBeGreaterThanOrEqual(10.5);
    }
  });
});
