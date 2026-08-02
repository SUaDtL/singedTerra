import { expect, test } from '@playwright/test';
import { gotoRunningGame } from './support';

const EXPLOSION_ART_PATH = 'art/explosion-sheet.webp';
const SOURCE_SIZE = 768;
const CELL_SIZE = 256;
const FRAME_COUNT = 9;

test.describe('authored explosion sheet', () => {
  test('ships a compact transparent 3x3 atlas with nine occupied cells', async ({ page }) => {
    await page.goto('?e2e=hotseat');

    const response = await page.request.get(EXPLOSION_ART_PATH);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');
    expect((await response.body()).byteLength).toBeLessThan(250_000);

    const contract = await page.evaluate(async ({ path, size, cell, frames }) => {
      const image = new Image();
      image.src = new URL(path, document.baseURI).href;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx === null) throw new Error('2D canvas unavailable');
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const alphaAt = (x: number, y: number) => (
        pixels[(y * canvas.width + x) * 4 + 3] ?? 255
      );
      const coverage = Array.from({ length: frames }, (_, frame) => {
        const left = (frame % 3) * cell;
        const top = Math.floor(frame / 3) * cell;
        let occupied = 0;
        let opaque = 0;
        let outsideReach = 0;
        for (let y = top; y < top + cell; y++) {
          for (let x = left; x < left + cell; x++) {
            const alpha = alphaAt(x, y);
            if (alpha > 0) occupied++;
            if (alpha === 255) opaque++;
            const dx = x - left + 0.5 - cell / 2;
            const dy = y - top + 0.5 - cell / 2;
            if (alpha > 0 && Math.hypot(dx, dy) > cell / 2) outsideReach++;
          }
        }
        return { occupied, opaque, outsideReach };
      });

      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        corners: [
          alphaAt(0, 0),
          alphaAt(size - 1, 0),
          alphaAt(0, size - 1),
          alphaAt(size - 1, size - 1),
        ],
        coverage,
      };
    }, {
      path: EXPLOSION_ART_PATH,
      size: SOURCE_SIZE,
      cell: CELL_SIZE,
      frames: FRAME_COUNT,
    });

    expect(contract).toMatchObject({
      width: SOURCE_SIZE,
      height: SOURCE_SIZE,
      corners: [0, 0, 0, 0],
    });
    expect(contract.coverage).toHaveLength(FRAME_COUNT);
    for (const frame of contract.coverage) {
      expect(frame.occupied).toBeGreaterThan(2_000);
      expect(frame.occupied).toBeLessThan(CELL_SIZE * CELL_SIZE * 0.6);
      expect(frame.opaque).toBeGreaterThan(200);
      expect(frame.outsideReach).toBe(0);
    }
  });

  test('paints the authored atlas through the real conventional-blast route', async ({ page }) => {
    await page.addInitScript(({ asset }) => {
      const view = window as typeof window & {
        __singedTerraExplosionDraws?: number[][];
      };
      const draws = view.__singedTerraExplosionDraws = [];
      const context = CanvasRenderingContext2D.prototype;
      const original = context.drawImage;
      context.drawImage = (function (
        this: CanvasRenderingContext2D,
        image: CanvasImageSource,
        ...args: number[]
      ): void {
        if (
          this.canvas.id === 'game'
          && image instanceof HTMLImageElement
          && image.currentSrc.endsWith(asset)
        ) {
          draws.push(args);
        }
        Reflect.apply(original, this, [image, ...args]);
      }) as typeof original;
    }, { asset: EXPLOSION_ART_PATH });

    const assetResponse = page.waitForResponse((response) => (
      response.url().endsWith(`/${EXPLOSION_ART_PATH}`)
      && response.status() === 200
    ));
    await gotoRunningGame(page);
    await assetResponse;

    await page.locator('.st-hud__primary-action').click();
    await expect.poll(async () => page.evaluate(() => (
      (window as typeof window & { __singedTerraExplosionDraws?: number[][] })
        .__singedTerraExplosionDraws?.length ?? 0
    )), { timeout: 15_000 }).toBeGreaterThan(0);

    const firstDraw = await page.evaluate(() => (
      (window as typeof window & { __singedTerraExplosionDraws?: number[][] })
        .__singedTerraExplosionDraws?.[0] ?? []
    ));
    expect(firstDraw).toHaveLength(8);
    expect(firstDraw[0] % CELL_SIZE).toBe(0);
    expect(firstDraw[1] % CELL_SIZE).toBe(0);
    expect(firstDraw.slice(2, 4)).toEqual([CELL_SIZE, CELL_SIZE]);
    expect(firstDraw[6]).toBeGreaterThan(0);
    expect(firstDraw[7]).toBe(firstDraw[6]);
  });
});
