/** Maximum inward reach of the cached terrain bevel, in solid pixels. */
export const TERRAIN_BEVEL_DEPTH = 3;
/** Exact highlight/shadow blend strength by distance from exposed air. */
export const TERRAIN_BEVEL_FALLOFF: readonly number[] = Object.freeze([
  0.32,
  0.18,
  0.08,
]);

const SIDE_LIGHT_WEIGHT = 0.75;

/**
 * Fast sampler for integer coordinates already proven inside its terrain frame.
 * `createTerrainBevelSampler` validates the snapshot once; the caller owns the
 * hot-loop coordinate contract.
 */
export type TerrainBevelSampler = (x: number, y: number) => number;

/**
 * Validate one terrain snapshot and return its bounded bevel sampler.
 *
 * TerrainRenderer creates this once per version-triggered rebuild, keeping
 * geometry validation outside its large pixel loop.
 */
export function createTerrainBevelSampler(
  terrain: Uint8Array,
  width: number,
  height: number,
): TerrainBevelSampler | null {
  const area = width * height;
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
    || !Number.isSafeInteger(area)
    || terrain.length !== area
  ) {
    return null;
  }

  return (x: number, y: number): number => {
    if (terrain[y * width + x] !== 1) return 0;

    let up = 0;
    let down = 0;
    let left = 0;
    let right = 0;
    for (let distance = 1; distance <= TERRAIN_BEVEL_DEPTH; distance++) {
      const strength = TERRAIN_BEVEL_FALLOFF[distance - 1] ?? 0;
      const northY = y - distance;
      const southY = y + distance;
      const westX = x - distance;
      const eastX = x + distance;

      // Beyond-frame samples are sealed solid, not exposed air. Each direction
      // latches its nearest air sample.
      if (up === 0 && northY >= 0 && terrain[northY * width + x] !== 1) {
        up = strength;
      }
      if (down === 0 && southY < height && terrain[southY * width + x] !== 1) {
        down = strength;
      }
      if (left === 0 && westX >= 0 && terrain[y * width + westX] !== 1) {
        left = strength;
      }
      if (right === 0 && eastX < width && terrain[y * width + eastX] !== 1) {
        right = strength;
      }
    }

    const highlight = Math.max(up, left * SIDE_LIGHT_WEIGHT);
    const shadow = Math.max(down, right * SIDE_LIGHT_WEIGHT);
    const light = highlight - shadow;
    return light === 0 ? 0 : light;
  };
}

/**
 * Derive signed directional light for one solid terrain pixel.
 *
 * Positive values blend toward the warm rim palette; negative values blend
 * toward cool backdrop shadow. Samples outside the bitmap count as solid so
 * the world frame remains visually sealed.
 */
export function terrainBevelLight(
  terrain: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (
    !Number.isInteger(x)
    || !Number.isInteger(y)
    || x < 0
    || x >= width
    || y < 0
    || y >= height
  ) {
    return 0;
  }
  return createTerrainBevelSampler(terrain, width, height)?.(x, y) ?? 0;
}
