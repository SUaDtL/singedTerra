import { expect, test } from '@playwright/test';

async function battlefieldTankStrips(page: import('@playwright/test').Page) {
  return page.locator('#game').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const stripWidth = 80;
    const centers = [120, 1080];
    const strips = centers.map((center) => ctx.getImageData(
      center - stripWidth / 2,
      0,
      stripWidth,
      canvas.height,
    ).data);
    return Array.from(strips.flatMap((strip) => Array.from(strip)));
  });
}

test('late tank atlas replaces fallback without a reload', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine');

  let releaseAtlas!: () => void;
  const atlasReleased = new Promise<void>((resolve) => {
    releaseAtlas = resolve;
  });
  let atlasRequested!: () => void;
  const atlasRequestStarted = new Promise<void>((resolve) => {
    atlasRequested = resolve;
  });
  await page.route('**/art/tank-parts.webp', async (route) => {
    atlasRequested();
    await atlasReleased;
    await route.continue();
  });

  await page.goto('?e2e=hotseat', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('#hud.st-hud')).toBeVisible();
  await expect(page.locator('#battle-rail .st-hud__console-solution')).toBeVisible();
  await atlasRequestStarted;
  await page.waitForTimeout(5_100);

  const portrait = page.locator('.st-hud__tank-portrait');
  const fallback = await portrait.evaluate(
    (canvas: HTMLCanvasElement) => canvas.toDataURL(),
  );
  const fallbackBattlefield = await battlefieldTankStrips(page);

  releaseAtlas();
  await expect.poll(async () => portrait.evaluate(
    (canvas: HTMLCanvasElement) => canvas.toDataURL(),
  ), { timeout: 5_000 }).not.toBe(fallback);

  await expect.poll(async () => {
    const authoredBattlefield = await battlefieldTankStrips(page);
    let changed = 0;
    for (let offset = 0; offset < authoredBattlefield.length; offset += 4) {
      const delta = (
        Math.abs(authoredBattlefield[offset]! - fallbackBattlefield[offset]!)
        + Math.abs(authoredBattlefield[offset + 1]! - fallbackBattlefield[offset + 1]!)
        + Math.abs(authoredBattlefield[offset + 2]! - fallbackBattlefield[offset + 2]!)
        + Math.abs(authoredBattlefield[offset + 3]! - fallbackBattlefield[offset + 3]!)
      );
      if (delta >= 18) changed++;
    }
    return changed;
  }, { timeout: 5_000 }).toBeGreaterThan(180);
});
