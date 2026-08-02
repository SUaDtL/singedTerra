import { expect, test } from '@playwright/test';
import { gotoRunningGame } from './support';

interface ImpactComposite {
  sourceWidth: number;
  sourceHeight: number;
  args: number[];
}

interface ImpactObserver {
  copies: ImpactComposite[];
  composites: ImpactComposite[];
}

test.describe('impact monitor', () => {
  test('magnifies a real hot-seat detonation through the exact screen-space viewport', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const view = window as typeof window & {
        __singedTerraImpactObserver?: ImpactObserver;
      };
      const observer = view.__singedTerraImpactObserver = {
        copies: [],
        composites: [],
      };
      const prototype = CanvasRenderingContext2D.prototype;
      const original = prototype.drawImage;
      prototype.drawImage = (function (
        this: CanvasRenderingContext2D,
        image: CanvasImageSource,
        ...args: number[]
      ): void {
        if (
          this.canvas instanceof HTMLCanvasElement
          && this.canvas.width === 220
          && this.canvas.height === 136
          && image instanceof HTMLCanvasElement
          && image.id === 'game'
        ) {
          observer.copies.push({
            sourceWidth: image.width,
            sourceHeight: image.height,
            args: [...args],
          });
        } else if (
          this.canvas.id === 'game'
          && image instanceof HTMLCanvasElement
          && image.width === 220
          && image.height === 136
        ) {
          observer.composites.push({
            sourceWidth: image.width,
            sourceHeight: image.height,
            args: [...args],
          });
        }
        Reflect.apply(original, this, [image, ...args]);
      }) as typeof original;
    });

    await gotoRunningGame(page);
    await page.locator('.st-hud__primary-action').click();

    await expect.poll(async () => page.evaluate(() => (
      (window as typeof window & {
        __singedTerraImpactObserver?: ImpactObserver;
      }).__singedTerraImpactObserver?.composites.length ?? 0
    )), { timeout: 15_000 }).toBeGreaterThan(0);

    const observed = await page.evaluate(() => (
      (window as typeof window & {
        __singedTerraImpactObserver?: ImpactObserver;
      }).__singedTerraImpactObserver ?? null
    ));
    expect(observed).not.toBeNull();
    const copy = observed!.copies[0]!;
    expect(copy.sourceWidth).toBe(1200);
    expect(copy.sourceHeight).toBe(600);
    expect(copy.args.slice(2, 4)).toEqual([144, 88]);
    expect(copy.args.slice(4)).toEqual([11, 7, 198, 121]);
    expect(copy.args[0]).toBeGreaterThanOrEqual(0);
    expect(copy.args[0]).toBeLessThanOrEqual(1056);
    expect(copy.args[1]).toBeGreaterThanOrEqual(0);
    expect(copy.args[1]).toBeLessThanOrEqual(512);
    expect(observed!.composites[0]).toEqual({
      sourceWidth: 220,
      sourceHeight: 136,
      args: [490, 18, 220, 136],
    });
  });
});
