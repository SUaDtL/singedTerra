import { test, expect, type Page } from '@playwright/test';
import { GameEngine } from '../shared/src/engine/GameEngine';
import { TANK_PART_SETS } from '../client/src/renderer/tankPartCatalog';
import { maximumTankRecoilDownPx } from '../client/src/renderer/tankRecoil';
import { ARENA_FLOOR_Y, CANVAS_HEIGHT } from '../shared/src/engine/Terrain';
import {
  gotoRunningGame,
  isCompact,
  findHudLayoutViolations,
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
  ['sandhog', 'Sandhog'],
  ['tracer', 'Tracer'],
  ['shield', 'Shield'],
  ['heavy_shield', 'Heavy Shield'],
] as const;

const STORE_WEAPONS = ARSENAL_WEAPONS.slice(1);

async function openStoreFromArmory(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open Armory — equip or buy weapons' }).click();
  const armory = page.locator('[data-ui="arsenal-drawer"]');
  await expect(armory).toBeVisible();
  await armory.getByRole('button', { name: /Buy weapons/ }).click();
  await expect(page.getByRole('dialog', { name: 'Store' })).toBeVisible();
}

/**
 * HUD rendering-guardrail suite. Runs across the viewport matrix (desktop-fine,
 * pixel-touch, small-window) defined in playwright.config.ts. Every assertion
 * reads COMPUTED GEOMETRY from real Chromium — not DOM presence — because the bug
 * these guard against (the Fire Control flex-crushed to ~10.6px) had the
 * right DOM but the wrong layout.
 */
test.describe('HUD layout guardrails', () => {
  test.beforeEach(async ({ page }) => {
    await gotoRunningGame(page);
    const briefing = page.locator('[data-ui="first-salvo-briefing"]');
    if (await briefing.isVisible()) {
      await page.getByRole('button', { name: 'Enter battle', exact: true }).click();
      await expect(briefing).toBeHidden();
    }
    const coachSkip = page.getByRole('button', { name: 'Skip', exact: true });
    if (await coachSkip.isVisible()) await coachSkip.click();
  });

  test('integrated firing controls are not flex-crushed', async ({ page }) => {
    const compact = await isCompact(page);
    const box = await page.locator('#battle-rail .st-hud__solution-adjustments').boundingBox();
    expect(box, 'integrated firing controls should have a rendered box').not.toBeNull();
    expect(box!.height).toBeGreaterThan(compact ? 24 : 40);
  });

  test('live firing values stay inside their integrated controls across phase states', async ({
    page,
  }) => {
    const solutionViolations = async (): Promise<string[]> =>
      page.locator('.st-hud__solution-adjustments').evaluate((controls) => {
        const contains = (outer: DOMRect, inner: DOMRect): boolean =>
          inner.left >= outer.left - 1 && inner.right <= outer.right + 1
          && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
        const failures: string[] = [];
        const railRect = document.querySelector<HTMLElement>('#battle-rail')!.getBoundingClientRect();
        for (const owner of controls.querySelectorAll<HTMLElement>('[data-value-owner]')) {
          const value = owner.querySelector<HTMLElement>('output, .st-hud__solution-wind-value')!;
          if (!contains(owner.getBoundingClientRect(), value.getBoundingClientRect())) failures.push(`${owner.dataset.valueOwner} value escapes owner`);
          if (!contains(railRect, value.getBoundingClientRect())) failures.push(`${owner.dataset.valueOwner} value escapes rail`);
          if (value.clientWidth < value.scrollWidth) {
            failures.push(`${owner.dataset.valueOwner} value is clipped`);
          }
          for (const button of owner.querySelectorAll<HTMLElement>('button')) {
            if (!contains(railRect, button.getBoundingClientRect())) {
              failures.push(`${owner.dataset.valueOwner} control escapes rail`);
            }
          }
        }
        return failures;
      });

    expect(await solutionViolations(), 'decision solution ancestry').toEqual([]);
    await page.locator('.st-hud__primary-action').click();
    await expect(page.locator('.st-hud__command-console'))
      .toHaveAttribute('data-command-phase', /submitting|tracking|resolving/);
    expect(await solutionViolations(), 'flight solution ancestry').toEqual([]);
  });

  test('right rail is a readable match ledger with a reachable Menu', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const ledger = page.locator('#hud');
    const matchDrawer = page.getByRole('button', { name: 'Open match ledger', exact: true });
    const close = ledger.getByRole('button', { name: 'Close match ledger', exact: true });
    const menu = ledger.getByRole('button', { name: 'Menu', exact: true });
    await expect(ledger).toBeHidden();
    await expect(matchDrawer).toBeVisible();
    await matchDrawer.click();
    await expect(ledger).toBeVisible();
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(ledger).toBeHidden();
    await expect(matchDrawer).toBeFocused();
    await matchDrawer.click();
    await expect(ledger).toBeVisible();
    await expect(ledger).toHaveAttribute('data-ui', 'match-ledger');
    await expect(ledger).toHaveAttribute('aria-label', 'Match ledger');
    await expect(ledger.locator('[data-ui="match-mode"]')).toHaveText('Free-for-all');
    await expect(ledger.locator('.st-hud__round')).toBeVisible();
    await expect(ledger.locator('.st-hud__players')).toHaveAttribute('aria-label', 'Turn order');
    await expect(ledger.locator('.st-hud__player')).toHaveCount(2);
    await expect(ledger.locator('.st-hud__conn')).toContainText('Ready');
    const [ledgerBox, stageBox, appBox] = await Promise.all([
      ledger.boundingBox(),
      page.locator('#stage').boundingBox(),
      page.locator('#app').boundingBox(),
    ]);
    expect(ledgerBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(appBox).not.toBeNull();
    expect(ledgerBox!.height).toBeLessThan(stageBox!.height * 0.6);
    // Ordinary desktop opens Match on demand over the field rather than
    // permanently reducing it. The app remains exactly the battlefield wide.
    expect(Math.abs(appBox!.width - stageBox!.width)).toBeLessThanOrEqual(1);
    expect(ledgerBox!.x + ledgerBox!.width).toBeLessThanOrEqual(stageBox!.x + stageBox!.width);

    const forbidden = ledger.locator([
      '[data-ui="weapon-bay"]',
      '[data-control="angle"]',
      '[data-control="power"]',
      '[data-ui="arsenal-drawer"]',
      '.st-hud__store-btn',
      '.st-hud__primary-action',
      '.st-hud__trajectory-guide',
    ].join(','));
    await expect(forbidden).toHaveCount(0);
    await expect(ledger).not.toContainText(/Fire Control/i);

    await expect(menu).toBeVisible();
    await expect(menu).toBeEnabled();
    const briefing = page.locator('[data-ui="first-salvo-briefing"]');
    if (await briefing.isVisible()) {
      await page.getByRole('button', { name: 'Enter battle', exact: true }).click();
      await expect(briefing).toBeHidden();
    }
    await menu.focus();
    await expect(menu).toBeFocused();
    await menu.click();
    const resume = page.getByRole('button', { name: 'Resume', exact: true });
    await expect(resume).toBeFocused();
    await resume.click();
    await expect(menu).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(ledger).toBeHidden();
    await expect(matchDrawer).toBeFocused();
  });

  test('docks Match only on an ultrawide fine-pointer stage without shrinking the battlefield', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'coarse pointer always uses the reachable Match drawer');
    await page.setViewportSize({ width: 2048, height: 838 });
    const ledger = page.locator('#hud');
    const drawer = page.getByRole('button', { name: 'Open match ledger', exact: true });
    await expect(ledger).toBeVisible();
    await expect(drawer).toBeHidden();
    const geometry = await page.evaluate(() => {
      const game = document.querySelector<HTMLCanvasElement>('#game')!;
      const stage = document.getElementById('stage')!;
      const ledger = document.getElementById('hud')!;
      const gameBox = game.getBoundingClientRect();
      const stageBox = stage.getBoundingClientRect();
      const ledgerBox = ledger.getBoundingClientRect();
      return {
        scale: gameBox.width / game.width,
        stage: stageBox.toJSON(),
        ledger: ledgerBox.toJSON(),
      };
    });
    expect(geometry.scale).toBeGreaterThan(1);
    expect(geometry.ledger.x).toBeGreaterThanOrEqual(geometry.stage.x + geometry.stage.width - 1);
    expect(geometry.ledger.y).toBeCloseTo(geometry.stage.y, 1);
    expect(geometry.ledger.height).toBeLessThan(geometry.stage.height * 0.6);
  });

  test('keeps Match as a drawer on a wide coarse-pointer viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the native coarse-pointer profile');
    const ledger = page.locator('#hud');
    const drawer = page.getByRole('button', { name: 'Open match ledger', exact: true });
    await expect(ledger).toBeHidden();
    await expect(drawer).toBeVisible();
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox!.width).toBeGreaterThanOrEqual(44);
    expect(drawerBox!.height).toBeGreaterThanOrEqual(44);
    await drawer.click();
    const close = ledger.locator('.st-hud__match-drawer-close');
    await expect(close).toBeVisible();
    const closeBox = await close.boundingBox();
    expect(closeBox).not.toBeNull();
    expect(closeBox!.width).toBeGreaterThanOrEqual(44);
    expect(closeBox!.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(ledger).toBeHidden();
  });

  test('keeps the Fire terminal compact rather than reserving a second command card', async ({ page }) => {
    const proportions = await page.evaluate(() => {
      const solution = document.querySelector<HTMLElement>('#battle-rail .st-hud__console-solution')!;
      const terminal = document.querySelector<HTMLElement>('#battle-rail .st-hud__fire-terminal')!;
      const solutionRect = solution.getBoundingClientRect();
      const terminalRect = terminal.getBoundingClientRect();
      return {
        ratio: terminalRect.width / solutionRect.width,
        terminalRect: terminalRect.toJSON(),
        coarsePointer: matchMedia('(pointer: coarse)').matches,
      };
    });
    // Coarse layouts reserve a 44px physical terminal target; fine-pointer
    // layouts must not recreate the old full-width commitment card.
    expect(proportions.ratio).toBeLessThanOrEqual(proportions.coarsePointer ? 0.68 : 0.16);
    expect(proportions.terminalRect.height).toBeGreaterThan(0);
  });

  test('decision-state Fire terminal uses its height for live status as well as the action', async ({ page }) => {
    const geometry = await page.locator('#battle-rail .st-hud__fire-terminal').evaluate((terminal) => {
      const terminalRect = terminal.getBoundingClientRect();
      const state = terminal.querySelector<HTMLElement>('.st-hud__console-state')!;
      const summary = terminal.querySelector<HTMLElement>('.st-hud__commitment-explanation')!;
      const fire = terminal.querySelector<HTMLElement>('.st-hud__primary-action')!;
      const stateRect = state.getBoundingClientRect();
      const summaryRect = summary.getBoundingClientRect();
      const fireRect = fire.getBoundingClientRect();
      const stateStyle = getComputedStyle(state);
      const terminalStyle = getComputedStyle(terminal);
      return {
        stateVisible: stateStyle.clip === 'auto' && stateRect.width > 1 && stateRect.height > 1,
        summaryHidden: summary.hidden,
        state: { top: stateRect.top, bottom: stateRect.bottom },
        summary: { top: summaryRect.top, bottom: summaryRect.bottom },
        fire: { top: fireRect.top, height: fireRect.height },
        terminal: { top: terminalRect.top, bottom: terminalRect.bottom, height: terminalRect.height },
        terminalVisualDecoration: {
          backgroundImage: terminalStyle.backgroundImage,
          borderLeftWidth: terminalStyle.borderLeftWidth,
        },
      };
    });
    expect(geometry.stateVisible).toBe(true);
    expect(geometry.summaryHidden).toBe(true);
    expect(geometry.state.top).toBeGreaterThanOrEqual(geometry.terminal.top);
    expect(geometry.fire.top).toBeGreaterThanOrEqual(geometry.state.bottom);
    expect(geometry.fire.height).toBeLessThanOrEqual(geometry.terminal.height * 0.62);
    expect(geometry.terminalVisualDecoration.backgroundImage).toBe('none');
    expect(geometry.terminalVisualDecoration.borderLeftWidth).toBe('0px');
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

  test('one responsive battle rail owns every rendered combat command and stays fitted', async ({
    page,
  }, testInfo) => {
    const rail = page.locator('#battle-rail');
    const console = rail.locator('.st-hud__command-console');
    await expect(page.locator('#game-overlay .st-hud__touch-strip')).toHaveCount(0);
    await expect(console).toBeVisible();

    const widestChassisBasesByRoster = [2, 3, 4].map((count) => {
      const state = new GameEngine({
        players: Array.from({ length: count }, (_, index) => ({
          name: `Commander ${index + 1}`,
          color: ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'][index]!,
          loadout: {
            treads: 'ranger' as const,
            hull: 'jackal' as const,
            turret: 'jackal' as const,
            barrel: 'jackal' as const,
          },
        })),
        maxPlayers: count,
        seed: 1,
      }).getState();
      const tread = TANK_PART_SETS.ranger.parts.treads;
      return state.tanks.map((tank) => Math.max(tank.y, ARENA_FLOOR_Y)
        + tread.offsetY + tread.height);
    });
    const recoilY = maximumTankRecoilDownPx();
    const geometry = await console.evaluate((node, { chassisBasesByRoster, recoil }) => {
      const rail = document.getElementById('battle-rail')!;
      const game = document.querySelector<HTMLCanvasElement>('#game')!;
      const railRect = rail.getBoundingClientRect();
      const gameRect = game.getBoundingClientRect();
      const consoleRect = node.getBoundingClientRect();
      const scale = gameRect.width / game.width;
      const rendered = (element: HTMLElement): boolean => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      };
      const targets = [...node.querySelectorAll<HTMLButtonElement>('button')]
        .filter(rendered)
        .map((button) => ({
          label: button.getAttribute('aria-label') ?? button.textContent ?? '',
          className: button.className,
          authoredWidth: getComputedStyle(button).width,
          authoredMinWidth: getComputedStyle(button).minWidth,
          rect: button.getBoundingClientRect().toJSON(),
        }));
      const labels = [...node.querySelectorAll<HTMLElement>([
        '.st-hud__turn-owner',
        '.st-hud__weapon-label',
        '.st-hud__weapon-value',
        '.st-hud__weapon-ammo',
        '.st-hud__solution-adjustment-label',
        '.st-hud__solution-direction',
        '.st-hud__trajectory-guide',
        '.st-hud__first-salvo-progress',
        '.st-hud__first-salvo-copy',
        '.st-hud__first-salvo-skip',
        '.st-hud__commitment-explanation',
      ].join(','))].filter(rendered).map((label) => ({
        text: label.textContent,
        renderedFontSize: label instanceof SVGTextElement
          ? label.getBoundingClientRect().height
          : parseFloat(getComputedStyle(label).fontSize)
            * (document.getElementById('app')!.getBoundingClientRect().width
              / document.getElementById('app')!.offsetWidth),
        clientWidth: label.clientWidth,
        scrollWidth: label.scrollWidth,
        clientHeight: label.clientHeight,
        scrollHeight: label.scrollHeight,
      }));
      return {
        rail: railRect.toJSON(),
        logicalRailHeight: railRect.height / scale,
        console: consoleRect.toJSON(),
        targets,
        labels,
        allTargetsInRail: targets.every(({ rect }) => rect.left >= railRect.left - 1
          && rect.right <= railRect.right + 1
          && rect.top >= railRect.top - 1
          && rect.bottom <= railRect.bottom + 1),
        widestChassisClearOfRail: chassisBasesByRoster.every((bases) => bases.every((baseY) =>
          gameRect.top + (baseY + recoil) * scale < railRect.top)),
        documentOverflowX: document.documentElement.scrollWidth - innerWidth,
        documentOverflowY: document.documentElement.scrollHeight - innerHeight,
      };
    }, { chassisBasesByRoster: widestChassisBasesByRoster, recoil: recoilY });

    expect(geometry.allTargetsInRail).toBe(true);
    expect(geometry.widestChassisClearOfRail).toBe(true);
    expect(geometry.logicalRailHeight, 'the protected command rail must not consume the battlefield')
      .toBeLessThanOrEqual(200.5);
    expect(geometry.documentOverflowX).toBeLessThanOrEqual(0);
    expect(geometry.documentOverflowY).toBeLessThanOrEqual(0);
    expect(geometry.console.x).toBeGreaterThanOrEqual(geometry.rail.x - 1);
    expect(geometry.console.y).toBeGreaterThanOrEqual(geometry.rail.y - 1);
    expect(geometry.console.x + geometry.console.width)
      .toBeLessThanOrEqual(geometry.rail.x + geometry.rail.width + 1);
    expect(geometry.console.y + geometry.console.height)
      .toBeLessThanOrEqual(geometry.rail.y + geometry.rail.height + 1);
    for (const label of geometry.labels) {
      expect.soft(label.renderedFontSize, `${label.text} must render at a readable size`)
        .toBeGreaterThanOrEqual(11);
      expect.soft(label.scrollWidth, `${label.text} must not clip horizontally`)
        .toBeLessThanOrEqual(label.clientWidth + 1);
      expect.soft(label.scrollHeight, `${label.text} must not clip vertically`)
        .toBeLessThanOrEqual(label.clientHeight + 1);
    }
    const targetFloor = testInfo.project.name === 'pixel-touch' ? 44 : 24;
    for (const target of geometry.targets) {
      expect(
        target.rect.width,
        `${target.label} target width (${target.className}; width ${target.authoredWidth}; min ${target.authoredMinWidth})`,
      ).toBeGreaterThanOrEqual(targetFloor);
      expect(target.rect.height, `${target.label} target height`).toBeGreaterThanOrEqual(targetFloor);
    }

    const briefing = page.locator('[data-ui="first-salvo-briefing"]');
    if (await briefing.isVisible()) await page.getByRole('button', { name: 'Enter battle' }).click();
    const before = await rail.boundingBox();
    await page.locator('.st-hud__primary-action').click();
    await expect(console).toHaveAttribute('data-command-phase', /submitting|tracking|resolving/);
    const after = await rail.boundingBox();
    expect(after?.height).toBeCloseTo(before!.height, 1);
    expect(after?.y).toBeCloseTo(before!.y, 1);
  });

  test('Pixel compact command text stays inside its component without collisions', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires compact coarse-pointer geometry');

    const commandViolations = async (): Promise<string[]> =>
      page.locator('#battle-rail').evaluate((rail) => {
        const rendered = (element: Element): element is HTMLElement | SVGElement => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden'
            && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
        };
        const contains = (outer: DOMRect, inner: DOMRect): boolean =>
          inner.left >= outer.left - 1 && inner.right <= outer.right + 1
          && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
        const intersects = (a: DOMRect, b: DOMRect): boolean =>
          a.left < b.right - 1 && a.right > b.left + 1
          && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        const failures: string[] = [];
        const assertContained = (owner: Element, child: Element, label: string): void => {
          if (rendered(child)
            && !contains(owner.getBoundingClientRect(), child.getBoundingClientRect())) {
            failures.push(`${label} escapes ${owner.className}`);
          }
        };
        const assertSeparated = (first: Element, second: Element, label: string): void => {
          if (rendered(first) && rendered(second)
            && intersects(first.getBoundingClientRect(), second.getBoundingClientRect())) {
            failures.push(`${label} intersects`);
          }
        };

        const weapon = rail.querySelector('.st-hud__weapon')!;
        for (const child of weapon.querySelectorAll(
          '.st-hud__weapon-value, .st-hud__weapon-ammo',
        )) {
          assertContained(weapon, child, child.textContent ?? child.className);
        }

        const context = rail.querySelector<HTMLElement>('.st-hud__console-context')!;
        const commander = context.querySelector<HTMLElement>('.st-hud__active-row')!;
        if (context.scrollWidth > context.clientWidth || context.scrollHeight > context.clientHeight) {
          failures.push('commander context scrolls instead of fitting');
        }
        assertContained(context, commander, 'active commander');
        for (const child of commander.querySelectorAll<HTMLElement>(
          '.st-hud__identity-lockup, .st-hud__mobility, .st-hud__fuel-meter, .st-hud__move-btn',
        )) {
          assertContained(context, child, child.className);
        }

        for (const group of rail.querySelectorAll('.st-hud__solution-adjustment')) {
          const label = group.querySelector('.st-hud__solution-adjustment-label')!;
          assertContained(group, label, label.textContent ?? 'adjustment label');
          for (const button of group.querySelectorAll('button')) {
            assertContained(group, button, button.getAttribute('aria-label') ?? 'adjustment button');
            assertSeparated(
              label,
              button,
              `${label.textContent} / ${button.getAttribute('aria-label')}`,
            );
          }
        }

        const solution = rail.querySelector('.st-hud__console-solution')!;
        const guide = solution.querySelector('.st-hud__trajectory-guide')!;
        const coach = solution.querySelector('[data-ui="first-salvo-coach"]');
        assertContained(solution, guide, 'trajectory guide');
        if (coach) {
          assertSeparated(guide, coach, 'trajectory guide / First Salvo');
          const coachProgress = coach.querySelector('.st-hud__first-salvo-progress')!;
          const coachCopy = coach.querySelector('.st-hud__first-salvo-copy')!;
          const coachSkip = coach.querySelector('.st-hud__first-salvo-skip')!;
          for (const child of [coachProgress, coachCopy, coachSkip]) {
            assertContained(coach, child, child.textContent ?? child.className);
          }
          assertSeparated(coachProgress, coachCopy, 'First Salvo progress / copy');
          assertSeparated(coachCopy, coachSkip, 'First Salvo copy / skip');
        }
        return failures;
      });

    expect(await commandViolations(), 'decision state geometry').toEqual([]);
    await page.locator('.st-hud__primary-action').click();
    await expect(page.locator('.st-hud__command-console'))
      .toHaveAttribute('data-command-phase', /submitting|tracking|resolving/);
    expect(await commandViolations(), 'flight state geometry').toEqual([]);
  });

  test('Pixel touch stalled recovery stays in the protected rail and can leave', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the coarse-pointer project');
    let leaveCount = 0;
    await page.exposeFunction('__recordTurnWatchLeave', () => { leaveCount += 1; });
    await page.evaluate(() => {
      const seam = (window as typeof window & {
        __SINGED_TERRA_E2E_HUD__?: { setTurnWatch: (state: string, playerName: string) => void };
      }).__SINGED_TERRA_E2E_HUD__;
      if (!seam) throw new Error('Missing E2E HUD turn-watch seam');
      seam.setTurnWatch('stalled', 'P2');
      document.querySelector<HTMLButtonElement>('.st-hud__turnwatch-leave')!
        .addEventListener('click', () => void (window as typeof window & {
          __recordTurnWatchLeave: () => void;
        }).__recordTurnWatchLeave());
    });
    const rail = page.locator('#battle-rail');
    const watch = page.locator('.st-hud__turnwatch');
    const leave = page.locator('.st-hud__turnwatch-leave');
    await expect(watch).toBeVisible();
    await expect(leave).toBeVisible();
    const geometry = await page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>('#battle-rail')!.getBoundingClientRect();
      const watch = document.querySelector<HTMLElement>('.st-hud__turnwatch')!.getBoundingClientRect();
      const leave = document.querySelector<HTMLButtonElement>('.st-hud__turnwatch-leave')!.getBoundingClientRect();
      return {
        contained: watch.top >= rail.top - 1 && watch.bottom <= rail.bottom + 1,
        targetHeight: leave.height,
      };
    });
    expect(geometry.contained).toBe(true);
    expect(geometry.targetHeight).toBeGreaterThanOrEqual(44);
    await leave.click();
    expect(leaveCount).toBe(1);
  });

  test('real Fire transition prioritizes outcome progress and restores decision focus', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const hud = page.locator('#hud');
    const rail = page.locator('#battle-rail');
    const overlay = page.locator('#game-overlay');
    const fire = page.locator('.st-hud__primary-action');
    await expect(hud).toHaveAttribute('data-combat-focus', 'decision');
    await expect(overlay).toHaveAttribute('data-combat-focus', 'decision');
    await expect(rail).toHaveAttribute('data-combat-focus', 'decision');

    await fire.click();
    await expect(hud).toHaveAttribute('data-combat-focus', 'outcome');
    await expect(overlay).toHaveAttribute('data-combat-focus', 'outcome');
    await expect(rail).toHaveAttribute('data-combat-focus', 'outcome');
    await expect(page.locator('.st-hud__primary-action')).toHaveCount(0);
    await expect(page.locator('.st-hud__aim')).toBeVisible();
    await expect(page.locator('.st-hud__active-row')).toBeVisible();
    await expect(page.locator('.st-hud__command-console')).not.toHaveAttribute('aria-disabled', /.+/);
    await expect(page.locator('.st-hud__touch-strip')).toHaveCount(0);
    await expect(page.locator('.st-hud__command-console')).toHaveAttribute(
      'aria-label',
      'Turn command console',
    );
    await expect(page.locator('#hud .st-hud__menu')).toBeEnabled();

    await expect(hud).toHaveAttribute('data-combat-focus', 'decision', { timeout: 20_000 });
    await expect(overlay).toHaveAttribute('data-combat-focus', 'decision');
    await expect(rail).toHaveAttribute('data-combat-focus', 'decision');
    await expect(page.locator('.st-hud__command-console')).not.toHaveAttribute('aria-disabled', /.+/);
    await expect(page.locator('.st-hud__touch-strip')).toHaveCount(0);
    await expect(page.locator('.st-hud__command-console')).toHaveAttribute('aria-label', 'Turn command console');
    await expect(page.locator('.st-hud__active-row')).toBeVisible();
    await expect(page.locator('.st-hud__primary-action')).toHaveCount(1);
  });

  test('keeps Space bound to fire after a gameplay control takes focus', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'pixel-touch', 'keyboard command deck is hidden');

    const aimLeft = page.getByRole('button', { name: 'Aim barrel left' });
    const fire = page.locator('.st-hud__primary-action');
    await aimLeft.click();
    await expect(aimLeft).toBeFocused();
    await expect(fire).toBeEnabled();

    await page.keyboard.press('Space');

    await expect(page.locator('.st-hud__primary-action')).toHaveCount(0);
  });

  test('active custom tank has a combat-readable tactical identity card', async ({
    page,
  }, testInfo) => {
    const frame = page.locator('.st-hud__tank-portrait-frame');
    const portrait = frame.locator('.st-hud__tank-portrait');
    if (testInfo.project.name === 'pixel-touch') {
      // Touch spends the rail's finite height on live movement and firing
      // targets. Identity, health and fuel remain; the decorative portrait is
      // deliberately removed rather than cramped into an unreadable card.
      await expect(frame).toBeHidden();
      await expect(page.locator('[data-ui="commander-health"]')).toHaveText('100 HP');
      await expect(page.getByRole('progressbar', { name: 'Movement fuel' })).toHaveAttribute('aria-valuenow', '100');
      return;
    }
    await expect(frame).toBeVisible();
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveAttribute('width', '144');
    await expect(portrait).toHaveAttribute('height', '80');

    const geometry = await frame.evaluate((node) => {
      const frameBox = node.getBoundingClientRect();
      const portraitBox = node.querySelector('canvas')!.getBoundingClientRect();
      const contextBox = node.closest('.st-hud__console-context')!.getBoundingClientRect();
      return {
        frame: frameBox.toJSON(),
        portrait: portraitBox.toJSON(),
        context: contextBox.toJSON(),
      };
    });
    expect(Math.abs(geometry.frame.width - geometry.portrait.width)).toBeLessThan(1);
    expect(Math.abs(geometry.frame.height - geometry.portrait.height)).toBeLessThan(1);
    expect(geometry.frame.left).toBeGreaterThanOrEqual(geometry.context.left);
    expect(geometry.frame.right).toBeLessThanOrEqual(geometry.context.right);

    if (testInfo.project.name === 'desktop-fine') {
      expect(geometry.frame.width).toBeGreaterThanOrEqual(140);
      expect(geometry.frame.height).toBeGreaterThanOrEqual(78);
    } else if (testInfo.project.name === 'pixel-touch') {
      expect(geometry.frame.width).toBeLessThanOrEqual(72);
      expect(geometry.frame.height).toBeLessThanOrEqual(40);
    } else {
      expect(geometry.frame.width).toBeLessThanOrEqual(90);
      expect(geometry.frame.height).toBeLessThanOrEqual(50);
    }
  });

  test('combat command glyphs stay semantic, framed, and fitted', async ({
    page,
  }, testInfo) => {
    const icons = page.locator('svg.st-ui-icon');
    const glyphs = page.locator('.st-ui-glyph');
    const visibleGlyphs = page.locator('.st-ui-glyph:visible');
    const railIcons = page.locator('#battle-rail svg.st-ui-icon');
    const railGlyphs = page.locator('#battle-rail .st-ui-glyph');

    expect(await icons.count()).toBeGreaterThan(0);
    expect(await glyphs.count()).toBeGreaterThan(0);
    await expect(page.locator('.st-hud__touch-strip')).toHaveCount(0);
    expect(await railIcons.count()).toBeGreaterThan(0);
    expect(await railGlyphs.count()).toBeGreaterThan(0);

    const arsenal = page.locator('[data-icon="arsenal"]');
    await expect(arsenal.locator('circle[r="9"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Open Armory — equip or buy weapons' })).toBeVisible();
    const drawerTrigger = page.getByRole('button', { name: 'Open match ledger', exact: true });
    if (await drawerTrigger.count()) {
      await expect(drawerTrigger).toBeVisible();
    } else {
      await expect(page.locator('#hud .st-hud__menu')).toBeVisible();
    }
    await expect(page.locator('.st-hud__primary-action')).toBeVisible();

    const geometry = await page.evaluate(() => ({
      glyphSizes: [...document.querySelectorAll<HTMLElement>('.st-ui-glyph')]
        .filter((glyph) => glyph.getBoundingClientRect().width > 0)
        .map(
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
    expect(geometry.glyphSizes).toHaveLength(await visibleGlyphs.count());
    const glyphFloor = testInfo.project.name === 'pixel-touch' ? 12 : 15;
    const iconFloor = testInfo.project.name === 'pixel-touch' ? 9.5 : 12;
    for (const size of geometry.glyphSizes) {
      expect(size.frameWidth).toBeGreaterThanOrEqual(glyphFloor);
      expect(size.frameHeight).toBeGreaterThanOrEqual(glyphFloor);
      expect(size.iconWidth).toBeGreaterThanOrEqual(iconFloor);
      expect(size.iconHeight).toBeGreaterThanOrEqual(iconFloor);
    }
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewportHeight);
  });

  test('weapon-family glyphs remain visible inside the gameplay Armory and Store', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Open Armory — equip or buy weapons' }).click();
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

    await page.getByRole('button', { name: 'Close Armory' }).click();
    await openStoreFromArmory(page);
    const storeIcons = page.locator('.st-hud__store-name-line .st-weapon-icon');
    const storeCatalog = await page.locator(
      '.st-hud__store-name-line',
    ).evaluateAll((lines) => lines.map((line) => ({
      weapon: line.querySelector('.st-weapon-icon')
        ?.getAttribute('data-weapon'),
      name: line.querySelector('.st-hud__store-name')?.textContent,
    })));
    // Task 1 intentionally grouped the former flat list by catalog role. This
    // guardrail owns glyph coverage, not the presentation order of those groups.
    expect(storeCatalog).toHaveLength(STORE_WEAPONS.length);
    expect(storeCatalog).toEqual(expect.arrayContaining(STORE_WEAPONS.map(([weapon, name]) => ({
      weapon,
      name,
    }))));
    await expect(storeIcons).toHaveCount(STORE_WEAPONS.length);
    const firstStoreIcon = await storeIcons.first().boundingBox();
    expect(firstStoreIcon).not.toBeNull();
    expect(firstStoreIcon!.width).toBeGreaterThanOrEqual(11);
    expect(firstStoreIcon!.height).toBeGreaterThanOrEqual(11);
  });

  test('Store catalog keeps its controls fixed around a responsive internal catalog', async ({
    page,
  }) => {
    await openStoreFromArmory(page);

    const panel = page.locator('.st-hud__store-panel');
    const catalog = panel.locator('.st-hud__store-catalog');
    const sections = catalog.locator('.st-hud__store-section');
    const close = panel.getByRole('button', { name: 'Close' });
    await expect(panel.locator('.st-hud__store-header')).toBeVisible();
    await expect(close).toBeVisible();
    await expect(sections).toHaveCount(4);

    const compact = await isCompact(page);
    const layout = await panel.evaluate((panelNode) => {
      const panel = panelNode as HTMLElement;
      const store = panel.parentElement!;
      const catalog = panel.querySelector<HTMLElement>('.st-hud__store-catalog')!;
      const sections = [...catalog.querySelectorAll<HTMLElement>('.st-hud__store-section')];
      const header = panel.querySelector<HTMLElement>('.st-hud__store-header')!;
      const footer = panel.querySelector<HTMLElement>('.st-hud__store-footer')!;
      const close = panel.querySelector<HTMLElement>('.st-hud__store-close')!;
      const panelRect = panel.getBoundingClientRect();
      const storeRect = store.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const closeRect = close.getBoundingClientRect();
      const firstSectionRect = sections[0]!.getBoundingClientRect();
      const secondSectionRect = sections[1]!.getBoundingClientRect();
      const catalogRect = catalog.getBoundingClientRect();
      const buyTargets = [...catalog.querySelectorAll<HTMLButtonElement>('.st-hud__store-buy')]
        .map((button) => button.getBoundingClientRect());
      const isContained = (inner: DOMRect, outer: DOMRect) =>
        inner.left >= outer.left - 1
        && inner.right <= outer.right + 1
        && inner.top >= outer.top - 1
        && inner.bottom <= outer.bottom + 1;
      const visibleBuyTargets = buyTargets.filter((target) =>
        target.top >= catalogRect.top - 1 && target.bottom <= catalogRect.bottom + 1,
      );

      return {
        panel: panelRect.toJSON(),
        store: storeRect.toJSON(),
        panelOverflowY: getComputedStyle(panel).overflowY,
        catalogOverflowY: getComputedStyle(catalog).overflowY,
        catalogScrollHeight: catalog.scrollHeight,
        catalogClientHeight: catalog.clientHeight,
        firstSection: firstSectionRect.toJSON(),
        secondSection: secondSectionRect.toJSON(),
        headerContained: headerRect.top >= panelRect.top - 1 && headerRect.bottom <= panelRect.bottom + 1,
        footerContained: footerRect.top >= panelRect.top - 1 && footerRect.bottom <= panelRect.bottom + 1,
        panelContainedByStore: isContained(panelRect, storeRect),
        panelContainedByViewport:
          panelRect.left >= -1 && panelRect.right <= window.innerWidth + 1
          && panelRect.top >= -1 && panelRect.bottom <= window.innerHeight + 1,
        closeContained: isContained(closeRect, panelRect) && isContained(closeRect, storeRect),
        visibleBuyTargets: visibleBuyTargets.map((target) => ({
          height: target.height,
          contained: isContained(target, panelRect) && isContained(target, storeRect),
        })),
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    expect(layout.panelOverflowY).not.toBe('auto');
    expect(layout.catalogOverflowY).toBe('auto');
    expect(layout.catalogScrollHeight).toBeGreaterThan(layout.catalogClientHeight);
    expect(layout.headerContained).toBe(true);
    expect(layout.footerContained).toBe(true);
    expect(layout.panelContainedByStore).toBe(true);
    expect(layout.panelContainedByViewport).toBe(true);
    expect(layout.closeContained).toBe(true);
    expect(layout.visibleBuyTargets.length).toBeGreaterThan(0);
    expect(layout.visibleBuyTargets.every((target) => target.contained)).toBe(true);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.documentHeight).toBeLessThanOrEqual(layout.viewportHeight);

    if (compact) {
      expect(layout.secondSection.left).toBeCloseTo(layout.firstSection.left, 0);
      expect(layout.secondSection.top).toBeGreaterThan(layout.firstSection.top);
      for (const target of layout.visibleBuyTargets) {
        expect(target.height).toBeGreaterThanOrEqual(44);
      }
    } else {
      expect(layout.secondSection.left).toBeGreaterThan(layout.firstSection.left);
      expect(layout.secondSection.top).toBeCloseTo(layout.firstSection.top, 0);
    }

    const scrolledLayout = await panel.evaluate((panelNode) => {
      const panel = panelNode as HTMLElement;
      const catalog = panel.querySelector<HTMLElement>('.st-hud__store-catalog')!;
      const header = panel.querySelector<HTMLElement>('.st-hud__store-header')!;
      const footer = panel.querySelector<HTMLElement>('.st-hud__store-footer')!;
      const close = panel.querySelector<HTMLElement>('.st-hud__store-close')!;
      const firstSection = catalog.querySelector<HTMLElement>('.st-hud__store-section')!;
      const before = {
        header: header.getBoundingClientRect().toJSON(),
        footer: footer.getBoundingClientRect().toJSON(),
        firstSectionTop: firstSection.getBoundingClientRect().top,
      };
      catalog.scrollTop = Math.min(80, catalog.scrollHeight - catalog.clientHeight);
      const panelRect = panel.getBoundingClientRect();
      const storeRect = panel.parentElement!.getBoundingClientRect();
      const catalogRect = catalog.getBoundingClientRect();
      const isContained = (inner: DOMRect, outer: DOMRect) =>
        inner.left >= outer.left - 1
        && inner.right <= outer.right + 1
        && inner.top >= outer.top - 1
        && inner.bottom <= outer.bottom + 1;
      const visibleBuyTargets = [...catalog.querySelectorAll<HTMLButtonElement>('.st-hud__store-buy')]
        .map((button) => button.getBoundingClientRect())
        .filter((target) => target.top >= catalogRect.top - 1 && target.bottom <= catalogRect.bottom + 1);

      return {
        before,
        header: header.getBoundingClientRect().toJSON(),
        footer: footer.getBoundingClientRect().toJSON(),
        firstSectionTop: firstSection.getBoundingClientRect().top,
        panelScrollTop: panel.scrollTop,
        catalogScrollTop: catalog.scrollTop,
        closeContained: isContained(close.getBoundingClientRect(), panelRect)
          && isContained(close.getBoundingClientRect(), storeRect),
        visibleBuysContained: visibleBuyTargets.length > 0
          && visibleBuyTargets.every((target) => isContained(target, panelRect) && isContained(target, storeRect)),
      };
    });
    expect(scrolledLayout.catalogScrollTop).toBeGreaterThan(0);
    expect(scrolledLayout.panelScrollTop).toBe(0);
    expect(scrolledLayout.header).toEqual(scrolledLayout.before.header);
    expect(scrolledLayout.footer).toEqual(scrolledLayout.before.footer);
    expect(scrolledLayout.firstSectionTop).toBeLessThan(scrolledLayout.before.firstSectionTop);
    expect(scrolledLayout.closeContained).toBe(true);
    expect(scrolledLayout.visibleBuysContained).toBe(true);
  });

  test('Store cards contain their information and purchase control without overlap', async ({
    page,
  }) => {
    await openStoreFromArmory(page);

    const violations = await page.locator('.st-hud__store-row').evaluateAll((rows) =>
      rows.flatMap((row) => {
        const card = row.getBoundingClientRect();
        const info = row.querySelector<HTMLElement>('.st-hud__store-info')!
          .getBoundingClientRect();
        const buy = row.querySelector<HTMLButtonElement>('.st-hud__store-buy')!
          .getBoundingClientRect();
        const tolerance = 1;
        const scale = card.width / (row as HTMLElement).offsetWidth;
        const declaredGap = Number.parseFloat(getComputedStyle(row).columnGap);
        const actualGap = buy.left - info.right;
        const expectedGap = declaredGap * scale;
        const infoLogicalWidth = info.width / scale;
        const infoNode = row.querySelector<HTMLElement>('.st-hud__store-info')!;
        const infoContentContained =
          infoNode.scrollWidth <= infoNode.clientWidth + tolerance
          && infoNode.scrollHeight <= infoNode.clientHeight + tolerance;
        const contained = (child: DOMRect) =>
          child.left >= card.left - tolerance
          && child.right <= card.right + tolerance
          && child.top >= card.top - tolerance
          && child.bottom <= card.bottom + tolerance;
        const separated = actualGap >= expectedGap - tolerance;
        const readableInfo = infoLogicalWidth >= 48 && infoContentContained;
        if (contained(info) && contained(buy) && separated && readableInfo) return [];
        return [{
          name: row.querySelector('.st-hud__store-name')?.textContent ?? 'unknown',
          card: card.toJSON(),
          info: info.toJSON(),
          buy: buy.toJSON(),
          containedInfo: contained(info),
          containedBuy: contained(buy),
          actualGap,
          expectedGap,
          infoLogicalWidth,
          infoContentContained,
          separated,
          readableInfo,
        }];
      }),
    );

    expect(
      violations,
      `Store card children must stay inside their card without overlap: ${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  test('Store catalog preserves 44px buy targets at the non-compact coarse scale', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the coarse-pointer project');
    await page.setViewportSize({ width: 1172, height: 600 });
    await expect.poll(() => isCompact(page)).toBe(false);
    await openStoreFromArmory(page);

    const targets = page.locator('.st-hud__store-catalog .st-hud__store-buy');
    const heights = await targets.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });

  test('Store keeps the generated round-shop coarse minimum at the scale boundary', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the coarse-pointer project');
    await page.setViewportSize({ width: 1172, height: 600 });
    await expect.poll(() => isCompact(page)).toBe(false);

    const roundShopMinimums = await page.locator('.st-hud__roundshop-grid .st-hud__store-buy')
      .evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).minHeight));
    expect(roundShopMinimums).toHaveLength(20);
    expect(roundShopMinimums.every((minimum) => minimum === '44px')).toBe(true);

    await openStoreFromArmory(page);
    const catalogHeights = await page.locator('.st-hud__store-catalog .st-hud__store-buy')
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(Math.min(...catalogHeights)).toBeGreaterThanOrEqual(44);
  });

  test('Store catalog preserves 44px buy targets at the smaller landscape scale', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the coarse-pointer project');
    await page.setViewportSize({ width: 667, height: 375 });
    await expect.poll(() => isCompact(page)).toBe(true);
    await openStoreFromArmory(page);

    const targets = page.locator('.st-hud__store-catalog .st-hud__store-buy');
    const heights = await targets.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    const containment = await page.locator('.st-hud__store-panel').evaluate((panelNode) => {
      const panel = panelNode as HTMLElement;
      const store = panel.parentElement!;
      const catalog = panel.querySelector<HTMLElement>('.st-hud__store-catalog')!;
      const panelRect = panel.getBoundingClientRect();
      const storeRect = store.getBoundingClientRect();
      const isContained = (inner: DOMRect, outer: DOMRect) =>
        inner.left >= outer.left - 1
        && inner.right <= outer.right + 1
        && inner.top >= outer.top - 1
        && inner.bottom <= outer.bottom + 1;
      const catalogRect = catalog.getBoundingClientRect();
      const visibleBuys = [...catalog.querySelectorAll<HTMLButtonElement>('.st-hud__store-buy')]
        .map((button) => button.getBoundingClientRect())
        .filter((target) => target.top >= catalogRect.top - 1 && target.bottom <= catalogRect.bottom + 1);
      return {
        panelContainedByStore: isContained(panelRect, storeRect),
        panelContainedByViewport:
          panelRect.left >= -1 && panelRect.right <= window.innerWidth + 1
          && panelRect.top >= -1 && panelRect.bottom <= window.innerHeight + 1,
        closeContained: isContained(panel.querySelector<HTMLElement>('.st-hud__store-close')!.getBoundingClientRect(), panelRect),
        visibleBuysContained: visibleBuys.length > 0
          && visibleBuys.every((target) => isContained(target, panelRect) && isContained(target, storeRect)),
      };
    });
    expect(containment.panelContainedByStore).toBe(true);
    expect(containment.panelContainedByViewport).toBe(true);
    expect(containment.closeContained).toBe(true);
    expect(containment.visibleBuysContained).toBe(true);
    const documentSize = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    expect(documentSize.width).toBeLessThanOrEqual(documentSize.viewportWidth);
    expect(documentSize.height).toBeLessThanOrEqual(documentSize.viewportHeight);
  });

  test('one numerical firing solution replaces the retired analog computer at every scale', async ({ page }) => {
    const solution = page.locator('#battle-rail .st-hud__console-solution');
    await expect(page.locator('.st-hud__gauge-row')).toHaveCount(0);
    await expect(solution.locator('.st-hud__solution-adjustment')).toHaveCount(2);
    const wind = solution.locator('.st-hud__solution-wind');
    await expect(wind).toHaveCount(1);
    await expect(wind.locator('[data-ui="deterministic-aim-guide"]')).toHaveCount(1);

    // Live numerical firing values must stay inside their owner regions.
    const geometry = await solution.evaluate((node) => {
      const solution = node.getBoundingClientRect();
      const controls = [...node.querySelectorAll<HTMLElement>(
        '.st-hud__solution-adjustment, .st-hud__solution-wind',
      )];
      const contained = (rect: DOMRect) =>
        rect.left >= solution.left - 1 && rect.right <= solution.right + 1
        && rect.top >= solution.top - 1 && rect.bottom <= solution.bottom + 1;
      return controls.map((control) => ({
        text: control.textContent?.trim(),
        contained: contained(control.getBoundingClientRect()),
      }));
    });
    expect(geometry).toHaveLength(3);
    expect(
      geometry.every((control) => control.contained),
      `integrated solution controls must remain contained: ${JSON.stringify(geometry)}`,
    ).toBe(true);
    expect(geometry.map((control) => control.text).join(' ')).toMatch(/Angle.*Power.*Wind.*Guide/s);
  });

  test('Fire Control uses the full live rail instead of decorative empty cards', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'pixel-touch', 'touch deliberately gives Wind and Guide their own reachable lower row');
    const geometry = await page.locator('#battle-rail .st-hud__console-solution').evaluate((solution) => {
      const rect = solution.getBoundingClientRect();
      const box = (selector: string) => {
        const node = solution.querySelector<HTMLElement>(selector)!;
        const value = node.getBoundingClientRect();
        return { top: value.top, bottom: value.bottom, height: value.height };
      };
      const angle = solution.querySelector<HTMLElement>('[data-value-owner="angle"]')!;
      const power = solution.querySelector<HTMLElement>('[data-value-owner="power"]')!;
      const band = (owner: HTMLElement) => {
        const label = owner.querySelector<HTMLElement>('.st-hud__solution-adjustment-label')!.getBoundingClientRect();
        const value = owner.querySelector<HTMLElement>('output')!.getBoundingClientRect();
        const buttons = [...owner.querySelectorAll<HTMLElement>('button')].map((button) => button.getBoundingClientRect());
        return {
          labelBottom: label.bottom,
          valueTop: value.top,
          valueBottom: value.bottom,
          buttonTop: Math.min(...buttons.map((button) => button.top)),
        };
      };
      return {
        solution: { top: rect.top, bottom: rect.bottom, height: rect.height },
        weapon: box('.st-hud__weapon'),
        angle: box('[data-value-owner="angle"]'),
        power: box('[data-value-owner="power"]'),
        wind: box('[data-value-owner="wind"]'),
        terminal: box('.st-hud__fire-terminal'),
        terminalState: box('.st-hud__console-state'),
        fire: box('.st-hud__primary-action'),
        angleBand: band(angle),
        powerBand: band(power),
      };
    });
    for (const [name, cell] of Object.entries({
      weapon: geometry.weapon,
      angle: geometry.angle,
      power: geometry.power,
      wind: geometry.wind,
      terminal: geometry.terminal,
    })) {
      expect(cell.height, `${name} must occupy the live Fire Control row`)
        .toBeGreaterThanOrEqual(geometry.solution.height * 0.72);
      expect(cell.top, `${name} starts in the shared row`).toBeLessThanOrEqual(geometry.solution.top + 8);
      expect(cell.bottom, `${name} ends in the shared row`).toBeGreaterThanOrEqual(geometry.solution.bottom - 8);
    }
    expect(geometry.terminalState.top, 'phase starts the terminal hierarchy')
      .toBeGreaterThanOrEqual(geometry.terminal.top);
    expect(geometry.fire.top, 'the one commit action follows phase state')
      .toBeGreaterThanOrEqual(geometry.terminalState.bottom);
    expect(geometry.fire.height, 'Fire remains a bounded terminal action')
      .toBeLessThanOrEqual(geometry.terminal.height * 0.62);
    for (const [name, band] of Object.entries({ angle: geometry.angleBand, power: geometry.powerBand })) {
      expect(band.labelBottom, `${name} label precedes live value`).toBeLessThanOrEqual(band.valueTop);
      expect(band.valueBottom, `${name} value precedes controls`).toBeLessThanOrEqual(band.buttonTop);
    }
  });

  test('Commander and Fire Control consume the full command rail with no orphaned track', async ({ page }) => {
    const geometry = await page.locator('#battle-rail .st-hud__command-console').evaluate((console) => {
      const rect = console.getBoundingClientRect();
      const directChildren = [...console.children].filter((node) => node instanceof HTMLElement) as HTMLElement[];
      const context = console.querySelector<HTMLElement>(':scope > .st-hud__console-context')!;
      const solution = console.querySelector<HTMLElement>(':scope > .st-hud__console-solution')!;
      const contextRect = context.getBoundingClientRect();
      const solutionRect = solution.getBoundingClientRect();
      return {
        directChildClasses: directChildren.map((child) => child.className),
        console: { left: rect.left, right: rect.right },
        context: { left: contextRect.left, right: contextRect.right },
        solution: { left: solutionRect.left, right: solutionRect.right },
      };
    });
    expect(geometry.directChildClasses).toEqual([
      expect.stringContaining('st-hud__console-context'),
      expect.stringContaining('st-hud__console-solution'),
    ]);
    expect(geometry.context.left).toBeLessThanOrEqual(geometry.console.left + 1);
    expect(geometry.solution.right).toBeGreaterThanOrEqual(geometry.console.right - 1);
    expect(geometry.solution.left).toBeGreaterThan(geometry.context.right);
  });

  test('desktop Commander spends its full column on live tactical identity instead of blank rail', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'touch intentionally removes the decorative portrait');
    const geometry = await page.locator('#battle-rail .st-hud__console-context').evaluate((context) => {
      const contextRect = context.getBoundingClientRect();
      const active = context.querySelector<HTMLElement>('.st-hud__active-row')!.getBoundingClientRect();
      const portrait = context.querySelector<HTMLElement>('.st-hud__tank-portrait-frame')!.getBoundingClientRect();
      const mobility = context.querySelector<HTMLElement>('.st-hud__mobility')!.getBoundingClientRect();
      return {
        context: { top: contextRect.top, bottom: contextRect.bottom, height: contextRect.height },
        active: { top: active.top, bottom: active.bottom, height: active.height },
        portrait: { top: portrait.top, bottom: portrait.bottom, width: portrait.width, height: portrait.height },
        mobility: { top: mobility.top, bottom: mobility.bottom },
      };
    });
    expect(geometry.active.bottom).toBeGreaterThanOrEqual(geometry.context.bottom - 4);
    // The compact 200px protected rail keeps Commander useful without taking
    // back battlefield height. The portrait remains a substantial identity cue
    // while mobility anchors the lower edge of the same live panel.
    expect(geometry.portrait.height).toBeGreaterThanOrEqual(geometry.active.height * 0.35);
    expect(geometry.portrait.width / geometry.portrait.height,
      'Commander tank art must remain a landscape vehicle, not stretch vertically').toBeGreaterThan(1.7);
    // Commander keeps a deliberate 7px inner panel inset; anything beyond this
    // would be the blank lower-third regression this test guards.
    expect(geometry.mobility.bottom).toBeGreaterThanOrEqual(geometry.context.bottom - 14);
  });

  test('turn command console is coherent, complete, and fitted', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'desktop-fine') {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    const console = page.getByRole('region', { name: 'Turn command console' });
    const activeRow = console.locator('.st-hud__active-row');
    const solution = console.locator('.st-hud__console-solution');
    const commitment = console.locator('.st-hud__fire-terminal');
    const player = activeRow.locator('.st-hud__turn-owner');
    const health = activeRow.locator('[data-ui="commander-health"]');
    const weapon = solution.locator('.st-hud__weapon-value');
    const portrait = activeRow.getByRole('img', { name: /Mobility:/ });
    const meter = activeRow.getByRole('progressbar', { name: 'Movement fuel' });
    const fire = console.locator('.st-hud__primary-action');

    await expect(console).toBeVisible();
    await expect(activeRow).toBeVisible();
    await expect(player).toHaveText('P1');
    await expect(health).toHaveText('100 HP');
    await expect(weapon).toHaveText('Baby Missile');
    if (testInfo.project.name === 'pixel-touch') {
      await expect(portrait).toHaveCount(0);
    } else {
      await expect(portrait).toHaveCount(1);
      await expect(portrait).toHaveAttribute(
        'aria-label',
        "P1's tank. Mobility: Tracks. Hull: Armor Hull. Turret: Cupola. Barrel: Cannon.",
      );
    }
    await expect(activeRow.locator('.st-hud__turn-kicker')).toBeVisible();
    await expect(solution.locator('.st-hud__weapon-icon .st-weapon-icon'))
      .toHaveAttribute('data-weapon', 'baby_missile');
    await expect(meter).toHaveAttribute('aria-valuenow', '100');
    await expect(fire).toBeVisible();
    await expect(console.locator('.st-hud__primary-action')).toHaveCount(1);
    await expect(commitment.locator('[data-ui="shot-readback"]')).toHaveCount(0);
    await expect(activeRow.locator('.st-hud__turn-status')).toHaveAttribute(
      'aria-label',
      "P1's turn. 100 health. Weapon Baby Missile. 100 fuel remaining.",
    );

    await page.getByRole('button', { name: 'Open Armory — equip or buy weapons' }).click();
    if (testInfo.project.name === 'pixel-touch') return;

    await page.locator('.st-hud__weapon-btn[data-weapon="sandhog"]').click();
    await page.getByRole('button', { name: 'Close Armory' }).click();
    await expect(weapon).toHaveText('Sandhog');
    await expect(commitment.locator('[data-ui="shot-readback"]')).toHaveCount(0);
    await expect(solution.locator('.st-hud__weapon-icon .st-weapon-icon'))
      .toHaveAttribute('data-weapon', 'sandhog');
    await expect(fire).toHaveAttribute('aria-label', 'Fire Sandhog');
    await expect(activeRow.locator('.st-hud__turn-status')).toHaveAttribute(
      'aria-label',
      "P1's turn. 100 health. Weapon Sandhog. 100 fuel remaining.",
    );
    await expect.poll(async () => portrait.evaluate((canvas) => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx === null) return false;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0;
      const colors = new Set<string>();
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3]!;
        if (alpha <= 32) continue;
        visible++;
        colors.add(
          `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${alpha}`,
        );
      }
      // The immediate geometric fallback occupies fewer than 1,000 pixels and
      // has a tiny palette. These floors require the decoded authored atlas.
      return visible > 1_000 && colors.size > 100;
    }), {
      message: 'the active portrait should decode and paint recognizable authored tank art',
    }).toBe(true);

    const portraitBox = await portrait.boundingBox();
    const activeRowBox = await activeRow.boundingBox();
    expect(portraitBox).not.toBeNull();
    expect(activeRowBox).not.toBeNull();
    expect(portraitBox!.width).toBeGreaterThanOrEqual(42);
    expect(portraitBox!.height).toBeGreaterThanOrEqual(24);
    expect(portraitBox!.x).toBeGreaterThanOrEqual(activeRowBox!.x - 1);
    expect(portraitBox!.x + portraitBox!.width)
      .toBeLessThanOrEqual(activeRowBox!.x + activeRowBox!.width + 1);
    expect(portraitBox!.y).toBeGreaterThanOrEqual(activeRowBox!.y - 1);
    expect(portraitBox!.y + portraitBox!.height)
      .toBeLessThanOrEqual(activeRowBox!.y + activeRowBox!.height + 1);

    // Exercise the exact maximum-name / longest-weapon layout contract with
    // production markup and computed browser geometry.
    const geometry = await console.evaluate((node) => {
      const hud = document.getElementById('hud')!;
      const playerNode = node.querySelector<HTMLElement>('.st-hud__turn-owner')!;
      const weaponNode = node.querySelector<HTMLElement>('.st-hud__weapon-value')!;
      const commitmentNode = node.querySelector<HTMLElement>('.st-hud__fire-terminal')!;
      // Mutate and measure in one browser task so the live HUD update loop
      // cannot restore the fixture name between the probe and geometry read.
      playerNode.textContent = 'Commander Longname X';
      const bounds = node.getBoundingClientRect();
      const visibleTargets = [...node.querySelectorAll<HTMLElement>('button')]
        .filter((target) => {
          const rect = target.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      const targetRects = visibleTargets.map((target) => target.getBoundingClientRect());
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
        targetViolations: targetRects
          .map((target, index) => ({ target, className: visibleTargets[index]!.className }))
          .filter(({ target }) => target.left < bounds.left - 1
            || target.right > bounds.right + 1
            || target.top < bounds.top - 1
            || target.bottom > bounds.bottom + 1)
          .map(({ target, className }) => ({ className, ...target.toJSON() })),
        commitmentHasSolutionReadback: commitmentNode.querySelector('[data-ui="shot-readback"]') !== null,
        solutionValueCounts: {
          weapon: node.querySelectorAll('.st-hud__console-solution .st-hud__weapon-value').length,
          elevation: node.querySelectorAll('.st-hud__console-solution [data-value-owner="angle"]').length,
          power: node.querySelectorAll('.st-hud__console-solution [data-value-owner="power"]').length,
          wind: node.querySelectorAll('.st-hud__console-solution [data-value-owner="wind"]').length,
        },
        childHeights: [...node.children].map((child) => ({
          className: child.className,
          clientHeight: (child as HTMLElement).clientHeight,
          scrollHeight: (child as HTMLElement).scrollHeight,
        })),
        targetMetrics: visibleTargets.map((target) => ({
          className: target.className,
          height: target.getBoundingClientRect().height,
          minHeight: getComputedStyle(target).minHeight,
        })),
      };
    });
    expect(geometry.consoleScrollHeight, JSON.stringify(geometry.childHeights))
      .toBeLessThanOrEqual(geometry.consoleClientHeight + 1);
    expect(geometry.consoleScrollWidth).toBeLessThanOrEqual(geometry.consoleClientWidth + 1);
    expect(geometry.hudScrollHeight).toBeLessThanOrEqual(geometry.hudClientHeight + 1);
    expect(geometry.playerScrollWidth).toBeLessThanOrEqual(geometry.playerClientWidth + 1);
    expect(geometry.weaponScrollWidth).toBeLessThanOrEqual(geometry.weaponClientWidth + 1);
    expect(geometry.targetViolations, JSON.stringify(geometry)).toEqual([]);
    expect(geometry.commitmentHasSolutionReadback).toBe(false);
    expect(geometry.solutionValueCounts).toEqual({ weapon: 1, elevation: 1, power: 1, wind: 1 });
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
      const visibleTargets = [...node.querySelectorAll<HTMLElement>('button')]
        .filter((target) => {
          const rect = target.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      return {
        hudClientHeight: hud.clientHeight,
        hudScrollHeight: hud.scrollHeight,
        targets: visibleTargets.map((target) => ({
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
  }, testInfo) => {
    const activeRow = page.locator('.st-hud__active-row');
    const mobility = activeRow.locator('.st-hud__mobility');
    const left = mobility.locator('[data-move="-8"]');
    const right = mobility.locator('[data-move="8"]');
    const fuel = mobility.locator('.st-hud__fuel-value');
    const fuelLabel = mobility.locator('.st-hud__fuel-label');
    const meter = mobility.getByRole('progressbar', { name: 'Movement fuel' });

    await expect(mobility).toBeVisible();
    await expect(mobility).toHaveAttribute('role', 'group');
    await expect(mobility).toHaveAttribute('aria-label', 'Tank movement');
    await expect(left).toBeEnabled();
    await expect(right).toBeEnabled();
    await expect(fuel).toHaveText('100');
    await expect(fuelLabel).toHaveText('Fuel');
    await expect(meter).toHaveAttribute('data-fuel-band', 'normal');

    const rowBox = await activeRow.boundingBox();
    const mobilityBox = await mobility.boundingBox();
    const meterBox = await meter.boundingBox();
    const fuelBox = await fuel.boundingBox();
    const fuelLabelBox = await fuelLabel.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(mobilityBox).not.toBeNull();
    expect(meterBox).not.toBeNull();
    expect(fuelBox).not.toBeNull();
    expect(fuelLabelBox).not.toBeNull();
    expect(mobilityBox!.x).toBeGreaterThanOrEqual(rowBox!.x - 1);
    expect(mobilityBox!.x + mobilityBox!.width)
      .toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1);
    const authoredDialSize = await meter.evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: parseFloat(style.width), height: parseFloat(style.height) };
    });
    const touch = testInfo.project.name === 'pixel-touch';
    const authoredFuelDial = touch ? 58 : testInfo.project.name === 'small-window' ? 42 : 34;
    expect(authoredDialSize.width).toBeCloseTo(authoredFuelDial, 1);
    expect(authoredDialSize.height).toBeCloseTo(authoredFuelDial, 1);
    expect(Math.abs(meterBox!.width - meterBox!.height)).toBeLessThanOrEqual(1);
    expect(meterBox!.width).toBeGreaterThanOrEqual(touch ? 28 : 20);
    expect(fuelBox!.x).toBeGreaterThanOrEqual(meterBox!.x);
    expect(fuelBox!.x + fuelBox!.width).toBeLessThanOrEqual(meterBox!.x + meterBox!.width);
    expect(fuelLabelBox!.x).toBeGreaterThanOrEqual(meterBox!.x);
    expect(fuelLabelBox!.x + fuelLabelBox!.width)
      .toBeLessThanOrEqual(meterBox!.x + meterBox!.width);
    expect(fuelBox!.y + fuelBox!.height).toBeLessThanOrEqual(fuelLabelBox!.y + 1);
    const fuelTypography = await meter.evaluate((node) => {
      const value = node.querySelector<HTMLElement>('.st-hud__fuel-value')!;
      const label = node.querySelector<HTMLElement>('.st-hud__fuel-label')!;
      return {
        valueFontSize: parseFloat(getComputedStyle(value).fontSize),
        labelFontSize: parseFloat(getComputedStyle(label).fontSize),
      };
    });
    const compact = testInfo.project.name !== 'desktop-fine';
    expect(fuelTypography.valueFontSize).toBeGreaterThanOrEqual(compact ? 12 : 11);
    expect(fuelTypography.labelFontSize).toBeGreaterThanOrEqual(compact ? 7 : 6);
    expect(fuelBox!.height).toBeGreaterThanOrEqual(compact ? 6.5 : 9);
    expect(fuelLabelBox!.height).toBeGreaterThanOrEqual(compact ? 4 : 5);
    await expect.poll(() => meter.evaluate(
      (node) => getComputedStyle(node).backgroundImage,
    )).toContain('conic-gradient');
    const tierColors = await meter.evaluate((node) => {
      const color = () => getComputedStyle(node).getPropertyValue('--st-fuel-color');
      const base = color();
      node.dataset['fuelTone'] = 'reserve';
      const reserve = color();
      node.dataset['fuelTone'] = 'deep-reserve';
      const deepReserve = color();
      node.dataset['fuelTone'] = 'base';
      return { base, reserve, deepReserve };
    });
    expect(new Set(Object.values(tierColors)).size).toBe(3);
    await meter.evaluate((node) => { node.dataset['identityProbe'] = 'stable'; });
    const fullRing = await meter.evaluate((node) => getComputedStyle(node).backgroundImage);

    const activeRight = right;
    await activeRight.click();
    await expect.poll(() => fuel.textContent()).not.toBe('100');
    const remaining = Number(await fuel.textContent());
    expect(remaining).toBeGreaterThanOrEqual(92);
    expect(remaining).toBeLessThan(100);
    await expect(meter).toHaveAttribute('aria-valuenow', String(remaining));
    await expect(meter).toHaveAttribute('data-identity-probe', 'stable');
    await expect.poll(() => meter.evaluate(
      (node) => getComputedStyle(node).backgroundImage,
    )).not.toBe(fullRing);
    await expect(activeRow.locator('.st-hud__turn-owner')).toHaveText('P1');
    await expect(activeRow.locator('.st-hud__turn-status')).toHaveAttribute(
      'aria-label',
      `P1's turn. 100 health. Weapon Baby Missile. ${remaining} fuel remaining.`,
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

    const railBox = await page.locator('#battle-rail').boundingBox();
    const actionBox = await action.boundingBox();
    expect(railBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(actionBox!.x).toBeGreaterThanOrEqual(railBox!.x - 1);
    expect(actionBox!.x + actionBox!.width)
      .toBeLessThanOrEqual(railBox!.x + railBox!.width + 1);
    expect(actionBox!.y).toBeGreaterThanOrEqual(railBox!.y - 1);
    expect(actionBox!.y + actionBox!.height)
      .toBeLessThanOrEqual(railBox!.y + railBox!.height + 1);
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
    await expect(page.locator('.st-hud__primary-action')).toHaveCount(0);
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
    const rail = page.locator('#battle-rail');
    const modalLayer = page.locator('#modal-layer');
    const before = await rail.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    const trigger = page.locator('.st-hud__strip-toggle');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.st-hud__strip-grid')).toBeVisible();
    await expect(page.locator('.st-hud__strip')).toHaveClass(/st-hud__strip--open/);
    await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.st-hud__arsenal-drawer-close')).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-hidden', 'true');
    const modalBox = await modalLayer.boundingBox();
    const drawerBox = await page.locator('.st-hud__strip').boundingBox();
    expect(modalBox).not.toBeNull();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox!.x).toBeGreaterThanOrEqual(modalBox!.x - 1);
    expect(drawerBox!.x + drawerBox!.width)
      .toBeLessThanOrEqual(modalBox!.x + modalBox!.width + 1);
    expect(drawerBox!.y).toBeGreaterThanOrEqual(modalBox!.y - 1);
    expect(drawerBox!.y + drawerBox!.height)
      .toBeLessThanOrEqual(modalBox!.y + modalBox!.height + 1);
    for (const locator of [
      page.locator('.st-hud__strip-grid'),
      page.locator('.st-hud__arsenal-drawer-close'),
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
    const open = await rail.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(open.scrollHeight).toBeLessThanOrEqual(open.clientHeight + 1);
    expect(open.scrollHeight).toBe(before.scrollHeight);

    const inertSiblings = await page.locator('#hud').evaluate((hud) =>
      [...hud.children]
        .filter((child) => !child.classList.contains('st-hud__strip'))
        .every((child) => (child as HTMLElement).inert),
    );
    expect(inertSiblings).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.st-hud__strip-grid')).toBeHidden();
    await expect(page.locator('.st-hud__strip')).not.toHaveClass(/st-hud__strip--open/);
    await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.st-hud__strip-toggle')).toBeFocused();
    await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute(
      'aria-label',
      'Open Armory — equip or buy weapons',
    );
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
