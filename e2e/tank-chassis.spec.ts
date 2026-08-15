import { test, expect, type Page } from '@playwright/test';
import { gotoRunningGame } from './support';

const CHASSIS_PATH = 'art/tank-chassis.webp';
const MAX_TRANSFER_BYTES = 100_000;
const DRAW_WIDTH = 36;
const DRAW_HEIGHT = 24;

test.describe('authored tank chassis asset', () => {
  test('is a bounded transparent 256x128 WebP that survives gameplay scale', async ({
    page,
    request,
  }) => {
    const response = await request.get(CHASSIS_PATH);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');
    expect((await response.body()).byteLength).toBeLessThanOrEqual(
      MAX_TRANSFER_BYTES,
    );

    await page.goto('.');
    const decoded = await page.evaluate(async ({
      src,
      drawWidth,
      drawHeight,
    }) => {
      const image = new Image();
      image.src = src;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let transparent = 0;
      let opaque = 0;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;
      let minLuminance = 255;
      let maxLuminance = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const offset = (y * canvas.width + x) * 4;
          const alpha = pixels[offset + 3]!;
          if (alpha <= 8) transparent++;
          if (alpha >= 240) opaque++;
          if (alpha <= 32) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          if (alpha < 128) continue;
          const luminance = (
            pixels[offset]! * 0.2126
            + pixels[offset + 1]! * 0.7152
            + pixels[offset + 2]! * 0.0722
          );
          minLuminance = Math.min(minLuminance, luminance);
          maxLuminance = Math.max(maxLuminance, luminance);
        }
      }

      const preview = document.createElement('canvas');
      preview.width = drawWidth;
      preview.height = drawHeight;
      const previewCtx = preview.getContext(
        '2d',
        { willReadFrequently: true },
      )!;
      previewCtx.imageSmoothingEnabled = true;
      previewCtx.imageSmoothingQuality = 'high';
      previewCtx.drawImage(image, 0, 0, preview.width, preview.height);
      const previewPixels = previewCtx.getImageData(
        0,
        0,
        preview.width,
        preview.height,
      ).data;
      let visiblePreviewPixels = 0;
      for (let offset = 3; offset < previewPixels.length; offset += 4) {
        if (previewPixels[offset]! >= 64) visiblePreviewPixels++;
      }

      const area = canvas.width * canvas.height;
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        transparentRatio: transparent / area,
        opaqueRatio: opaque / area,
        occupiedWidth: maxX - minX + 1,
        occupiedHeight: maxY - minY + 1,
        minX,
        minY,
        maxX,
        maxY,
        luminanceRange: maxLuminance - minLuminance,
        visiblePreviewPixels,
        visibleGameplayWidth: (
          (maxX - minX + 1) / canvas.width * drawWidth
        ),
      };
    }, {
      src: CHASSIS_PATH,
      drawWidth: DRAW_WIDTH,
      drawHeight: DRAW_HEIGHT,
    });

    expect(decoded.width).toBe(256);
    expect(decoded.height).toBe(128);
    expect(decoded.transparentRatio).toBeGreaterThan(0.35);
    expect(decoded.opaqueRatio).toBeGreaterThan(0.12);
    expect(decoded.occupiedWidth).toBeGreaterThan(170);
    expect(decoded.occupiedHeight).toBeGreaterThan(58);
    expect(decoded.minX).toBeGreaterThan(2);
    expect(decoded.minY).toBeGreaterThan(2);
    expect(decoded.maxX).toBeLessThan(253);
    expect(decoded.maxY).toBeLessThan(125);
    expect(decoded.luminanceRange).toBeGreaterThan(80);
    expect(decoded.visiblePreviewPixels).toBeGreaterThan(140);
    expect(decoded.visibleGameplayWidth).toBeLessThanOrEqual(34);
  });
});

const STRIP_WIDTH = 80;
const TANK_XS = [120, 1080] as const;

async function tankStrips(page: Page): Promise<Buffer> {
  const encoded = await page.locator('#game').evaluate((
    canvas: HTMLCanvasElement,
    { stripWidth, tankXs },
  ) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const bytes = new Uint8Array(
      stripWidth * canvas.height * 4 * tankXs.length,
    );
    let targetOffset = 0;
    for (const centerX of tankXs) {
      const source = ctx.getImageData(
        centerX - stripWidth / 2,
        0,
        stripWidth,
        canvas.height,
      ).data;
      bytes.set(source, targetOffset);
      targetOffset += source.length;
    }
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8_192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8_192));
    }
    return btoa(binary);
  }, { stripWidth: STRIP_WIDTH, tankXs: TANK_XS });
  return Buffer.from(encoded, 'base64');
}

test.describe('authored tank chassis integration', () => {
  test('paints localized red/blue variants through the live game and keeps firing fitted', async ({
    page,
    context,
  }) => {
    await gotoRunningGame(page);
    await page.waitForTimeout(1_100);
    const authored = await tankStrips(page);

    const fallbackPage = await context.newPage();
    await fallbackPage.route(
      '**/art/tank-parts.webp',
      (route) => route.abort(),
    );
    await gotoRunningGame(fallbackPage);
    await fallbackPage.waitForTimeout(1_100);
    const fallback = await tankStrips(fallbackPage);
    await fallbackPage.close();

    let changed = 0;
    let redVariantPixels = 0;
    let blueVariantPixels = 0;
    const bytesPerStrip = STRIP_WIDTH * 600 * 4;
    for (let offset = 0; offset < authored.length; offset += 4) {
      const delta = (
        Math.abs(authored[offset]! - fallback[offset]!)
        + Math.abs(authored[offset + 1]! - fallback[offset + 1]!)
        + Math.abs(authored[offset + 2]! - fallback[offset + 2]!)
        + Math.abs(authored[offset + 3]! - fallback[offset + 3]!)
      );
      if (delta < 18) continue;
      changed++;
      const red = authored[offset]!;
      const green = authored[offset + 1]!;
      const blue = authored[offset + 2]!;
      if (
        offset < bytesPerStrip
        && red > green * 1.12
        && red > blue * 1.18
      ) redVariantPixels++;
      if (
        offset >= bytesPerStrip
        && blue > red * 1.12
        && blue > green * 1.04
      ) blueVariantPixels++;
    }

    expect(changed).toBeGreaterThan(180);
    expect(changed).toBeLessThan(2_500);
    expect(redVariantPixels).toBeGreaterThan(20);
    expect(blueVariantPixels).toBeGreaterThan(20);

    const action = page.locator('.st-hud__primary-action');
    await expect(action).toBeEnabled();
    await action.click();
    await expect(page.locator('.st-hud__command-console'))
      .toHaveAttribute('data-command-phase', /submitting|tracking|resolving/);
    await expect(action).toBeEnabled({ timeout: 15_000 });
    await expect(page.locator('[data-control="angle"] output'))
      .toHaveText('45°');

    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.height).toBeLessThanOrEqual(geometry.viewportHeight);
  });
});
