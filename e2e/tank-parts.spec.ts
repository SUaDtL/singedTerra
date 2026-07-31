import { test, expect } from '@playwright/test';
import {
  BARREL_LENGTH,
  BARREL_PIVOT_HEIGHT,
} from '../shared/src/engine/Tank';
import {
  TANK_KIT_IDS,
  TANK_PART_ATLAS_HEIGHT,
  TANK_PART_ATLAS_WIDTH,
  TANK_PART_CELL_HEIGHT,
  TANK_PART_CELL_WIDTH,
  TANK_PART_SETS,
  TANK_PART_SLOTS,
} from '../client/src/renderer/tankPartCatalog';

const ATLAS_PATH = 'art/tank-parts.webp';
const MAX_TRANSFER_BYTES = 250_000;

test.describe('modular authored tank atlas', () => {
  test('ships sixteen independently occupied transparent gameplay parts', async ({
    page,
    request,
  }) => {
    const response = await request.get(ATLAS_PATH);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');
    expect((await response.body()).byteLength).toBeLessThanOrEqual(
      MAX_TRANSFER_BYTES,
    );

    await page.goto('.');
    const barrelDefinitions = TANK_KIT_IDS.map((kit) =>
      TANK_PART_SETS[kit].parts.barrel);
    const mobilityDefinitions = TANK_KIT_IDS.map((kit) =>
      TANK_PART_SETS[kit].parts.treads);
    const partDefinitions = TANK_KIT_IDS.flatMap((kit) =>
      TANK_PART_SLOTS.map((slot) => ({
        kit,
        slot,
        definition: TANK_PART_SETS[kit].parts[slot],
      })));
    const decoded = await page.evaluate(async ({
      src,
      atlasWidth,
      atlasHeight,
      cellWidth,
      cellHeight,
      barrels,
      mobilities,
      kitCount,
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

      const cells = Array.from({ length: kitCount * 4 }, (_, cell) => {
        const row = Math.floor(cell / 4);
        const column = cell % 4;
        const occupied = new Uint8Array(cellWidth * cellHeight);
        let visible = 0;
        let minX = cellWidth;
        let maxX = -1;
        let minY = cellHeight;
        let maxY = -1;
        let minLuminance = 255;
        let maxLuminance = 0;
        for (let y = 0; y < cellHeight; y++) {
          for (let x = 0; x < cellWidth; x++) {
            const atlasX = column * cellWidth + x;
            const atlasY = row * cellHeight + y;
            const offset = (atlasY * atlasWidth + atlasX) * 4;
            const alpha = pixels[offset + 3]!;
            if (alpha <= 32) continue;
            occupied[y * cellWidth + x] = 1;
            visible++;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
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
        const seen = new Uint8Array(occupied.length);
        let principal = {
          area: 0,
          minX: cellWidth,
          maxX: -1,
          minY: cellHeight,
          maxY: -1,
        };
        for (let start = 0; start < occupied.length; start++) {
          if (occupied[start] === 0 || seen[start] === 1) continue;
          const pending = [start];
          seen[start] = 1;
          const component = {
            area: 0,
            minX: cellWidth,
            maxX: -1,
            minY: cellHeight,
            maxY: -1,
          };
          while (pending.length > 0) {
            const current = pending.pop()!;
            const x = current % cellWidth;
            const y = Math.floor(current / cellWidth);
            component.area++;
            component.minX = Math.min(component.minX, x);
            component.maxX = Math.max(component.maxX, x);
            component.minY = Math.min(component.minY, y);
            component.maxY = Math.max(component.maxY, y);
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (
                  nx < 0
                  || nx >= cellWidth
                  || ny < 0
                  || ny >= cellHeight
                ) continue;
                const next = ny * cellWidth + nx;
                if (occupied[next] === 1 && seen[next] === 0) {
                  seen[next] = 1;
                  pending.push(next);
                }
              }
            }
          }
          if (component.area > principal.area) principal = component;
        }
        return {
          visible,
          occupiedWidth: maxX - minX + 1,
          occupiedHeight: maxY - minY + 1,
          luminanceRange: maxLuminance - minLuminance,
          minX,
          maxX,
          principal,
        };
      });

      const mobilityMasks = mobilities.map((mobility) => {
        const sample = document.createElement('canvas');
        sample.width = 40;
        sample.height = 24;
        const sampleCtx = sample.getContext('2d', {
          willReadFrequently: true,
        })!;
        sampleCtx.drawImage(
          image,
          mobility.source.x,
          mobility.source.y,
          mobility.source.width,
          mobility.source.height,
          (sample.width - mobility.width) / 2,
          sample.height - mobility.height,
          mobility.width,
          mobility.height,
        );
        const data = sampleCtx.getImageData(
          0,
          0,
          sample.width,
          sample.height,
        ).data;
        return Array.from(
          { length: sample.width * sample.height },
          (_, index) => data[index * 4 + 3]! > 48,
        );
      });
      const silhouetteDistance = (a: boolean[], b: boolean[]): number => {
        let union = 0;
        let intersection = 0;
        for (let index = 0; index < a.length; index++) {
          if (a[index] || b[index]) union++;
          if (a[index] && b[index]) intersection++;
        }
        return union === 0 ? 0 : 1 - intersection / union;
      };
      const mobilityDistances: number[] = [];
      for (let left = 0; left < mobilityMasks.length; left++) {
        for (let right = left + 1; right < mobilityMasks.length; right++) {
          mobilityDistances.push(silhouetteDistance(
            mobilityMasks[left]!,
            mobilityMasks[right]!,
          ));
        }
      }
      let legacyRowsDigest = 2_166_136_261;
      let legacyRowsVisibleDigest = 2_166_136_261;
      for (let y = 0; y < 3 * cellHeight; y++) {
        const rowStart = y * atlasWidth * 4;
        const rowEnd = rowStart + atlasWidth * 4;
        for (let offset = rowStart; offset < rowEnd; offset += 4) {
          const alpha = pixels[offset + 3]!;
          legacyRowsDigest ^= alpha;
          legacyRowsDigest = Math.imul(legacyRowsDigest, 16_777_619);
          for (let channel = 0; channel < 3; channel++) {
            const premultiplied = Math.round(
              pixels[offset + channel]! * alpha / 255,
            );
            legacyRowsVisibleDigest ^= premultiplied;
            legacyRowsVisibleDigest = Math.imul(
              legacyRowsVisibleDigest,
              16_777_619,
            );
          }
          legacyRowsVisibleDigest ^= alpha;
          legacyRowsVisibleDigest = Math.imul(
            legacyRowsVisibleDigest,
            16_777_619,
          );
        }
      }

      const alphaNear = (
        centerX: number,
        centerY: number,
        radius: number,
      ): boolean => {
        for (
          let y = Math.max(0, Math.floor(centerY - radius));
          y <= Math.min(atlasHeight - 1, Math.ceil(centerY + radius));
          y++
        ) {
          for (
            let x = Math.max(0, Math.floor(centerX - radius));
            x <= Math.min(atlasWidth - 1, Math.ceil(centerX + radius));
            x++
          ) {
            const offset = (y * atlasWidth + x) * 4 + 3;
            if (pixels[offset]! > 32) return true;
          }
        }
        return false;
      };
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        cells,
        mobilityDistances,
        legacyRowsDigest: (legacyRowsDigest >>> 0)
          .toString(16)
          .padStart(8, '0'),
        legacyRowsVisibleDigest: (legacyRowsVisibleDigest >>> 0)
          .toString(16)
          .padStart(8, '0'),
        barrels: barrels.map((barrel) => {
          const mountY = barrel.source.y
            + (-barrel.offsetY / barrel.height) * barrel.source.height;
          // One rendered logical pixel converted back into cropped-source pixels.
          const sourceRadius = Math.ceil(
            barrel.source.width / barrel.width,
          );
          const sourceX = (renderedX: number): number =>
            barrel.source.x + Math.min(
              barrel.source.width - 1,
              renderedX / barrel.width * barrel.source.width,
            );
          return {
            pivotOccupied: alphaNear(
              sourceX(barrel.pivotX),
              mountY,
              sourceRadius,
            ),
            muzzleOccupied: alphaNear(
              sourceX(barrel.muzzleX),
              mountY,
              sourceRadius,
            ),
          };
        }),
      };
    }, {
      src: ATLAS_PATH,
      atlasWidth: TANK_PART_ATLAS_WIDTH,
      atlasHeight: TANK_PART_ATLAS_HEIGHT,
      cellWidth: TANK_PART_CELL_WIDTH,
      cellHeight: TANK_PART_CELL_HEIGHT,
      barrels: barrelDefinitions,
      mobilities: mobilityDefinitions,
      kitCount: TANK_KIT_IDS.length,
    });

    expect(decoded.legacyRowsDigest).toBe('669c6463');
    expect(decoded.legacyRowsVisibleDigest).toBe('56549168');
    expect(decoded.width).toBe(TANK_PART_ATLAS_WIDTH);
    expect(decoded.height).toBe(TANK_PART_ATLAS_HEIGHT);
    expect(decoded.cells).toHaveLength(16);
    for (const [index, part] of partDefinitions.entries()) {
      const row = Math.floor(index / 4);
      const column = index % 4;
      const principal = decoded.cells[index]!.principal;
      const crop = part.definition.source;
      const cropBounds = {
        minX: crop.x - column * TANK_PART_CELL_WIDTH,
        maxX: crop.x + crop.width - 1 - column * TANK_PART_CELL_WIDTH,
        minY: crop.y - row * TANK_PART_CELL_HEIGHT,
        maxY: crop.y + crop.height - 1 - row * TANK_PART_CELL_HEIGHT,
      };
      for (const edge of ['minX', 'maxX', 'minY', 'maxY'] as const) {
        expect(
          Math.abs(cropBounds[edge] - principal[edge]),
          `${part.kit} ${part.slot} ${edge} must track the principal authored alpha bounds`,
        ).toBeLessThanOrEqual(1);
      }
    }
    // Even the two most similarly proportioned bases must differ across more
    // than a tenth of their tight gameplay-scale alpha union.
    expect(Math.min(...decoded.mobilityDistances)).toBeGreaterThan(0.1);
    const minimumsBySlot = [
      { visible: 7_000, width: 200, height: 35 },
      { visible: 4_000, width: 190, height: 24 },
      { visible: 700, width: 80, height: 18 },
      { visible: 4_000, width: 200, height: 28 },
    ];
    for (const [index, cell] of decoded.cells.entries()) {
      const minimums = minimumsBySlot[index % 4]!;
      expect(cell.visible).toBeGreaterThan(minimums.visible);
      expect(cell.occupiedWidth).toBeGreaterThan(minimums.width);
      expect(cell.occupiedHeight).toBeGreaterThan(minimums.height);
      expect(cell.luminanceRange).toBeGreaterThan(60);
    }

    for (const [index, barrel] of barrelDefinitions.entries()) {
      expect(barrel.muzzleX - barrel.pivotX).toBe(BARREL_LENGTH);
      expect(decoded.barrels[index]!.pivotOccupied).toBe(true);
      expect(decoded.barrels[index]!.muzzleOccupied).toBe(true);
    }
  });

  test('keeps all four complete families distinct at gameplay scale', async ({
    page,
  }) => {
    await page.goto('.');
    const partSets = TANK_KIT_IDS.map((kit) => TANK_PART_SETS[kit].parts);
    const result = await page.evaluate(async ({
      atlasSrc,
      cellWidth,
      cellHeight,
      definitions,
      barrelPivotHeight,
    }) => {
      const image = new Image();
      image.src = atlasSrc;
      await image.decode();

      const masks = definitions.map((parts) => {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 32;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        const anchorX = 24;
        const anchorY = 28;
        const staticSlots = ['treads', 'hull', 'turret'] as const;
        for (const slot of staticSlots) {
          const part = parts[slot];
          ctx.drawImage(
            image,
            part.source.x,
            part.source.y,
            part.source.width,
            part.source.height,
            anchorX + part.offsetX,
            anchorY + part.offsetY,
            part.width,
            part.height,
          );
        }
        const barrel = parts.barrel;
        ctx.save();
        ctx.translate(anchorX, anchorY - barrelPivotHeight);
        ctx.rotate(-12 * Math.PI / 180);
        ctx.drawImage(
          image,
          barrel.source.x,
          barrel.source.y,
          barrel.source.width,
          barrel.source.height,
          barrel.offsetX,
          barrel.offsetY,
          barrel.width,
          barrel.height,
        );
        ctx.restore();
        const pixels = ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        return Array.from(
          { length: canvas.width * canvas.height },
          (_, index) => pixels[index * 4 + 3]! > 48,
        );
      });
      const distance = (left: boolean[], right: boolean[]): number => {
        let union = 0;
        let intersection = 0;
        for (let index = 0; index < left.length; index++) {
          if (left[index] || right[index]) union++;
          if (left[index] && right[index]) intersection++;
        }
        return union === 0 ? 0 : 1 - intersection / union;
      };
      const pairwise: number[] = [];
      for (let left = 0; left < masks.length; left++) {
        for (let right = left + 1; right < masks.length; right++) {
          pairwise.push(distance(masks[left]!, masks[right]!));
        }
      }
      return {
        occupied: masks.map((mask) => mask.filter(Boolean).length),
        pairwise,
      };
    }, {
      atlasSrc: ATLAS_PATH,
      cellWidth: TANK_PART_CELL_WIDTH,
      cellHeight: TANK_PART_CELL_HEIGHT,
      definitions: partSets,
      barrelPivotHeight: BARREL_PIVOT_HEIGHT,
    });

    expect(Math.min(...result.occupied)).toBeGreaterThan(110);
    // Complete tanks deliberately share one side-view mount contract; the
    // propulsion silhouettes carry the strongest family distinction and are
    // asserted independently above.
    expect(Math.min(...result.pairwise)).toBeGreaterThan(0.08);
  });
});
