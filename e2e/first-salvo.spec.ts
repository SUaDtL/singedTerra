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
  await page.goto('?e2e=hotseat&tutorial=first-salvo');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.getByRole('dialog', { name: 'First salvo briefing' })).toBeVisible();
}

test.describe('First Salvo semantic console contract', () => {
  test('fits the briefing and enters battle without firing', async ({ page }) => {
    await gotoFirstSalvo(page);
    const briefing = page.getByRole('dialog', { name: 'First salvo briefing' });
    await expect(briefing.getByRole('heading', { name: 'Field briefing' })).toBeVisible();
    await expect(briefing).toContainText('Adjust angle and power');
    await expect(briefing).toContainText('Wind changes each turn');
    await expect(briefing).toContainText('Fire commits your shot');
    const fit = await briefing.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight, scroll: node.scrollWidth, client: node.clientWidth };
    });
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.top).toBeGreaterThanOrEqual(0);
    expect(fit.right).toBeLessThanOrEqual(fit.width);
    expect(fit.bottom).toBeLessThanOrEqual(fit.height);
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
    const before = await readAimProbe(page);
    await briefing.getByRole('button', { name: 'Enter battle' }).click();
    await expect(briefing).toHaveCount(0);
    expect(await readAimProbe(page)).toEqual(before);
    await expect(page.getByRole('button', { name: 'Fire Baby Missile', exact: true })).toBeEnabled();
  });

  test('moves focus into briefing after the real splash fades away', async ({ page }) => {
    await page.goto('?e2e=hotseat&tutorial=first-salvo');
    const splash = page.locator('#st-splash');
    await expect(splash).toBeVisible();
    await splash.click();
    await expect(splash).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enter battle', exact: true })).toBeFocused();
  });

  test('keeps keyboard focus inside the briefing', async ({ page }) => {
    await gotoFirstSalvo(page);
    const enter = page.getByRole('button', { name: 'Enter battle', exact: true });
    const skip = page.getByRole('button', { name: 'Skip', exact: true });
    await expect(enter).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(enter).toBeFocused();
  });

  test('blocks combat keys behind briefing and permits native Space entry', async ({ page }) => {
    await gotoFirstSalvo(page);
    const before = await readAimProbe(page);
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    for (const key of ['Space', 'ArrowLeft', 'ArrowUp', 'a', 'd', 'q']) await page.keyboard.press(key);
    expect(await readAimProbe(page)).toEqual(before);
    const enter = page.getByRole('button', { name: 'Enter battle', exact: true });
    await enter.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog', { name: 'First salvo briefing' })).toHaveCount(0);
    expect(await readAimProbe(page)).toEqual(before);
  });

  test('Skip dismisses briefing without dispatching combat actions', async ({ page }) => {
    await gotoFirstSalvo(page);
    const before = await readAimProbe(page);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'First salvo briefing' })).toHaveCount(0);
    expect(await readAimProbe(page)).toEqual(before);
    await expect(page.getByRole('button', { name: 'Fire Baby Missile', exact: true })).toBeEnabled();
  });

  test('a primary battlefield contact aims without firing after entry', async ({ page }, testInfo) => {
    await gotoFirstSalvo(page);
    await page.getByRole('button', { name: 'Enter battle', exact: true }).click();
    const canvas = page.locator('#game');
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    const before = await readAimProbe(page);
    const x = bounds!.x + bounds!.width * 0.55;
    const y = bounds!.y + bounds!.height * 0.36;
    if (testInfo.project.name === 'pixel-touch') {
      await canvas.evaluate((element) => {
        element.addEventListener('pointerdown', (event) => {
          element.dataset.lastPointerType = event.pointerType;
          event.preventDefault(); // Require the native touch path, not compatibility mouse events.
        }, { capture: true, once: true });
      });
      // Resolve the canvas origin at dispatch after its post-briefing layout
      // settles, while still sending a native touch contact.
      await canvas.tap({ position: { x: bounds!.width * 0.55, y: bounds!.height * 0.36 } });
      await expect(canvas).toHaveAttribute('data-last-pointer-type', 'touch');
    } else await page.mouse.click(x, y);
    await expect.poll(() => readAimProbe(page)).toMatchObject({
      phase: 'PLAYER_TURN', turn: before.turn, activePlayerId: before.activePlayerId, projectileCount: 0,
      forwardedActions: { setAngle: before.forwardedActions.setAngle + 1,
        setPower: before.forwardedActions.setPower + 1, fire: before.forwardedActions.fire },
    });
  });

  test('tracks a native touch drag with canvas-scoped gesture ownership', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'requires the coarse-pointer project');
    await gotoFirstSalvo(page);
    await page.getByRole('button', { name: 'Enter battle', exact: true }).click();

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

});
