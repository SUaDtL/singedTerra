import { describe, expect, it, vi } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { TerrainRenderer } from './TerrainRenderer';
import { createTerrainBevelSampler } from './terrainBevelLighting';
import {
  BATTLEFIELD_WORLDS,
  type BattlefieldWorld,
} from './BattlefieldBackdrop';

interface MaterialStub {
  readonly isSettled: boolean;
  readonly needsApplication: boolean;
  sample(x: number, y: number): number;
  acknowledgeApplied(): void;
  select(asset: string): void;
  reset(): void;
}

const NOOP_MATERIAL_LIFECYCLE: Pick<MaterialStub, 'select' | 'reset'> = {
  select() {},
  reset() {},
};

interface TerrainRendererSeam {
  offscreen: HTMLCanvasElement;
  offCtx: CanvasRenderingContext2D;
  imageData: ImageData;
}

function flatTerrain(surfaceY = 100): Uint8Array {
  const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  for (let y = surfaceY; y < CANVAS_HEIGHT; y++) {
    terrain.fill(1, y * CANVAS_WIDTH, (y + 1) * CANVAS_WIDTH);
  }
  return terrain;
}

function rendererWith(
  material: MaterialStub,
  createBevelSampler: typeof createTerrainBevelSampler =
    createTerrainBevelSampler,
): {
  renderer: TerrainRenderer;
  pixels: Uint8ClampedArray;
  rebuilds: () => number;
} {
  const pixels = new Uint8ClampedArray(
    CANVAS_WIDTH * CANVAS_HEIGHT * 4,
  );
  let rebuildCount = 0;
  const renderer = new TerrainRenderer(
    createBevelSampler,
    material,
  );
  const seam = renderer as unknown as TerrainRendererSeam;
  seam.offscreen = {} as HTMLCanvasElement;
  seam.offCtx = {
    putImageData() {
      rebuildCount++;
    },
  } as unknown as CanvasRenderingContext2D;
  seam.imageData = { data: pixels } as ImageData;
  return { renderer, pixels, rebuilds: () => rebuildCount };
}

function rgbaAt(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const offset = (y * CANVAS_WIDTH + x) * 4;
  return [
    pixels[offset]!,
    pixels[offset + 1]!,
    pixels[offset + 2]!,
    pixels[offset + 3]!,
  ];
}

function byteHash(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const target = {
  drawImage() {},
} as unknown as CanvasRenderingContext2D;

describe('TerrainRenderer authored material integration', () => {
  it('paints lava with a distinct high-contrast material color', () => {
    const material: MaterialStub = {
      isSettled: true,
      needsApplication: false,
      sample: () => 0,
      acknowledgeApplied() {},
      select() {},
      reset() {},
    };
    const { renderer, pixels } = rendererWith(material);
    const terrain = flatTerrain(100);
    terrain[120 * CANVAS_WIDTH + 500] = 2;
    renderer.draw(target, terrain, 1);
    expect(rgbaAt(pixels, 500, 120)).toEqual([238, 46, 18, 255]);
    expect(rgbaAt(pixels, 500, 121)).not.toEqual([238, 46, 18, 255]);
  });

  it('rebuilds an already-cached frame when the first world is selected (kills missing selectWorld markDirty)', () => {
    const select = vi.fn();
    const material: MaterialStub = {
      isSettled: true,
      needsApplication: false,
      sample: () => 0,
      acknowledgeApplied() {},
      select,
      reset: vi.fn(),
    };
    const { renderer, pixels, rebuilds } = rendererWith(material);
    const terrain = flatTerrain();

    expect(renderer.draw(target, terrain, 30)).toBe(true);
    const fallbackPixel = rgbaAt(pixels, 500, 120);
    expect(renderer.draw(target, terrain, 30)).toBe(false);

    renderer.selectWorld(BATTLEFIELD_WORLDS[1]!);

    expect(renderer.needsRedraw(30)).toBe(true);
    expect(renderer.draw(target, terrain, 30)).toBe(true);
    expect(rgbaAt(pixels, 500, 120)).not.toEqual(fallbackPixel);
    expect(select).toHaveBeenCalledOnce();
    expect(rebuilds()).toBe(2);
  });

  it('freezes the first selected world until reset (kills the selectedWorld identity-only guard)', () => {
    const select = vi.fn();
    const reset = vi.fn();
    const material: MaterialStub = {
      isSettled: true,
      needsApplication: false,
      sample: () => 0,
      acknowledgeApplied() {},
      select,
      reset,
    };
    const { renderer, pixels } = rendererWith(material);
    const terrain = flatTerrain();
    const beforeHash = byteHash(terrain);
    const ember = BATTLEFIELD_WORLDS[0]!;
    const obsidian = BATTLEFIELD_WORLDS[1]!;
    const clonedEmber = {
      ...ember,
      terrainPalette: { ...ember.terrainPalette },
    } as BattlefieldWorld;

    renderer.selectWorld(ember);
    expect(renderer.draw(target, terrain, 31)).toBe(true);
    const emberPixel = rgbaAt(pixels, 500, 120);
    expect(renderer.draw(target, terrain, 31)).toBe(false);

    renderer.selectWorld(obsidian);
    expect(select).toHaveBeenCalledOnce();
    expect(renderer.draw(target, terrain, 31)).toBe(false);
    expect(rgbaAt(pixels, 500, 120)).toEqual(emberPixel);

    renderer.selectWorld(clonedEmber);

    expect(select).toHaveBeenCalledOnce();
    expect(renderer.draw(target, terrain, 31)).toBe(false);
    expect(rgbaAt(pixels, 500, 120)).toEqual(emberPixel);
    expect(byteHash(terrain)).toBe(beforeHash);

    renderer.reset();
    expect(reset).toHaveBeenCalledOnce();
    renderer.selectWorld(obsidian);

    expect(select).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenLastCalledWith(obsidian.terrainMaterialAsset);
    expect(renderer.draw(target, terrain, 31)).toBe(true);
    expect(rgbaAt(pixels, 500, 120)).toEqual([16, 24, 32, 255]);
  });

  it('renders materially distinct literal catalog palettes without mutating terrain (kills palette routing)', () => {
    const terrain = flatTerrain();
    const beforeHash = byteHash(terrain);
    const rendered = BATTLEFIELD_WORLDS.map((world) => {
      const material: MaterialStub = {
        isSettled: true,
        needsApplication: false,
        sample: () => 0,
        acknowledgeApplied() {},
        select() {},
        reset() {},
      };
      const { renderer, pixels } = rendererWith(material);

      renderer.selectWorld(world);
      expect(renderer.draw(target, terrain, 32)).toBe(true);
      expect(byteHash(terrain)).toBe(beforeHash);
      return { id: world.id, rgba: rgbaAt(pixels, 500, 120) };
    });

    expect(rendered).toEqual([
      { id: 'ember-dusk', rgba: [90, 58, 34, 255] },
      { id: 'obsidian-caldera', rgba: [16, 24, 32, 255] },
      { id: 'glassstorm-expanse', rgba: [128, 148, 156, 255] },
    ]);
  });

  it.each([
    {
      id: 'obsidian-caldera',
      asset: 'art/terrain-material-obsidian-caldera.webp',
      bandSurface: '#101820',
      expected: [16, 24, 32, 255],
    },
    {
      id: 'glassstorm-expanse',
      asset: 'art/terrain-material-glassstorm-expanse.webp',
      bandSurface: '#80949c',
      expected: [128, 148, 156, 255],
    },
  ])('applies the $id palette and matching selected material', ({
    id,
    asset,
    bandSurface,
    expected,
  }) => {
    const select = vi.fn();
    const material: MaterialStub = {
      isSettled: true,
      needsApplication: false,
      sample: () => 0,
      acknowledgeApplied() {},
      select,
      reset: vi.fn(),
    };
    const { renderer, pixels } = rendererWith(material);
    const world = {
      id,
      name: id,
      asset: `art/battlefield-${id}.webp`,
      terrainMaterialAsset: asset,
      terrainPalette: {
        rim: '#ffffff',
        mid: '#405060',
        deep: '#202830',
        bandSurface,
        bandMid: '#405060',
        bandDeep: '#202830',
        bevelShadow: '#080c10',
      },
    } as BattlefieldWorld;

    renderer.selectWorld(world);
    expect(renderer.draw(target, flatTerrain(), 1)).toBe(true);

    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(asset);
    expect(rgbaAt(pixels, 500, 120)).toEqual(expected);
  });

  it('modulates only solid interior RGB within the dirty rebuild', () => {
    let sampleCalls = 0;
    let pending = true;
    const acknowledgeApplied = vi.fn(() => {
      pending = false;
    });
    const material: MaterialStub = {
      ...NOOP_MATERIAL_LIFECYCLE,
      get isSettled() {
        return !pending;
      },
      get needsApplication() {
        return pending;
      },
      sample(x, y) {
        sampleCalls++;
        return (x + y) % 2 === 0 ? 1 : -1;
      },
      acknowledgeApplied,
    };
    const fallback: MaterialStub = {
      ...NOOP_MATERIAL_LIFECYCLE,
      isSettled: true,
      needsApplication: false,
      sample: () => 0,
      acknowledgeApplied() {},
    };
    const textured = rendererWith(material);
    const plain = rendererWith(fallback);
    const terrain = flatTerrain();
    const beforeHash = byteHash(terrain);

    expect(textured.renderer.draw(target, terrain, 4)).toBe(true);
    expect(plain.renderer.draw(target, terrain, 4)).toBe(true);

    expect(byteHash(terrain)).toBe(beforeHash);
    expect(rgbaAt(textured.pixels, 500, 100))
      .toEqual(rgbaAt(plain.pixels, 500, 100));
    expect(rgbaAt(textured.pixels, 500, 101))
      .toEqual(rgbaAt(plain.pixels, 500, 101));

    const texturedInterior = rgbaAt(textured.pixels, 500, 120);
    const plainInterior = rgbaAt(plain.pixels, 500, 120);
    expect(texturedInterior.slice(0, 3)).not.toEqual(
      plainInterior.slice(0, 3),
    );
    expect(texturedInterior[3]).toBe(plainInterior[3]);
    expect(
      texturedInterior[0]! - plainInterior[0]!,
    ).toBeGreaterThanOrEqual(10);
    for (let channel = 0; channel < 3; channel++) {
      expect(Math.abs(
        texturedInterior[channel]! - plainInterior[channel]!,
      )).toBeLessThanOrEqual(16);
    }
    const texturedDark = rgbaAt(textured.pixels, 502, 120);
    const plainDark = rgbaAt(plain.pixels, 502, 120);
    expect(
      texturedDark[0]! - plainDark[0]!,
    ).toBeLessThanOrEqual(-10);
    expect(texturedDark[3]).toBe(plainDark[3]);
    expect(sampleCalls).toBeGreaterThan(0);
    expect(acknowledgeApplied).toHaveBeenCalledOnce();
    expect(textured.renderer.isMaterialSettled).toBe(true);

    const sampledAfterRebuild = sampleCalls;
    expect(textured.renderer.draw(target, terrain, 4)).toBe(false);
    expect(sampleCalls).toBe(sampledAfterRebuild);
    expect(textured.rebuilds()).toBe(1);
  });

  it('rebuilds the same terrain version once when the material becomes ready', () => {
    let pending = false;
    let settled = false;
    let sampleValue = 0;
    const acknowledgeApplied = vi.fn(() => {
      if (!pending) return;
      pending = false;
      settled = true;
    });
    const material: MaterialStub = {
      ...NOOP_MATERIAL_LIFECYCLE,
      get isSettled() {
        return settled;
      },
      get needsApplication() {
        return pending;
      },
      sample: () => sampleValue,
      acknowledgeApplied,
    };
    const { renderer, pixels, rebuilds } = rendererWith(material);
    const terrain = flatTerrain();

    expect(renderer.draw(target, terrain, 9)).toBe(true);
    const fallbackPixel = rgbaAt(pixels, 500, 120);
    expect(renderer.draw(target, terrain, 9)).toBe(false);

    pending = true;
    sampleValue = 1;

    expect(renderer.needsRedraw(9)).toBe(true);
    expect(renderer.isMaterialSettled).toBe(false);
    expect(renderer.draw(target, terrain, 9)).toBe(true);
    expect(rgbaAt(pixels, 500, 120)).not.toEqual(fallbackPixel);
    expect(acknowledgeApplied).toHaveBeenCalledOnce();
    expect(rebuilds()).toBe(2);
    expect(renderer.needsRedraw(9)).toBe(false);
    expect(renderer.isMaterialSettled).toBe(true);
  });

  it('reapplies material to a newly exposed wall after terrain deformation', () => {
    let sampleCalls = 0;
    const material: MaterialStub = {
      ...NOOP_MATERIAL_LIFECYCLE,
      isSettled: true,
      needsApplication: false,
      sample() {
        sampleCalls++;
        return 1;
      },
      acknowledgeApplied() {},
    };
    const fallback: MaterialStub = {
      ...NOOP_MATERIAL_LIFECYCLE,
      isSettled: true,
      needsApplication: false,
      sample: () => 0,
      acknowledgeApplied() {},
    };
    const textured = rendererWith(material);
    const plain = rendererWith(fallback);
    const terrain = flatTerrain();

    expect(textured.renderer.draw(target, terrain, 12)).toBe(true);
    const callsBeforeDeformation = sampleCalls;

    for (let y = 105; y <= 125; y++) {
      terrain.fill(
        0,
        y * CANVAS_WIDTH + 490,
        y * CANVAS_WIDTH + 511,
      );
    }
    const deformedHash = byteHash(terrain);

    expect(textured.renderer.draw(target, terrain, 13)).toBe(true);
    expect(plain.renderer.draw(target, terrain, 13)).toBe(true);

    const texturedWall = rgbaAt(textured.pixels, 489, 112);
    const plainWall = rgbaAt(plain.pixels, 489, 112);
    expect(texturedWall[3]).toBeGreaterThan(0);
    expect(texturedWall[3]).toBeLessThan(255);
    expect(texturedWall.slice(0, 3)).not.toEqual(plainWall.slice(0, 3));
    expect(texturedWall[3]).toBe(plainWall[3]);
    expect(sampleCalls).toBeGreaterThan(callsBeforeDeformation);
    expect(byteHash(terrain)).toBe(deformedHash);
    expect(textured.rebuilds()).toBe(2);
  });

  it('applies material before structural bevel lighting', () => {
    const material: MaterialStub = {
      ...NOOP_MATERIAL_LIFECYCLE,
      isSettled: true,
      needsApplication: false,
      sample: () => 1,
      acknowledgeApplied() {},
    };
    const fallback: MaterialStub = {
      ...NOOP_MATERIAL_LIFECYCLE,
      isSettled: true,
      needsApplication: false,
      sample: () => 0,
      acknowledgeApplied() {},
    };
    const constantHighlight = () => () => 0.32;
    const textured = rendererWith(material, constantHighlight);
    const plain = rendererWith(fallback, constantHighlight);
    const terrain = flatTerrain();

    expect(textured.renderer.draw(target, terrain, 21)).toBe(true);
    expect(plain.renderer.draw(target, terrain, 21)).toBe(true);

    const texturedPixel = rgbaAt(textured.pixels, 500, 120);
    const plainPixel = rgbaAt(plain.pixels, 500, 120);
    expect(texturedPixel[0]! - plainPixel[0]!).toBe(10);
    expect(texturedPixel[3]).toBe(plainPixel[3]);
  });
});
