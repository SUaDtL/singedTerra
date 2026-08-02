import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { TerrainRenderer } from './TerrainRenderer';

interface TerrainRendererSeam {
  offscreen: HTMLCanvasElement;
  offCtx: CanvasRenderingContext2D;
  imageData: ImageData;
}

function requiredNumber(value: number | undefined, label: string): number {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function alphaAt(data: Uint8ClampedArray, x: number, y: number): number {
  return requiredNumber(data[(y * CANVAS_WIDTH + x) * 4 + 3], 'terrain alpha');
}

function byteHash(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

describe('TerrainRenderer edge compositing', () => {
  it('writes coverage alpha into rebuilt ImageData and retains the version cache', () => {
    const data = new Uint8ClampedArray(CANVAS_WIDTH * CANVAS_HEIGHT * 4);
    let rebuilds = 0;
    let blits = 0;
    const renderer = new TerrainRenderer();
    const seam = renderer as unknown as TerrainRendererSeam;
    seam.offscreen = {} as HTMLCanvasElement;
    seam.offCtx = {
      putImageData() { rebuilds++; },
    } as unknown as CanvasRenderingContext2D;
    seam.imageData = { data } as ImageData;
    const ctx = {
      drawImage() { blits++; },
    } as unknown as CanvasRenderingContext2D;
    const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    const probeX = 900;
    for (let y = 50; y <= 52; y++) {
      for (let x = probeX - 1; x <= probeX + 1; x++) terrain[y * CANVAS_WIDTH + x] = 1;
    }
    const beforeHash = byteHash(terrain);

    expect(renderer.draw(ctx, terrain, 7)).toBe(true);
    expect(alphaAt(data, probeX, 49)).toBe(0);
    expect(alphaAt(data, probeX, 50)).toBe(231);
    expect(alphaAt(data, probeX, 51)).toBe(255);
    expect(byteHash(terrain)).toBe(beforeHash);

    expect(renderer.draw(ctx, terrain, 7)).toBe(false);
    expect(rebuilds).toBe(1);
    expect(blits).toBe(2);

    expect(renderer.draw(ctx, terrain, 8)).toBe(true);
    expect(rebuilds).toBe(2);
    expect(blits).toBe(3);
  });
});
