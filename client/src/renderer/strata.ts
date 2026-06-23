/**
 * Terrain strata band logic — PURE, DOM-FREE.
 *
 * Maps a world-y pixel coordinate (0 = top of canvas, grows downward) to one
 * of three horizontal strata bands. Used by TerrainRenderer.rebuild() to set a
 * base band color before the depth-ramp shading is applied on top, so that
 * craters expose visually distinct layered cross-sections.
 *
 * Bands (y grows downward, canvas height = 600):
 *   0 — surface earth  (y < STRATA_BAND_A)
 *   1 — mid rock layer (STRATA_BAND_A <= y < STRATA_BAND_B)
 *   2 — deep rock      (y >= STRATA_BAND_B)
 *
 * This module is intentionally free of DOM access, Canvas API calls, and
 * Vite-alias imports so it can be imported by Node/tsx harnesses directly.
 */

/** World-y threshold between band 0 (surface earth) and band 1 (mid rock). */
export const STRATA_BAND_A = 200;

/** World-y threshold between band 1 (mid rock) and band 2 (deep rock). */
export const STRATA_BAND_B = 380;

/**
 * Return the strata band index for a given world-y pixel coordinate.
 *
 * @param y - Absolute canvas y (0 = top, increases downward).
 * @returns 0 for surface earth, 1 for mid rock, 2 for deep rock.
 */
export function bandForY(y: number): 0 | 1 | 2 {
  if (y < STRATA_BAND_A) return 0;
  if (y < STRATA_BAND_B) return 1;
  return 2;
}

/** Half-width (px) of the cross-fade zone around each band threshold. Within
 *  ±STRATA_BLEND of a boundary the base color lerps between the two bands instead
 *  of switching abruptly, so there is no hard horizontal seam in the terrain fill. */
export const STRATA_BLEND = 48;

/**
 * Continuous band coordinate in [0, 2] for a world-y. Integer-valued away from the
 * thresholds (0/1/2, matching {@link bandForY}); inside ±STRATA_BLEND of a threshold
 * it ramps linearly so a renderer can lerp band colors across the seam. The two
 * blend zones do not overlap (A+blend=248 < B-blend=332).
 */
export function bandFloatForY(y: number): number {
  if (y < STRATA_BAND_A - STRATA_BLEND) return 0;
  if (y < STRATA_BAND_A + STRATA_BLEND) {
    return (y - (STRATA_BAND_A - STRATA_BLEND)) / (2 * STRATA_BLEND); // 0 → 1
  }
  if (y < STRATA_BAND_B - STRATA_BLEND) return 1;
  if (y < STRATA_BAND_B + STRATA_BLEND) {
    return 1 + (y - (STRATA_BAND_B - STRATA_BLEND)) / (2 * STRATA_BLEND); // 1 → 2
  }
  return 2;
}
