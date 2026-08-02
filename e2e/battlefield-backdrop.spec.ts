import { test, expect, type Page } from '@playwright/test';
import { gotoRunningGame } from './support';

const BACKDROP_PATHS = [
  'art/battlefield-backdrop.webp',
  'art/battlefield-obsidian-caldera.webp',
  'art/battlefield-glassstorm-expanse.webp',
] as const;
const MAX_TRANSFER_BYTES = 500_000;

async function sampleSky(page: Page): Promise<number[]> {
  return page.locator<HTMLCanvasElement>('#game').evaluate((canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const samples: number[] = [];
    for (let y = 20; y < canvas.height * 0.58; y += 20) {
      for (let x = 20; x < canvas.width - 20; x += 20) {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        samples.push(pixel[0]!, pixel[1]!, pixel[2]!);
      }
    }
    return samples;
  });
}

function meanChannelDelta(left: number[], right: number[]): number {
  expect(right).toHaveLength(left.length);
  const total = left.reduce(
    (sum, channel, index) => sum + Math.abs(channel - right[index]!),
    0,
  );
  return total / left.length;
}

test.describe('authored battlefield backdrop asset', () => {
  test('catalog assets are bounded opaque 2:1 WebPs that the browser can decode', async ({
    page,
    request,
  }) => {
    await page.goto('.');
    for (const path of BACKDROP_PATHS) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()['content-type'], path).toContain('image/webp');
      expect((await response.body()).byteLength, path)
        .toBeLessThanOrEqual(MAX_TRANSFER_BYTES);

      const decoded = await page.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0);

        let minAlpha = 255;
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let offset = 3; offset < pixels.length; offset += 4) {
          minAlpha = Math.min(minAlpha, pixels[offset]!);
        }

        return {
          width: image.naturalWidth,
          height: image.naturalHeight,
          minAlpha,
        };
      }, path);

      expect(decoded.width, path).toBeGreaterThanOrEqual(1_536);
      expect(decoded.width / decoded.height, path).toBe(2);
      expect(decoded.minAlpha, path).toBe(255);
    }
  });
});

test.describe('authored battlefield backdrop integration', () => {
  test('real deterministic seed fixtures reach every authored world', async ({
    context,
  }) => {
    const fixtures = [
      { seed: 4, path: 'art/battlefield-backdrop.webp' },
      { seed: 8, path: 'art/battlefield-obsidian-caldera.webp' },
      { seed: 1, path: 'art/battlefield-glassstorm-expanse.webp' },
    ] as const;

    for (const fixture of fixtures) {
      const page = await context.newPage();
      const selectedAsset = page.waitForResponse((response) =>
        response.url().endsWith(fixture.path),
      );
      await gotoRunningGame(page, `?e2e=hotseat&seed=${fixture.seed}`);
      expect((await selectedAsset).status()).toBe(200);
      await page.close();
    }
  });

  test('missing, blank, and invalid fixture seeds preserve the 1337 baseline', async ({
    context,
  }) => {
    const searches = [
      '?e2e=hotseat',
      '?e2e=hotseat&seed=',
      '?e2e=hotseat&seed=not-a-number',
    ] as const;

    for (const search of searches) {
      const page = await context.newPage();
      const selectedAsset = page.waitForResponse((response) =>
        response.url().endsWith('art/battlefield-backdrop.webp'),
      );
      await gotoRunningGame(page, search);
      expect((await selectedAsset).status()).toBe(200);
      await page.close();
    }
  });

  test('loads through the live renderer without changing the single-page frame', async ({
    page,
  }) => {
    const assetResponse = page.waitForResponse((response) =>
      BACKDROP_PATHS.some((path) => response.url().endsWith(path)),
    );

    await gotoRunningGame(page);
    const response = await assetResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');
    expect(BACKDROP_PATHS.some((path) =>
      new URL(response.url()).pathname === new URL(path, page.url()).pathname,
    )).toBe(true);

    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
      const box = canvas.getBoundingClientRect();
      return {
        canvasWidth: box.width,
        canvasHeight: box.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });

    expect(geometry.canvasWidth).toBeGreaterThan(0);
    expect(geometry.canvasHeight).toBeGreaterThan(0);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewportHeight);
  });

  test('composites the decoded panorama instead of leaving the procedural fallback', async ({
    page,
    context,
  }) => {
    for (const path of BACKDROP_PATHS) {
      await page.route(`**/${path}`, (route) => route.abort());
    }
    await gotoRunningGame(page);
    const fallbackSky = await sampleSky(page);

    const authoredPage = await context.newPage();
    const assetResponse = authoredPage.waitForResponse((response) =>
      BACKDROP_PATHS.some((path) => response.url().endsWith(`/${path}`)),
    );
    await gotoRunningGame(authoredPage);
    expect((await assetResponse).status()).toBe(200);

    await expect.poll(async () =>
      meanChannelDelta(fallbackSky, await sampleSky(authoredPage)),
    // The procedural and authored skies differ by ~12 RGB levels per sampled
    // channel; keep a conservative floor that still decisively rejects the
    // zero-delta failure mode where the decoded image never reaches the canvas.
    ).toBeGreaterThan(8);

    await authoredPage.close();
  });
});
