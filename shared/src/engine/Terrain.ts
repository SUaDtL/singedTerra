/**
 * Terrain: a per-pixel BITMAP — a Uint8Array of length CANVAS_WIDTH*CANVAS_HEIGHT
 * (index y*CANVAS_WIDTH + x), 0 = air, 1 = solid. This bitmap is the canonical
 * terrain held in GameState and used for O(1) collision (SPEC §4.1). It is built
 * by rasterizing a midpoint-displacement HEIGHT-MAP SILHOUETTE (`generate()`
 * returns the per-column surface y), then deformed on explosions (craters clear
 * pixels; the Dirt Bomb sets them) and compacted by gravity, which lets unsupported
 * ground fall and buries tanks.
 *
 * Convention (shared by all agents): y grows DOWNWARD, so a smaller surface-y is a
 * taller hill. Ground occupies y from the surface down to CANVAS_HEIGHT; a point
 * (x, y) is solid when its bitmap pixel is set (or y >= CANVAS_HEIGHT).
 *
 * Determinism: all randomness here comes from a SEEDED PRNG (mulberry32) seeded
 * from the `seed` argument. No wall-clock reads, no global Math.random — same
 * seed always yields identical terrain.
 */

import { clamp } from './math';

export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 600;

/** Surface kept within these vertical bounds so tanks have sky above / ground below. */
const MIN_SURFACE_Y = Math.floor(CANVAS_HEIGHT * 0.35); // 210 — tallest allowed hill
const MAX_SURFACE_Y = Math.floor(CANVAS_HEIGHT * 0.9); //  540 — lowest allowed valley

/**
 * Seeded PRNG (mulberry32). Deterministic, fast, good enough for terrain gen.
 * Returns a function yielding floats in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fold an arbitrary caller-supplied seed (which may be a float, negative, NaN,
 * Infinity, or larger than 2^32) into a well-mixed uint32. This avoids silent
 * seed collisions: a bare `seed >>> 0` would collapse all of NaN/0/-0/Infinity/
 * 2^32 to seed 0 and alias seeds differing only above bit 32. Deterministic —
 * pure integer mixing, no clock or global random.
 */
function hashSeed(seed: number): number {
  // Map any non-finite seed to a defined fallback so NaN/Infinity are stable
  // and distinct from a typical small integer seed.
  const n = Number.isFinite(seed) ? seed : 0x9e3779b9;
  // Capture the fractional part and both 32-bit halves of large integers so
  // floats and seeds > 2^32 don't alias.
  const frac = Math.floor((n - Math.floor(n)) * 0x100000000) >>> 0;
  const lo = Math.floor(n) | 0;
  const hi = Math.floor(n / 0x100000000) | 0;
  let h = (lo ^ frac ^ Math.imul(hi, 0x85ebca6b)) >>> 0;
  // Final avalanche (MurmurHash3 fmix32).
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Generate a reproducible height map via 1D midpoint displacement
 * (diamond-square variant). Endpoints are seeded randomly, then each segment is
 * recursively split: the midpoint height is the average of its endpoints plus a
 * random displacement whose magnitude halves at each level of recursion.
 *
 * @param seed RNG seed for reproducible terrain. Same seed => identical array;
 *             different seeds => different terrain.
 * @returns Height map of length CANVAS_WIDTH, each value the surface y for that
 *          column, within roughly [MIN_SURFACE_Y, MAX_SURFACE_Y].
 */
export function generate(seed: number): Uint16Array {
  // Hash the caller seed into a well-mixed uint32 so distinct seeds (including
  // floats and out-of-range values) map to distinct terrain.
  const rand = mulberry32(hashSeed(seed));
  const n = CANVAS_WIDTH;

  // Work on a power-of-two-plus-one grid so midpoint displacement subdivides
  // cleanly, then sample the first CANVAS_WIDTH columns out of it.
  let size = 1;
  while (size + 1 < n) size *= 2;
  const gridLen = size + 1; // (2^k) + 1 points

  const heights = new Float64Array(gridLen);

  const span = MAX_SURFACE_Y - MIN_SURFACE_Y;
  const mid = MIN_SURFACE_Y + span / 2;

  // Random endpoints near the middle of the allowed band.
  heights[0] = mid + (rand() - 0.5) * span * 0.5;
  heights[gridLen - 1] = mid + (rand() - 0.5) * span * 0.5;

  // Initial displacement magnitude; roughness controls how the magnitude decays
  // per level (0.5 => classic midpoint displacement / Hurst exponent ~1).
  let displacement = span * 0.6;
  const roughness = 0.5;

  for (let step = size; step > 1; step = Math.floor(step / 2)) {
    const half = Math.floor(step / 2);
    for (let i = half; i < gridLen; i += step) {
      const left = heights[i - half];
      const right = heights[i + half];
      const avg = (left + right) / 2;
      heights[i] = avg + (rand() - 0.5) * 2 * displacement;
    }
    displacement *= roughness;
  }

  // Sample / clamp into the output column array.
  const terrain = new Uint16Array(n);
  for (let x = 0; x < n; x++) {
    // Map column x in [0, n) onto the grid [0, gridLen-1]. gridLen is always
    // (2^k)+1 >= 2 for CANVAS_WIDTH=800, so n-1 is never 0 here.
    const gx = Math.round((x * (gridLen - 1)) / (n - 1));
    const y = clamp(heights[gx], MIN_SURFACE_Y, MAX_SURFACE_Y);
    terrain[x] = Math.round(y);
  }

  return terrain;
}

/** Total pixel count of the terrain bitmap (one byte per pixel). */
export const BITMAP_LEN = CANVAS_WIDTH * CANVAS_HEIGHT;

/**
 * Build a pixel BITMAP (Uint8Array of length CANVAS_WIDTH*CANVAS_HEIGHT, index
 * y*CANVAS_WIDTH + x, 0 = air, 1 = solid) from a height LINE (one surface y per
 * column, as produced by generate()). For each column x the pixels from its
 * surface y down to the canvas floor are filled solid; everything above is air.
 *
 * Deterministic — a pure function of the input height line. The bitmap is the
 * runtime representation deformed by explosions; the height line is kept only
 * for generation and tank placement.
 */
export function buildBitmap(heightLine: Uint16Array): Uint8Array {
  const bitmap = new Uint8Array(BITMAP_LEN);
  for (let x = 0; x < CANVAS_WIDTH; x++) {
    const s = clamp(heightLine[x], 0, CANVAS_HEIGHT);
    for (let y = s; y < CANVAS_HEIGHT; y++) {
      bitmap[y * CANVAS_WIDTH + x] = 1;
    }
  }
  return bitmap;
}

/** Generate a terrain bitmap directly from a seed (generate -> buildBitmap). */
export function generateBitmap(seed: number): Uint8Array {
  return buildBitmap(generate(seed));
}

/**
 * Pure, bounds-checked pixel lookup: 1 if (x, y) is solid, 0 if air OR
 * out-of-canvas. No bottom-floor synthesis here — out-of-bounds reads return
 * air; the bottom-floor collision rule lives in Physics.collide, not here.
 */
export function pixelAt(bitmap: Uint8Array, x: number, y: number): number {
  if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) return 0;
  return bitmap[y * CANVAS_WIDTH + x];
}

/**
 * Surface y at a given (possibly fractional) x: the topmost solid pixel in that
 * column. Scans top→bottom and returns the first solid y; if the whole column is
 * air, returns CANVAS_HEIGHT (i.e. the floor). Replaces the old height-line
 * surfaceAt — now derived from the live bitmap so it tracks deformation.
 */
export function surfaceAt(bitmap: Uint8Array, x: number): number {
  const xi = clamp(Math.floor(x), 0, CANVAS_WIDTH - 1);
  for (let y = 0; y < CANVAS_HEIGHT; y++) {
    if (bitmap[y * CANVAS_WIDTH + xi] === 1) return y;
  }
  return CANVAS_HEIGHT;
}

/**
 * Deform the BITMAP with a circular blast at (cx, cy) of radius r (SPEC §4.1).
 *
 * raise=false CLEARS (sets 0/air) every solid-or-not pixel inside the blast
 * circle — a crater. raise=true FILLS (sets 1/solid) every pixel inside the
 * circle — dirt/raise weapons. Iterates the bounding box ceil(c-r)..floor(c+r)
 * in both axes and writes only the in-canvas pixels whose center lies within r
 * of (cx, cy). Pure integer/float arithmetic on the inputs — deterministic.
 *
 * Returns the clamped bounding rect {xStart,xEnd,yStart,yEnd} of the pixels
 * ACTUALLY written (so the gravity pass can be confined to the touched column
 * range), or null if r<=0 or no pixel fell inside the canvas+circle.
 */
export function deform(
  bitmap: Uint8Array,
  cx: number,
  cy: number,
  r: number,
  raise = false,
): { xStart: number; xEnd: number; yStart: number; yEnd: number } | null {
  if (r <= 0) return null;

  const r2 = r * r;
  const value = raise ? 1 : 0;

  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;

  const pxStart = Math.ceil(cx - r);
  const pxEnd = Math.floor(cx + r);
  const pyStart = Math.ceil(cy - r);
  const pyEnd = Math.floor(cy + r);

  for (let px = pxStart; px <= pxEnd; px++) {
    if (px < 0 || px >= CANVAS_WIDTH) continue;
    const dx = px - cx;
    for (let py = pyStart; py <= pyEnd; py++) {
      if (py < 0 || py >= CANVAS_HEIGHT) continue;
      const dy = py - cy;
      if (dx * dx + dy * dy > r2) continue;
      bitmap[py * CANVAS_WIDTH + px] = value;
      if (px < xMin) xMin = px;
      if (px > xMax) xMax = px;
      if (py < yMin) yMin = py;
      if (py > yMax) yMax = py;
    }
  }

  if (xMin > xMax) return null; // nothing written
  return { xStart: xMin, xEnd: xMax, yStart: yMin, yEnd: yMax };
}

/**
 * Number of pixels a settling column advances per engine tick during the
 * animated end-of-turn collapse. Exported so GameEngine can reference the
 * constant without duplicating the literal. Playtest-tunable — do not inline.
 */
export const COLLAPSE_PX_PER_TICK = 4;

/**
 * Advance the per-column "dirt falls" settle by AT MOST `pxPerTick` pixels per
 * column per call. Uses a SAND model: only UNSUPPORTED solid pixels (those with
 * air directly below) fall, by exactly 1px per sub-step. `pxPerTick` sub-steps
 * are run per column per call (with early-exit if the column is fully settled).
 *
 * Scanning bottom-up each sub-step: when a solid at y has air at y+1, the solid
 * swaps down (bitmap[y+1]=1, bitmap[y]=0). This means an entire floating run
 * descends exactly 1px per sub-step (the vacated row is filled by the grain
 * above; the gap rises to the top of the floating mass). Supported grains (solid
 * directly below, or resting on the canvas floor) never move.
 *
 * Properties:
 *   - Strictly downward-only: no solid pixel ever moves upward.
 *   - Solid-count conserved: no pixel is created or destroyed per column.
 *   - Supported ground is preserved: if a solid's lower neighbour is solid it
 *     never moves, so a resting floor stays in place while a floating overhang
 *     above it descends independently.
 *   - Convergence parity: looping to convergence produces a result byte-identical
 *     to a single applyGravity call on the same input bitmap (all solids end at
 *     the bottom of each column, same final compacted state).
 *   - Termination: converges in at most ceil(CANVAS_HEIGHT / pxPerTick) calls.
 *   - Deterministic: no Math.random, no Date, no wall-clock reads.
 *
 * Returns `true` iff any pixel moved this call; `false` once fully settled.
 */
export function settleStep(
  bitmap: Uint8Array,
  xStart: number,
  xEnd: number,
  pxPerTick: number,
): boolean {
  const lo = Math.max(0, xStart);
  const hi = Math.min(CANVAS_WIDTH - 1, xEnd);
  let anyMoved = false;

  for (let x = lo; x <= hi; x++) {
    // Run up to pxPerTick one-pixel sub-steps for this column.
    for (let s = 0; s < pxPerTick; s++) {
      let movedThisSubstep = false;
      // Scan bottom-up (y from H-2 down to 0): a solid at y with air at y+1
      // falls one pixel. Bottom-up scan ensures a floating run shifts down as
      // a whole unit in a single pass (each grain clears the row below it for
      // the grain above).
      for (let y = CANVAS_HEIGHT - 2; y >= 0; y--) {
        if (bitmap[y * CANVAS_WIDTH + x] === 1 && bitmap[(y + 1) * CANVAS_WIDTH + x] === 0) {
          bitmap[(y + 1) * CANVAS_WIDTH + x] = 1;
          bitmap[y * CANVAS_WIDTH + x] = 0;
          movedThisSubstep = true;
          anyMoved = true;
        }
      }
      if (!movedThisSubstep) break; // column fully settled — no more sub-steps needed
    }
  }

  return anyMoved;
}

/**
 * Per-column "dirt falls" pass (SPEC §4.1). For each column x in the inclusive
 * [xStart, xEnd] range (clamped to the canvas), count its solid pixels then
 * rewrite the column so all solids are compacted to the BOTTOM: air for
 * y in [0, H-count), solid for y in [H-count, H). Pure integer ops, run once
 * per explosion over the columns deform() actually touched.
 *
 * Re-expressed as a loop over settleStep to convergence, preserving identical
 * external behavior (byte-identical result) while reusing the stepped logic.
 */
export function applyGravity(
  bitmap: Uint8Array,
  xStart: number,
  xEnd: number,
): void {
  // Drive settleStep to convergence with an unbounded step size to match the
  // original single-pass instant compaction. Using CANVAS_HEIGHT as the step
  // guarantees each column compacts in exactly one settleStep iteration,
  // preserving the byte-identical result callers depend on.
  while (settleStep(bitmap, xStart, xEnd, CANVAS_HEIGHT)) { /* settle */ }
}
