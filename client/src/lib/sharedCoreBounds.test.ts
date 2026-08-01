import { describe, expect, it } from 'vitest';
import { createTank } from '@shared/engine/Tank';
import {
  BITMAP_LEN,
  CANVAS_HEIGHT,
  buildBitmap,
  pixelAt,
} from '@shared/engine/Terrain';

describe('shared core malformed-array boundaries', () => {
  it('keeps an empty height line from leaking undefined into tank state', () => {
    const tank = createTank('p1', 'Player 1', 0, [], '#e84d4d');

    expect(tank.y).toBe(CANVAS_HEIGHT);
  });

  it('treats missing bitmap storage as air', () => {
    expect(pixelAt(new Uint8Array(0), 0, 0)).toBe(0);
  });

  it('rasterizes missing height columns as empty terrain', () => {
    const bitmap = buildBitmap(new Uint16Array(0));

    expect(bitmap).toHaveLength(BITMAP_LEN);
    expect(bitmap.some((pixel) => pixel !== 0)).toBe(false);
  });
});
