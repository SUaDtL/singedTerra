/**
 * ringBuffer.test.ts — fixed-capacity 2D-point ring buffer (projectile smoke trail).
 * Insertion-order iteration IS the draw order (oldest/faded → newest/tip).
 */
import { describe, it, expect } from 'vitest';
import { RingBuffer, type Point2D } from './ringBuffer';

function collect(rb: RingBuffer): Point2D[] {
  const out: Point2D[] = [];
  rb.forEach((p) => out.push(p));
  return out;
}

describe('RingBuffer', () => {
  it('rejects a capacity below 1', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
  });

  it('iterates a partially-filled buffer in insertion order', () => {
    const rb = new RingBuffer(4);
    rb.push({ x: 1, y: 1 });
    rb.push({ x: 2, y: 2 });
    expect(rb.length).toBe(2);
    expect(collect(rb)).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  });

  it('overwrites the oldest entry once full, preserving oldest→newest order', () => {
    const rb = new RingBuffer(3);
    for (let i = 1; i <= 5; i++) rb.push({ x: i, y: 0 }); // 1,2 evicted
    expect(rb.length).toBe(3);
    expect(collect(rb).map((p) => p.x)).toEqual([3, 4, 5]);
  });

  it('forEach is a no-op on an empty buffer; clear() resets to empty', () => {
    const rb = new RingBuffer(2);
    let calls = 0;
    rb.forEach(() => calls++);
    expect(calls).toBe(0);

    rb.push({ x: 9, y: 9 });
    rb.clear();
    expect(rb.length).toBe(0);
    expect(collect(rb)).toEqual([]);
  });
});
