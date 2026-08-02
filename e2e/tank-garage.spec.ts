import { expect, test, type Page } from '@playwright/test';
import {
  TANK_KIT_IDS,
  TANK_PART_SETS,
  TANK_PART_SLOTS,
} from '../client/src/renderer/tankPartCatalog';

async function openGarage(page: Page): Promise<void> {
  await page.goto('.');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('.lobby-garage')).toHaveCount(2);
}

async function expectTouchSized(locator: ReturnType<Page['locator']>): Promise<void> {
  const boxes = await locator.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    const html = element as HTMLElement;
    return {
      selector: `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`,
      label: html.getAttribute('aria-label') ?? html.title,
      width: box.width,
      height: box.height,
    };
  }));
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect.soft(
      Math.min(box.width, box.height),
      `${box.selector} (${box.label}) must retain a 24px rendered target`,
    ).toBeGreaterThanOrEqual(24);
  }
}

async function openCompactGarage(page: Page, ownerLabel: string): Promise<void> {
  if (await page.locator('#app').evaluate((app) => app.classList.contains('is-compact'))) {
    await page.getByRole('button', {
      name: `Customize ${ownerLabel} tank`,
    }).click();
  }
}

async function closeCompactGarage(page: Page): Promise<void> {
  const done = page.getByRole('button', { name: 'Done customizing tank' });
  if (await done.isVisible()) await done.click();
}

async function installTankPartDrawProbe(page: Page): Promise<void> {
  const partSizes = Array.from(new Set(
    TANK_KIT_IDS.flatMap((kit) => TANK_PART_SLOTS.map((slot) => {
      const part = TANK_PART_SETS[kit].parts[slot];
      return `${part.width}x${part.height}`;
    })),
  ));
  await page.evaluate((knownPartSizes) => {
    const state = window as typeof window & {
      __tankPartDraws?: Array<{ target: string; hash: number }>;
      __tankPartProbeInstalled?: boolean;
      __tankPartSizes?: Set<string>;
    };
    state.__tankPartDraws = [];
    state.__tankPartSizes = new Set(knownPartSizes);
    if (state.__tankPartProbeInstalled) return;
    state.__tankPartProbeInstalled = true;

    const prototype = CanvasRenderingContext2D.prototype;
    const original = prototype.drawImage;
    prototype.drawImage = (function (
      this: CanvasRenderingContext2D,
      image: CanvasImageSource,
      ...args: number[]
    ): void {
      const targetCanvas = this.canvas;
      const target = targetCanvas.id === 'game'
        ? 'game'
        : targetCanvas.classList.contains('lobby-preview__canvas')
          ? 'preview'
          : '';

      if (
        target
        && image instanceof HTMLCanvasElement
        && state.__tankPartSizes!.has(`${image.width}x${image.height}`)
      ) {
        const source = image.getContext('2d', { willReadFrequently: true });
        if (source) {
          const pixels = source.getImageData(
            0,
            0,
            image.width,
            image.height,
          ).data;
          let hash = 2166136261;
          for (const byte of pixels) {
            hash = Math.imul(hash ^ byte, 16777619);
          }
          state.__tankPartDraws!.push({ target, hash: hash >>> 0 });
        }
      }
      Reflect.apply(original, this, [image, ...args]);
    }) as typeof prototype.drawImage;
  }, partSizes);
}

async function previewComponentAreas(page: Page): Promise<number[]> {
  return page.locator(
    '.lobby-preview__canvas',
  ).first().evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return [];
    const { data, width, height } = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const occupied = new Uint8Array(width * height);
    for (let pixel = 0; pixel < occupied.length; pixel++) {
      occupied[pixel] = data[pixel * 4 + 3]! > 24 ? 1 : 0;
    }
    const seen = new Uint8Array(occupied.length);
    const componentAreas: number[] = [];
    for (let start = 0; start < occupied.length; start++) {
      if (occupied[start] === 0 || seen[start] === 1) continue;
      const pending = [start];
      seen[start] = 1;
      let area = 0;
      while (pending.length > 0) {
        const current = pending.pop()!;
        area++;
        const x = current % width;
        const y = Math.floor(current / width);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const next = ny * width + nx;
            if (occupied[next] === 1 && seen[next] === 0) {
              seen[next] = 1;
              pending.push(next);
            }
          }
        }
      }
      if (area >= 8) componentAreas.push(area);
    }
    return componentAreas.sort((left, right) => right - left);
  });
}

async function previewSilhouetteMetrics(page: Page): Promise<{
  width: number;
  height: number;
  top: number;
  middle: number;
  bottom: number;
}> {
  return page.locator(
    '.lobby-preview__canvas',
  ).first().evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      return { width: 0, height: 0, top: 0, middle: 0, bottom: 0 };
    }
    const { data, width, height } = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3]! <= 24) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) {
      return { width: 0, height: 0, top: 0, middle: 0, bottom: 0 };
    }
    const occupiedHeight = maxY - minY + 1;
    const bands = [0, 0, 0];
    for (let y = minY; y <= maxY; y++) {
      const band = Math.min(
        2,
        Math.floor((y - minY) / occupiedHeight * 3),
      );
      for (let x = minX; x <= maxX; x++) {
        if (data[(y * width + x) * 4 + 3]! > 24) bands[band]!++;
      }
    }
    return {
      width: maxX - minX + 1,
      height: occupiedHeight,
      top: bands[0]!,
      middle: bands[1]!,
      bottom: bands[2]!,
    };
  });
}

test.describe('tank Garage', () => {
  test('connects every preview barrel/turret mix to the authored tank stack', async ({
    page,
  }) => {
    await openGarage(page);
    await openCompactGarage(page, 'Player 1');
    const kits = ['Foundry', 'Ranger', 'Bulwark', 'Jackal'] as const;
    for (let turretIndex = 0; turretIndex < kits.length; turretIndex++) {
      for (let barrelIndex = 0; barrelIndex < kits.length; barrelIndex++) {
        await page.getByRole('button', {
          name: `Apply ${kits[turretIndex]} preset to Player 1`,
        }).click();
        const barrelSteps = (
          barrelIndex - turretIndex + kits.length
        ) % kits.length;
        for (let step = 0; step < barrelSteps; step++) {
          await page.getByRole('button', {
            name: 'Change Player 1 barrel',
          }).click();
        }
        await expect.poll(async () => (
          (await previewComponentAreas(page))[0] ?? 0
        )).toBeGreaterThan(700);
        await expect.poll(async () => (
          (await previewComponentAreas(page))[1] ?? 0
        )).toBeLessThan(250);
      }
    }
  });

  test('keeps a maximum-length player identity above fitted tactical controls', async ({
    page,
  }) => {
    await openGarage(page);
    const playerName = 'Commander Longname X';
    await page.getByRole('textbox', { name: 'Player 1' }).fill(playerName);
    await page.evaluate(() => localStorage.setItem('st_arsenal_collapsed', '1'));
    await page.getByRole('button', { name: 'Start Game' }).click();

    const active = page.locator('.st-hud__active-row');
    const owner = active.locator('.st-hud__turn-owner');
    const tactical = active.locator('.st-hud__tactical-row');
    await expect(active).toBeVisible();
    await expect(owner).toHaveText(playerName);
    await expect(owner).toHaveAttribute('title', playerName);
    await expect(tactical.locator('.st-hud__weapon')).toBeVisible();
    await expect(tactical.locator('.st-hud__mobility')).toBeVisible();

    const fit = await owner.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      textOverflow: getComputedStyle(element).textOverflow,
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 1);
    expect(fit.textOverflow).not.toBe('ellipsis');
    expect(fit.pageHeight).toBeLessThanOrEqual(fit.viewportHeight + 1);
  });

  test('fits the stage and previews distinct authored kits', async ({ page }, testInfo) => {
    await openGarage(page);

    await openCompactGarage(page, 'Player 1');
    const fittedPresetLabels = [
      ['Foundry', ['Tracks', 'Armor Hull', 'Cupola', 'Cannon']],
      ['Ranger', ['Spider Legs', 'Scout Hull', 'Sensor Pod', 'Railgun']],
      ['Bulwark', ['Hover', 'Siege Hull', 'Bunker', 'Siege Gun']],
      ['Jackal', ['Dune Wheels', 'Raider Hull', 'Sensor Ring', 'Howitzer']],
    ] as const;
    for (const [preset, expected] of fittedPresetLabels) {
      await page.getByRole('button', {
        name: `Apply ${preset} preset to Player 1`,
      }).click();
      const labels = await page.locator(
        '.lobby-garage[data-owner="player-1"] .lobby-garage__slot strong',
      ).evaluateAll((nodes) => nodes.map((label) => {
        const range = document.createRange();
        range.selectNodeContents(label);
        return {
          text: label.textContent,
          clientWidth: label.clientWidth,
          scrollWidth: label.scrollWidth,
          textWidth: range.getBoundingClientRect().width,
        };
      }));
      expect(labels.map(({ text }) => text)).toEqual(expected);
      for (const label of labels) {
        // Keep real slack for Linux/Windows font-metric differences rather
        // than merely passing at the exact no-overflow boundary.
        expect(label.textWidth + 4).toBeLessThanOrEqual(label.clientWidth);
        expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
      }
      const silhouette = await previewSilhouetteMetrics(page);
      expect(silhouette.width).toBeGreaterThanOrEqual(52);
      expect(silhouette.height).toBeGreaterThanOrEqual(36);
      expect(silhouette.top).toBeGreaterThan(20);
      expect(silhouette.middle).toBeGreaterThan(40);
      expect(silhouette.bottom).toBeGreaterThan(40);
    }
    await closeCompactGarage(page);

    const fit = await page.locator('.lobby-card').evaluate((card) => ({
      clientHeight: card.clientHeight,
      scrollHeight: card.scrollHeight,
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight + 1);
    expect(fit.documentHeight).toBeLessThanOrEqual(fit.viewportHeight + 1);

    if (testInfo.project.name === 'pixel-touch') {
      await expectTouchSized(page.locator('.lobby-swatch:visible'));
      await expectTouchSized(page.locator('.lobby-garage__open:visible'));
      await openCompactGarage(page, 'Player 1');
      const firstPreset = page.getByRole('button', {
        name: 'Apply Foundry preset to Player 1',
      });
      const done = page.getByRole('button', {
        name: 'Done customizing tank',
      });
      await expect(page.getByRole('dialog', {
        name: 'Player 1 tank Garage',
      })).toBeVisible();
      await expect(firstPreset).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(done).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(firstPreset).toBeFocused();
      const rangerPreset = page.getByRole('button', {
        name: 'Apply Ranger preset to Player 1',
      });
      await rangerPreset.click();
      await expect(rangerPreset).toBeFocused();
      const turretSlot = page.getByRole('button', {
        name: 'Change Player 1 turret',
      });
      await turretSlot.click();
      await expect(turretSlot).toBeFocused();
      await expectTouchSized(page.locator(
        '.lobby-garage.editing button:visible',
      ));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', {
        name: 'Customize Player 1 tank',
      })).toBeFocused();
    }

    await page.locator('.lobby-field select:not([id])').selectOption('4');
    await expect(page.locator('.lobby-garage')).toHaveCount(4);
    const fourPlayerFit = await page.locator('.lobby-card').evaluate((card) => ({
      clientHeight: card.clientHeight,
      scrollHeight: card.scrollHeight,
    }));
    expect(fourPlayerFit.scrollHeight).toBeLessThanOrEqual(
      fourPlayerFit.clientHeight + 1,
    );
    if (testInfo.project.name === 'pixel-touch') {
      await expectTouchSized(page.locator('.lobby-swatch:visible'));
      await expectTouchSized(page.locator('.lobby-garage__open:visible'));
    }

    await page.locator('.lobby-field select:not([id])').selectOption('2');
    await page.getByRole('button', { name: 'Play Online' }).click();
    await expect(page.locator('.lobby-garage')).toHaveCount(1);
    const onlineFit = await page.locator('.lobby-card').evaluate((card) => ({
      clientHeight: card.clientHeight,
      scrollHeight: card.scrollHeight,
    }));
    expect(onlineFit.scrollHeight).toBeLessThanOrEqual(
      onlineFit.clientHeight + 1,
    );
    await page.getByRole('button', { name: 'Hot Seat' }).click();

    await openCompactGarage(page, 'Player 1');
    await page.getByRole('button', {
      name: 'Apply Ranger preset to Player 1',
    }).click();
    await closeCompactGarage(page);
    await openCompactGarage(page, 'Player 2');
    await page.getByRole('button', {
      name: 'Apply Bulwark preset to Player 2',
    }).click();
    await closeCompactGarage(page);

    await expect(page.locator(
      'button[aria-label="Apply Ranger preset to Player 1"]',
    )).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(
      'button[aria-label="Apply Bulwark preset to Player 2"]',
    )).toHaveAttribute('aria-pressed', 'true');

    await expect.poll(async () => page.evaluate(() => {
      const signatures = Array.from(
        document.querySelectorAll<HTMLCanvasElement>('.lobby-preview__canvas'),
      ).map((canvas) => {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx === null) return '';
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let signature = '';
        let visible = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index]! > 32) {
            visible++;
            signature += `${(index - 3) / 4},`;
          }
        }
        return `${visible}:${signature}`;
      });
      return {
        ready: signatures.every((signature) =>
          Number(signature.split(':', 1)[0]) > 100),
        distinct: signatures.length === 2 && signatures[0] !== signatures[1],
      };
    })).toEqual({ ready: true, distinct: true });
  });

  test('carries a mixed Jackal selection into a running game', async ({
    page,
  }) => {
    await openGarage(page);
    await installTankPartDrawProbe(page);

    await openCompactGarage(page, 'Player 1');
    await page.getByRole('button', {
      name: 'Apply Jackal preset to Player 1',
    }).click();
    await page.getByRole('button', {
      name: 'Change Player 1 turret',
    }).click();

    await expect(page.getByRole('button', {
      name: 'Change Player 1 turret',
    })).toContainText('Cupola');
    const expectedPartHashes = await page.evaluate(() => {
      const records = (window as typeof window & {
        __tankPartDraws?: Array<{ target: string; hash: number }>;
      }).__tankPartDraws ?? [];
      return records
        .filter(({ target }) => target === 'preview')
        .slice(-8, -4)
        .map(({ hash }) => hash);
    });
    expect(new Set(expectedPartHashes).size).toBe(4);
    await page.evaluate(() => {
      (window as typeof window & {
        __tankPartDraws?: Array<{ target: string; hash: number }>;
      }).__tankPartDraws = [];
    });
    await closeCompactGarage(page);
    await page.getByRole('button', { name: 'Start Game' }).click();

    await expect(page.locator('#game')).toBeVisible();
    await expect(page.locator('#hud.st-hud')).toBeVisible();
    await expect.poll(async () => page.evaluate((expected) => {
      const records = (window as typeof window & {
        __tankPartDraws?: Array<{ target: string; hash: number }>;
      }).__tankPartDraws ?? [];
      const gameHashes = new Set(
        records
          .filter(({ target }) => target === 'game')
          .map(({ hash }) => hash),
      );
      return expected.every((hash) => gameHashes.has(hash));
    }, expectedPartHashes)).toBe(true);
  });
});
