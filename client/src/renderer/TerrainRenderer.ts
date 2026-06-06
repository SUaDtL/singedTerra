/**
 * TerrainRenderer fills a polygon from the height map down to the canvas
 * bottom. Per SPEC §7 the terrain is re-rendered only when its dirty flag
 * is set (one beginPath, iterate columns, lineTo, close).
 */
export class TerrainRenderer {
  /** @param terrain height map: terrain[x] = surface y at column x. */
  draw(_ctx: CanvasRenderingContext2D, _terrain: number[]): void {
    throw new Error('TerrainRenderer.draw not implemented');
  }
}
