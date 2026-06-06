import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@shared/engine/Terrain';

/** Earthy crater-brown fill for solid ground pixels. */
const TERRAIN_FILL = '#6b4a2b';

/** Parse the #rrggbb fill into [r,g,b] once at module load. */
const FILL_R = parseInt(TERRAIN_FILL.slice(1, 3), 16);
const FILL_G = parseInt(TERRAIN_FILL.slice(3, 5), 16);
const FILL_B = parseInt(TERRAIN_FILL.slice(5, 7), 16);

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
   * Rebuild the offscreen ImageData from the bitmap: solid pixels => opaque brown
   * fill, air pixels => alpha 0 (transparent). One RGBA quad per pixel; the
   * bitmap index y*WIDTH+x maps to byte offset (y*WIDTH+x)*4. putImageData writes
   * the whole buffer into the offscreen canvas (NOT the main ctx).
   */
  private rebuild(terrain: Uint8Array): void {
    const offCtx = this.offCtx;
    const img = this.imageData;
    if (offCtx === null || img === null) return; // ensureOffscreen ran first

    const data = img.data;
    const n = CANVAS_WIDTH * CANVAS_HEIGHT;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (terrain[i] === 1) {
        data[o] = FILL_R;
        data[o + 1] = FILL_G;
        data[o + 2] = FILL_B;
        data[o + 3] = 255; // opaque solid ground
      } else {
        data[o + 3] = 0; // transparent air — sky shows through on composite
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
