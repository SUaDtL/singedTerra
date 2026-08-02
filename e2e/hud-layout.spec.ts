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
  ['sandhog', 'Sandhog'],
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

  test('active custom tank has a combat-readable tactical identity card', async ({
    page,
  }, testInfo) => {
    const frame = page.locator('.st-hud__tank-portrait-frame');
    const portrait = frame.locator('.st-hud__tank-portrait');
    await expect(frame).toBeVisible();
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveAttribute('width', '144');
    await expect(portrait).toHaveAttribute('height', '80');

    const geometry = await frame.evaluate((node) => {
      const frameBox = node.getBoundingClientRect();
      const portraitBox = node.querySelector('canvas')!.getBoundingClientRect();
      const hudBox = node.closest('#hud')!.getBoundingClientRect();
      return {
        frame: frameBox.toJSON(),
        portrait: portraitBox.toJSON(),
        hud: hudBox.toJSON(),
      };
    });
    expect(Math.abs(geometry.frame.width - geometry.portrait.width)).toBeLessThan(1);
    expect(Math.abs(geometry.frame.height - geometry.portrait.height)).toBeLessThan(1);
    expect(geometry.frame.left).toBeGreaterThanOrEqual(geometry.hud.left);
    expect(geometry.frame.right).toBeLessThanOrEqual(geometry.hud.right);

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
  }) => {
    const icons = page.locator('svg.st-ui-icon');
    const glyphs = page.locator('.st-ui-glyph');
    const visibleGlyphs = page.locator('.st-ui-glyph:visible');
    const commandIcons = page.locator('.st-hud__controls svg.st-ui-icon');
    const commandGlyphs = page.locator('.st-hud__controls .st-ui-glyph');
    const touchIcons = page.locator('.st-hud__touch-strip svg.st-ui-icon');
    const railIcons = page.locator('#hud svg.st-ui-icon');
    const railGlyphs = page.locator('#hud .st-ui-glyph');

    await expect(icons).toHaveCount(18);
    await expect(glyphs).toHaveCount(10);
    expect(await commandIcons.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-icon')),
    )).toEqual(['aim', 'power', 'move', 'weapon', 'fire']);
    expect(await commandGlyphs.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-glyph')),
    )).toEqual(['aim', 'power', 'move', 'weapon', 'fire']);
    expect(await touchIcons.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-icon')),
    )).toEqual(['left', 'right', 'decrease', 'increase', 'left', 'right', 'weapon', 'menu']);
    expect(await railIcons.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-symbol')),
    )).toEqual(['menu', 'credits', 'target', 'ordnance', 'disclosure']);
    expect(await railGlyphs.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-glyph')),
    )).toEqual(['menu', 'store', 'fire', 'arsenal']);

    const arsenal = page.locator('[data-icon="arsenal"]');
    const store = page.locator('[data-icon="store"]');
    await expect(arsenal.locator('circle[r="9"]')).toHaveCount(1);
    await expect(store.locator('circle[r="6"]')).toHaveCount(1);
    await expect(page.getByText('Arsenal', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Store/ })).toBeVisible();
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
    for (const size of geometry.glyphSizes) {
      expect(size.frameWidth).toBeGreaterThanOrEqual(15);
      expect(size.frameHeight).toBeGreaterThanOrEqual(15);
      expect(size.iconWidth).toBeGreaterThanOrEqual(12);
      expect(size.iconHeight).toBeGreaterThanOrEqual(12);
    }
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewportHeight);
  });

  test('interactive Command Deck and touch dock stay causal, strong, and fitted', async ({
    page,
  }, testInfo) => {
    const overlay = page.locator('#game-overlay');
    const deck = overlay.locator('[data-ui="command-deck"]');
    const dock = overlay.locator('.st-hud__touch-strip');
    const isTouch = testInfo.project.name === 'pixel-touch';

    if (!isTouch) {
      await expect(deck).toBeVisible();
      await expect(deck).toHaveAttribute('role', 'region');
      await expect(deck).toHaveAttribute('aria-label', 'Keyboard and mouse commands');
      await expect(dock).toBeHidden();
      await expect(deck.locator('.st-hud__controls-title')).toHaveText('Command Deck');
      await expect(deck.locator('.st-hud__controls-mode')).toHaveText('Mouse + keys');
      await expect(deck.locator('.st-hud__control-cell')).toHaveCount(5);
      expect(await deck.locator('.st-hud__control-cell').evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset['command']),
      )).toEqual(['aim', 'power', 'move', 'weapon', 'fire']);
      const commandKeys = deck.locator('.st-hud__command-key');
      await expect(commandKeys).toHaveCount(9);
      expect(await commandKeys.evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset['commandAction']),
      )).toEqual([
        'aim-left',
        'aim-right',
        'power-up',
        'power-down',
        'move-left',
        'move-right',
        'weapon',
        'fire-space',
        'fire-enter',
      ]);
      const geometry = await deck.evaluate((node) => {
        const deckRect = node.getBoundingClientRect();
        const game = document.querySelector<HTMLCanvasElement>('#game')!;
        const gameRect = game.getBoundingClientRect();
        const gameScale = gameRect.width / game.width;
        const impactMonitorLeft = gameRect.left + ((game.width - 220) / 2) * gameScale;
        const title = node.querySelector<HTMLElement>('.st-hud__controls-title')!;
        const mode = node.querySelector<HTMLElement>('.st-hud__controls-mode')!;
        const rows = [...node.querySelectorAll<HTMLElement>('.st-hud__control-cell')];
        const labels = [...node.querySelectorAll<HTMLElement>('.st-hud__control-label')];
        const keycaps = [...node.querySelectorAll<HTMLElement>('kbd')];
        const glyphs = [...node.querySelectorAll<HTMLElement>('.st-ui-glyph')];
        const firstStyle = getComputedStyle(rows[0]!);
        const primaryStyle = getComputedStyle(rows.at(-1)!);
        return {
          width: parseFloat(getComputedStyle(node).width),
          titleFont: parseFloat(getComputedStyle(title).fontSize),
          modeFont: parseFloat(getComputedStyle(mode).fontSize),
          rows: rows.map((row) => ({
            rect: row.getBoundingClientRect().toJSON(),
            minHeight: parseFloat(getComputedStyle(row).minHeight),
          })),
          labels: labels.map((label) => ({
            fontSize: parseFloat(getComputedStyle(label).fontSize),
            height: label.getBoundingClientRect().height,
          })),
          keyFonts: keycaps.map((key) => parseFloat(getComputedStyle(key).fontSize)),
          glyphs: glyphs.map((glyph) => ({
            logicalWidth: parseFloat(getComputedStyle(glyph).width),
            logicalHeight: parseFloat(getComputedStyle(glyph).height),
            rendered: glyph.getBoundingClientRect().toJSON(),
          })),
          ordinaryBorder: firstStyle.borderColor,
          primaryBorder: primaryStyle.borderColor,
          ordinaryBackground: firstStyle.backgroundImage,
          primaryBackground: primaryStyle.backgroundImage,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          impactClearanceLogical: (impactMonitorLeft - deckRect.right) / gameScale,
        };
      });
      const compactDeck = testInfo.project.name === 'small-window';
      expect(geometry.width).toBeCloseTo(236, 1);
      expect(geometry.titleFont).toBeGreaterThanOrEqual(10.5);
      expect(geometry.modeFont).toBeGreaterThanOrEqual(7.5);
      expect(geometry.rows.at(-1)!.rect.width)
        .toBeGreaterThan(geometry.rows[0]!.rect.width * 1.8);
      for (const row of geometry.rows.slice(0, -1)) {
        expect(row.minHeight).toBeGreaterThanOrEqual(46);
      }
      expect(geometry.rows.at(-1)!.minHeight).toBeGreaterThanOrEqual(42);
      expect(geometry.ordinaryBorder).not.toBe(geometry.primaryBorder);
      expect(geometry.ordinaryBackground).not.toBe(geometry.primaryBackground);
      expect(geometry.keyFonts).toHaveLength(9);
      for (const fontSize of geometry.keyFonts) {
        expect(fontSize).toBeGreaterThanOrEqual(8.5);
      }
      expect(geometry.glyphs).toHaveLength(5);
      for (const glyph of geometry.glyphs) {
        expect(glyph.logicalWidth).toBeCloseTo(30, 1);
        expect(glyph.logicalHeight).toBeCloseTo(30, 1);
        expect(glyph.rendered.width).toBeGreaterThanOrEqual(compactDeck ? 15 : 29.9);
        expect(glyph.rendered.height).toBeGreaterThanOrEqual(compactDeck ? 15 : 29.9);
      }
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
      expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight);
      expect(geometry.impactClearanceLogical).toBeGreaterThanOrEqual(32);
      for (const label of geometry.labels) {
        expect(label.fontSize).toBeGreaterThanOrEqual(compactDeck ? 11 : 10);
        expect(label.height).toBeGreaterThanOrEqual(compactDeck ? 5 : 7);
      }
      const elevation = page.locator(
        '.st-hud__gauge-cell--elevation .st-hud__gauge-label',
      );
      const power = page.locator('.st-hud__gauge-cell--power .st-hud__gauge-label');
      await expect(elevation).toHaveText('45° ▶');
      const aimLeft = deck.locator(
        '.st-hud__command-key[data-command-action="aim-left"]',
      );
      await expect(aimLeft).toHaveAttribute('aria-label', 'Aim barrel left');
      await aimLeft.focus();
      expect(await aimLeft.evaluate((button) => getComputedStyle(button).boxShadow))
        .not.toBe('none');
      await page.keyboard.press('Enter');
      await expect(elevation).toHaveText('48° ▶');
      await deck.getByRole('button', { name: 'Aim barrel right' }).click();
      await expect(elevation).toHaveText('45° ▶');
      await expect(power).toHaveText('50');
      await deck.getByRole('button', { name: 'Increase power' }).click();
      await expect(power).toHaveText('53');
      await deck.getByRole('button', { name: 'Decrease power' }).click();
      await expect(power).toHaveText('50');

      const arsenalToggle = page.getByRole('button', { name: 'Expand arsenal' });
      const deckGrid = deck.locator('.st-hud__control-grid');
      await expect(deckGrid).not.toHaveAttribute('inert', '');
      await arsenalToggle.click();
      await expect(deckGrid).toHaveAttribute('inert', '');
      await expect(deck).toHaveAttribute('aria-hidden', 'true');
      await aimLeft.evaluate((button) => (button as HTMLButtonElement).focus());
      await expect(aimLeft).not.toBeFocused();
      const aimBounds = await aimLeft.boundingBox();
      expect(aimBounds).not.toBeNull();
      await page.mouse.click(
        aimBounds!.x + aimBounds!.width / 2,
        aimBounds!.y + aimBounds!.height / 2,
      );
      await expect(elevation).toHaveText('45° ▶');
      await page.keyboard.press('Tab');
      expect(await deck.evaluate((node) => node.contains(document.activeElement))).toBe(false);
      await page.getByRole('button', { name: 'Collapse arsenal' }).click();
      await expect(deckGrid).not.toHaveAttribute('inert', '');
      await expect(deck).not.toHaveAttribute('aria-hidden', 'true');
      await aimLeft.focus();
      await expect(aimLeft).toBeFocused();

      const fire = deck.getByRole('button', { name: 'Fire Baby Missile with Space' });
      await fire.click();
      await expect(fire).toBeDisabled();
    } else {
      await expect(deck).toBeHidden();
      await expect(dock).toBeVisible();
      await expect(dock).toHaveAttribute('role', 'toolbar');
      await expect(dock).toHaveAttribute('aria-label', 'Touch commands');
      await expect(dock.locator('.st-hud__touch-title')).toHaveText('Command Deck');
      await expect(dock.locator('.st-hud__touch-mode')).toHaveText('Touch');
      const groups = dock.locator('.st-hud__touch-group');
      await expect(groups).toHaveCount(3);
      expect(await groups.evaluateAll((items) => items.map((item) => ({
        name: item.getAttribute('aria-label'),
        title: item.querySelector('.st-hud__touch-group-title')?.textContent,
        labels: [...item.querySelectorAll('.st-hud__touch-label')]
          .map((label) => label.textContent),
      })))).toEqual([
        { name: 'Aim', title: 'Aim', labels: ['Left', 'Right'] },
        { name: 'Power', title: 'Power', labels: ['Less', 'More'] },
        { name: 'Drive', title: 'Drive', labels: ['Left', 'Right'] },
      ]);
      const buttons = dock.locator('.st-hud__touch-btn');
      await expect(buttons).toHaveCount(8);
      expect(await buttons.evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset['command']),
      )).toEqual([
        'aim-left',
        'aim-right',
        'power-down',
        'power-up',
        'move-left',
        'move-right',
        'weapon',
        'menu',
      ]);
      const buttonBoxes = await buttons.evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().toJSON()),
      );
      for (const box of buttonBoxes) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      const dockType = await dock.evaluate((node) => ({
        title: node.querySelector<HTMLElement>('.st-hud__touch-title')!
          .getBoundingClientRect().toJSON(),
        mode: node.querySelector<HTMLElement>('.st-hud__touch-mode')!
          .getBoundingClientRect().toJSON(),
        groupTitles: [...node.querySelectorAll<HTMLElement>('.st-hud__touch-group-title')]
          .map((title) => ({
            text: title.textContent,
            box: title.getBoundingClientRect().toJSON(),
          })),
        labels: [...node.querySelectorAll<HTMLElement>('.st-hud__touch-label')]
          .map((label) => label.getBoundingClientRect().height),
        symbols: [...node.querySelectorAll<HTMLElement>('.st-hud__touch-symbol')]
          .map((symbol) => {
            const box = symbol.getBoundingClientRect();
            return { width: box.width, height: box.height };
          }),
        icons: [...node.querySelectorAll<SVGElement>('.st-hud__touch-symbol svg')]
          .map((icon) => icon.getBoundingClientRect().toJSON()),
      }));
      expect(dockType.title.height).toBeGreaterThanOrEqual(8);
      expect(dockType.mode.height).toBeGreaterThanOrEqual(8);
      expect(dockType.groupTitles.map((title) => title.text)).toEqual([
        'Aim',
        'Power',
        'Drive',
        'Utilities',
      ]);
      for (const title of dockType.groupTitles) {
        expect(title.box.width).toBeGreaterThan(0);
        expect(title.box.height).toBeGreaterThanOrEqual(8);
      }
      for (const height of dockType.labels) expect(height).toBeGreaterThanOrEqual(8);
      for (const symbol of dockType.symbols) {
        expect(symbol.width).toBeGreaterThanOrEqual(18);
        expect(symbol.height).toBeGreaterThanOrEqual(18);
      }
      for (const icon of dockType.icons) {
        expect(icon.width).toBeGreaterThanOrEqual(12);
        expect(icon.height).toBeGreaterThanOrEqual(12);
      }
      await expect(page.locator('#hud .st-hud__menu')).toBeHidden();
      await dock.getByRole('button', { name: 'Open menu' }).click();
      await expect(page.getByText('Paused', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Resume' }).click();
      await expect(page.getByText('Paused', { exact: true })).toBeHidden();
      await expect(dock).toBeVisible();

      const elevation = page.locator(
        '.st-hud__gauge-cell--elevation .st-hud__gauge-label',
      );
      const power = page.locator('.st-hud__gauge-cell--power .st-hud__gauge-label');
      await expect(elevation).toHaveText('45° ▶');
      await dock.getByRole('button', { name: 'Aim barrel left' }).click();
      await expect(elevation).toHaveText('48° ▶');
      await dock.getByRole('button', { name: 'Aim barrel right' }).click();
      await expect(elevation).toHaveText('45° ▶');
      await expect(power).toHaveText('50');
      await dock.getByRole('button', { name: 'Decrease power' }).click();
      await expect(power).toHaveText('47');
      await dock.getByRole('button', { name: 'Increase power' }).click();
      await expect(power).toHaveText('50');
      await dock.getByRole('button', { name: 'Cycle weapon, current Baby Missile' }).click();
      await expect(dock.getByRole('button', { name: 'Cycle weapon, current Missile' }))
        .toBeVisible();

      const fuel = page.locator('.st-hud__fuel-value');
      await expect(fuel).toHaveText('100');
      await dock.getByRole('button', { name: 'Move tank right, 8 fuel maximum' }).click();
      const movedRight = await fuel.evaluate((element) =>
        new Promise<boolean>((resolve) => {
          let frames = 0;
          const sample = (): void => {
            if (element.textContent !== '100') {
              resolve(true);
            } else if (frames >= 6) {
              resolve(false);
            } else {
              frames += 1;
              requestAnimationFrame(sample);
            }
          };
          requestAnimationFrame(sample);
        }),
      );
      if (!movedRight) {
        await dock.getByRole('button', { name: 'Move tank left, 8 fuel maximum' }).click();
      }
      await expect(fuel).not.toHaveText('100');
      const remainingFuel = Number(await fuel.textContent());
      expect(remainingFuel).toBeGreaterThanOrEqual(92);
      expect(remainingFuel).toBeLessThan(100);
      await expect(page.locator('.st-hud__turn-owner')).toHaveText('P1');

      const railMoves = page.locator('.st-hud__mobility > .st-hud__move-btn');
      await expect(railMoves).toHaveCount(2);
      await expect(railMoves.first()).toBeHidden();
      await expect(railMoves.last()).toBeHidden();
      for (const action of [
        page.getByRole('button', { name: /^Store/ }),
        page.getByRole('button', { name: /^Fire/ }),
      ]) {
        const box = await action.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }

      const arsenalToggle = page.getByRole('button', { name: 'Expand arsenal' });
      const arsenalBox = await arsenalToggle.boundingBox();
      expect(arsenalBox).not.toBeNull();
      expect(arsenalBox!.width).toBeGreaterThanOrEqual(44);
      expect(arsenalBox!.height).toBeGreaterThanOrEqual(44);
      await arsenalToggle.click();
      await expect(dock).toBeHidden();
      expect(await dock.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
      await page.getByRole('button', { name: 'Collapse arsenal' }).click();
      await expect(dock).toBeVisible();
      expect(await dock.evaluate((element) => (element as HTMLElement).inert)).toBe(false);
    }

    const labelSelector = isTouch
      ? '.st-hud__touch-label'
      : '.st-hud__control-label';
    const typography = await page.evaluate((selector) => {
      const label = document.querySelector<HTMLElement>(selector)!;
      const probe = document.createElement('span');
      probe.style.color = 'var(--ui-copy)';
      probe.style.fontFamily = 'var(--font-sans)';
      document.body.append(probe);
      const actual = getComputedStyle(label);
      const expected = getComputedStyle(probe);
      const result = {
        color: actual.color,
        expectedColor: expected.color,
        family: actual.fontFamily,
        expectedFamily: expected.fontFamily,
      };
      probe.remove();
      return result;
    }, labelSelector);
    expect(typography.color).toBe(typography.expectedColor);
    expect(typography.family).toBe(typography.expectedFamily);

    const geometry = await page.evaluate(() => {
      const overlayRect = document.getElementById('game-overlay')!.getBoundingClientRect();
      const active = document.querySelector<HTMLElement>(
        matchMedia('(pointer: coarse)').matches
          ? '.st-hud__touch-strip'
          : '.st-hud__controls',
      )!.getBoundingClientRect();
      return {
        contained:
          active.left >= overlayRect.left - 1
          && active.right <= overlayRect.right + 1
          && active.top >= overlayRect.top - 1
          && active.bottom <= overlayRect.bottom + 1,
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      };
    });
    expect(geometry.contained).toBe(true);
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewportHeight);
  });

  test('Pixel 5 Touch Command Deck stays bounded clear of shared overlay states', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the coarse-pointer project');
    const firstSalvo = page.locator('[data-ui="first-salvo-coach"]');
    const firstSalvoChildCount = await firstSalvo.evaluate((node) => node.childElementCount);
    const geometry = await page.evaluate(() => {
      const dock = document.querySelector<HTMLElement>('.st-hud__touch-strip')!;
      const overlay = document.getElementById('game-overlay')!;
      const hud = document.getElementById('hud')!;
      const stateEntries = [
        { node: document.querySelector<HTMLElement>('.st-hud__conn')!, hidden: 'st-hud__conn--hidden' },
        { node: document.querySelector<HTMLElement>('.st-hud__toast')!, hidden: 'st-hud__toast--hidden' },
        { node: document.querySelector<HTMLElement>('.st-hud__turnwatch')!, hidden: 'st-hud__turnwatch--hidden' },
        { node: document.querySelector<HTMLElement>('[data-ui="first-salvo-coach"]')!, hidden: 'st-hud__first-salvo--hidden' },
      ];
      const snapshots = stateEntries.map(({ node }) => ({
        node,
        className: node.className,
      }));
      const fixtureNodes = stateEntries.slice(0, 3).map(({ node }, index) => {
        const fixture = document.createElement('span');
        fixture.dataset['layoutStateFixture'] = String(index);
        fixture.textContent = ['Connection lost — reconnecting…', 'Shot failed — try again', 'Waiting for P2…'][index]!;
        node.append(fixture);
        return fixture;
      });
      const intersects = (a: DOMRect, b: DOMRect): boolean =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const renderedMetric = (node: HTMLElement): {
        rendered: boolean;
        box: DOMRect;
      } => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return {
          rendered:
            style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity) > 0
            && box.width > 0
            && box.height > 0,
          box,
        };
      };

      try {
        for (const { node, hidden } of stateEntries) node.classList.remove(hidden);
        const dockMetric = renderedMetric(dock);
        const overlayMetric = renderedMetric(overlay);
        const buttons = [...dock.querySelectorAll<HTMLElement>('.st-hud__touch-btn')]
          .map((button) => {
            const metric = renderedMetric(button);
            return { rendered: metric.rendered, box: metric.box.toJSON() };
          });
        const groups = [...dock.querySelectorAll<HTMLElement>('.st-hud__touch-group')]
          .map((group) => {
            const groupMetric = renderedMetric(group);
            const titleMetric = renderedMetric(
              group.querySelector<HTMLElement>('.st-hud__touch-group-title')!,
            );
            return {
              rendered: groupMetric.rendered,
              group: groupMetric.box.toJSON(),
              titleRendered: titleMetric.rendered,
              title: titleMetric.box.toJSON(),
              buttons: [...group.querySelectorAll<HTMLElement>('.st-hud__touch-btn')]
                .map((button) => renderedMetric(button).box.toJSON()),
            };
          });
        const states = stateEntries.map(({ node }) => {
          const metric = renderedMetric(node);
          return { rendered: metric.rendered, box: metric.box.toJSON() };
        });
        const stateOverlaps = states.map((state) => intersects(dockMetric.box, state.box as DOMRect));
        const noticeOverlaps = states.slice(0, 3).flatMap((state, index) =>
          states.slice(index + 1, 3).map((candidate) =>
            intersects(state.box as DOMRect, candidate.box as DOMRect),
          ),
        );
        return {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          dockRendered: dockMetric.rendered,
          overlayRendered: overlayMetric.rendered,
          dock: dockMetric.box.toJSON(),
          overlay: overlayMetric.box.toJSON(),
          buttons,
          groups,
          states,
          stateOverlaps,
          noticeOverlaps,
          documentOverflowX: document.documentElement.scrollWidth - innerWidth,
          documentOverflowY: document.documentElement.scrollHeight - innerHeight,
          hudOverflowX: hud.scrollWidth - hud.clientWidth,
          hudOverflowY: hud.scrollHeight - hud.clientHeight,
        };
      } finally {
        for (const snapshot of snapshots) {
          snapshot.node.className = snapshot.className;
        }
        for (const fixture of fixtureNodes) fixture.remove();
      }
    });

    expect(geometry.viewportWidth).toBe(802);
    expect(geometry.viewportHeight).toBe(293);
    expect(geometry.dockRendered).toBe(true);
    expect(geometry.overlayRendered).toBe(true);
    expect(geometry.dock.left).toBeGreaterThanOrEqual(geometry.overlay.left - 1);
    expect(geometry.dock.right).toBeLessThanOrEqual(geometry.overlay.right + 1);
    expect(geometry.dock.top).toBeGreaterThanOrEqual(geometry.overlay.top - 1);
    expect(geometry.dock.bottom).toBeLessThanOrEqual(geometry.overlay.bottom + 1);
    expect(geometry.dock.height).toBeLessThanOrEqual(78);
    for (const button of geometry.buttons) {
      expect(button.rendered).toBe(true);
      expect(button.box.width).toBeGreaterThanOrEqual(44);
      expect(button.box.height).toBeGreaterThanOrEqual(44);
    }
    for (const group of geometry.groups) {
      expect(group.rendered).toBe(true);
      expect(group.titleRendered).toBe(true);
      expect(group.title.bottom).toBeLessThanOrEqual(group.buttons[0]!.top);
      expect(group.buttons[0]!.right).toBeLessThanOrEqual(group.buttons[1]!.left);
      expect(group.buttons[0]!.top).toBe(group.buttons[1]!.top);
    }
    expect(geometry.states.every((state) => state.rendered)).toBe(true);
    expect(geometry.stateOverlaps).toEqual([false, false, false, false]);
    expect(geometry.noticeOverlaps).toEqual([false, false, false]);
    for (const notice of geometry.states.slice(0, 3)) {
      expect(notice.box.top).toBeGreaterThanOrEqual(geometry.dock.bottom);
    }
    expect(geometry.documentOverflowX).toBeLessThanOrEqual(0);
    expect(geometry.documentOverflowY).toBeLessThanOrEqual(0);
    expect(geometry.hudOverflowX).toBeLessThanOrEqual(0);
    expect(geometry.hudOverflowY).toBeLessThanOrEqual(0);
    await expect(firstSalvo).toHaveJSProperty('childElementCount', firstSalvoChildCount);
    await expect(firstSalvo.locator('.st-hud__first-salvo-progress')).toHaveCount(1);
    await expect(firstSalvo.locator('.st-hud__first-salvo-copy')).toHaveCount(1);
    await expect(firstSalvo.locator('.st-hud__first-salvo-status')).toHaveCount(1);
    await expect(firstSalvo.locator('.st-hud__first-salvo-skip')).toHaveCount(1);
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
    await page.getByRole('button', { name: /Store/ }).click();

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

  test('Store catalog preserves 44px buy targets at the non-compact coarse scale', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the coarse-pointer project');
    await page.setViewportSize({ width: 1172, height: 600 });
    await expect.poll(() => isCompact(page)).toBe(false);
    await page.getByRole('button', { name: /Store/ }).click();

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
    expect(roundShopMinimums).toHaveLength(17);
    expect(roundShopMinimums.every((minimum) => minimum === '44px')).toBe(true);

    await page.getByRole('button', { name: /Store/ }).click();
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
    await page.getByRole('button', { name: /Store/ }).click();

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
    if (testInfo.project.name === 'desktop-fine') {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    const console = page.getByRole('region', { name: 'Turn command console' });
    const activeRow = console.locator('.st-hud__active-row');
    const player = activeRow.locator('.st-hud__turn-owner');
    const weapon = activeRow.locator('.st-hud__weapon-value');
    const portrait = activeRow.getByRole('img', { name: /Mobility:/ });
    const meter = activeRow.getByRole('progressbar', { name: 'Movement fuel' });
    const store = console.getByRole('button', { name: /Store/ });
    const fire = console.getByRole('button', { name: /Fire/ });

    await expect(console).toBeVisible();
    await expect(activeRow).toBeVisible();
    await expect(player).toHaveText('P1');
    await expect(weapon).toHaveText('Baby Missile');
    await expect(portrait).toHaveCount(1);
    await expect(portrait).toHaveAttribute(
      'aria-label',
      "P1's tank. Mobility: Tracks. Hull: Armor Hull. Turret: Cupola. Barrel: Cannon.",
    );
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
    await page.locator('.st-hud__weapon-btn[data-weapon="sandhog"]').click();
    await page.getByRole('button', { name: 'Collapse arsenal' }).click();
    await expect(weapon).toHaveText('Sandhog');
    await expect(activeRow.locator('.st-hud__weapon-icon .st-weapon-icon'))
      .toHaveAttribute('data-weapon', 'sandhog');
    await expect(fire).toHaveAttribute('aria-label', 'Fire Sandhog');
    await expect(activeRow.locator('.st-hud__turn-status')).toHaveAttribute(
      'aria-label',
      "P1's turn. Weapon Sandhog. 100 fuel remaining.",
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
        targetsContained: targetRects.every((target) =>
          target.left >= bounds.left - 1
          && target.right <= bounds.right + 1
          && target.top >= bounds.top - 1
          && target.bottom <= bounds.bottom + 1),
        targetMetrics: visibleTargets.map((target) => ({
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
    expect(authoredDialSize.width).toBeCloseTo(touch ? 58 : 34, 1);
    expect(authoredDialSize.height).toBeCloseTo(touch ? 58 : 34, 1);
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

    const activeRight = touch
      ? page.locator('.st-hud__touch-strip [data-command="move-right"]')
      : right;
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
