/**
 * Pure, DOM-free edge-detection helpers for audio trigger signals.
 *
 * These functions are intentionally free of any browser/DOM dependency —
 * they use only arithmetic and boolean logic so they can be imported and
 * tested by a Node/tsx harness without a canvas or window object.  The
 * Renderer imports them to derive per-frame audio cues from existing
 * GameState fields; AudioEngine consumes those cues from the RenderEventSink.
 *
 * No imports from shared/, client/, or any DOM API.
 */

/**
 * Detect a rising or falling edge on the napalm fire-field length.
 *
 * "start"  — fire went from absent (0) to present (>0) this frame.
 * "stop"   — fire went from present (>0) to absent (0) this frame.
 * null     — no edge (both zero, or both non-zero).
 *
 * @param prevLen  Number of FireCells last frame (>= 0).
 * @param curLen   Number of FireCells this frame  (>= 0).
 */
export function fireActiveEdge(
  prevLen: number,
  curLen: number,
): 'start' | 'stop' | null {
  if (prevLen === 0 && curLen > 0) return 'start';
  if (prevLen > 0 && curLen === 0) return 'stop';
  return null;
}

/**
 * Count how many betty-hop ticks should fire this frame.
 *
 * A hop tick is emitted once per terrain bounce: the `bounces` field on
 * ProjectileState counts REMAINING bounces and DECREMENTS on each bounce.
 * A decrease from prev to cur means one hop occurred (the engine resolves
 * one bounce per tick, so the delta is always 0 or 1 in practice).  An
 * INCREASE or same value is not a hop — it represents either a reset (new
 * shot) or no change.
 *
 * Returns the number of ticks to emit (>= 0).  In practice this is 0 or 1,
 * but the general "delta" formulation is returned so a caller can loop over
 * multi-tick cases if the engine ever batches bounces.
 *
 * @param prevBounces  `bounces` field from the previous frame's ProjectileState.
 * @param curBounces   `bounces` field from the current frame's ProjectileState.
 */
export function bettyHopCount(prevBounces: number, curBounces: number): number {
  const delta = prevBounces - curBounces;
  // Only count strict decreases; increases (resets/new shot) are ignored.
  return delta > 0 ? delta : 0;
}

/**
 * Determine whether an out-of-bounds (OOB) fizzle sound should play this frame.
 *
 * A fizzle occurs when:
 *   - a projectile WAS in flight last frame (hadProjectile = true), AND
 *   - no projectile is in flight this frame (hasProjectile = false), AND
 *   - no NEW explosion appeared this frame (newExplosion = false).
 *
 * The absence of a new explosion is the key discriminator: if the shot
 * detonated (hit terrain or a tank) there WILL be an explosion id; if it flew
 * off-screen (OOB) the engine resets state without producing an explosion.
 *
 * @param hadProjectile   True if `state.projectiles.length > 0` last frame.
 * @param hasProjectile   True if `state.projectiles.length > 0` this frame.
 * @param newExplosion    True if a new explosion id appeared in this frame's state
 *                        (i.e. consumeExplosion found id > lastSeenExplosionId).
 */
export function isOobFizzle(
  hadProjectile: boolean,
  hasProjectile: boolean,
  newExplosion: boolean,
): boolean {
  return hadProjectile && !hasProjectile && !newExplosion;
}
