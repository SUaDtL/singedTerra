import { describe, expect, it } from 'vitest';
import { OrderedActionSession } from './OrderedActionSession';

describe('OrderedActionSession', () => {
  it('buffers gaps, drops stale duplicates, and drains only contiguous actions', () => {
    const session = new OrderedActionSession<string>();
    session.buffer(1, 'one');
    session.buffer(0, 'zero');
    const applied: string[] = [];

    session.drain(() => true, (action) => applied.push(action), () => undefined, () => undefined);

    expect(applied).toEqual(['zero', 'one']);
    expect(session.nextExpectedSeq).toBe(2);
    expect(session.pendingSize).toBe(0);
    expect(session.buffer(0, 'duplicate')).toBe(false);
  });

  it('stops draining when the engine rejects another action', () => {
    const session = new OrderedActionSession<string>();
    session.buffer(0, 'fire');
    session.buffer(1, 'next');
    let admits = true;
    const applied: string[] = [];
    session.drain(
      () => admits,
      (action) => { applied.push(action); admits = false; },
      () => undefined,
      () => undefined,
    );
    expect(applied).toEqual(['fire']);
    expect(session.nextExpectedSeq).toBe(1);
  });

  it('ticks each replayed action to settlement before continuing', () => {
    const session = new OrderedActionSession<string>();
    session.beginReplay();
    session.buffer(0, 'first');
    session.buffer(1, 'second');
    const events: string[] = [];
    session.drain(
      () => true,
      (action) => events.push(action),
      () => events.push('settled'),
      () => undefined,
    );
    session.finishReplay();
    expect(events).toEqual(['first', 'settled', 'second', 'settled']);
  });

  it('merges overlapping live resyncs and ignores fetches after disposal', () => {
    const session = new OrderedActionSession<string>();
    expect(session.acceptResync([])).toBe(true);
    expect(session.acceptResync([{ seq: 0, action: 'canonical' }])).toBe(true);
    session.dispose();
    expect(session.acceptResync([{ seq: 1, action: 'late' }])).toBe(false);
  });

  it('rejects NaN through the shared admission rule', () => {
    const session = new OrderedActionSession<string>();
    expect(session.buffer(Number.NaN, 'invalid')).toBe(false);
  });
});
