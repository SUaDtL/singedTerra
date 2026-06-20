// RESYNC_GUARD check — locks in the contract of shouldBufferSeq() in
// shared/src/net/seqGuard.ts, the pure predicate that gates every incoming
// Realtime row in NetworkClient's `pendingActions` buffer.
//
// Proves:
//   A. AHEAD: seq > nextExpectedSeq → buffer (true)
//   B. CONTIGUOUS: seq === nextExpectedSeq → buffer (true; the row that FILLS
//      the gap must NOT be dropped, or the engine stalls permanently)
//   C. STALE: seq < nextExpectedSeq → drop (false; prevents the pending-actions
//      Map from accumulating keys that flushPendingActions() will never consume)
//   D. BOUNDARY CASES: four pinned (seq, next) pairs with expected outputs
//   E. SIMULATION: a tiny Map models the buffer — a stale row leaves Map.size
//      unchanged; an at-or-ahead row is retained (spirit of the memory-leak fix)
//
// Deterministic: no I/O, no Math.random, no Date. Zero engine dependencies.
// Run: npx tsx scripts/checks/resync_guard.mjs

import { shouldBufferSeq } from '../../shared/src/net/seqGuard.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log('FAIL: ' + m); };

// --- Check A: ahead row (seq > next) must be buffered ---
{
  const result = shouldBufferSeq(7, 5);
  if (result !== true) fail(`A: seq=7 next=5 should return true (buffer), got ${result}`);
  if (!failed) log('PASS: ahead row (seq > nextExpectedSeq) is buffered.');
}

// --- Check B: contiguous row (seq === next) must be buffered ---
{
  const result = shouldBufferSeq(5, 5);
  if (result !== true) fail(`B: seq=5 next=5 should return true (buffer), got ${result}`);
  if (!failed) log('PASS: contiguous row (seq === nextExpectedSeq) is buffered, not dropped.');
}

// --- Check C: stale row (seq < next) must be dropped ---
{
  const result = shouldBufferSeq(3, 5);
  if (result !== false) fail(`C: seq=3 next=5 should return false (drop), got ${result}`);
  if (!failed) log('PASS: stale row (seq < nextExpectedSeq) is dropped.');
}

// --- Check D: pinned boundary cases ---
{
  const cases = [
    { seq: 0, next: 0, expected: true,  label: 'seq=0,next=0 (game start, first row)' },
    { seq: 4, next: 5, expected: false, label: 'seq=4,next=5 (one behind — stale)' },
    { seq: 5, next: 5, expected: true,  label: 'seq=5,next=5 (exact match — contiguous)' },
    { seq: 6, next: 5, expected: true,  label: 'seq=6,next=5 (one ahead — future row)' },
  ];
  let dFailed = false;
  for (const { seq, next, expected, label } of cases) {
    const got = shouldBufferSeq(seq, next);
    if (got !== expected) {
      fail(`D: ${label} → expected ${expected}, got ${got}`);
      dFailed = true;
    }
  }
  if (!dFailed) log('PASS: all four boundary cases match pinned expectations.');
}

// --- Check E: simulation — Map buffer respects guard output ---
{
  // Model: pendingActions Map<seq, action>, nextExpectedSeq starts at 5.
  // Stale row seq=3 must NOT grow the map.
  // At-or-ahead rows seq=5 and seq=7 MUST grow the map.
  const pendingActions = new Map();
  let nextExpectedSeq = 5;

  const incomingRows = [
    { seq: 3, payload: 'stale-row'   },  // should be dropped
    { seq: 5, payload: 'current-row' },  // should be kept
    { seq: 7, payload: 'future-row'  },  // should be kept
  ];

  for (const row of incomingRows) {
    if (shouldBufferSeq(row.seq, nextExpectedSeq)) {
      pendingActions.set(row.seq, row.payload);
    }
  }

  if (pendingActions.has(3)) fail('E: stale row (seq=3) was inserted into the Map — memory-leak guard bypassed');
  if (!pendingActions.has(5)) fail('E: contiguous row (seq=5) was dropped — engine will stall');
  if (!pendingActions.has(7)) fail('E: ahead row (seq=7) was dropped — out-of-order delivery lost');
  if (pendingActions.size !== 2) fail(`E: Map should contain 2 entries (seq=5, seq=7), got ${pendingActions.size}`);

  if (!failed) log('PASS: simulation — stale row excluded from Map; contiguous + ahead rows retained.');
}

if (failed) { log('\nRESYNC_GUARD CHECK: FAILED'); process.exit(1); }
else { log('\nRESYNC_GUARD CHECK: PASSED'); process.exit(0); }
