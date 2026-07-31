import { test, expect } from '@playwright/test';
import {
  gotoRunningGame,
  isCompact,
  findHudLayoutViolations,
  assertInstrumentsHeight,
} from './support';

const ARSENAL_WEAPONS = [
  ['baby_missile', 'Baby Missile'],
  ['missile', 'Missile'],
  ['heavy_missile', 'Heavy Missile'],
  ['baby_nuke', 'Baby Nuke'],
  ['nuke', 'Nuke'],
  ['dirt_bomb', 'Dirt Bomb'],
  ['bouncing_betty', 'Bouncing Betty'],
  ['funky_bomb', 'Funky Bomb'],
  ['napalm', 'Napalm'],
  ['cluster_bomb', 'Cluster Bomb'],
  ['mirv', 'MIRV'],
  ['deaths_head', "Death's Head"],
  ['riot_bomb', 'Riot Bomb'],
  ['hot_napalm', 'Hot Napalm'],
  ['shield', 'Shield'],
] as const;

const STORE_WEAPONS = ARSENAL_WEAPONS.slice(1);

/**
 * HUD rendering-guardrail suite. Runs across the viewport matrix (desktop-fine,
 * pixel-touch, small-window) defined in playwright.config.ts. Every assertion
 * reads COMPUTED GEOMETRY from real Chromium — not DOM presence — because the bug
 * these guard against (the instrument cluster flex-crushed to ~10.6px) had the
 * right DOM but the wrong layout.
 */
test.describe('HUD layout guardrails', () => {
  test.beforeEach(async ({ page }) => {
    await gotoRunningGame(page);
  });

  test('instrument cluster is not flex-crushed (the exact regression)', async ({ page }) => {
    const compact = await isCompact(page);
    await assertInstrumentsHeight(page, compact);
  });

  test('no direct #hud child is crushed or content-clipped (generalized invariant)', async ({
    page,
  }) => {
    const violations = await findHudLayoutViolations(page);
    expect(
      violations,
      `#hud children must not be crushed/clipped, got: ${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  test('combat command glyphs stay semantic, framed, and fitted', async ({
    page,
  }) => {
    const icons = page.locator('svg.st-ui-icon');
    const glyphs = page.locator('.st-ui-glyph');

    await expect(icons).toHaveCount(5);
    await expect(glyphs).toHaveCount(4);
    expect(await icons.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-symbol')),
    )).toEqual(['menu', 'credits', 'target', 'ordnance', 'disclosure']);
    expect(await glyphs.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-glyph')),
    )).toEqual(['menu', 'store', 'fire', 'arsenal']);

    const arsenal = page.locator('[data-icon="arsenal"]');
    const store = page.locator('[data-icon="store"]');
    await expect(arsenal.locator('circle[r="9"]')).toHaveCount(1);
    await expect(store.locator('circle[r="6"]')).toHaveCount(1);
    await expect(page.getByText('Arsenal', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Store/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Fire/ })).toBeVisible();

    const geometry = await page.evaluate(() => ({
      glyphSizes: [...document.querySelectorAll<HTMLElement>('.st-ui-glyph')].map(
        (glyph) => {
          const glyphRect = glyph.getBoundingClientRect();
          const iconRect = glyph.querySelector('svg')!.getBoundingClientRect();
          return {
            frameWidth: glyphRect.width,
            frameHeight: glyphRect.height,
            iconWidth: iconRect.width,
            iconHeight: iconRect.height,
          };
        },
      ),
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    for (const size of geometry.glyphSizes) {
      expect(size.frameWidth).toBeGreaterThanOrEqual(15);
      expect(size.frameHeight).toBeGreaterThanOrEqual(15);
      expect(size.iconWidth).toBeGreaterThanOrEqual(12);
      expect(size.iconHeight).toBeGreaterThanOrEqual(12);
    }
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewportHeight);
  });

  test('weapon-family glyphs remain visible inside Arsenal and Store', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Expand arsenal' }).click();
    const arsenalCatalog = await page.locator(
      '.st-hud__weapon-btn',
    ).evaluateAll((buttons) => buttons.map((button) => ({
      weapon: (button as HTMLElement).dataset['weapon'],
      iconWeapon: button.querySelector('.st-weapon-icon')
        ?.getAttribute('data-weapon'),
      name: button.querySelector('.st-hud__weapon-btn-name')?.textContent,
    })));
    expect(arsenalCatalog).toEqual(ARSENAL_WEAPONS.map(([weapon, name]) => ({
      weapon,
      iconWeapon: weapon,
      name,
    })));

    const arsenalIcons = page.locator(
      '.st-hud__weapon-btn:not(.st-hud__weapon-btn--hidden) .st-weapon-icon',
    );
    expect(await arsenalIcons.count()).toBeGreaterThanOrEqual(10);
    const arsenalSizes = await arsenalIcons.evaluateAll((icons) =>
      icons.map((icon) => {
        const rect = icon.getBoundingClientRect();
        const button = icon.closest('button')!.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          contained:
            rect.left >= button.left - 1
            && rect.right <= button.right + 1
            && rect.top >= button.top - 1
            && rect.bottom <= button.bottom + 1,
        };
      }),
    );
    for (const size of arsenalSizes) {
      expect(size.width).toBeGreaterThanOrEqual(11);
      expect(size.height).toBeGreaterThanOrEqual(11);
      expect(size.contained).toBe(true);
    }

    await page.getByRole('button', { name: 'Collapse arsenal' }).click();
    await page.getByRole('button', { name: /Store/ }).click();
    const storeIcons = page.locator('.st-hud__store-name-line .st-weapon-icon');
    const storeCatalog = await page.locator(
      '.st-hud__store-name-line',
    ).evaluateAll((lines) => lines.map((line) => ({
      weapon: line.querySelector('.st-weapon-icon')
        ?.getAttribute('data-weapon'),
      name: line.querySelector('.st-hud__store-name')?.textContent,
    })));
    expect(storeCatalog).toEqual(STORE_WEAPONS.map(([weapon, name]) => ({
      weapon,
      name,
    })));
    await expect(storeIcons).toHaveCount(STORE_WEAPONS.length);
    const firstStoreIcon = await storeIcons.first().boundingBox();
    expect(firstStoreIcon).not.toBeNull();
    expect(firstStoreIcon!.width).toBeGreaterThanOrEqual(11);
    expect(firstStoreIcon!.height).toBeGreaterThanOrEqual(11);
  });

  test('the analog console is visible, boxed, and inside #hud at every scale', async ({ page }) => {
    const dials = page.locator('.st-hud__gauge-row');
    const nums = page.locator('.st-hud__gauge-nums');

    await expect(dials).toBeVisible();
    await expect(nums).toHaveCount(0);

    const gaugeBox = await dials.boundingBox();
    expect(gaugeBox, 'the visible gauge representation should have a box').not.toBeNull();
    expect(gaugeBox!.width).toBeGreaterThan(0);
    expect(gaugeBox!.height).toBeGreaterThan(0);

    // The gauges must lie within the #hud panel — not overflowing/clipped out of it.
    const hudBox = await page.locator('#hud').boundingBox();
    expect(hudBox).not.toBeNull();
    expect(gaugeBox!.x).toBeGreaterThanOrEqual(hudBox!.x - 1);
    expect(gaugeBox!.x + gaugeBox!.width).toBeLessThanOrEqual(hudBox!.x + hudBox!.width + 1);
    expect(gaugeBox!.y).toBeGreaterThanOrEqual(hudBox!.y - 1);
    expect(gaugeBox!.y + gaugeBox!.height).toBeLessThanOrEqual(hudBox!.y + hudBox!.height + 1);

    const elevationBox = await page.locator('.st-hud__gauge-cell--elevation').boundingBox();
    const powerBox = await page.locator('.st-hud__gauge-cell--power').boundingBox();
    const windBox = await page.locator('.st-hud__gauge-cell--wind').boundingBox();
    expect(elevationBox).not.toBeNull();
    expect(powerBox).not.toBeNull();
    expect(windBox).not.toBeNull();
    expect(Math.abs(elevationBox!.y - powerBox!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(elevationBox!.width - powerBox!.width)).toBeLessThanOrEqual(1);
    expect(windBox!.y).toBeGreaterThan(elevationBox!.y + elevationBox!.height);
    expect(windBox!.width).toBeGreaterThan(elevationBox!.width * 1.8);
  });

  test('turn command console is coherent, complete, and fitted', async ({ page }, testInfo) => {
    const console = page.getByRole('region', { name: 'Turn command console' });
    const activeRow = console.locator('.st-hud__active-row');
    const player = activeRow.locator('.st-hud__turn-owner');
    const weapon = activeRow.locator('.st-hud__weapon-value');
    const meter = activeRow.getByRole('progressbar', { name: 'Movement fuel' });
    const store = console.getByRole('button', { name: /Store/ });
    const fire = console.getByRole('button', { name: /Fire/ });

    await expect(console).toBeVisible();
    await expect(activeRow).toBeVisible();
    await expect(player).toHaveText('P1');
    await expect(weapon).toHaveText('Baby Missile');
    await expect(activeRow.locator('.st-hud__turn-kicker')).toBeVisible();
    await expect(activeRow.locator('.st-hud__weapon-icon .st-weapon-icon'))
      .toHaveAttribute('data-weapon', 'baby_missile');
    await expect(meter).toHaveAttribute('aria-valuenow', '100');
    await expect(store).toBeVisible();
    await expect(fire).toBeVisible();
    await expect(activeRow.locator('.st-hud__turn-status')).toHaveAttribute(
      'aria-label',
      "P1's turn. Weapon Baby Missile. 100 fuel remaining.",
    );

    await page.getByRole('button', { name: 'Expand arsenal' }).click();
    await page.locator('.st-hud__weapon-btn[data-weapon="bouncing_betty"]').click();
    await page.getByRole('button', { name: 'Collapse arsenal' }).click();
    await expect(weapon).toHaveText('Bouncing Betty');
    await expect(activeRow.locator('.st-hud__weapon-icon .st-weapon-icon'))
      .toHaveAttribute('data-weapon', 'bouncing_betty');
    await expect(fire).toHaveAttribute('aria-label', 'Fire Bouncing Betty');
    await expect(activeRow.locator('.st-hud__turn-status')).toHaveAttribute(
      'aria-label',
      "P1's turn. Weapon Bouncing Betty. 100 fuel remaining.",
    );

    // Exercise the exact maximum-name / longest-weapon layout contract with
    // production markup and computed browser geometry.
    await player.evaluate((node) => { node.textContent = 'Commander Longname X'; });
    const geometry = await console.evaluate((node) => {
      const hud = document.getElementById('hud')!;
      const playerNode = node.querySelector<HTMLElement>('.st-hud__turn-owner')!;
      const weaponNode = node.querySelector<HTMLElement>('.st-hud__weapon-value')!;
      const bounds = node.getBoundingClientRect();
      const targetRects = [...node.querySelectorAll<HTMLElement>('button')]
        .map((target) => target.getBoundingClientRect());
      return {
        consoleClientHeight: node.clientHeight,
        consoleScrollHeight: node.scrollHeight,
        consoleClientWidth: node.clientWidth,
        consoleScrollWidth: node.scrollWidth,
        hudClientHeight: hud.clientHeight,
        hudScrollHeight: hud.scrollHeight,
        playerClientWidth: playerNode.clientWidth,
        playerScrollWidth: playerNode.scrollWidth,
        weaponClientWidth: weaponNode.clientWidth,
        weaponScrollWidth: weaponNode.scrollWidth,
        targetsContained: targetRects.every((target) =>
          target.left >= bounds.left - 1
          && target.right <= bounds.right + 1
          && target.top >= bounds.top - 1
          && target.bottom <= bounds.bottom + 1),
        targetMetrics: [...node.querySelectorAll<HTMLElement>('button')].map((target) => ({
          className: target.className,
          height: target.getBoundingClientRect().height,
          minHeight: getComputedStyle(target).minHeight,
        })),
      };
    });
    expect(geometry.consoleScrollHeight).toBeLessThanOrEqual(geometry.consoleClientHeight + 1);
    expect(geometry.consoleScrollWidth).toBeLessThanOrEqual(geometry.consoleClientWidth + 1);
    expect(geometry.hudScrollHeight).toBeLessThanOrEqual(geometry.hudClientHeight + 1);
    expect(geometry.playerScrollWidth).toBeLessThanOrEqual(geometry.playerClientWidth + 1);
    expect(geometry.weaponScrollWidth).toBeLessThanOrEqual(geometry.weaponClientWidth + 1);
    expect(geometry.targetsContained).toBe(true);
    const targetFloor = testInfo.project.name === 'pixel-touch' ? 44 : 24;
    for (const target of geometry.targetMetrics) {
      expect(
        target.height,
        `${target.className} (${target.minHeight}) must retain a ${targetFloor}px rendered target`,
      ).toBeGreaterThanOrEqual(targetFloor);
    }
  });

  test('noncompact touch keeps every command target at least 44 rendered pixels', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the coarse-pointer project');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(() => isCompact(page)).toBe(false);

    const commandConsole = page.getByRole('region', { name: 'Turn command console' });
    const geometry = await commandConsole.evaluate((node) => {
      const hud = document.getElementById('hud')!;
      return {
        hudClientHeight: hud.clientHeight,
        hudScrollHeight: hud.scrollHeight,
        targets: [...node.querySelectorAll<HTMLElement>('button')].map((target) => ({
          className: target.className,
          height: target.getBoundingClientRect().height,
        })),
      };
    });

    expect(geometry.hudScrollHeight).toBeLessThanOrEqual(geometry.hudClientHeight + 1);
    for (const target of geometry.targets) {
      expect(
        target.height,
        `${target.className} must retain a 44px rendered target on noncompact touch`,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test('mobility rocker stays fitted and spends authoritative fuel without ending the turn', async ({
    page,
  }) => {
    const activeRow = page.locator('.st-hud__active-row');
    const mobility = activeRow.locator('.st-hud__mobility');
    const left = mobility.locator('[data-move="-8"]');
    const right = mobility.locator('[data-move="8"]');
    const fuel = mobility.locator('.st-hud__fuel-value');

    await expect(mobility).toBeVisible();
    await expect(mobility).toHaveAttribute('role', 'group');
    await expect(mobility).toHaveAttribute('aria-label', 'Tank movement');
    await expect(left).toBeEnabled();
    await expect(right).toBeEnabled();
    await expect(fuel).toHaveText('100');

    const rowBox = await activeRow.boundingBox();
    const mobilityBox = await mobility.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(mobilityBox).not.toBeNull();
    expect(mobilityBox!.x).toBeGreaterThanOrEqual(rowBox!.x - 1);
    expect(mobilityBox!.x + mobilityBox!.width)
      .toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1);

    await right.click();
    let remaining = Number(await fuel.textContent());
    if (remaining === 100) {
      await left.click();
      remaining = Number(await fuel.textContent());
    }
    expect(remaining).toBeGreaterThanOrEqual(92);
    expect(remaining).toBeLessThan(100);
    await expect(mobility.getByRole('progressbar', { name: 'Movement fuel' }))
      .toHaveAttribute('aria-valuenow', String(remaining));
    await expect(activeRow.locator('.st-hud__turn-owner')).toHaveText('P1');
    await expect(activeRow.locator('.st-hud__turn-status')).toHaveAttribute(
      'aria-label',
      `P1's turn. Weapon Baby Missile. ${remaining} fuel remaining.`,
    );

    const geometry = await page.evaluate(() => ({
      hudClient: document.querySelector<HTMLElement>('#hud')!.clientHeight,
      hudScroll: document.querySelector<HTMLElement>('#hud')!.scrollHeight,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    expect(geometry.hudScroll).toBeLessThanOrEqual(geometry.hudClient + 1);
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewportHeight);
  });

  test('one primary action stays visible, in-bounds, and drives the live fire path', async ({
    page,
  }, testInfo) => {
    const action = page.locator('.st-hud__primary-action');
    await expect(action).toHaveCount(1);
    await expect(action).toBeVisible();
    await expect(action).toBeEnabled();
    await expect(action).toContainText('Fire');
    await expect(page.locator('.st-hud__touch-fire')).toHaveCount(0);

    const hudBox = await page.locator('#hud').boundingBox();
    const actionBox = await action.boundingBox();
    expect(hudBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(actionBox!.x).toBeGreaterThanOrEqual(hudBox!.x - 1);
    expect(actionBox!.x + actionBox!.width)
      .toBeLessThanOrEqual(hudBox!.x + hudBox!.width + 1);
    expect(actionBox!.y).toBeGreaterThanOrEqual(hudBox!.y - 1);
    expect(actionBox!.y + actionBox!.height)
      .toBeLessThanOrEqual(hudBox!.y + hudBox!.height + 1);
    if (testInfo.project.name === 'pixel-touch') {
      expect(actionBox!.height).toBeGreaterThanOrEqual(44);
    }

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    let reachedAction = false;
    for (let index = 0; index < 20 && !reachedAction; index++) {
      await page.keyboard.press('Tab');
      reachedAction = await action.evaluate((element) => document.activeElement === element);
    }
    expect(reachedAction, 'Tab should reach the primary action').toBe(true);
    await page.keyboard.press('Enter');
    await expect(action).toBeDisabled();
  });

  test('compact touch starts fitted with arsenal collapsed', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch');
    const strip = page.locator('.st-hud__strip');
    await expect(strip).toHaveClass(/st-hud__strip--collapsed/);
    await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.st-hud__strip-grid')).toBeHidden();
    await expect(page.locator('.st-hud__strip-scroll-hint')).toBeHidden();
    const geometry = await page.locator('#hud').evaluate((hud) => ({
      clientHeight: hud.clientHeight,
      scrollHeight: hud.scrollHeight,
    }));
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
  });

  test('arsenal opens as a fitted drawer without changing rail height', async ({ page }) => {
    const before = await page.locator('#hud').evaluate((hud) => ({
      clientHeight: hud.clientHeight,
      scrollHeight: hud.scrollHeight,
    }));
    await page.locator('.st-hud__strip-toggle').click();
    await expect(page.locator('.st-hud__strip-grid')).toBeVisible();
    await expect(page.locator('.st-hud__strip')).toHaveClass(/st-hud__strip--open/);
    await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'true');
    const hudBox = await page.locator('#hud').boundingBox();
    const drawerBox = await page.locator('.st-hud__strip').boundingBox();
    expect(hudBox).not.toBeNull();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox!.x).toBeGreaterThanOrEqual(hudBox!.x - 1);
    expect(drawerBox!.x + drawerBox!.width)
      .toBeLessThanOrEqual(hudBox!.x + hudBox!.width + 1);
    expect(drawerBox!.y).toBeGreaterThanOrEqual(hudBox!.y - 1);
    expect(drawerBox!.y + drawerBox!.height)
      .toBeLessThanOrEqual(hudBox!.y + hudBox!.height + 1);
    for (const locator of [
      page.locator('.st-hud__strip-grid'),
      page.locator('.st-hud__strip-toggle'),
    ]) {
      const childBox = await locator.boundingBox();
      expect(childBox).not.toBeNull();
      expect(childBox!.x).toBeGreaterThanOrEqual(drawerBox!.x - 1);
      expect(childBox!.x + childBox!.width)
        .toBeLessThanOrEqual(drawerBox!.x + drawerBox!.width + 1);
      expect(childBox!.y).toBeGreaterThanOrEqual(drawerBox!.y - 1);
      expect(childBox!.y + childBox!.height)
        .toBeLessThanOrEqual(drawerBox!.y + drawerBox!.height + 1);
    }
    const open = await page.locator('#hud').evaluate((hud) => ({
      clientHeight: hud.clientHeight,
      scrollHeight: hud.scrollHeight,
    }));
    expect(open.scrollHeight).toBeLessThanOrEqual(open.clientHeight + 1);
    expect(open.scrollHeight).toBe(before.scrollHeight);

    const inertSiblings = await page.locator('#hud').evaluate((hud) =>
      [...hud.children]
        .filter((child) => !child.classList.contains('st-hud__strip'))
        .every((child) => (child as HTMLElement).inert),
    );
    expect(inertSiblings).toBe(true);
    await page.locator('.st-hud__weapon-btn:visible').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.st-hud__strip-grid')).toBeHidden();
    await expect(page.locator('.st-hud__strip')).not.toHaveClass(/st-hud__strip--open/);
    await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.st-hud__strip-toggle')).toBeFocused();
    await expect(page.locator('.st-hud__strip-toggle')).toContainText('Expand');
    const releasedSiblings = await page.locator('#hud').evaluate((hud) =>
      [...hud.children]
        .filter((child) => !child.classList.contains('st-hud__strip'))
        .every((child) => !(child as HTMLElement).inert),
    );
    expect(releasedSiblings).toBe(true);
  });
});

test.describe('HUD arsenal responsive defaults', () => {
  test('desktop-fine starts with a closed arsenal drawer', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine');
    await gotoRunningGame(page);
    await expect(page.locator('.st-hud__strip-grid')).toBeHidden();
    await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  test('small fine-pointer windows start collapsed and keep the HUD fitted', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'small-window');
    await gotoRunningGame(page);
    await expect(page.locator('.st-hud__strip-grid')).toBeHidden();
    await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'false');
    const geometry = await page.locator('#hud').evaluate((hud) => ({
      clientHeight: hud.clientHeight,
      scrollHeight: hud.scrollHeight,
    }));
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
  });

  test('saved expanded preference wins on compact touch', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch');
    await page.addInitScript(() => localStorage.setItem('st_arsenal_collapsed', '0'));
    await gotoRunningGame(page);
    await expect(page.locator('.st-hud__strip')).not.toHaveClass(/st-hud__strip--collapsed/);
    await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'true');
    const geometry = await page.locator('#hud').evaluate((hud) => ({
      clientHeight: hud.clientHeight,
      scrollHeight: hud.scrollHeight,
    }));
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
  });
});
