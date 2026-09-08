import { test, expect, type Locator } from '@playwright/test';
import { gotoRunningGame } from './support';
import { STORE_CATALOG } from '../client/src/ui/storeCatalog';
import { WEAPONS, ACCESSORIES } from '../shared/src/engine/WeaponSystem';

/** Accepted Preact console successor coverage map:
 * Retired .st-hud command-card, SVG-gauge, painted-cutout, old arsenal preference,
 * plate-pixel and per-recess assertions described the replaced DOM/art implementation.
 * Their behavioral obligations remain in the following named successors:
 * - Flex crush, command bay/rail ownership, gauge/value containment, physical targets:
 *   fitted semantic controls below + product-completion/console.spec.ts AC-01/02/03.
 * - Fuel spending, equip/buy, wind read-only, Settings persistence and turn progression:
 *   product-completion/console.spec.ts AC-03/05/08 (real engine, five viewport profiles).
 * - Old arsenal banks, purchase keys and scroll reachability: complete catalog below.
 * - Match header/gutter/drawer/text fitting: Match clearance below plus
 *   product-completion/compact-readability.spec.ts and e2e/command-menu.spec.ts.
 * - Input state, Space, fast-forward and modal focus: interaction journeys below.
 * - Round-shop geometry and actual next-round transition: retained test below.
 * - Long identities: actual fitted DOM fixtures below (never frozen-marker geometry).
 * - Pixi fallback, dynamic needle and resource cleanup: compositor-failure-state,
 *   pixi/live-instruments, mount.runtime, lifecycle.runtime and adapter-lifecycle tests.
 * Removed assertions do not define new gameplay or obsolete visual acceptance gates.
 */
async function contained(child: Locator, owner: Locator): Promise<void> {
  const inner = (await child.boundingBox())!;
  const outer = (await owner.boundingBox())!;
  expect(inner).not.toBeNull();
  expect(outer).not.toBeNull();
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

test.describe('accepted battle console rendering guardrails', () => {
  test.beforeEach(async ({ page }) => {
    await gotoRunningGame(page);
    await expect(page.locator('[data-battle-console-surface]')).toHaveAttribute('data-battle-console-ready', 'true');
  });

  test('semantic controls remain fitted, reachable and paired with inert Pixi', async ({ page }) => {
    const surface = page.locator('[data-battle-console-surface]');
    const canvas = page.locator('[data-battle-console-pixi]');
    await expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(await canvas.evaluate(e => getComputedStyle(e).pointerEvents)).toBe('none');
    const controls = page.locator('[data-battle-console-target-key]');
    await expect(controls).toHaveCount(10);
    for (const control of await controls.all()) {
      const name = await control.getAttribute('aria-label');
      await contained(control, surface);
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(30);
      expect(box.height).toBeGreaterThanOrEqual(30);
      if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
        expect(box.width, `${name} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44);
      }
    }
    for (const key of ['node:output:Angle:43', 'node:output:Power:52', 'node:output:Wind:58']) {
      await contained(page.locator(`[data-semantic-key="${key}"]`), surface);
    }
    const field = (await page.locator('#game').boundingBox())!;
    const rail = (await surface.boundingBox())!;
    expect(Math.abs(field.x - rail.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(field.width - rail.width)).toBeLessThanOrEqual(2);
  });

  test('all catalog items and their complete actions can be scrolled into the Armory frame', async ({ page }) => {
    // Reuse the network quick-chat surface in the deterministic hot-seat fixture.
    await page.locator('.st-hud__quick-chat').evaluate(element => element.classList.remove('st-hud__quick-chat--hidden'));
    const quickChat = page.getByRole('button', { name: 'Open quick chat', exact: true });
    await expect(quickChat).toBeVisible();
    await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Armory', exact: true });
    const scroll = dialog.locator('[data-battle-console-armory-scroll]');
    const items = dialog.locator('[data-battle-console-armory-item]');
    await expect(quickChat.click({ trial: true, timeout: 500 })).rejects.toThrow();
    const entries = STORE_CATALOG.flatMap(section => section.entries);
    await expect(items).toHaveCount(entries.length);
    for (const entry of entries) {
      const name = entry.kind === 'weapon' ? WEAPONS[entry.type].name : ACCESSORIES[entry.type].name;
      const item = items.filter({ has: page.getByRole('heading', { name, exact: true }) });
      const buy = item.getByRole('button', { name: /^Buy / });
      await buy.scrollIntoViewIfNeeded();
      await contained(buy, scroll);
      await contained(buy, item);
      await expect(item.locator('[data-battle-console-bundle]')).toContainText('per purchase');
    }
    const lastEnabled = dialog.locator('button:not(:disabled)').last();
    await lastEnabled.focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close Armory' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(lastEnabled).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open Armory', exact: true })).toBeFocused();
    await quickChat.click();
    await expect(quickChat).toHaveAttribute('aria-expanded', 'true');
  });

  test('Match title clears its menu and long names stay in the player row', async ({ page }) => {
    const match = page.locator('#hud .st-hud__match-card');
    if (!await match.isVisible()) await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
    await contained(match, page.locator('#game'));
    const title = await page.locator('#hud .st-hud__match-title').evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return { x: range.getBoundingClientRect().x };
    });
    const menu = (await page.locator('#hud .st-hud__menu').boundingBox())!;
    expect(menu.x + menu.width).toBeLessThanOrEqual(title.x + 1);
    // A detached-copy fixture changes only text, preserving the actual generated CSS.
    const result = await page.locator('#hud .st-hud__player').first().evaluate(player => {
      const copy = player.cloneNode(true) as HTMLElement;
      player.replaceWith(copy);
      const name = copy.querySelector<HTMLElement>('.st-hud__name')!;
      name.textContent = 'LongRangeCommander20';
      const row = copy.getBoundingClientRect();
      const text = name.getBoundingClientRect();
      return { left: text.left - row.left, right: row.right - text.right, overflow: name.scrollWidth - name.clientWidth };
    });
    expect(result.left).toBeGreaterThanOrEqual(-1);
    expect(result.right).toBeGreaterThanOrEqual(-1);
    expect(result.overflow).toBeLessThanOrEqual(1);
  });

  test('legal long Commander and weapon labels remain bounded by their live DOM cells', async ({ page }) => {
    const readings = await page.locator('[data-console-owner="preact"]').evaluate(inline => {
      // Freeze this presentation fixture for typography measurement, without changing engine state.
      const copy = inline.cloneNode(true) as HTMLElement;
      inline.replaceWith(copy);
      const commander = copy.querySelector<HTMLElement>('[data-semantic-key="node:span:P1:10"]')
        ?? copy.querySelector<HTMLElement>('[data-battle-console-compact-chassis] strong')!;
      const weapon = copy.querySelector<HTMLElement>('[data-semantic-key="node:span:Baby Missile:30"]')
        ?? copy.querySelector<HTMLElement>('[data-battle-console-target-key="weapon-next"] > span')!;
      commander.textContent = 'LongRangeCommander20';
      commander.setAttribute('data-battle-console-long-name', '');
      weapon.textContent = 'Bouncing Betty';
      return [commander, weapon].map(element => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height, overflow: style.overflow,
          scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
      });
    });
    for (const reading of readings) {
      expect(reading.width).toBeGreaterThan(30);
      expect(reading.height).toBeGreaterThan(10);
      // Ellipsis is allowed for a bounded name; overflowing ink is not.
      if (reading.scrollWidth > reading.clientWidth || reading.scrollHeight > reading.clientHeight) {
        expect(reading.overflow).toBe('hidden');
      }
    }
  });

  test('Space fires once after an aim control takes focus and locks commands through flight', async ({ page }) => {
    const surface = page.locator('[data-battle-console-surface]');
    const commander = await surface.getAttribute('data-active-commander');
    await page.getByRole('button', { name: 'Aim barrel right', exact: true }).click();
    await page.keyboard.press('Space');
    await expect(surface).toHaveAttribute('data-battle-console-phase', /firing|resolving/);
    for (const name of ['Aim barrel left', 'Aim barrel right', 'Decrease power', 'Increase power']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    }
    await page.keyboard.down('f');
    try {
      await expect(page.locator('.st-hud__toast')).not.toContainText('Fast-forward');
      await expect.poll(() => surface.getAttribute('data-active-commander'), { timeout: 30_000 }).not.toBe(commander);
    } finally { await page.keyboard.up('f'); }
    await expect(page.locator('#game')).toHaveCount(1);
  });

  test('Settings contains focus and prevents aim changes behind its modal', async ({ page }) => {
    const angle = page.locator('[data-semantic-key="node:output:Angle:43"]');
    const before = await angle.textContent();
    await page.getByRole('button', { name: 'Battle settings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Battle Settings', exact: true });
    await expect(dialog.getByRole('switch', { name: 'Trajectory guide' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(angle).toHaveText(before!);
    await dialog.getByRole('button', { name: 'Close settings', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('switch', { name: 'Trajectory guide' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Close settings', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Battle settings', exact: true })).toBeFocused();
  });
  test('real Round Shop owns the completed-round transition and reference frame', async ({ page }, testInfo) => {
    await page.goto('?e2e=round-shop');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());

    const dialog = page.getByRole('dialog', { name: /Round 1.*Player 1 won.*Round 2 of 3/i });
    const panel = page.locator('.st-hud__overlay-panel--round-shop');
    await expect(dialog).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(panel.locator('.st-hud__overlay-text')).toContainText('Round 1 complete');
    await expect(panel.locator('.st-hud__roundshop-title')).toHaveText('Round shop');
    await expect(panel.locator('.st-hud__roundshop-sel')).toHaveValue(/.+/);
    await expect(page.locator('#modal-layer [role="dialog"]:visible')).toHaveCount(1);
    await expect(page.locator('#modal-layer [aria-label="Store"]:visible')).toHaveCount(0);
    await expect(page.locator('#modal-layer [data-ui="arsenal-drawer"]:visible')).toHaveCount(0);
    await expect(panel.locator('.st-hud__roundshop-sel')).toBeFocused();

    const geometry = await panel.evaluate((owner) => {
      const panelRect = owner.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const gridRect = owner.querySelector<HTMLElement>('.st-hud__roundshop-grid')!.getBoundingClientRect();
      const interactive = [...owner.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)')]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const clippedByGrid = element.closest('.st-hud__roundshop-grid') !== null
            && (rect.top < gridRect.top - 1 || rect.bottom > gridRect.bottom + 1);
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0
            && !clippedByGrid;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            text: element.textContent?.trim() ?? '',
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            clientWidth: element.clientWidth,
            clientHeight: element.clientHeight,
            scrollWidth: element.scrollWidth,
            scrollHeight: element.scrollHeight,
          };
        });
      const title = owner.querySelector<HTMLElement>('.st-hud__roundshop-title')!;
      const credits = owner.querySelector<HTMLElement>('.st-hud__roundshop-credits')!;
      const titleRect = title.getBoundingClientRect();
      const creditsRect = credits.getBoundingClientRect();
      const selector = owner.querySelector<HTMLSelectElement>('.st-hud__roundshop-sel')!;
      const visibleCards = [...owner.querySelectorAll<HTMLElement>('.st-hud__roundshop-grid .st-hud__store-buy')]
        .filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.top >= gridRect.top - 1 && rect.bottom <= gridRect.bottom + 1;
        });
      const visibleCardNames = visibleCards.map((card) => {
        const name = card.querySelector<HTMLElement>('.st-hud__roundshop-item-name')!;
        const style = getComputedStyle(name);
        return {
          text: name.textContent ?? '',
          clientWidth: name.clientWidth,
          clientHeight: name.clientHeight,
          scrollWidth: name.scrollWidth,
          scrollHeight: name.scrollHeight,
          textOverflow: style.textOverflow,
        };
      });
      return {
        panel: {
          left: panelRect.left,
          top: panelRect.top,
          right: panelRect.right,
          bottom: panelRect.bottom,
          width: panelRect.width,
          height: panelRect.height,
          clientWidth: owner.clientWidth,
          clientHeight: owner.clientHeight,
          scrollWidth: owner.scrollWidth,
          scrollHeight: owner.scrollHeight,
        },
        viewport,
        interactive,
        headTextIntersects: titleRect.left < creditsRect.right - 1
          && titleRect.right > creditsRect.left + 1
          && titleRect.top < creditsRect.bottom - 1
          && titleRect.bottom > creditsRect.top + 1,
        selectorAppearance: getComputedStyle(selector).appearance,
        visibleCardIconCounts: visibleCards.map((card) => card.querySelectorAll('.st-weapon-icon, .st-ui-glyph').length),
        visibleCardNames,
        nextRoundGlyphCount: owner.querySelectorAll('.st-hud__restart > .st-ui-glyph').length,
        stageScale: document.getElementById('app')!.getBoundingClientRect().width / 1200,
        coarse: matchMedia('(pointer: coarse)').matches,
      };
    });

    await panel.screenshot({ path: testInfo.outputPath(`round-shop-reference-lock-${testInfo.project.name}.png`) });

    expect(geometry.panel.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(-1);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
    expect(geometry.panel.scrollWidth).toBeLessThanOrEqual(geometry.panel.clientWidth + 1);
    expect(geometry.panel.scrollHeight).toBeLessThanOrEqual(geometry.panel.clientHeight + 1);
    expect(geometry.headTextIntersects, 'Round Shop title and credits occupy separate hardware labels').toBe(false);
    expect(geometry.selectorAppearance, 'tank selector uses authored hardware instead of browser-native chrome').toBe('none');
    expect(geometry.visibleCardIconCounts.length).toBeGreaterThanOrEqual(3);
    expect(geometry.visibleCardIconCounts.every((count) => count === 1), 'every visible commerce key has one semantic-family glyph').toBe(true);
    for (const name of geometry.visibleCardNames) {
      expect(name.textOverflow, `${name.text} is shown in full instead of ellipsized`).not.toBe('ellipsis');
      expect(name.scrollWidth, `${name.text} fits its commerce-key name well`).toBeLessThanOrEqual(name.clientWidth + 1);
      expect(name.scrollHeight, `${name.text} fits its commerce-key name well`).toBeLessThanOrEqual(name.clientHeight + 1);
    }
    expect(geometry.nextRoundGlyphCount, 'Next Round has one registered command glyph').toBe(1);
    expect(geometry.interactive.length).toBeGreaterThanOrEqual(4);
    for (const control of geometry.interactive) {
      expect(control.left, `${control.text} starts inside the Round Shop frame`).toBeGreaterThanOrEqual(geometry.panel.left - 1);
      expect(control.top, `${control.text} starts inside the Round Shop frame`).toBeGreaterThanOrEqual(geometry.panel.top - 1);
      expect(control.right, `${control.text} ends inside the Round Shop frame`).toBeLessThanOrEqual(geometry.panel.right + 1);
      expect(control.bottom, `${control.text} ends inside the Round Shop frame`).toBeLessThanOrEqual(geometry.panel.bottom + 1);
      expect(control.scrollWidth, `${control.text} has no horizontal clipping`).toBeLessThanOrEqual(control.clientWidth + 1);
      expect(control.scrollHeight, `${control.text} has no vertical clipping`).toBeLessThanOrEqual(control.clientHeight + 1);
      if (geometry.coarse) expect(control.height, `${control.text} remains touch-safe`).toBeGreaterThanOrEqual(44);
    }

    await panel.getByRole('button', { name: 'Start Next Round', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-semantic-key="node:output:Angle:43"]')).toBeVisible();
  });


});
