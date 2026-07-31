import { test, expect, type Page } from '@playwright/test';
import { gotoRunningGame } from './support';

async function storeCanvasFrame(page: Page): Promise<void> {
  await page.locator('#game').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    (globalThis as typeof globalThis & { __aimGuideFrame?: Uint8ClampedArray })
      .__aimGuideFrame = frame.data.slice();
  });
}

async function changedCanvasPixels(page: Page): Promise<number> {
  return page.locator('#game').evaluate((canvas: HTMLCanvasElement) => {
    const previous = (
      globalThis as typeof globalThis & { __aimGuideFrame?: Uint8ClampedArray }
    ).__aimGuideFrame;
    if (!previous) return 0;

    const current = canvas.getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height)
      .data;
    let changed = 0;
    for (let offset = 0; offset < current.length; offset += 4) {
      if (
        current[offset] !== previous[offset]
        || current[offset + 1] !== previous[offset + 1]
        || current[offset + 2] !== previous[offset + 2]
        || current[offset + 3] !== previous[offset + 3]
      ) {
        changed++;
      }
    }
    return changed;
  });
}

async function expectGuideToggleChangesCanvas(page: Page): Promise<void> {
  await storeCanvasFrame(page);
  await page.keyboard.press('g');
  await expect.poll(() => changedCanvasPixels(page)).toBeGreaterThan(20);
}

interface ComposedGuideSeam {
  changedPixels: number;
  openingCrossError: number;
  fullCrossError: number;
  guideSpan: number;
  immediateBarrelSamples: number;
  totalBarrelSamples: number;
}

async function waitForTwoCanvasFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

/**
 * Compare guide-on pixels with the fully composed guide-off battlefield. The
 * guide delta locates the real rendered muzzle; sampling backwards from that
 * point must find the authored barrel centerline immediately and continuously.
 */
async function composedGuideSeam(
  page: Page,
  angle: number,
): Promise<ComposedGuideSeam> {
  await page.keyboard.press('g'); // guide off
  await waitForTwoCanvasFrames(page);
  await storeCanvasFrame(page);
  await page.keyboard.press('g'); // guide on
  await expect.poll(() => changedCanvasPixels(page)).toBeGreaterThan(20);

  return page.locator('#game').evaluate((canvas: HTMLCanvasElement, aimAngle) => {
    const baseline = (
      globalThis as typeof globalThis & { __aimGuideFrame?: Uint8ClampedArray }
    ).__aimGuideFrame!;
    const current = canvas.getContext('2d', { willReadFrequently: true })!
      .getImageData(0, 0, canvas.width, canvas.height)
      .data;
    const radians = aimAngle * Math.PI / 180;
    const aim = { x: Math.cos(radians), y: -Math.sin(radians) };
    const normal = { x: -aim.y, y: aim.x };
    const changed: Array<{ x: number; y: number; delta: number; along: number }> = [];

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4;
        const delta =
          Math.abs(current[offset]! - baseline[offset]!)
          + Math.abs(current[offset + 1]! - baseline[offset + 1]!)
          + Math.abs(current[offset + 2]! - baseline[offset + 2]!);
        if (delta > 6) {
          changed.push({
            x,
            y,
            delta,
            along: x * aim.x + y * aim.y,
          });
        }
      }
    }

    // Avoid argument-spread limits if an unrelated animation ever contaminates
    // the frame delta; the assertion below will still reject that noisy frame.
    let firstAlong = Infinity;
    for (const pixel of changed) firstAlong = Math.min(firstAlong, pixel.along);
    const opening = changed.filter((pixel) => pixel.along <= firstAlong + 13);
    const start = opening.filter((pixel) => pixel.along <= firstAlong + 3);
    const startWeight = start.reduce((sum, pixel) => sum + pixel.delta, 0);
    const muzzle = {
      x: start.reduce((sum, pixel) => sum + pixel.x * pixel.delta, 0) / startWeight,
      y: start.reduce((sum, pixel) => sum + pixel.y * pixel.delta, 0) / startWeight,
    };
    const crossErrors = opening
      .map((pixel) => Math.abs(
        (pixel.x - muzzle.x) * normal.x + (pixel.y - muzzle.y) * normal.y,
      ))
      .sort((left, right) => left - right);
    const openingCrossError = crossErrors[Math.floor(crossErrors.length / 2)] ?? Infinity;
    const rayPixels = changed.filter((pixel) => {
      const dx = pixel.x - muzzle.x;
      const dy = pixel.y - muzzle.y;
      const forward = dx * aim.x + dy * aim.y;
      const cross = dx * normal.x + dy * normal.y;
      return forward >= -3 && forward <= 180 && Math.abs(cross) <= 12;
    });
    const fullCrossErrors = rayPixels
      .map((pixel) => Math.abs(
        (pixel.x - muzzle.x) * normal.x + (pixel.y - muzzle.y) * normal.y,
      ))
      .sort((left, right) => left - right);
    const fullCrossError = fullCrossErrors[
      Math.floor(fullCrossErrors.length * 0.8)
    ] ?? Infinity;
    const guideSpan = rayPixels.reduce((furthest, pixel) => {
      const dx = pixel.x - muzzle.x;
      const dy = pixel.y - muzzle.y;
      return Math.max(furthest, dx * aim.x + dy * aim.y);
    }, 0);

    const colorAt = (x: number, y: number): [number, number, number] => {
      let red = 0;
      let green = 0;
      let blue = 0;
      let samples = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x + ox)));
          const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y + oy)));
          const offset = (py * canvas.width + px) * 4;
          red += baseline[offset]!;
          green += baseline[offset + 1]!;
          blue += baseline[offset + 2]!;
          samples++;
        }
      }
      return [red / samples, green / samples, blue / samples];
    };
    const distance = (
      left: [number, number, number],
      right: [number, number, number],
    ): number => Math.hypot(
      left[0] - right[0],
      left[1] - right[1],
      left[2] - right[2],
    );
    const barrelContrast = Array.from({ length: 19 }, (_, distanceBehind) => {
      const x = muzzle.x - aim.x * distanceBehind;
      const y = muzzle.y - aim.y * distanceBehind;
      const center = colorAt(x, y);
      const sideA = colorAt(x + normal.x * 6, y + normal.y * 6);
      const sideB = colorAt(x - normal.x * 6, y - normal.y * 6);
      const surround: [number, number, number] = [
        (sideA[0] + sideB[0]) / 2,
        (sideA[1] + sideB[1]) / 2,
        (sideA[2] + sideB[2]) / 2,
      ];
      return distance(center, surround);
    });

    return {
      changedPixels: changed.length,
      openingCrossError,
      fullCrossError,
      guideSpan,
      immediateBarrelSamples: barrelContrast.slice(0, 5)
        .filter((contrast) => contrast > 18).length,
      totalBarrelSamples: barrelContrast
        .filter((contrast) => contrast > 18).length,
    };
  }, angle);
}

test.describe('bounded aim guide', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('singedterra:aimguide', '1');
    });
    await gotoRunningGame(page);
    // Let the bounded turn-opening wind flourish expire so guide-toggle deltas
    // are isolated from cosmetic animation.
    await page.waitForTimeout(1_000);
  });

  test('reacts to aim, never disappears after the opening rotation, and stays fitted', async ({
    page,
  }) => {
    // G only controls the local launch hint. A visible delta proves the guide is
    // present without relying on an exact full-path color or impact marker.
    await expectGuideToggleChangesCanvas(page);
    await page.keyboard.press('g'); // restore enabled

    await storeCanvasFrame(page);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => changedCanvasPixels(page)).toBeGreaterThan(20);

    const action = page.locator('.st-hud__primary-action');
    for (let shot = 0; shot < 2; shot++) {
      await expect(action).toBeEnabled();
      await action.click();
      await expect(action).toBeDisabled();
      await expect(action).toBeEnabled({ timeout: 15_000 });
      if (shot === 0) {
        await expect(page.getByRole('img', { name: 'Elevation gauge' }))
          .toContainText('45° ◀');
      }
    }

    // Turn 2 is beyond the two-seat opening rotation. The same bounded hint must
    // still exist—there is no privileged collision-accurate opening solution.
    await expectGuideToggleChangesCanvas(page);

    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.height).toBeLessThanOrEqual(geometry.viewportHeight);
  });

  test('composites the guide directly from right- and left-facing authored barrels', async ({
    page,
  }) => {
    const right = await composedGuideSeam(page, 45);

    const action = page.locator('.st-hud__primary-action');
    await action.click();
    await expect(action).toBeDisabled();
    await expect(action).toBeEnabled({ timeout: 15_000 });
    // The new turn has the same bounded wind/turn-handoff flourishes as initial
    // load. Let them expire before isolating a guide-only frame delta.
    await page.waitForTimeout(1_000);
    const left = await composedGuideSeam(page, 135);

    for (const [direction, seam] of Object.entries({ right, left })) {
      expect(
        seam.changedPixels,
        `${direction} guide must paint a causal composed-canvas delta`,
      ).toBeGreaterThan(20);
      expect(
        seam.openingCrossError,
        `${direction} guide opening must stay on the rendered barrel centerline`,
      ).toBeLessThan(2.5);
      expect(
        seam.fullCrossError,
        `${direction} complete guide must remain one straight muzzle ray`,
      ).toBeLessThan(4);
      expect(
        seam.guideSpan,
        `${direction} straight guide must retain its bounded readable reach`,
      ).toBeGreaterThan(70);
      expect(
        seam.immediateBarrelSamples,
        `${direction} guide start must touch the authored barrel at the muzzle`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        seam.totalBarrelSamples,
        `${direction} guide must extend the authored barrel rather than a parallel seam`,
      ).toBeGreaterThanOrEqual(12);
    }
  });
});
