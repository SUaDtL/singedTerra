import { describe, expect, it, vi } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { TerrainRenderer } from './TerrainRenderer';
import { createTerrainBevelSampler } from './terrainBevelLighting';

interface TerrainRendererSeam {
  offscreen: HTMLCanvasElement;
  offCtx: CanvasRenderingContext2D;
  imageData: ImageData;
}

function rgbaAt(
  data: Uint8ClampedArray,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const offset = (y * CANVAS_WIDTH + x) * 4;
  return [
    data[offset],
    data[offset + 1],
    data[offset + 2],
    data[offset + 3],
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

describe('TerrainRenderer directional bevel lighting', () => {
  it('gives opposite crater walls cached light and shadow without touching terrain or alpha', () => {
    const pixels = new Uint8ClampedArray(CANVAS_WIDTH * CANVAS_HEIGHT * 4);
    let rebuilds = 0;
    let blits = 0;
    const samplerFactory = vi.fn(createTerrainBevelSampler);
    const renderer = new TerrainRenderer(samplerFactory);
    const seam = renderer as unknown as TerrainRendererSeam;
    seam.offscreen = {} as HTMLCanvasElement;
    seam.offCtx = {
      putImageData() { rebuilds++; },
    } as unknown as CanvasRenderingContext2D;
    seam.imageData = { data: pixels } as ImageData;
    const ctx = {
      drawImage() { blits++; },
    } as unknown as CanvasRenderingContext2D;

    const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    for (let y = 100; y < CANVAS_HEIGHT; y++) {
      terrain.fill(1, y * CANVAS_WIDTH, (y + 1) * CANVAS_WIDTH);
    }
    for (let y = 200; y <= 350; y++) {
      terrain.fill(0, y * CANVAS_WIDTH + 600, y * CANVAS_WIDTH + 620);
    }
    const beforeHash = byteHash(terrain);

    expect(renderer.draw(ctx, terrain, 9)).toBe(true);

    // Upper-left illumination: the left crater wall faces right and falls into
    // cool shadow, while the right wall faces left and catches warm light.
    expect(rgbaAt(pixels, 599, 275)).toEqual([25, 15, 14, 231]);
    expect(rgbaAt(pixels, 620, 275)).toEqual([51, 33, 19, 231]);
    expect(rgbaAt(pixels, 596, 275)).toEqual([29, 18, 11, 255]);
    expect(byteHash(terrain)).toBe(beforeHash);

    // Lighting lives in the existing version cache: a stable frame only blits.
    expect(renderer.draw(ctx, terrain, 9)).toBe(false);
    expect(samplerFactory).toHaveBeenCalledTimes(1);
    expect(rebuilds).toBe(1);
    expect(blits).toBe(2);

    expect(renderer.draw(ctx, terrain, 10)).toBe(true);
    expect(samplerFactory).toHaveBeenCalledTimes(2);
    expect(rebuilds).toBe(2);
    expect(blits).toBe(3);
  });

  it('does not cache a malformed rebuild over a corrected same-version bitmap', () => {
    const pixels = new Uint8ClampedArray(CANVAS_WIDTH * CANVAS_HEIGHT * 4);
    let rebuilds = 0;
    const samplerFactory = vi.fn(createTerrainBevelSampler);
    const renderer = new TerrainRenderer(samplerFactory);
    const seam = renderer as unknown as TerrainRendererSeam;
    seam.offscreen = {} as HTMLCanvasElement;
    seam.offCtx = {
      putImageData() { rebuilds++; },
    } as unknown as CanvasRenderingContext2D;
    seam.imageData = { data: pixels } as ImageData;
    const ctx = { drawImage() {} } as unknown as CanvasRenderingContext2D;

    expect(renderer.draw(ctx, new Uint8Array(0), 12)).toBe(false);
    expect(renderer.needsRedraw(12)).toBe(true);
    expect(rebuilds).toBe(0);

    expect(renderer.draw(
      ctx,
      new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT),
      12,
    )).toBe(true);
    expect(renderer.needsRedraw(12)).toBe(false);
    expect(samplerFactory).toHaveBeenCalledTimes(2);
    expect(rebuilds).toBe(1);
  });
});
