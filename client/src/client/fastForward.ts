// Pure view-pacing helper for the fast-forward control (playtest review #7).
//
// DETERMINISM-SAFE: the shared engine is fixed-timestep, so running N ticks within a
// single rAF frame produces the EXACT same outcome as N frames of one tick — only
// fewer frames are drawn. Fast-forward is therefore pure LOCAL view pacing: it never
// changes the action log, the seq order, or the simulation result, so it is safe in
// hot-seat AND networked play. This module decides how many engine.tick() calls a
// client's rAF loop runs this frame; the clients keep their own break-on-settle /
// drain logic around it.

/** Engine ticks per frame while fast-forwarding a live shot (~8× the normal 1/frame). */
export const FF_TICKS_PER_FRAME = 8;

/**
 * Ticks to advance this frame: FF_TICKS_PER_FRAME while fast-forwarding a live
 * (FIRING/RESOLVING) shot, else 1. Fast-forward only accelerates the busy phases —
 * in input-accepting phases (PLAYER_TURN/ROUND_OVER/GAME_OVER/LOBBY) tick() is a
 * no-op, so there is nothing to speed up and we never spin.
 */
export function fastForwardTicks(fastForward: boolean, phase: string): number {
  if (fastForward && (phase === 'FIRING' || phase === 'RESOLVING')) {
    return FF_TICKS_PER_FRAME;
  }
  return 1;
}
