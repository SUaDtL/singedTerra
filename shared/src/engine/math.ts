/**
 * Shared numeric primitives. Single source of truth so a NaN/edge-behavior change
 * can't silently diverge hot-seat vs networked replay (REVIEW_BACKLOG P3-15) — the
 * engine, the AI, terrain generation, and the UI all clamp the SAME way.
 */

/**
 * Clamp `v` into the inclusive range [lo, hi].
 *
 * NaN note (preserved from every prior copy): for `v === NaN`, both `v < lo` and
 * `v > hi` are false, so NaN is returned unchanged — do NOT "fix" this without
 * auditing every caller, as the engine relies on this exact behavior.
 */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
