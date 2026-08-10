import { expect, test } from '@playwright/test';
import { openHotSeatCustomization } from './support';

async function openRoom(
  page: import('@playwright/test').Page,
  walls: 'open' | 'wrap' | 'concrete',
): Promise<void> {
  await page.goto('.');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await page.getByRole('button', { name: 'Local Battle', exact: true }).click();
  if (walls !== 'open') {
    await openHotSeatCustomization(page);
    await page.getByRole('button', { name: 'Advanced settings', exact: true }).click();
    await page.getByLabel('Side walls').selectOption(walls);
    await expect(page.getByLabel('Side walls')).toHaveValue(walls);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Deploy local battle' }).click();
  await expect(page.locator('#hud.st-hud')).toBeVisible();
}

async function countConcretePixels(
  page: import('@playwright/test').Page,
): Promise<{ left: number; right: number }> {
  return page.locator<HTMLCanvasElement>('#game').evaluate((canvas) => {
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const strip = 14;
    const countPixels = (data: Uint8ClampedArray): number => {
      let count = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        const red = data[offset]!;
        const green = data[offset + 1]!;
        const blue = data[offset + 2]!;
        const alpha = data[offset + 3]!;
        if (alpha > 180 && red > green + 5 && green > blue + 5 && red - blue > 20) {
          count++;
        }
      }
      return count;
    };
    return {
      left: countPixels(context.getImageData(0, 0, strip, canvas.height).data),
      right: countPixels(context.getImageData(canvas.width - strip, 0, strip, canvas.height).data),
    };
  });
}

async function countPortalPixels(
  page: import('@playwright/test').Page,
): Promise<{ left: number; right: number }> {
  return page.locator<HTMLCanvasElement>('#game').evaluate((canvas) => {
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const strip = 14;
    const countPixels = (data: Uint8ClampedArray): number => {
      let count = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        const red = data[offset]!;
        const green = data[offset + 1]!;
        const blue = data[offset + 2]!;
        const alpha = data[offset + 3]!;
        if (
          alpha > 180
          && red > 110
          && blue > 140
          && blue - green > 35
          && red - green > 20
        ) {
          count++;
        }
      }
      return count;
    };
    return {
      left: countPixels(
        context.getImageData(0, 0, strip, canvas.height).data,
      ),
      right: countPixels(
        context.getImageData(canvas.width - strip, 0, strip, canvas.height).data,
      ),
    };
  });
}

test.describe('wrap sidewalls', () => {
  test('ships a fitted hot-seat room with visibly paired portal rails', async ({
    page,
  }) => {
    await openRoom(page, 'open');
    const openEdgePixels = await countPortalPixels(page);

    await openRoom(page, 'wrap');

    const geometry = await page.evaluate(() => ({
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      canvasWidth: document.querySelector<HTMLCanvasElement>('#game')!.width,
    }));
    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.canvasWidth).toBeGreaterThan(0);
    await expect.poll(async () => (
      (await countPortalPixels(page)).left - openEdgePixels.left
    )).toBeGreaterThan(250);
    await expect.poll(async () => (
      (await countPortalPixels(page)).right - openEdgePixels.right
    )).toBeGreaterThan(250);
  });

  test('ships a concrete hot-seat room with amber terminating rails', async ({ page }) => {
    await openRoom(page, 'concrete');
    const rails = await countConcretePixels(page);
    const geometry = await page.evaluate(() => ({
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      canvasWidth: document.querySelector<HTMLCanvasElement>('#game')!.width,
    }));

    expect(rails.left).toBeGreaterThan(250);
    expect(rails.right).toBeGreaterThan(250);
    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.canvasWidth).toBeGreaterThan(0);
  });
});
