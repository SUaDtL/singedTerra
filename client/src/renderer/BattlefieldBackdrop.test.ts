import { describe, expect, it, vi } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import {
  BATTLEFIELD_WORLDS,
  BattlefieldBackdrop,
  centeredCoverCrop,
  selectBattlefieldWorld,
  type BackdropImageFactory,
} from './BattlefieldBackdrop';

interface ControlledImage {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

function controlledImage(): ControlledImage {
  return {
    src: '',
    naturalWidth: 0,
    naturalHeight: 0,
    onload: null,
    onerror: null,
  };
}

function pooledFactory(): {
  factory: BackdropImageFactory;
  images: ControlledImage[];
} {
  const images: ControlledImage[] = [];
  return {
    factory: () => {
      const image = controlledImage();
      images.push(image);
      return image as unknown as HTMLImageElement;
    },
    images,
  };
}

function terrainFixture(marker: number): Uint8Array {
  const terrain = new Uint8Array(4_096);
  for (let index = 0; index < terrain.length; index++) {
    terrain[index] = (marker * 31 + index * 17) & 0xff;
  }
  return terrain;
}

describe('battlefield world catalog', () => {
  it('declares three unique project-owned worlds with stable ids and assets', () => {
    expect(BATTLEFIELD_WORLDS).toHaveLength(3);
    expect(new Set(BATTLEFIELD_WORLDS.map(({ id }) => id)).size).toBe(3);
    expect(new Set(BATTLEFIELD_WORLDS.map(({ asset }) => asset)).size).toBe(3);
    expect(BATTLEFIELD_WORLDS.map(({ id }) => id)).toEqual([
      'ember-dusk',
      'obsidian-caldera',
      'glassstorm-expanse',
    ]);
    for (const world of BATTLEFIELD_WORLDS) {
      expect(world.name.length).toBeGreaterThan(3);
      expect(world.asset).toMatch(/^art\/battlefield-[a-z-]+\.webp$/);
    }
  });

  it('binds each panorama to one immutable material and complete terrain palette', () => {
    expect(new Set(BATTLEFIELD_WORLDS.map(
      (world) => world.terrainMaterialAsset,
    ))).toEqual(new Set([
      'art/terrain-material.webp',
      'art/terrain-material-obsidian-caldera.webp',
      'art/terrain-material-glassstorm-expanse.webp',
    ]));

    for (const world of BATTLEFIELD_WORLDS) {
      expect(Object.isFrozen(world)).toBe(true);
      expect(Object.isFrozen(world.terrainPalette)).toBe(true);
      expect(Object.keys(world.terrainPalette).sort()).toEqual([
        'bandDeep',
        'bandMid',
        'bandSurface',
        'bevelShadow',
        'deep',
        'mid',
        'rim',
      ]);
      for (const color of Object.values(world.terrainPalette)) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('selects deterministically and makes every catalog world reachable', () => {
    const seen = new Set<string>();
    for (let marker = 0; marker < 256; marker++) {
      const terrain = terrainFixture(marker);
      const first = selectBattlefieldWorld(terrain);
      const copy = selectBattlefieldWorld(terrain.slice());
      expect(copy).toBe(first);
      seen.add(first.id);
    }
    expect(seen).toEqual(new Set(BATTLEFIELD_WORLDS.map(({ id }) => id)));
  });
});

describe('centeredCoverCrop', () => {
  it('centers a horizontal crop when the source is wider than the destination', () => {
    expect(centeredCoverCrop(2_000, 1_000, 1_600, 1_000)).toEqual({
      sx: 200,
      sy: 0,
      width: 1_600,
      height: 1_000,
    });
  });

  it('centers a vertical crop when the source is taller than the destination', () => {
    expect(centeredCoverCrop(1_600, 1_200, 1_600, 1_000)).toEqual({
      sx: 0,
      sy: 100,
      width: 1_600,
      height: 1_000,
    });
  });
});

describe('BattlefieldBackdrop', () => {
  it('loads only the selected world and freezes it for the current game', () => {
    const { factory, images } = pooledFactory();
    const backdrop = new BattlefieldBackdrop(factory, '/singedTerra/');
    const initialTerrain = terrainFixture(3);
    const chosen = selectBattlefieldWorld(initialTerrain);

    expect(images).toHaveLength(0);
    expect(backdrop.selectedWorld).toBeNull();
    expect(backdrop.draw({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D))
      .toBe(false);

    expect(backdrop.select(initialTerrain)).toBe(chosen);
    expect(images).toHaveLength(1);
    expect(images[0]!.src).toBe(`/singedTerra/${chosen.asset}`);
    expect(backdrop.selectedWorld).toBe(chosen);
    expect(backdrop.state).toBe('loading');

    const differentTerrain = terrainFixture(97);
    expect(backdrop.select(differentTerrain)).toBe(chosen);
    expect(images).toHaveLength(1);
  });

  it('draws a valid decoded panorama with an aspect-preserving centered cover crop', () => {
    const { factory, images } = pooledFactory();
    const backdrop = new BattlefieldBackdrop(factory, '/');
    const drawImage = vi.fn();
    backdrop.select(terrainFixture(8));
    const image = images[0]!;

    image.naturalWidth = 1_774;
    image.naturalHeight = 887;
    image.onload?.();

    expect(backdrop.state).toBe('ready');
    expect(backdrop.isSettled).toBe(false);
    expect(backdrop.draw({ drawImage } as unknown as CanvasRenderingContext2D))
      .toBe(true);
    expect(backdrop.isSettled).toBe(true);
    expect(drawImage).toHaveBeenCalledOnce();

    const call = drawImage.mock.calls[0]!;
    expect(call[0]).toBe(image);
    expect(CANVAS_WIDTH / CANVAS_HEIGHT).toBe(2);
    expect(call[1]).toBe(0);
    expect(call[2]).toBe(0);
    expect(call[3]).toBe(1_774);
    expect(call[4]).toBe(887);
    expect(call.slice(5)).toEqual([0, 0, CANVAS_WIDTH, CANVAS_HEIGHT]);
    expect(call[3] / call[4]).toBeCloseTo(CANVAS_WIDTH / CANVAS_HEIGHT, 8);
  });

  it('preserves source geometry while overscanning translated battlefield edges', () => {
    const { factory, images } = pooledFactory();
    const backdrop = new BattlefieldBackdrop(factory, '/');
    const drawImage = vi.fn();
    backdrop.select(terrainFixture(9));
    const image = images[0]!;
    image.naturalWidth = 1_774;
    image.naturalHeight = 887;
    image.onload?.();

    expect(backdrop.draw(
      { drawImage } as unknown as CanvasRenderingContext2D,
      16,
    )).toBe(true);
    const call = drawImage.mock.calls[0]!;
    expect(call.slice(5)).toEqual([
      -16,
      -8,
      CANVAS_WIDTH + 32,
      CANVAS_HEIGHT + 16,
    ]);
    expect(call[1]).toBe(0);
    expect(call[2]).toBe(0);
    expect(call[3]).toBe(1_774);
    expect(call[4]).toBe(887);
    expect(call[3] / call[4]).toBeCloseTo(
      (CANVAS_WIDTH + 32) / (CANVAS_HEIGHT + 16),
      8,
    );
  });

  it('resets for a new game and ignores callbacks from the retired image', () => {
    const { factory, images } = pooledFactory();
    const backdrop = new BattlefieldBackdrop(factory, '/');
    backdrop.select(terrainFixture(1));
    const retired = images[0]!;

    backdrop.reset();
    expect(backdrop.selectedWorld).toBeNull();
    backdrop.select(terrainFixture(2));
    const current = images[1]!;
    expect(current).toBeDefined();

    retired.naturalWidth = 1_774;
    retired.naturalHeight = 887;
    retired.onload?.();
    expect(backdrop.state).toBe('loading');

    current.naturalWidth = 1_774;
    current.naturalHeight = 887;
    current.onload?.();
    expect(backdrop.state).toBe('ready');

    retired.onerror?.();
    expect(backdrop.state).toBe('ready');
  });

  it.each([
    {
      name: 'network or decode error',
      settle(image: ControlledImage): void {
        image.onerror?.();
      },
    },
    {
      name: 'wrong decoded aspect ratio',
      settle(image: ControlledImage): void {
        image.naturalWidth = 1_774;
        image.naturalHeight = 900;
        image.onload?.();
      },
    },
    {
      name: 'zero decoded dimensions',
      settle(image: ControlledImage): void {
        image.onload?.();
      },
    },
  ])('fails closed for $name', ({ settle }) => {
    const { factory, images } = pooledFactory();
    const backdrop = new BattlefieldBackdrop(factory, '/');
    const drawImage = vi.fn();
    backdrop.select(terrainFixture(5));

    settle(images[0]!);

    expect(backdrop.state).toBe('failed');
    expect(backdrop.isSettled).toBe(true);
    expect(backdrop.draw({ drawImage } as unknown as CanvasRenderingContext2D))
      .toBe(false);
    expect(drawImage).not.toHaveBeenCalled();
  });
});
