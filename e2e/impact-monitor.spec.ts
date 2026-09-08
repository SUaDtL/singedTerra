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
  labels: string[];
}

test.describe('impact monitor', () => {
  test('magnifies a real hot-seat detonation through the exact screen-space viewport', async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      const view = window as typeof window & {
        __singedTerraImpactObserver?: ImpactObserver;
      };
      const observer = view.__singedTerraImpactObserver = {
        copies: [],
        composites: [],
        labels: [],
      };
      const impactCanvases = new WeakSet<HTMLCanvasElement>();
      const prototype = CanvasRenderingContext2D.prototype;
      const original = prototype.drawImage;
      prototype.drawImage = (function (
        this: CanvasRenderingContext2D,
        image: CanvasImageSource,
        ...args: number[]
      ): void {
        if (
          this.canvas instanceof HTMLCanvasElement
          && image instanceof HTMLCanvasElement
          && image.id === 'game'
        ) {
          impactCanvases.add(this.canvas);
          observer.copies.push({
            sourceWidth: image.width,
            sourceHeight: image.height,
            args: [...args],
          });
        } else if (
          this.canvas.id === 'game'
          && image instanceof HTMLCanvasElement
          && impactCanvases.has(image)
        ) {
          observer.composites.push({
            sourceWidth: image.width,
            sourceHeight: image.height,
            args: [...args],
          });
        }
        Reflect.apply(original, this, [image, ...args]);
      }) as typeof original;
      const originalFillText = prototype.fillText;
      prototype.fillText = (function (
        this: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth?: number,
      ): void {
        if (impactCanvases.has(this.canvas)) observer.labels.push(text);
        if (maxWidth === undefined) {
          Reflect.apply(originalFillText, this, [text, x, y]);
        } else {
          Reflect.apply(originalFillText, this, [text, x, y, maxWidth]);
        }
      }) as typeof originalFillText;
    });

    await gotoRunningGame(page);
    await page.locator('button[data-battle-console-action="fire"]').click();

    await expect.poll(async () => page.evaluate(() => (
      (window as typeof window & {
        __singedTerraImpactObserver?: ImpactObserver;
      }).__singedTerraImpactObserver?.composites.length ?? 0
    )), { timeout: 15_000 }).toBeGreaterThan(0);

    const observed = await page.evaluate(() => {
      const view = window as typeof window & {
        __singedTerraImpactObserver?: ImpactObserver;
      };
      const monitor = view.__singedTerraImpactObserver ?? null;
      const game = document.querySelector<HTMLCanvasElement>('#game');
      const composite = monitor?.composites[0];
      if (!monitor || !game || !composite) return null;
      const screen = game.getBoundingClientRect();
      return {
        monitor,
        physicalFrame: {
          width: composite.args[2]! * screen.width / game.width,
          height: composite.args[3]! * screen.height / game.height,
        },
      };
    });
    expect(observed).not.toBeNull();
    const copy = observed!.monitor.copies[0]!;
    expect(copy.sourceWidth).toBe(1200);
    expect(copy.sourceHeight).toBe(600);
    expect(copy.args[0]).toBeGreaterThanOrEqual(0);
    expect(copy.args[0]! + copy.args[2]!).toBeLessThanOrEqual(1200);
    expect(copy.args[1]).toBeGreaterThanOrEqual(0);
    const composite = observed!.monitor.composites[0]!;
    expect(observed!.monitor.labels).toContain('IMPACT MONITOR');
    expect(
      observed!.monitor.labels.some((label) => (
        label.includes(' PX LEFT OF ')
        || label.includes(' PX RIGHT OF ')
        || label.startsWith('ON LINE:')
        || label.startsWith('DIRECT HIT:')
      )),
    ).toBe(true);
    expect(
      observed!.monitor.labels.some((label) => (
        label === 'SHIFT IMPACT LEFT'
        || label === 'SHIFT IMPACT RIGHT'
        || label === 'HOLD COURSE'
      )),
    ).toBe(true);
    if (testInfo.project.name === 'desktop-fine') {
      expect(copy.args.slice(2, 4)).toEqual([144, 88]);
      expect(copy.args.slice(4)).toEqual([11, 7, 198, 121]);
      expect(composite).toEqual({
        sourceWidth: 220,
        sourceHeight: 136,
        args: [490, 18, 220, 136],
      });
    } else {
      expect(copy.args[2]).toBeGreaterThan(144);
      expect(copy.args[3]).toBeGreaterThan(88);
      expect(copy.args[6]).toBeGreaterThan(198);
      expect(copy.args[7]).toBeGreaterThan(121);
      expect(
        observed!.physicalFrame.width,
        'compact layouts preserve a readable impact monitor width',
      ).toBeGreaterThanOrEqual(180);
      expect(
        observed!.physicalFrame.height,
        'compact layouts preserve a readable impact monitor height',
      ).toBeGreaterThanOrEqual(110);
    }
  });
});
