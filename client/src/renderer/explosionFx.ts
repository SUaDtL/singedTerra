/**
 * Pure, DOM-free helpers for explosion visual effects.
 *
 * These functions are intentionally free of any browser/DOM dependency —
 * they use only arithmetic so they can be imported and tested by a Node/tsx
 * harness without a canvas or window object. The Renderer imports them to
 * drive the flash and scorch draw passes; the harness asserts the curves
 * directly.
 *
 * No imports from client/, shared/, or any DOM API.
 */

/**
 * Canvas light-flash intensity for a single burst.
 *
 * Returns an alpha value in [0, 1] that:
 *   - peaks quickly (at PEAK_FRAC of lifeFrames, at most at age 1)
 *   - decays monotonically from the peak to 0
 *   - is exactly 0 once age >= lifeFrames
 *   - scales linearly with radius (a nuke flashes brighter than a baby_missile)
 *
 * The flash is intentionally SUBTLE (max raw alpha ~0.18 at radius 30) so it
 * complements the existing DOM bloom in main.ts without doubling into garish.
 *
 * @param age        Frames elapsed since the burst was spawned (0-indexed).
 * @param lifeFrames Total lifetime of this burst in frames (> 0).
 * @param radius     Blast radius in canvas pixels (> 0).
 * @returns          Alpha in [0, 1].  0 when age >= lifeFrames.
 */
export function flashIntensity(age: number, lifeFrames: number, radius: number): number {
  if (lifeFrames <= 0 || radius <= 0) return 0;
  if (age >= lifeFrames) return 0;

  // Peak occurs at the first rendered frame (age = 0) of the burst.
  // We model a two-segment ramp: hold full intensity for the first HOLD_FRAC
  // of the life, then decay linearly to 0.
  const HOLD_FRAC = 0.12; // fraction of lifeFrames where intensity stays at peak
  const t = age / lifeFrames; // normalised progress [0, 1)

  // Envelope: 1.0 during the hold, linear ramp-down after it.
  const envelope = t < HOLD_FRAC ? 1 : 1 - (t - HOLD_FRAC) / (1 - HOLD_FRAC);

  // Radius scaling: normalise against a "reference" blast (radius 30 ≈ missile).
  // Clamp so a tiny splash doesn't fully vanish and a nuke doesn't blow past 1.
  const REFERENCE_RADIUS = 30;
  const MAX_SCALE = 2.5; // nukes are ~2× the reference radius
  const radiusScale = Math.min(radius / REFERENCE_RADIUS, MAX_SCALE);

  // Raw peak alpha: kept gentle to avoid washing out the canvas entirely.
  const PEAK_ALPHA = 0.1;

  return Math.min(1, Math.max(0, envelope * radiusScale * PEAK_ALPHA));
}

/**
 * Scorch decal alpha for a crater mark at the impact point.
 *
 * The scorch starts fully opaque at age 0 and fades out linearly, disappearing
 * once age >= lifeFrames.  Radius is accepted but not used for alpha (all
 * scorches fade at the same rate; the draw size is scaled by the caller).
 *
 * @param age        Frames elapsed since the scorch was seeded.
 * @param lifeFrames Total lifetime of this scorch decal.
 * @returns          Alpha in [0, 1].
 */
export function scorchAlpha(age: number, lifeFrames: number): number {
  if (lifeFrames <= 0) return 0;
  if (age >= lifeFrames) return 0;
  return Math.max(0, 1 - age / lifeFrames);
}
