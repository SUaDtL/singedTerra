import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@shared/engine/Terrain';
import { TERRAIN, hexToRgb } from '../ui/theme';
import { bandFloatForY } from './strata';

/**
 * Scorched depth ramp (banner palette): a LIT RIM on the top 2px of every solid
 * run, then a shade from `top` → `mid` → `deep` over the first ~120px of depth.
 * Gives the terrain dimensional, scorched body + a lit surface edge instead of a
 * flat brown slab. Parsed once at module load.
 */
const RIM = hexToRgb(TERRAIN.rim);
const MID = hexToRgb(TERRAIN.mid);
const DEEP = hexToRgb(TERRAIN.deep);
/** Depth (px below the lit rim) over which top→mid→deep fully ramps. */
const RAMP_DEPTH = 120;

/**
 * Strata band BASE colors (T7). Each band supplies a starting RGB that the
 * depth-ramp blends FROM, so the surface rim/ramp still reads correctly but
 * deeper craters expose visually distinct rock layers.
 *
 * Band 0 (surface earth): warm brown — same family as TOP, nearly imperceptible
 * without a crater cut, ensuring the unmodified surface looks unchanged.
 * Band 1 (mid rock): cooler sandstone-shifted brown, visible in medium craters.
 * Band 2 (deep rock): dark purple-rock, visible only in the deepest craters.
 */
const BAND_COLORS: [[number, number, number], [number, number, number], [number, number, number]] = [
  hexToRgb(TERRAIN.bandSurface),
  hexToRgb(TERRAIN.bandMid),
  hexToRgb(TERRAIN.bandDeep),
];

/**
 * TerrainRenderer paints the pixel terrain bitmap (SPEC §7 layer 2). The terrain
 * is now a Uint8Array of length CANVAS_WIDTH*CANVAS_HEIGHT (index y*WIDTH + x,
 * 0 = air, 1 = solid), deformed pixel-by-pixel on explosions — no longer a single
 * height-line polygon.
 *
 * Approach — OFFSCREEN COMPOSITE: an offscreen HTMLCanvasElement (CANVAS_WIDTH×CANVAS_HEIGHT,
 * i.e. 1200×600) holds
 * the rendered terrain as an ImageData where solid pixels are the opaque brown
 * fill and air pixels are fully TRANSPARENT (alpha 0). The expensive
 * per-pixel ImageData rebuild + putImageData runs ONLY when the bitmap content
 * changes (detected by an FNV hash over the Uint8Array) or a redraw is forced.
 * EVERY draw() call then composites that offscreen onto the main ctx with
 * ctx.drawImage — which alpha-blends, so the transparent air pixels let the sky
 * layer beneath show through. (We deliberately do NOT putImageData onto the main
 * ctx: putImageData overwrites pixels wholesale and would erase the sky.)
 *
 * Dirty-flag pattern (SPEC §7): rebuilding the 720k-pixel ImageData every frame
 * is wasteful on a t3.micro, and terrain only changes when a crater deforms it.
 * Change is detected by comparing state.terrainVersion — a counter the engine bumps
 * on every deform (REVIEW_BACKLOG P2-8) — instead of hashing all 720k bytes each
 * frame (which defeated the very dirty-flag design it implemented). Two explicit
 * hooks are also provided:
 *   - markDirty(): force the next draw() to rebuild the offscreen.
 *   - needsRedraw(version): whether the next draw() would rebuild, without doing
 *     it — useful for orchestrators that batch layer redraws.
 *
 * Usage:
 *   const tr = new TerrainRenderer();
 *   tr.draw(ctx, state.terrain, state.terrainVersion); // blits every frame; rebuilds on change
 */
export class TerrainRenderer {
  /** Lazily-created offscreen canvas holding the composited terrain (1200×600). */
  private offscreen: HTMLCanvasElement | null = null;
  /** 2D context of {@link offscreen}. */
  private offCtx: CanvasRenderingContext2D | null = null;
  /** Reusable ImageData buffer for the offscreen rebuild (avoids reallocation). */
  private imageData: ImageData | null = null;

  /** terrainVersion at the last rebuild; null => never rebuilt. */
  private lastVersion: number | null = null;
  /** When true, the next draw() rebuilds the offscreen regardless of version. */
  private forceRedraw = true;

  /**
   * Composite the terrain onto ctx. The offscreen is rebuilt only if the terrain
   * version changed since the last rebuild (or a redraw was forced); the blit
   * happens on every call so the terrain is always present even when unchanged.
   *
   * @param ctx     2D context (sized CANVAS_WIDTH x CANVAS_HEIGHT).
   * @param terrain Pixel bitmap: index y*CANVAS_WIDTH + x, 0 = air, 1 = solid.
   * @param version state.terrainVersion — bumped by the engine on every deform.
   * @returns true if it rebuilt the offscreen this call, false if it only blitted.
   */
  draw(ctx: CanvasRenderingContext2D, terrain: Uint8Array, version: number): boolean {
    const off = this.ensureOffscreen();

    let rebuilt = false;
    if (this.forceRedraw || version !== this.lastVersion) {
      this.rebuild(terrain);
      this.lastVersion = version;
      this.forceRedraw = false;
      rebuilt = true;
    }

    // drawImage alpha-composites: transparent air pixels reveal the sky beneath.
    ctx.drawImage(off, 0, 0);
    return rebuilt;
  }

  /** Force the next draw() to rebuild the offscreen regardless of version. */
  markDirty(): void {
    this.forceRedraw = true;
  }

  /**
   * Whether the next draw() at this version would rebuild the offscreen (dirty),
   * without rebuilding. True if a redraw is forced or the version advanced since
   * the last rebuilt state.
   */
  needsRedraw(version: number): boolean {
    return this.forceRedraw || version !== this.lastVersion;
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
   *
   * Strata (T7): each pixel's base color is selected by its WORLD-Y position via
   * `bandForY`, giving 2–3 horizontal earth/rock bands. The existing depth ramp is
   * then applied ON TOP of that base, so surface pixels still read correctly and
   * craters expose the underlying band color as they cut deeper.
   *
   * The band base color blends toward the ramp's TOP/MID/DEEP palette so the
   * transition between strata is smooth rather than abrupt: the ramp lerps from
   * the band base instead of from a fixed `TOP`.
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
            r = RIM[0]; g = RIM[1]; b = RIM[2]; // lit surface edge (unchanged)
          } else {
            // Strata band base: a CONTINUOUS color by world-y (cross-faded across
            // the band thresholds via bandFloatForY) so horizontal earth/rock bands
            // are revealed as craters cut deeper WITHOUT a hard horizontal seam at
            // the boundaries. Lerp the two bordering band colors by the fractional
            // band coordinate.
            const bf = bandFloatForY(y);      // 0..2, smooth across boundaries
            const lo = bf < 1 ? 0 : 1;        // lower of the two bands to blend
            const f = bf - lo;                // 0..1 within the pair
            const A = BAND_COLORS[lo];
            const Bc = BAND_COLORS[lo + 1];
            const baseR = A[0] + (Bc[0] - A[0]) * f;
            const baseG = A[1] + (Bc[1] - A[1]) * f;
            const baseB = A[2] + (Bc[2] - A[2]) * f;
            // Depth ramp: blend BASE → MID → DEEP over RAMP_DEPTH px so the
            // band color grades smoothly into the deep-rock palette.
            const t = Math.min((depth - 2) / RAMP_DEPTH, 1);
            if (t < 0.5) {
              const u = t * 2; // band-base → mid
              r = baseR + (MID[0] - baseR) * u;
              g = baseG + (MID[1] - baseG) * u;
              b = baseB + (MID[2] - baseB) * u;
            } else {
              const u = (t - 0.5) * 2; // mid → deep
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
}
