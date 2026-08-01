import { describe, expect, it } from 'vitest';
import { terrainEdgeAlpha } from './terrainEdges';

function bitmap(rows: string[]): Uint8Array {
  return Uint8Array.from(rows.join('').replaceAll('.', '0').replaceAll('#', '1'), Number);
}

describe('terrainEdgeAlpha', () => {
  it('keeps air transparent and surrounded terrain opaque without mutating the bitmap', () => {
    const terrain = bitmap([
      '###',
      '###',
      '###',
    ]);
    const before = terrain.slice();

    expect(terrainEdgeAlpha(terrain, 3, 3, 1, 1)).toBe(255);
    expect(terrainEdgeAlpha(bitmap(['.']), 1, 1, 0, 0)).toBe(0);
    expect(terrain).toEqual(before);
  });

  it('softens flat and vertical edges consistently and exposes corners more', () => {
    const flat = bitmap([
      '...',
      '###',
      '###',
    ]);
    const vertical = bitmap([
      '.##',
      '.##',
      '.##',
    ]);
    const corner = bitmap([
      '...',
      '.##',
      '.##',
    ]);

    const flatAlpha = terrainEdgeAlpha(flat, 3, 3, 1, 1);
    const verticalAlpha = terrainEdgeAlpha(vertical, 3, 3, 1, 1);
    const cornerAlpha = terrainEdgeAlpha(corner, 3, 3, 1, 1);

    expect(flatAlpha).toBe(231);
    expect(verticalAlpha).toBe(flatAlpha);
    expect(cornerAlpha).toBe(215);
    expect(cornerAlpha).toBeLessThan(flatAlpha);
    expect(cornerAlpha).toBeGreaterThanOrEqual(191);
  });

  it('treats samples outside the world frame as solid', () => {
    const terrain = bitmap([
      '##',
      '##',
    ]);

    expect(terrainEdgeAlpha(terrain, 2, 2, 0, 0)).toBe(255);
  });

  it('softens diagonal-only exposure instead of treating cardinal enclosure as interior', () => {
    const terrain = bitmap([
      '###',
      '###',
      '##.',
    ]);

    expect(terrainEdgeAlpha(terrain, 3, 3, 1, 1)).toBe(247);
  });

  it('treats absent storage in a truncated interior bitmap as air', () => {
    // Logical 3×3 center is present at index 4; the four later neighbor slots
    // are absent rather than leaking `undefined` into the alpha calculation.
    const truncated = Uint8Array.from([1, 1, 1, 1, 1]);

    expect(terrainEdgeAlpha(truncated, 3, 3, 1, 1)).toBe(223);
  });

  it('maps every local coverage level monotonically from isolated debris to interior', () => {
    const neighbors = [
      [0, 0], [1, 0], [2, 0], [0, 1],
      [2, 1], [0, 2], [1, 2], [2, 2],
    ] as const;
    const alphas: number[] = [];

    for (let count = 0; count <= neighbors.length; count++) {
      const terrain = new Uint8Array(9);
      terrain[4] = 1;
      for (const [x, y] of neighbors.slice(0, count)) terrain[y * 3 + x] = 1;
      alphas.push(terrainEdgeAlpha(terrain, 3, 3, 1, 1));
    }

    expect(alphas).toEqual([191, 199, 207, 215, 223, 231, 239, 247, 255]);
  });
});
