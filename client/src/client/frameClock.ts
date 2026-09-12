/** Intended browser pacing: preserve the long-standing ~60 Hz play speed explicitly. */
export const LOGICAL_FRAME_RATE_HZ = 60;
export const LOGICAL_FRAME_INTERVAL_MS = 1_000 / LOGICAL_FRAME_RATE_HZ;

/**
 * At most this many logical presentation/simulation beats may run in one RAF.
 * Longer suspension is discarded so returning from a hidden tab cannot replay an
 * unbounded wall-clock backlog into the deterministic engine.
 */
export const MAX_FRAME_CATCH_UP_BEATS = 4;

const ROUNDING_EPSILON_MS = LOGICAL_FRAME_INTERVAL_MS * 1e-9;

/**
 * Converts display-owned RAF timestamps into a fixed 60 Hz logical beat count.
 * Physics still advances only through complete engine.tick() calls; elapsed time
 * never enters the shared engine. One beat also represents one presentation
 * emission, keeping renderer-owned frame lifetimes on the same explicit clock.
 */
export class FrameClock {
  private lastTimestampMs = 0;
  private accumulatorMs = 0;

  reset(timestampMs: number): void {
    this.lastTimestampMs = Number.isFinite(timestampMs) ? timestampMs : 0;
    this.accumulatorMs = 0;
  }

  advance(timestampMs: number): number {
    if (!Number.isFinite(timestampMs)) return 0;

    const elapsedMs = timestampMs - this.lastTimestampMs;
    // Equal/backward callbacks represent no elapsed wall time. Keep the last valid
    // timestamp so a later forward callback cannot re-count the backwards interval.
    if (elapsedMs <= 0) return 0;
    this.lastTimestampMs = timestampMs;

    const catchUpWindowMs = LOGICAL_FRAME_INTERVAL_MS * MAX_FRAME_CATCH_UP_BEATS;
    this.accumulatorMs = Math.min(
      this.accumulatorMs + elapsedMs,
      catchUpWindowMs,
    );
    const beats = Math.min(
      MAX_FRAME_CATCH_UP_BEATS,
      Math.floor((this.accumulatorMs + ROUNDING_EPSILON_MS) / LOGICAL_FRAME_INTERVAL_MS),
    );
    this.accumulatorMs = Math.max(
      0,
      this.accumulatorMs - beats * LOGICAL_FRAME_INTERVAL_MS,
    );
    return beats;
  }
}
