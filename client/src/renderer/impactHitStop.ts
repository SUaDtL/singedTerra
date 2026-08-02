/** Smallest blast radius that earns a pre-impact presentation hold. */
export const HEAVY_IMPACT_RADIUS_THRESHOLD = 50;

/** Finite hold at 60fps: roughly 33ms, enough to read without feeling laggy. */
export const HEAVY_IMPACT_HOLD_FRAMES = 2;

/**
 * Return the render-only hold for one coalesced explosion batch.
 *
 * Deterministic simulation is deliberately outside this helper: callers leave
 * the already-painted canvas in place while the engine continues fixed-step
 * execution. Reduced-motion and malformed data fail closed to no hold.
 */
export function impactHitStopFrames(radius: number, reduceMotion: boolean): number {
  if (
    reduceMotion
    || !Number.isFinite(radius)
    || radius < HEAVY_IMPACT_RADIUS_THRESHOLD
  ) {
    return 0;
  }
  return HEAVY_IMPACT_HOLD_FRAMES;
}
