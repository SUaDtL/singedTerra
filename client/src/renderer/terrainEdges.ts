/**
 * Lowest opacity assigned to a solid terrain pixel with no solid neighbors.
 * The pixel remains visually present while the sky can soften its hard square edge.
 */
const MIN_SOLID_ALPHA = 191;
const ALPHA_RANGE = 255 - MIN_SOLID_ALPHA;

/**
 * Derive render-only opacity for one binary terrain sample.
 *
 * Gameplay continues to use the untouched 0/1 bitmap. Only the cached Canvas
 * texture consumes this local eight-neighbor coverage. Samples beyond the world
 * frame count as solid so the left, right, and bottom bounds remain fully sealed.
 */
export function terrainEdgeAlpha(
  terrain: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const index = y * width + x;
  if ((terrain[index] ?? 0) === 0) return 0;

  // Nearly every solid pixel is deep interior. Unroll its in-bounds neighborhood
  // so the terrain-version rebuild avoids loop/bounds overhead without skipping
  // diagonal-only exposure.
  if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
    const solidNeighbors =
      Number((terrain[index - width - 1] ?? 0) > 0)
      + Number((terrain[index - width] ?? 0) > 0)
      + Number((terrain[index - width + 1] ?? 0) > 0)
      + Number((terrain[index - 1] ?? 0) > 0)
      + Number((terrain[index + 1] ?? 0) > 0)
      + Number((terrain[index + width - 1] ?? 0) > 0)
      + Number((terrain[index + width] ?? 0) > 0)
      + Number((terrain[index + width + 1] ?? 0) > 0);
    return MIN_SOLID_ALPHA + Math.round(ALPHA_RANGE * solidNeighbors / 8);
  }

  let solidNeighbors = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (
        nx < 0
        || nx >= width
        || ny < 0
        || ny >= height
        || (terrain[ny * width + nx] ?? 0) > 0
      ) {
        solidNeighbors++;
      }
    }
  }

  return MIN_SOLID_ALPHA + Math.round(ALPHA_RANGE * solidNeighbors / 8);
}
