// Ring-buffer pure-logic check for singedTerra client renderer.
//
// Proves the contract for RingBuffer<T> used by ProjectileRenderer
// to maintain per-slot projectile position history:
//
//   1. CAPACITY EVICTION: push (cap + k) items into a buffer of cap => only the
//      newest cap items are retained, in FIFO order (oldest-first iteration).
//   2. EMPTY SAFETY: iterating an empty buffer is safe and yields no items.
//   3. CLEAR: after clear() the buffer is empty and accepts new pushes.
//   4. PARTIAL FILL: pushing fewer than cap items retains them all in order.
//   5. SINGLE ITEM: a buffer of capacity 1 always holds only the last pushed item.
//
// Imports the TypeScript source directly (tsx runs .ts without a build step).
// The module MUST be DOM-free — this harness runs in Node/tsx, not a browser.
//
// Run: npx tsx scripts/checks/ringbuffer.mjs

import { RingBuffer } from '../../client/src/renderer/ringBuffer.ts';

let failed = false;
const log = (...args) => console.log(...args);
const fail = (msg) => { failed = true; log(`FAIL: ${msg}`); };

// -----------------------------------------------------------------------
// 1. CAPACITY EVICTION
// -----------------------------------------------------------------------
{
  const cap = 5;
  const buf = new RingBuffer(cap);
  // Push cap + 3 items; only the newest cap should remain.
  for (let i = 0; i < cap + 3; i++) {
    buf.push({ x: i * 10, y: i });
  }
  const items = [];
  buf.forEach((pt) => items.push(pt));

  if (items.length !== cap) {
    fail(`[eviction] expected ${cap} items after ${cap + 3} pushes, got ${items.length}`);
  } else {
    // The newest `cap` items are i=3..7 (x=30..70).
    const expectedX = [30, 40, 50, 60, 70];
    let ok = true;
    for (let i = 0; i < cap; i++) {
      if (items[i].x !== expectedX[i]) {
        fail(`[eviction] item[${i}].x expected ${expectedX[i]}, got ${items[i].x}`);
        ok = false;
      }
    }
    if (ok) log('PASS: capacity eviction — oldest items evicted, newest cap retained in FIFO order.');
  }
}

// -----------------------------------------------------------------------
// 2. EMPTY SAFETY
// -----------------------------------------------------------------------
{
  const buf = new RingBuffer(8);
  let count = 0;
  buf.forEach(() => count++);
  if (count !== 0) {
    fail(`[empty] expected 0 iterations on empty buffer, got ${count}`);
  } else {
    log('PASS: empty buffer iteration is safe and yields no items.');
  }
}

// -----------------------------------------------------------------------
// 3. CLEAR
// -----------------------------------------------------------------------
{
  const buf = new RingBuffer(4);
  for (let i = 0; i < 6; i++) buf.push({ x: i, y: i });
  buf.clear();

  let count = 0;
  buf.forEach(() => count++);
  if (count !== 0) {
    fail(`[clear] after clear(), expected 0 items, got ${count}`);
  } else {
    // Also confirm new pushes work after clear.
    buf.push({ x: 99, y: 99 });
    const items = [];
    buf.forEach((pt) => items.push(pt));
    if (items.length !== 1 || items[0].x !== 99) {
      fail('[clear] push after clear() did not produce the expected single item');
    } else {
      log('PASS: clear() empties the buffer and accepts new pushes afterward.');
    }
  }
}

// -----------------------------------------------------------------------
// 4. PARTIAL FILL (fewer than cap items)
// -----------------------------------------------------------------------
{
  const cap = 10;
  const buf = new RingBuffer(cap);
  const pushed = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }];
  for (const p of pushed) buf.push(p);
  const items = [];
  buf.forEach((pt) => items.push(pt));

  if (items.length !== pushed.length) {
    fail(`[partial] expected ${pushed.length} items, got ${items.length}`);
  } else {
    let ok = true;
    for (let i = 0; i < pushed.length; i++) {
      if (items[i].x !== pushed[i].x || items[i].y !== pushed[i].y) {
        fail(`[partial] item[${i}] mismatch: expected (${pushed[i].x},${pushed[i].y}), got (${items[i].x},${items[i].y})`);
        ok = false;
      }
    }
    if (ok) log('PASS: partial fill — fewer-than-cap items all retained in insertion order.');
  }
}

// -----------------------------------------------------------------------
// 5. SINGLE ITEM CAPACITY
// -----------------------------------------------------------------------
{
  const buf = new RingBuffer(1);
  buf.push({ x: 10, y: 20 });
  buf.push({ x: 30, y: 40 }); // overwrites
  const items = [];
  buf.forEach((pt) => items.push(pt));

  if (items.length !== 1) {
    fail(`[cap1] expected 1 item, got ${items.length}`);
  } else if (items[0].x !== 30 || items[0].y !== 40) {
    fail(`[cap1] expected (30,40), got (${items[0].x},${items[0].y})`);
  } else {
    log('PASS: capacity-1 buffer keeps only the last pushed item.');
  }
}

if (failed) {
  log('\nRINGBUFFER CHECK: FAILED');
  process.exit(1);
} else {
  log('\nRINGBUFFER CHECK: PASSED');
  process.exit(0);
}
