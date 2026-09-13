import { expect, test } from '@playwright/test';

interface RectGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface TextGeometry {
  readonly text: string;
  readonly lineCount: number;
  readonly lineRects: readonly RectGeometry[];
  readonly contentBox: Readonly<{
    left: number;
    right: number;
    top: number;
    bottom: number;
  }>;
  readonly insideContentBox: boolean;
  readonly physicalFontSize: number;
}

const CONTROL_KEYS = [
  'move-left',
  'move-right',
  'weapon-next',
  'armory',
  'angle-decrease',
  'angle-increase',
  'power-decrease',
  'power-increase',
  'settings',
  'fire',
] as const;

test('P06 compact short-height labels remain complete inside their control wells', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-touch', 'The defect requires the short-height coarse-pointer profile.');

  await page.goto('?e2e=quick-duel-seed');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  const operation = page.locator('[data-operation-id="last-light-siege"]');
  if (!await operation.isVisible()) {
    const otherQuickDuels = page.locator('[data-ui="other-quick-duels"] > summary');
    if (await otherQuickDuels.isVisible()) await otherQuickDuels.click();
  }
  await operation.click();
  await page.getByRole('button', { name: 'Quick Duel vs CPU', exact: true }).click();

  const entry = page.getByRole('button', { name: 'Enter battle', exact: true });
  if (await entry.isVisible()) await entry.click();

  const chassis = page.locator('[data-battle-console-compact-chassis]');
  await expect(chassis).toBeVisible();
  await expect(page.locator('#hud [data-ui="quick-operation"]'))
    .toHaveText('Last Light Siege · A best-of-three duel that tightens into sudden death.');

  const geometry = await page.evaluate((controlKeys) => {
    const root = document.querySelector<HTMLElement>('[data-battle-console-compact-chassis]');
    if (!root) throw new Error('Missing compact battle console');
    const stage = document.querySelector<HTMLElement>('#stage');
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!stage || !canvas) throw new Error('Missing battle stage or game canvas');

    const rootRect = root.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const physicalScale = rootRect.width / root.offsetWidth;
    const measureText = (
      key: 'weapon-next' | 'armory' | 'settings',
      part: 'name' | 'metadata' | 'button' = 'button',
    ): TextGeometry => {
      const button = root.querySelector<HTMLButtonElement>(`[data-battle-console-target-key="${key}"]`);
      if (!button) throw new Error(`Missing ${key} control`);
      const textTarget = part === 'name'
        ? button.querySelector<HTMLElement>(':scope > span')
        : part === 'metadata'
          ? button.querySelector<HTMLElement>(':scope > small')
          : button;
      if (!textTarget) throw new Error(`Missing ${key} ${part} text`);

      const buttonRect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const scaleX = buttonRect.width / button.offsetWidth;
      const scaleY = buttonRect.height / button.offsetHeight;
      const px = (value: string): number => Number.parseFloat(value) || 0;
      const contentBox = {
        left: buttonRect.left + (px(style.borderLeftWidth) + px(style.paddingLeft)) * scaleX,
        right: buttonRect.right - (px(style.borderRightWidth) + px(style.paddingRight)) * scaleX,
        top: buttonRect.top + (px(style.borderTopWidth) + px(style.paddingTop)) * scaleY,
        bottom: buttonRect.bottom - (px(style.borderBottomWidth) + px(style.paddingBottom)) * scaleY,
      };
      const range = document.createRange();
      range.selectNodeContents(textTarget);
      const lines = [...range.getClientRects()].filter((rect) => rect.width > 0.5 && rect.height > 0.5);
      const lineBands = lines.reduce<number[]>((bands, rect) => {
        if (!bands.some((y) => Math.abs(y - rect.y) <= 1)) bands.push(rect.y);
        return bands;
      }, []);

      return {
        text: textTarget.textContent?.trim() ?? '',
        lineCount: lineBands.length,
        lineRects: lines.map((rect) => ({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        })),
        contentBox,
        insideContentBox: lines.every((rect) => (
          rect.left >= contentBox.left - 1
          && rect.right <= contentBox.right + 1
          && rect.top >= contentBox.top - 1
          && rect.bottom <= contentBox.bottom + 1
        )),
        physicalFontSize: Number.parseFloat(getComputedStyle(textTarget).fontSize) * physicalScale,
      };
    };

    const targets = controlKeys.map((key) => {
      const button = root.querySelector<HTMLElement>(`[data-battle-console-target-key="${key}"]`);
      if (!button) throw new Error(`Missing ${key} control`);
      const rect = button.getBoundingClientRect();
      return { key, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });

    return {
      viewport: { width: innerWidth, height: innerHeight },
      chassis: {
        left: rootRect.left,
        right: rootRect.right,
        top: rootRect.top,
        bottom: rootRect.bottom,
      },
      stage: {
        x: stageRect.x,
        y: stageRect.y,
        width: stageRect.width,
        height: stageRect.height,
      },
      canvas: {
        x: canvasRect.x,
        y: canvasRect.y,
        width: canvasRect.width,
        height: canvasRect.height,
      },
      targets,
      weapon: measureText('weapon-next', 'name'),
      weaponMetadata: measureText('weapon-next', 'metadata'),
      armory: measureText('armory'),
      settings: measureText('settings'),
      resourceUrls: [...new Set(
        performance.getEntriesByType('resource').map((entry) => entry.name),
      )].sort(),
    };
  }, CONTROL_KEYS);

  await testInfo.attach('p06-compact-console-measurement.json', {
    body: Buffer.from(`${JSON.stringify(geometry, null, 2)}\n`),
    contentType: 'application/json',
  });
  const screenshotPath = testInfo.outputPath('p06-compact-console-pre-assertions.png');
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach('p06-compact-console-pre-assertions.png', {
    path: screenshotPath,
    contentType: 'image/png',
  });

  expect(geometry.viewport.height).toBeLessThanOrEqual(360);
  expect(geometry.weapon).toMatchObject({
    text: 'Baby Missile',
    insideContentBox: true,
  });
  expect(geometry.weapon.lineCount).toBeGreaterThanOrEqual(1);
  expect(geometry.weapon.lineCount).toBeLessThanOrEqual(2);
  expect(geometry.weaponMetadata.insideContentBox, 'Weapon metadata remains inside its content box').toBe(true);
  expect(geometry.weaponMetadata.lineCount).toBeGreaterThanOrEqual(1);
  expect(geometry.weaponMetadata.lineCount).toBeLessThanOrEqual(2);
  expect(geometry.armory).toMatchObject({ text: 'Armory', lineCount: 1, insideContentBox: true });
  expect(geometry.settings).toMatchObject({ text: 'Settings', lineCount: 1, insideContentBox: true });

  for (const label of [geometry.weapon, geometry.weaponMetadata, geometry.armory, geometry.settings]) {
    expect(label.physicalFontSize, `${label.text} retains the established physical readability floor`)
      .toBeGreaterThanOrEqual(13.99);
  }
  for (const target of geometry.targets) {
    expect(target.width, `${target.key} retains a 44px physical target`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.key} retains a 44px physical target`).toBeGreaterThanOrEqual(44);
  }
  expect(geometry.chassis.left).toBeGreaterThanOrEqual(0);
  expect(geometry.chassis.top).toBeGreaterThanOrEqual(0);
  expect(geometry.chassis.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
  expect(geometry.chassis.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
});
