/**
 * fastForward.test.ts — pure view-pacing helper (playtest review #7). Determinism-safe:
 * accelerating the busy phases only changes how many ticks a frame runs, never the outcome.
 */
import { describe, it, expect } from 'vitest';
import { fastForwardTicks, FF_TICKS_PER_FRAME } from './fastForward';

describe('fastForwardTicks', () => {
  it('accelerates only the busy (FIRING/RESOLVING) phases when fast-forward is on', () => {
    expect(fastForwardTicks(true, 'FIRING')).toBe(FF_TICKS_PER_FRAME);
    expect(fastForwardTicks(true, 'RESOLVING')).toBe(FF_TICKS_PER_FRAME);
  });

  it('never accelerates input-accepting phases (tick() is a no-op there)', () => {
    for (const phase of ['PLAYER_TURN', 'ROUND_OVER', 'GAME_OVER', 'LOBBY']) {
      expect(fastForwardTicks(true, phase)).toBe(1);
    }
  });

  it('runs one tick per frame when fast-forward is off, regardless of phase', () => {
    expect(fastForwardTicks(false, 'FIRING')).toBe(1);
    expect(fastForwardTicks(false, 'PLAYER_TURN')).toBe(1);
  });
});
