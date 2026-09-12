import { describe, expect, it } from 'vitest';
import {
  FrameClock,
  LOGICAL_FRAME_INTERVAL_MS,
  MAX_FRAME_CATCH_UP_BEATS,
} from './frameClock';

describe('FrameClock', () => {
  it.each([30, 60, 120, 144])('produces 60 logical beats over one second at %i Hz', (displayHz) => {
    const clock = new FrameClock();
    clock.reset(0);
    let beats = 0;
    for (let frame = 1; frame <= displayHz; frame++) {
      beats += clock.advance(frame * (1_000 / displayHz));
    }
    expect(beats).toBe(60);
  });

  it('caps one suspended frame and discards its remaining backlog', () => {
    const clock = new FrameClock();
    clock.reset(0);
    expect(clock.advance(5 * 60 * 1_000)).toBe(MAX_FRAME_CATCH_UP_BEATS);
    expect(clock.advance(5 * 60 * 1_000 + LOGICAL_FRAME_INTERVAL_MS)).toBe(1);
  });

  it('ignores equal/backward timestamps without manufacturing later elapsed time', () => {
    const clock = new FrameClock();
    clock.reset(100);
    expect(clock.advance(100)).toBe(0);
    expect(clock.advance(50)).toBe(0);
    expect(clock.advance(100 + LOGICAL_FRAME_INTERVAL_MS)).toBe(1);
  });
});
