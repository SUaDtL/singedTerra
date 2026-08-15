import { expect, test } from '@playwright/test';

interface AimProbe {
  phase: string;
  turn: number;
  activePlayerId: string;
  projectileCount: number;
  forwardedActions: { setAngle: number; setPower: number; fire: number };
}

async function readAimProbe(page: import('@playwright/test').Page): Promise<AimProbe> {
  return page.evaluate(() => (
    window as typeof window & { __SINGED_TERRA_E2E__: AimProbe }
  ).__SINGED_TERRA_E2E__);
}

async function gotoFirstSalvo(page: import('@playwright/test').Page): Promise<void> {
  // Keep this relative: it works against both the root preview and the GitHub
  // Pages project-site path, and the opt-in flag does not clear any storage.
  await page.goto('?e2e=hotseat&tutorial=first-salvo');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('#hud.st-hud')).toBeVisible();
  await expect(page.locator('[data-ui="first-salvo-briefing"]')).toBeVisible();
  await expect(page.locator('[data-ui="first-salvo-coach"]')).toBeHidden();
}

async function enterFirstSalvoBriefing(
  page: import('@playwright/test').Page,
  activation: 'keyboard' | 'pointer' = 'keyboard',
): Promise<void> {
  const briefing = page.locator('[data-ui="first-salvo-briefing"]');
  const enter = page.getByRole('button', { name: 'Enter battle', exact: true });
  await expect(briefing).toContainText('Aim');
  await expect(briefing).toContainText('Wind');
  await expect(briefing).toContainText('Commit');
  await expect(briefing.getByRole('button')).toHaveCount(1);
  await expect(enter).toBeFocused();
  if (activation === 'pointer') await enter.click();
  else await page.keyboard.press('Enter');
  await expect(briefing).toBeHidden();
  await expect(page.locator('[data-ui="first-salvo-coach"]')).toBeVisible();
}

async function expectCoachFitsRail(page: import('@playwright/test').Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const stage = document.getElementById('stage')?.getBoundingClientRect();
    const cardElement = document.querySelector<HTMLElement>('[data-ui="first-salvo-coach"]');
    const card = cardElement?.getBoundingClientRect();
    const rail = document.getElementById('battle-rail')?.getBoundingClientRect();
    const skip = document.querySelector<HTMLElement>('.st-hud__first-salvo-skip')?.getBoundingClientRect();
    return {
      stage: stage?.toJSON(),
      card: card?.toJSON(),
      cardLayoutHeight: cardElement?.offsetHeight,
      rail: rail?.toJSON(),
      skip: skip?.toJSON(),
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
    };
  });

  expect(geometry.stage, 'fixed game stage should be rendered').toBeTruthy();
  expect(geometry.card, 'First Salvo card should be rendered').toBeTruthy();
  expect(geometry.rail, 'protected rail should be rendered').toBeTruthy();
  expect(geometry.skip, 'First Salvo Skip target should be rendered').toBeTruthy();
  expect(geometry.card!.left).toBeGreaterThanOrEqual(geometry.stage!.left);
  expect(geometry.card!.right).toBeLessThanOrEqual(geometry.stage!.right);
  expect(geometry.card!.top).toBeGreaterThanOrEqual(geometry.stage!.top);
  expect(geometry.card!.bottom).toBeLessThanOrEqual(geometry.stage!.bottom);
  expect(geometry.card!.top).toBeGreaterThanOrEqual(geometry.rail!.top);
  expect(geometry.card!.bottom).toBeLessThanOrEqual(geometry.rail!.bottom);
  // The fixed arena is CSS-zoomed to fit smaller viewports. offsetHeight keeps
  // this contract in the ribbon's logical CSS pixels rather than screen pixels.
  expect(geometry.cardLayoutHeight).toBeGreaterThanOrEqual(32);
  expect(geometry.cardLayoutHeight).toBeLessThanOrEqual(geometry.coarsePointer ? 91 : 44);
  expect(geometry.skip!.left).toBeGreaterThanOrEqual(geometry.card!.left);
  expect(geometry.skip!.right).toBeLessThanOrEqual(geometry.card!.right);
  expect(geometry.skip!.top).toBeGreaterThanOrEqual(geometry.card!.top);
  expect(geometry.skip!.bottom).toBeLessThanOrEqual(geometry.card!.bottom);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewportHeight);
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeEnabled();
}

async function expectCoachAnchorsRailZone(
  page: import('@playwright/test').Page,
  anchor: 'solution' | 'commitment',
): Promise<void> {
  const geometry = await page.evaluate((expectedAnchor) => {
    const coach = document.querySelector<HTMLElement>('[data-ui="first-salvo-coach"]')!;
    const zone = document.querySelector<HTMLElement>(
      `#battle-rail .st-hud__console-${expectedAnchor}`,
    )!;
    const coachRect = coach.getBoundingClientRect();
    const zoneRect = zone.getBoundingClientRect();
    const railRect = document.getElementById('battle-rail')!.getBoundingClientRect();
    return { coachRect: coachRect.toJSON(), zoneRect: zoneRect.toJSON(), railRect: railRect.toJSON(), anchor: coach.dataset['coachAnchor'] };
  }, anchor);
  expect(geometry.anchor).toBe(anchor);
  expect(geometry.coachRect.top).toBeGreaterThanOrEqual(geometry.railRect.top);
  expect(geometry.coachRect.bottom).toBeLessThanOrEqual(geometry.railRect.bottom);
  expect(geometry.coachRect.left).toBeGreaterThanOrEqual(geometry.zoneRect.left);
  expect(geometry.coachRect.right).toBeLessThanOrEqual(geometry.zoneRect.right);
  expect(geometry.coachRect.top).toBeGreaterThanOrEqual(geometry.zoneRect.top);
  expect(geometry.coachRect.bottom).toBeLessThanOrEqual(geometry.zoneRect.bottom);
}

test.describe('First Salvo browser contract', () => {
  test('blocks combat keys behind the briefing while preserving native Space entry', async ({ page }) => {
    await gotoFirstSalvo(page);
    const briefing = page.locator('[data-ui="first-salvo-briefing"]');
    const enter = page.getByRole('button', { name: 'Enter battle', exact: true });
    const before = await readAimProbe(page);
    await page.evaluate(() => {
      document.body.tabIndex = -1;
      document.body.focus();
    });

    for (const key of ['Space', 'ArrowLeft', 'ArrowUp', 'a', 'd', 'q']) {
      await page.keyboard.press(key);
    }

    expect(await readAimProbe(page)).toEqual(before);
    await expect(briefing).toBeVisible();
    await enter.focus();
    await page.keyboard.press('Space');
    await expect(briefing).toBeHidden();
    expect(await readAimProbe(page)).toEqual(before);

    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => readAimProbe(page)).toMatchObject({
      phase: 'PLAYER_TURN',
      forwardedActions: {
        setAngle: before.forwardedActions.setAngle + 1,
        setPower: before.forwardedActions.setPower,
        fire: before.forwardedActions.fire,
      },
    });
  });

  test('fits the fixed stage and advances through real local controls', async ({ page }, testInfo) => {
    await gotoFirstSalvo(page);
    await enterFirstSalvoBriefing(
      page,
      testInfo.project.name === 'pixel-touch' ? 'pointer' : 'keyboard',
    );

    const card = page.locator('[data-ui="first-salvo-coach"]');
    const fire = page.locator('.st-hud__primary-action');
    await expect(card).toContainText('1 / 3');
    await expect(fire).toBeVisible();
    await expect(fire).toBeEnabled();
    await expectCoachFitsRail(page);
    await expectCoachAnchorsRailZone(page, 'solution');

    if (testInfo.project.name === 'pixel-touch') {
      const skipBox = await page.getByRole('button', { name: 'Skip', exact: true }).boundingBox();
      const skipLayoutHeight = await page.getByRole('button', { name: 'Skip', exact: true })
        .evaluate((button: HTMLButtonElement) => button.offsetHeight);
      expect(skipBox).not.toBeNull();
      expect(skipBox!.width).toBeGreaterThanOrEqual(44);
      expect(skipLayoutHeight).toBeGreaterThanOrEqual(44);
    }

    if (testInfo.project.name === 'pixel-touch') {
      const aimTargets = page.locator('#battle-rail [data-first-salvo-target="aim"]');
      const powerTargets = page.locator('#battle-rail [data-first-salvo-target="power-and-wind"]');
      const touchAim = page.locator('#battle-rail button[data-first-salvo-target="aim"]');
      const touchPower = page.locator('#battle-rail button[data-first-salvo-target="power-and-wind"]');
      await expect(touchAim).toHaveCount(2);
      await expect(touchPower).toHaveCount(2);
      await expect.poll(() => aimTargets.evaluateAll((targets) => targets.every((target) =>
        target.classList.contains('st-hud__first-salvo-target--active'),
      ))).toBe(true);
      await expect.poll(() => powerTargets.evaluateAll((targets) => targets.every((target) =>
        !target.classList.contains('st-hud__first-salvo-target--active'),
      ))).toBe(true);

      await touchAim.first().click();
      await expect(card).toContainText('2 / 3');
      await expect.poll(() => aimTargets.evaluateAll((targets) => targets.every((target) =>
        !target.classList.contains('st-hud__first-salvo-target--active'),
      ))).toBe(true);
      await expect.poll(() => powerTargets.evaluateAll((targets) => targets.every((target) =>
        target.classList.contains('st-hud__first-salvo-target--active'),
      ))).toBe(true);

      await touchPower.last().click();
      await expect.poll(() => powerTargets.evaluateAll((targets) => targets.every((target) =>
        !target.classList.contains('st-hud__first-salvo-target--active'),
      ))).toBe(true);
    } else {
      await page.keyboard.press('ArrowLeft');
      await expect(card).toContainText('2 / 3');
      await page.keyboard.press('ArrowUp');
    }

    await expect(card).toContainText('3 / 3');
    await expectCoachAnchorsRailZone(page, 'commitment');
    await expect(fire).toBeVisible();
    await expect(fire).toBeEnabled();
    await expectCoachFitsRail(page);

    await fire.click();
    await expect(card).toBeHidden();
  });

  test('lets Pixel Skip dismiss the anchored coach once without stealing Fire reachability', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'Coarse-pointer Skip activation regression');
    await gotoFirstSalvo(page);
    await enterFirstSalvoBriefing(page, 'pointer');

    const card = page.locator('[data-ui="first-salvo-coach"]');
    const skip = page.getByRole('button', { name: 'Skip', exact: true });
    const skipHandle = await skip.elementHandle();
    const fire = page.locator('#battle-rail .st-hud__primary-action');
    expect(skipHandle).not.toBeNull();
    await expect(skip).toBeEnabled();
    await skip.click();
    await expect(card).toBeHidden();
    await expect(fire).toBeVisible();
    await expect(fire).toBeEnabled();

    // A stale handle must not reopen coaching or consume a second command.
    await skipHandle!.evaluate((button: HTMLButtonElement) => button.click());
    await expect(card).toBeHidden();
    await expect(fire).toBeEnabled();
  });

  test('keeps the inline coach clear while a fine-pointer canvas drag still aims', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'pixel-touch', 'Fine-pointer pass-through regression');
    await gotoFirstSalvo(page);
    await enterFirstSalvoBriefing(page);

    const card = page.locator('[data-ui="first-salvo-coach"]');
    const cardBox = await card.boundingBox();
    const canvasBox = await page.locator('#game').boundingBox();
    const railBox = await page.locator('#battle-rail').boundingBox();
    expect(cardBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    expect(railBox).not.toBeNull();
    const start = {
      x: canvasBox!.x + canvasBox!.width * 0.55,
      y: canvasBox!.y + (railBox!.y - canvasBox!.y) * 0.65,
    };
    expect(start.x).toBeGreaterThan(canvasBox!.x);
    expect(start.x).toBeLessThan(canvasBox!.x + canvasBox!.width);
    expect(start.y).toBeGreaterThan(canvasBox!.y);
    expect(start.y).toBeLessThan(canvasBox!.y + canvasBox!.height);
    expect(start.y).toBeLessThan(railBox!.y);
    expect(start.x < cardBox!.x || start.x > cardBox!.x + cardBox!.width
      || start.y < cardBox!.y || start.y > cardBox!.y + cardBox!.height).toBe(true);

    const before = await readAimProbe(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.up();

    await expect(card).not.toContainText('1 / 3');
    await expect.poll(() => readAimProbe(page)).toMatchObject({
      phase: 'PLAYER_TURN',
      turn: before.turn,
      activePlayerId: before.activePlayerId,
      projectileCount: 0,
      forwardedActions: {
        setAngle: before.forwardedActions.setAngle + 1,
        setPower: before.forwardedActions.setPower + 1,
        fire: before.forwardedActions.fire,
      },
    });
  });

  test('lets one primary touchscreen contact set aim without firing', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the coarse-pointer project');
    await gotoFirstSalvo(page);
    await enterFirstSalvoBriefing(page, 'pointer');

    const card = page.locator('[data-ui="first-salvo-coach"]');
    const elevation = page.locator(
      '.st-hud__gauge-cell--elevation .st-hud__gauge-label',
    );
    const power = page.locator('.st-hud__gauge-cell--power .st-hud__gauge-label');
    const fire = page.locator('.st-hud__primary-action');
    const canvasBox = await page.locator('#game').boundingBox();
    expect(canvasBox).not.toBeNull();
    await expect(elevation).toHaveText('45° ▶');
    await expect(power).toHaveText('50');
    await expect(card).toContainText('1 / 3');
    await expect(fire).toBeEnabled();
    const before = await readAimProbe(page);

    const canvas = page.locator('#game');
    await canvas.evaluate((element) => {
      element.addEventListener('pointerdown', (event) => {
        element.dataset.lastPointerType = event.pointerType;
        element.dataset.lastPointerPrimary = String(event.isPrimary);
        // Suppress Chromium's compatibility mouse event. The application must
        // respond to this native touch Pointer Event for the assertions to pass.
        event.preventDefault();
      }, { capture: true, once: true });
    });
    await page.touchscreen.tap(
      canvasBox!.x + canvasBox!.width * 0.55,
      canvasBox!.y + canvasBox!.height * 0.36,
    );

    await expect(canvas).toHaveAttribute('data-last-pointer-type', 'touch');
    await expect(canvas).toHaveAttribute('data-last-pointer-primary', 'true');
    await expect(elevation).not.toHaveText('45° ▶');
    await expect(power).not.toHaveText('50');
    await expect(card).not.toContainText('1 / 3');
    await expect(fire).toBeEnabled();
    await expect.poll(() => readAimProbe(page)).toMatchObject({
      phase: 'PLAYER_TURN',
      turn: before.turn,
      activePlayerId: before.activePlayerId,
      projectileCount: 0,
      forwardedActions: {
        setAngle: before.forwardedActions.setAngle + 1,
        setPower: before.forwardedActions.setPower + 1,
        fire: before.forwardedActions.fire,
      },
    });
  });

  test('tracks a native touch drag with canvas-scoped gesture ownership', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the coarse-pointer project');
    await gotoFirstSalvo(page);
    await enterFirstSalvoBriefing(page, 'pointer');

    const canvas = page.locator('#game');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const touchActions = await page.evaluate(() => ({
      canvas: getComputedStyle(document.getElementById('game')!).touchAction,
      hudShell: getComputedStyle(document.getElementById('hud')!).touchAction,
    }));
    expect(touchActions.canvas).toBe('none');
    expect(touchActions.hudShell).not.toBe('none');

    await canvas.evaluate((element) => {
      element.dataset.touchMoves = '0';
      element.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'touch') {
          element.dataset.touchMoves = String(Number(element.dataset.touchMoves) + 1);
        }
      });
    });
    const before = await readAimProbe(page);
    const start = {
      x: canvasBox!.x + canvasBox!.width * 0.55,
      y: canvasBox!.y + canvasBox!.height * 0.36,
    };
    const end = {
      x: canvasBox!.x + canvasBox!.width * 0.62,
      y: canvasBox!.y + canvasBox!.height * 0.28,
    };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...start, id: 51, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...end, id: 51, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(canvas).not.toHaveAttribute('data-touch-moves', '0');
    const after = await readAimProbe(page);
    expect(after).toMatchObject({
      phase: 'PLAYER_TURN',
      turn: before.turn,
      activePlayerId: before.activePlayerId,
      projectileCount: 0,
    });
    expect(after.forwardedActions.fire).toBe(before.forwardedActions.fire);
    expect(after.forwardedActions.setAngle).toBeGreaterThan(before.forwardedActions.setAngle);
    expect(after.forwardedActions.setPower).toBeGreaterThan(before.forwardedActions.setPower);
  });

  test('uses a static target outline for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoFirstSalvo(page);
    await enterFirstSalvoBriefing(page);

    await expect.poll(() => page.evaluate(() =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )).toBe(true);
    const elevationTarget = page.locator('.st-hud__gauge-cell--elevation[data-first-salvo-target="aim"]');
    await expect(elevationTarget).toHaveClass(
      /st-hud__first-salvo-target--active/,
    );
    await expect(elevationTarget).toHaveCSS('animation-name', 'none');
  });
});
