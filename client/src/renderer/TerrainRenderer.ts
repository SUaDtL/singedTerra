import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@shared/engine/Terrain';

/** Earthy crater-brown fill for the ground polygon. */
const TERRAIN_FILL = '#6b4a2b';

/**
 * TerrainRenderer fills ONE polygon from the height map down to the canvas
 * bottom (SPEC §7 layer 2). Per the convention, terrain[x] is the surface
 * y-coordinate at column x, and ground occupies y from terrain[x] down to
 * CANVAS_HEIGHT.
 *
 * Dirty-flag pattern (SPEC §7): re-tessellating an 800-point polygon every
 * frame is wasteful on a t3.micro, and terrain only changes when a crater
 * deforms it. This renderer tracks a version token derived from the terrain
 * array's contents; {@link draw} skips the redraw work when the supplied
 * terrain is unchanged since the last actual paint.
 *
 * Usage:
 *   const tr = new TerrainRenderer();
 *   // In the frame loop, after acquiring state:
 *   tr.draw(ctx, state.terrain);   // paints only when terrain changed
 *
 * The renderer self-detects change by hashing the array, so callers do not
 * have to manage dirtiness. Two explicit hooks are also provided for callers
 * that prefer to drive it manually:
 *   - markDirty(): force the next draw() to repaint (e.g. after a known crater,
 *     or after the canvas/context was cleared by another layer).
 *   - needsRedraw(terrain): returns whether the next draw() would repaint,
 *     without painting — useful for orchestrators that batch layer redraws.
 *
 * IMPORTANT: because other layers (sky, tanks) share the canvas and the frame
 * is typically cleared/repainted as a whole, the orchestrating Renderer should
 * call markDirty() whenever it clears the region under the terrain so the
 * polygon is repainted on the next frame. For an isolated/cached terrain layer
 * the self-hashing alone suffices.
 */
export class TerrainRenderer {
  /** Hash of the terrain contents at the last actual paint; null => never painted. */
  private lastHash: number | null = null;
  /** When true, the next draw() repaints regardless of the hash compare. */
  private forceRedraw = true;

  /**
   * Fill the terrain polygon if the terrain changed since the last paint (or a
   * redraw was forced). Returns true if it painted this call, false if skipped.
   *
   * @param ctx     2D context (already sized to CANVAS_WIDTH x CANVAS_HEIGHT).
   * @param terrain Height map: terrain[x] = surface y at column x.
   */
  draw(ctx: CanvasRenderingContext2D, terrain: number[]): boolean {
    const hash = this.hash(terrain);
    if (!this.forceRedraw && hash === this.lastHash) return false;

    this.paint(ctx, terrain);
    this.lastHash = hash;
    this.forceRedraw = false;
    return true;
  }

  /** Force the next draw() to repaint regardless of terrain change. */
  markDirty(): void {
    this.forceRedraw = true;
  }

  /**
   * Whether the next draw() with this terrain would repaint (dirty), without
   * painting. True if a redraw is forced or the terrain differs from the last
   * painted state.
   */
  needsRedraw(terrain: number[]): boolean {
    return this.forceRedraw || this.hash(terrain) !== this.lastHash;
  }

  /** Emit the single ground polygon: surface across the top, canvas bottom closing it off. */
  private paint(ctx: CanvasRenderingContext2D, terrain: number[]): void {
    const w = Math.min(CANVAS_WIDTH, terrain.length);

    ctx.beginPath();
    ctx.moveTo(0, terrain[0]);
    for (let x = 1; x < w; x++) {
      ctx.lineTo(x, terrain[x]);
    }
    // Down the right edge, across the bottom, back up the left edge, close.
    ctx.lineTo(CANVAS_WIDTH, terrain[w - 1]);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.lineTo(0, CANVAS_HEIGHT);
    ctx.closePath();

    ctx.fillStyle = TERRAIN_FILL;
    ctx.fill();
  }

  /**
   * Cheap order-sensitive content hash of the height map (FNV-1a style, kept in
   * 32-bit range). Used purely to detect "did the terrain change" between
   * frames; not a security hash. Deterministic for identical arrays.
   */
  private hash(terrain: number[]): number {
    let h = 0x811c9dc5;
    for (let x = 0; x < terrain.length; x++) {
      h ^= terrain[x] | 0;
      // h *= 16777619, kept in 32-bit unsigned range without 64-bit drift.
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
}
