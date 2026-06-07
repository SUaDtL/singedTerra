import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@shared/engine/Terrain';
import { TERRAIN, hexToRgb } from '../ui/theme';

/**
 * Scorched depth ramp (banner palette): a LIT RIM on the top 2px of every solid
 * run, then a shade from `top` → `mid` → `deep` over the first ~120px of depth.
 * Gives the terrain dimensional, scorched body + a lit surface edge instead of a
 * flat brown slab. Parsed once at module load.
 */
const RIM = hexToRgb(TERRAIN.rim);
const TOP = hexToRgb(TERRAIN.top);
const MID = hexToRgb(TERRAIN.mid);
const DEEP = hexToRgb(TERRAIN.deep);
/** Depth (px below the lit rim) over which top→mid→deep fully ramps. */
const RAMP_DEPTH = 120;

/**
 * TerrainRenderer paints the pixel terrain bitmap (SPEC §7 layer 2). The terrain
 * is now a Uint8Array of length CANVAS_WIDTH*CANVAS_HEIGHT (index y*WIDTH + x,
 * 0 = air, 1 = solid), deformed pixel-by-pixel on explosions — no longer a single
 * height-line polygon.
 *
 * Approach — OFFSCREEN COMPOSITE: an offscreen HTMLCanvasElement (800x500) holds
 * the rendered terrain as an ImageData where solid pixels are the opaque brown
 * fill and air pixels are fully TRANSPARENT (alpha 0). The expensive
 * per-pixel ImageData rebuild + putImageData runs ONLY when the bitmap content
 * changes (detected by an FNV hash over the Uint8Array) or a redraw is forced.
 * EVERY draw() call then composites that offscreen onto the main ctx with
 * ctx.drawImage — which alpha-blends, so the transparent air pixels let the sky
 * layer beneath show through. (We deliberately do NOT putImageData onto the main
 * ctx: putImageData overwrites pixels wholesale and would erase the sky.)
 *
 * Dirty-flag pattern (SPEC §7): rebuilding the 400k-pixel ImageData every frame
 * is wasteful on a t3.micro, and terrain only changes when a crater deforms it.
 * The self-hashing means callers do not have to manage dirtiness; two explicit
 * hooks are also provided:
 *   - markDirty(): force the next draw() to rebuild the offscreen.
 *   - needsRedraw(terrain): whether the next draw() would rebuild, without doing
 *     it — useful for orchestrators that batch layer redraws.
 *
 * Usage:
 *   const tr = new TerrainRenderer();
 *   tr.draw(ctx, state.terrain);   // blits every frame; rebuilds only on change
 */
export class TerrainRenderer {
  /** Lazily-created offscreen canvas holding the composited terrain (800x500). */
  private offscreen: HTMLCanvasElement | null = null;
  /** 2D context of {@link offscreen}. */
  private offCtx: CanvasRenderingContext2D | null = null;
  /** Reusable ImageData buffer for the offscreen rebuild (avoids reallocation). */
  private imageData: ImageData | null = null;

  /** Hash of the bitmap contents at the last rebuild; null => never rebuilt. */
  private lastHash: number | null = null;
  /** When true, the next draw() rebuilds the offscreen regardless of the hash. */
  private forceRedraw = true;

  /**
   * Composite the terrain onto ctx. The offscreen is rebuilt only if the bitmap
   * changed since the last rebuild (or a redraw was forced); the blit happens on
   * every call so the terrain is always present even when nothing changed.
   *
   * @param ctx     2D context (sized CANVAS_WIDTH x CANVAS_HEIGHT).
   * @param terrain Pixel bitmap: index y*CANVAS_WIDTH + x, 0 = air, 1 = solid.
   * @returns true if it rebuilt the offscreen this call, false if it only blitted.
   */
  draw(ctx: CanvasRenderingContext2D, terrain: Uint8Array): boolean {
    const off = this.ensureOffscreen();

    const hash = this.hash(terrain);
    let rebuilt = false;
    if (this.forceRedraw || hash !== this.lastHash) {
      this.rebuild(terrain);
      this.lastHash = hash;
      this.forceRedraw = false;
      rebuilt = true;
    }

    // drawImage alpha-composites: transparent air pixels reveal the sky beneath.
    ctx.drawImage(off, 0, 0);
    return rebuilt;
  }

  /** Force the next draw() to rebuild the offscreen regardless of bitmap change. */
  markDirty(): void {
    this.forceRedraw = true;
  }

  /**
   * Whether the next draw() with this terrain would rebuild the offscreen (dirty),
   * without rebuilding. True if a redraw is forced or the bitmap differs from the
   * last rebuilt state.
   */
  needsRedraw(terrain: Uint8Array): boolean {
    return this.forceRedraw || this.hash(terrain) !== this.lastHash;
  }

  /** Lazily create the offscreen canvas + its context and ImageData buffer. */
  private ensureOffscreen(): HTMLCanvasElement {
    if (this.offscreen === null) {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      const offCtx = canvas.getContext('2d');
      if (!offCtx) throw new Error('Failed to acquire offscreen 2D context');
      this.offscreen = canvas;
      this.offCtx = offCtx;
      this.imageData = offCtx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    return this.offscreen;
  }

  /**
   * Rebuild the offscreen ImageData from the bitmap: solid pixels => opaque
   * SCORCHED-RAMP fill (lit rim on top, darkening with depth), air pixels =>
   * alpha 0 (transparent). Iterated PER COLUMN so each solid run's depth-from-its-
   * own-surface drives the shade — so overhangs/cave lips also get a lit rim.
   * No per-pixel allocation (writes straight into the Uint8ClampedArray). Runs
   * only on bitmap change, so the per-pixel ramp math stays off the frame budget.
   */
  private rebuild(terrain: Uint8Array): void {
    const offCtx = this.offCtx;
    const img = this.imageData;
    if (offCtx === null || img === null) return; // ensureOffscreen ran first

    const data = img.data;
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    for (let x = 0; x < W; x++) {
      let depth = -1; // -1 = in air; resets at every air gap (fresh rim per run)
      for (let y = 0; y < H; y++) {
        const o = (y * W + x) * 4;
        if (terrain[y * W + x] === 1) {
          depth++;
          let r: number;
          let g: number;
          let b: number;
          if (depth < 2) {
            r = RIM[0]; g = RIM[1]; b = RIM[2]; // lit surface edge
          } else {
            const t = Math.min((depth - 2) / RAMP_DEPTH, 1);
            if (t < 0.5) {
              const u = t * 2; // top -> mid
              r = TOP[0] + (MID[0] - TOP[0]) * u;
              g = TOP[1] + (MID[1] - TOP[1]) * u;
              b = TOP[2] + (MID[2] - TOP[2]) * u;
            } else {
              const u = (t - 0.5) * 2; // mid -> deep
              r = MID[0] + (DEEP[0] - MID[0]) * u;
              g = MID[1] + (DEEP[1] - MID[1]) * u;
              b = MID[2] + (DEEP[2] - MID[2]) * u;
            }
          }
          data[o] = r;
          data[o + 1] = g;
          data[o + 2] = b;
          data[o + 3] = 255; // opaque solid ground
        } else {
          depth = -1;
          data[o + 3] = 0; // transparent air — sky shows through on composite
        }
      }
    }
    offCtx.putImageData(img, 0, 0);
  }

  /**
   * Cheap order-sensitive content hash of the bitmap (FNV-1a style, kept in
   * 32-bit range). Used purely to detect "did the terrain change" between frames;
   * not a security hash. Deterministic for identical bitmaps.
   */
  private hash(terrain: Uint8Array): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < terrain.length; i++) {
      h ^= terrain[i];
      // h *= 16777619, kept in 32-bit unsigned range without 64-bit drift.
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
}
