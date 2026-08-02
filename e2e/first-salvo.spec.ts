import { expect, test } from '@playwright/test';

async function gotoFirstSalvo(page: import('@playwright/test').Page): Promise<void> {
  // Keep this relative: it works against both the root preview and the GitHub
  // Pages project-site path, and the opt-in flag does not clear any storage.
  await page.goto('?e2e=hotseat&tutorial=first-salvo');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('#hud.st-hud')).toBeVisible();
  await expect(page.locator('[data-ui="first-salvo-coach"]')).toBeVisible();
}

async function expectCoachFitsStage(page: import('@playwright/test').Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const stage = document.getElementById('stage')?.getBoundingClientRect();
    const card = document.querySelector<HTMLElement>('[data-ui="first-salvo-coach"]')?.getBoundingClientRect();
    return {
      stage: stage?.toJSON(),
      card: card?.toJSON(),
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry.stage, 'fixed game stage should be rendered').toBeTruthy();
  expect(geometry.card, 'First Salvo card should be rendered').toBeTruthy();
  expect(geometry.card!.left).toBeGreaterThanOrEqual(geometry.stage!.left);
  expect(geometry.card!.right).toBeLessThanOrEqual(geometry.stage!.right);
  expect(geometry.card!.top).toBeGreaterThanOrEqual(geometry.stage!.top);
  expect(geometry.card!.bottom).toBeLessThanOrEqual(geometry.stage!.bottom);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewportHeight);
}

test.describe('First Salvo browser contract', () => {
  test('fits the fixed stage and advances through real local controls', async ({ page }, testInfo) => {
    await gotoFirstSalvo(page);

    const card = page.locator('[data-ui="first-salvo-coach"]');
    const fire = page.locator('.st-hud__primary-action');
    await expect(card).toContainText('1 / 3');
    await expect(fire).toBeVisible();
    await expect(fire).toBeEnabled();
    await expectCoachFitsStage(page);

    if (testInfo.project.name === 'pixel-touch') {
      const touchAim = page.locator('.st-hud__touch-strip [data-first-salvo-target="aim"]');
      const touchPower = page.locator('.st-hud__touch-strip [data-first-salvo-target="power-and-wind"]');
      await expect(touchAim).toHaveCount(2);
      await expect(touchPower).toHaveCount(2);
      await expect.poll(() => touchAim.evaluateAll((targets) => targets.every((target) =>
        target.classList.contains('st-hud__first-salvo-target--active'),
      ))).toBe(true);
      await expect.poll(() => touchPower.evaluateAll((targets) => targets.every((target) =>
        !target.classList.contains('st-hud__first-salvo-target--active'),
      ))).toBe(true);

      await touchAim.first().click();
      await expect(card).toContainText('2 / 3');
      await expect.poll(() => touchAim.evaluateAll((targets) => targets.every((target) =>
        !target.classList.contains('st-hud__first-salvo-target--active'),
      ))).toBe(true);
      await expect.poll(() => touchPower.evaluateAll((targets) => targets.every((target) =>
        target.classList.contains('st-hud__first-salvo-target--active'),
      ))).toBe(true);

      await touchPower.last().click();
      await expect.poll(() => touchPower.evaluateAll((targets) => targets.every((target) =>
        !target.classList.contains('st-hud__first-salvo-target--active'),
      ))).toBe(true);
    } else {
      await page.keyboard.press('ArrowLeft');
      await expect(card).toContainText('2 / 3');
      await page.keyboard.press('ArrowUp');
    }

    await expect(card).toContainText('3 / 3');
    await expect(fire).toBeVisible();
    await expect(fire).toBeEnabled();
    await expectCoachFitsStage(page);

    await fire.click();
    await expect(card).toBeHidden();
  });

  test('lets a fine-pointer canvas drag begin through the coach background', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'pixel-touch', 'Fine-pointer pass-through regression');
    await gotoFirstSalvo(page);

    const card = page.locator('[data-ui="first-salvo-coach"]');
    const cardBox = await card.boundingBox();
    const canvasBox = await page.locator('#game').boundingBox();
    expect(cardBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    const start = {
      x: cardBox!.x + 10,
      y: cardBox!.y + cardBox!.height - 10,
    };
    expect(start.x).toBeGreaterThan(canvasBox!.x);
    expect(start.x).toBeLessThan(canvasBox!.x + canvasBox!.width);
    expect(start.y).toBeGreaterThan(canvasBox!.y);
    expect(start.y).toBeLessThan(canvasBox!.y + canvasBox!.height);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 80, start.y - 80, { steps: 3 });
    await page.mouse.up();

    await expect(card).not.toContainText('1 / 3');
  });

  test('uses a static target outline for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoFirstSalvo(page);

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
