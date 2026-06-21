/**
 * Harness for AC-01: settleStep convergence parity.
 *
 * Proves:
 *   (1) CONVERGENCE PARITY — repeatedly calling settleStep(B, xs, xe, COLLAPSE_PX_PER_TICK)
 *       until it returns false produces a bitmap byte-identical to a single applyGravity
 *       call on the same deformed-but-not-yet-compacted bitmap. Tested across a grid of
 *       seeds × crater positions/radii, including overlapping discs (cluster/MIRV style).
 *   (2) MOVE LIMIT — a single settleStep call never advances any column's dirt top by more
 *       than pxPerTick pixels.
 *   (3) TERMINATION — settleStep eventually returns false (halts).
 *   (4) IDEMPOTENCE — calling settleStep once more after convergence returns false and
 *       does not mutate the bitmap.
 *
 * Run: npx tsx scripts/checks/collapse.mjs
 */

import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  COLLAPSE_PX_PER_TICK,
  generate,
  buildBitmap,
  deform,
  applyGravity,
  settleStep,
} from '../../shared/src/engine/Terrain.ts';

let failed = false;
let pass = 0;
let failCount = 0;

function ok(cond, label, detail = '') {
  if (cond) {
    pass++;
  } else {
    failCount++;
    failed = true;
    console.log(`FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  }
}

/**
 * Find the topmost solid pixel y in column x (the "dirt top").
 * Returns CANVAS_HEIGHT if the column is entirely air.
 */
function dirtTop(bitmap, x) {
  for (let y = 0; y < CANVAS_HEIGHT; y++) {
    if (bitmap[y * CANVAS_WIDTH + x] === 1) return y;
  }
  return CANVAS_HEIGHT;
}

/**
 * Count solid pixels in column x.
 */
function solidCount(bitmap, x) {
  let count = 0;
  for (let y = 0; y < CANVAS_HEIGHT; y++) {
    if (bitmap[y * CANVAS_WIDTH + x] === 1) count++;
  }
  return count;
}

/**
 * Apply one or more circular craters to a bitmap clone (does not call applyGravity).
 * Returns { bitmap, xStart, xEnd } covering the union of all crater ranges.
 */
function applyDeforms(seedBitmap, craters) {
  const bitmap = seedBitmap.slice();
  let xStart = Infinity;
  let xEnd = -Infinity;
  for (const { cx, cy, r } of craters) {
    const range = deform(bitmap, cx, cy, r, false);
    if (range !== null) {
      if (range.xStart < xStart) xStart = range.xStart;
      if (range.xEnd > xEnd) xEnd = range.xEnd;
    }
  }
  if (!isFinite(xStart)) return null; // nothing deformed
  return { bitmap, xStart, xEnd };
}

// ---------------------------------------------------------------------------
// Test grid: seeds × crater configurations (including overlapping/MIRV-style)
// ---------------------------------------------------------------------------

const SEEDS = [0x1234, 0xabcd, 0xdeadbeef, 42, 999999];

const CRATER_CONFIGS = [
  // Single craters
  [{ cx: 400, cy: 350, r: 30 }],
  [{ cx: 100, cy: 400, r: 50 }],
  [{ cx: 1100, cy: 300, r: 25 }],
  [{ cx: 600, cy: 500, r: 60 }],
  // Overlapping discs (cluster/MIRV style)
  [
    { cx: 400, cy: 350, r: 25 },
    { cx: 420, cy: 360, r: 25 },
    { cx: 440, cy: 340, r: 20 },
  ],
  [
    { cx: 300, cy: 400, r: 40 },
    { cx: 340, cy: 390, r: 35 },
    { cx: 360, cy: 420, r: 30 },
    { cx: 320, cy: 430, r: 25 },
  ],
  // Near left edge
  [{ cx: 10, cy: 300, r: 30 }],
  // Near right edge
  [{ cx: CANVAS_WIDTH - 10, cy: 300, r: 30 }],
  // Large crater spanning many columns
  [{ cx: 600, cy: 350, r: 100 }],
  // Two separate craters (non-overlapping)
  [
    { cx: 200, cy: 350, r: 30 },
    { cx: 900, cy: 400, r: 40 },
  ],
];

// ---------------------------------------------------------------------------
// (1) CONVERGENCE PARITY across seeds × crater configs
// ---------------------------------------------------------------------------

console.log('[1] Convergence parity: settleStep-to-convergence == applyGravity');

let caseNum = 0;
for (const seed of SEEDS) {
  const heightLine = generate(seed);
  const baseBitmap = buildBitmap(heightLine);

  for (const craters of CRATER_CONFIGS) {
    caseNum++;
    const result = applyDeforms(baseBitmap, craters);
    if (result === null) {
      // No pixels in canvas were touched — skip
      continue;
    }
    const { xStart, xEnd } = result;

    // Copy A: instant applyGravity
    const bitmapA = result.bitmap.slice();
    applyGravity(bitmapA, xStart, xEnd);

    // Copy B: repeated settleStep to convergence
    const bitmapB = result.bitmap.slice();
    let iterations = 0;
    const MAX_ITER = Math.ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK) + 10;
    while (settleStep(bitmapB, xStart, xEnd, COLLAPSE_PX_PER_TICK)) {
      iterations++;
      if (iterations > MAX_ITER * 10) {
        ok(false, `case ${caseNum} (seed=${seed.toString(16)}): settleStep failed to converge within ${MAX_ITER * 10} iterations`);
        break;
      }
    }

    // Compare byte-by-byte
    let mismatch = false;
    for (let i = 0; i < bitmapA.length; i++) {
      if (bitmapA[i] !== bitmapB[i]) {
        mismatch = true;
        const x = i % CANVAS_WIDTH;
        const y = Math.floor(i / CANVAS_WIDTH);
        ok(false, `case ${caseNum} (seed=${seed.toString(16)}): bitmap mismatch at index ${i} (x=${x} y=${y}) A=${bitmapA[i]} B=${bitmapB[i]}`);
        break;
      }
    }
    if (!mismatch) {
      ok(true, `case ${caseNum} (seed=${seed.toString(16)}): byte-identical after ${iterations} settleStep calls`);
    }
  }
}

// ---------------------------------------------------------------------------
// (2) MOVE LIMIT — settleStep never moves a column's dirt top by more than pxPerTick
// ---------------------------------------------------------------------------

console.log('[2] Move limit: single settleStep call moves dirt top <= COLLAPSE_PX_PER_TICK per column');

{
  // Use a deformed bitmap where some columns have floating dirt
  const seed = SEEDS[0];
  const heightLine = generate(seed);
  const baseBitmap = buildBitmap(heightLine);
  // Create a large floating clump by carving a wide crater mid-column
  const result = applyDeforms(baseBitmap, [{ cx: 400, cy: 300, r: 80 }]);
  if (result !== null) {
    const { bitmap, xStart, xEnd } = result;

    // Record dirt tops before a single step
    const topsBefore = new Array(CANVAS_WIDTH);
    for (let x = xStart; x <= xEnd; x++) {
      topsBefore[x] = dirtTop(bitmap, x);
    }

    // Run exactly one settleStep
    settleStep(bitmap, xStart, xEnd, COLLAPSE_PX_PER_TICK);

    // Check each column
    let violates = false;
    for (let x = xStart; x <= xEnd; x++) {
      const topAfter = dirtTop(bitmap, x);
      const topBefore = topsBefore[x];
      // Dirt top moves DOWN (larger y) as solids settle; movement = topAfter - topBefore
      // (positive means the solid block dropped, i.e. topAfter > topBefore)
      const moved = topAfter - topBefore;
      if (moved > COLLAPSE_PX_PER_TICK) {
        violates = true;
        ok(false, `move limit: column x=${x} moved ${moved} px in one call (limit=${COLLAPSE_PX_PER_TICK})`);
        break;
      }
    }
    if (!violates) {
      ok(true, `move limit: no column moved more than ${COLLAPSE_PX_PER_TICK} px in a single settleStep call`);
    }
  }
}

// Also check a manually constructed bitmap with a large floating column
{
  // Construct a bitmap with a single column where all dirt is at the top (maximally floating)
  const bitmap = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  // Column 100: 50 solid pixels at y=0..49, rest air -> these need to fall to the bottom
  for (let y = 0; y < 50; y++) {
    bitmap[y * CANVAS_WIDTH + 100] = 1;
  }
  const topBefore = dirtTop(bitmap, 100); // should be 0
  settleStep(bitmap, 100, 100, COLLAPSE_PX_PER_TICK);
  const topAfter = dirtTop(bitmap, 100);
  const moved = topAfter - topBefore;
  ok(moved <= COLLAPSE_PX_PER_TICK, `move limit (manual): column moved ${moved} px, expected <= ${COLLAPSE_PX_PER_TICK}`);
  ok(moved > 0, `move limit (manual): column DID move (${moved} > 0) — not already settled`);
}

// ---------------------------------------------------------------------------
// (2b) OVERHANG — solid→air-gap→solid-floor columns: downward-only invariants
//      across every intermediate settleStep call.
//
//      These cases directly exercise the defect in the old rigid-block model:
//      a solid-at-top, air-gap, solid-floor column (what a crater carved through
//      a hill leaves). The old model would teleport the resting floor upward into
//      the floating mass. The new sand model must leave the floor in place while
//      only the floating overhang descends.
// ---------------------------------------------------------------------------

console.log('[2b] Overhang: downward-only invariants on solid→air-gap→solid-floor columns');

/**
 * Count the contiguous solid run at the BOTTOM of column x (the "resting run").
 * Returns 0 if the bottom pixel (y = CANVAS_HEIGHT-1) is air.
 */
function bottomRunCount(bitmap, x) {
  let count = 0;
  for (let y = CANVAS_HEIGHT - 1; y >= 0; y--) {
    if (bitmap[y * CANVAS_WIDTH + x] === 1) count++;
    else break;
  }
  return count;
}

// Overhang case 1: hand-built minimal column.
//   x=200: solid at y=100 (1 pixel floating), air 101-499, solid 500-599 (100px floor).
//   Expected: settleStep moves only the floating pixel downward;
//             floor (y=500-599) stays in place every intermediate step.
{
  const bitmap = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  const COL = 200;
  bitmap[100 * CANVAS_WIDTH + COL] = 1;          // floating grain at y=100
  for (let y = 500; y < CANVAS_HEIGHT; y++) {    // solid floor y=500..599
    bitmap[y * CANVAS_WIDTH + COL] = 1;
  }

  const totalSolids = solidCount(bitmap, COL);   // 1 + 100 = 101
  const initialBottomRun = bottomRunCount(bitmap, COL); // 100

  let stepCount = 0;
  const MAX_STEPS = Math.ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK) + 10;
  let prevTop = dirtTop(bitmap, COL);
  let invariantOk = true;

  while (settleStep(bitmap, COL, COL, COLLAPSE_PX_PER_TICK)) {
    stepCount++;

    // (a) Solid count must be conserved.
    const sc = solidCount(bitmap, COL);
    if (sc !== totalSolids) {
      ok(false, `overhang-1 step ${stepCount}: solid count changed — expected ${totalSolids} got ${sc}`);
      invariantOk = false;
    }

    // (b) Dirt top must be non-decreasing (surface descends, never rises).
    const top = dirtTop(bitmap, COL);
    if (top < prevTop) {
      ok(false, `overhang-1 step ${stepCount}: dirt top ROSE from y=${prevTop} to y=${top} (must only descend)`);
      invariantOk = false;
    }
    prevTop = top;

    // (c) Bottom contiguous resting run must never shrink.
    const br = bottomRunCount(bitmap, COL);
    if (br < initialBottomRun) {
      ok(false, `overhang-1 step ${stepCount}: bottom run shrank from ${initialBottomRun} to ${br} (floor pixels lost)`);
      invariantOk = false;
    }

    if (stepCount > MAX_STEPS) {
      ok(false, `overhang-1: failed to converge within ${MAX_STEPS} steps`);
      invariantOk = false;
      break;
    }
  }

  if (invariantOk) {
    ok(true, `overhang-1 (minimal, 1 floating grain): all per-step invariants held across ${stepCount} steps`);
  }
  ok(stepCount >= 2, `overhang-1: required >= 2 settleStep calls to converge, got ${stepCount}`);

  // Convergence parity: result must equal applyGravity on the same initial bitmap.
  {
    const bitmapRef = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    bitmapRef[100 * CANVAS_WIDTH + COL] = 1;
    for (let y = 500; y < CANVAS_HEIGHT; y++) bitmapRef[y * CANVAS_WIDTH + COL] = 1;
    applyGravity(bitmapRef, COL, COL);

    let mismatch = false;
    for (let i = 0; i < bitmap.length; i++) {
      if (bitmap[i] !== bitmapRef[i]) { mismatch = true; break; }
    }
    ok(!mismatch, 'overhang-1: settleStep convergence == applyGravity (byte-identical)');
  }
}

// Overhang case 2: thick floating clump above a floor.
//   x=400: solid y=50-99 (50px floating), air 100-399, solid 400-599 (200px floor).
//   The floating clump must descend until it merges with the floor;
//   the floor must never gain pixels from below (bottom run non-decreasing).
{
  const bitmap = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  const COL = 400;
  for (let y = 50; y < 100; y++) bitmap[y * CANVAS_WIDTH + COL] = 1;  // 50px floating
  for (let y = 400; y < CANVAS_HEIGHT; y++) bitmap[y * CANVAS_WIDTH + COL] = 1; // 200px floor

  const totalSolids = solidCount(bitmap, COL);           // 250
  const initialBottomRun = bottomRunCount(bitmap, COL);  // 200

  let stepCount = 0;
  const MAX_STEPS = Math.ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK) + 10;
  let prevTop = dirtTop(bitmap, COL);
  let invariantOk = true;

  while (settleStep(bitmap, COL, COL, COLLAPSE_PX_PER_TICK)) {
    stepCount++;

    const sc = solidCount(bitmap, COL);
    if (sc !== totalSolids) {
      ok(false, `overhang-2 step ${stepCount}: solid count changed — expected ${totalSolids} got ${sc}`);
      invariantOk = false;
    }

    const top = dirtTop(bitmap, COL);
    if (top < prevTop) {
      ok(false, `overhang-2 step ${stepCount}: dirt top ROSE from y=${prevTop} to y=${top}`);
      invariantOk = false;
    }
    prevTop = top;

    const br = bottomRunCount(bitmap, COL);
    if (br < initialBottomRun) {
      ok(false, `overhang-2 step ${stepCount}: bottom run shrank from ${initialBottomRun} to ${br}`);
      invariantOk = false;
    }

    if (stepCount > MAX_STEPS) {
      ok(false, `overhang-2: failed to converge within ${MAX_STEPS} steps`);
      invariantOk = false;
      break;
    }
  }

  if (invariantOk) {
    ok(true, `overhang-2 (thick floating clump): all per-step invariants held across ${stepCount} steps`);
  }
  ok(stepCount >= 2, `overhang-2: required >= 2 settleStep calls to converge, got ${stepCount}`);

  // Convergence parity
  {
    const bitmapRef = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    for (let y = 50; y < 100; y++) bitmapRef[y * CANVAS_WIDTH + COL] = 1;
    for (let y = 400; y < CANVAS_HEIGHT; y++) bitmapRef[y * CANVAS_WIDTH + COL] = 1;
    applyGravity(bitmapRef, COL, COL);

    let mismatch = false;
    for (let i = 0; i < bitmap.length; i++) {
      if (bitmap[i] !== bitmapRef[i]) { mismatch = true; break; }
    }
    ok(!mismatch, 'overhang-2: settleStep convergence == applyGravity (byte-identical)');
  }
}

// Overhang case 3: multiple floating clumps (two separate air-gap regions).
//   x=600: solid y=10-19 (10px), air 20-199, solid 200-299 (100px), air 300-399, solid 400-599 (200px).
//   Three separate solid runs; both upper runs must descend without disturbing each other
//   or the bottom floor until they merge.
{
  const bitmap = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  const COL = 600;
  for (let y = 10; y < 20; y++) bitmap[y * CANVAS_WIDTH + COL] = 1;   // top clump, 10px
  for (let y = 200; y < 300; y++) bitmap[y * CANVAS_WIDTH + COL] = 1; // mid clump, 100px
  for (let y = 400; y < CANVAS_HEIGHT; y++) bitmap[y * CANVAS_WIDTH + COL] = 1; // floor, 200px

  const totalSolids = solidCount(bitmap, COL);           // 310
  const initialBottomRun = bottomRunCount(bitmap, COL);  // 200

  let stepCount = 0;
  const MAX_STEPS = Math.ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK) + 10;
  let prevTop = dirtTop(bitmap, COL);
  let invariantOk = true;

  while (settleStep(bitmap, COL, COL, COLLAPSE_PX_PER_TICK)) {
    stepCount++;

    const sc = solidCount(bitmap, COL);
    if (sc !== totalSolids) {
      ok(false, `overhang-3 step ${stepCount}: solid count changed — expected ${totalSolids} got ${sc}`);
      invariantOk = false;
    }

    const top = dirtTop(bitmap, COL);
    if (top < prevTop) {
      ok(false, `overhang-3 step ${stepCount}: dirt top ROSE from y=${prevTop} to y=${top}`);
      invariantOk = false;
    }
    prevTop = top;

    const br = bottomRunCount(bitmap, COL);
    if (br < initialBottomRun) {
      ok(false, `overhang-3 step ${stepCount}: bottom run shrank from ${initialBottomRun} to ${br}`);
      invariantOk = false;
    }

    if (stepCount > MAX_STEPS) {
      ok(false, `overhang-3: failed to converge within ${MAX_STEPS} steps`);
      invariantOk = false;
      break;
    }
  }

  if (invariantOk) {
    ok(true, `overhang-3 (multiple floating clumps): all per-step invariants held across ${stepCount} steps`);
  }
  ok(stepCount >= 2, `overhang-3: required >= 2 settleStep calls to converge, got ${stepCount}`);

  console.log(`  overhang-3 settle ticks observed: ${stepCount}`);

  // Convergence parity
  {
    const bitmapRef = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    for (let y = 10; y < 20; y++) bitmapRef[y * CANVAS_WIDTH + COL] = 1;
    for (let y = 200; y < 300; y++) bitmapRef[y * CANVAS_WIDTH + COL] = 1;
    for (let y = 400; y < CANVAS_HEIGHT; y++) bitmapRef[y * CANVAS_WIDTH + COL] = 1;
    applyGravity(bitmapRef, COL, COL);

    let mismatch = false;
    for (let i = 0; i < bitmap.length; i++) {
      if (bitmap[i] !== bitmapRef[i]) { mismatch = true; break; }
    }
    ok(!mismatch, 'overhang-3: settleStep convergence == applyGravity (byte-identical)');
  }
}

// ---------------------------------------------------------------------------
// (3) TERMINATION — settleStep halts (returns false) for any deformed bitmap
// ---------------------------------------------------------------------------

console.log('[3] Termination: settleStep always reaches false within ceil(CANVAS_HEIGHT/COLLAPSE_PX_PER_TICK) calls');

{
  const maxCalls = Math.ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK);
  let worstCase = 0;

  for (const seed of SEEDS.slice(0, 3)) {
    const heightLine = generate(seed);
    const baseBitmap = buildBitmap(heightLine);
    const result = applyDeforms(baseBitmap, [{ cx: 400, cy: 200, r: 120 }]);
    if (result === null) continue;
    const { bitmap, xStart, xEnd } = result;

    let calls = 0;
    while (settleStep(bitmap, xStart, xEnd, COLLAPSE_PX_PER_TICK)) {
      calls++;
      if (calls > maxCalls * 2) break; // safety
    }
    if (calls > worstCase) worstCase = calls;
    ok(calls <= maxCalls, `termination (seed=${seed.toString(16)}): converged in ${calls} calls (limit=${maxCalls})`);
  }

  // Also run the overhang-3 case through the termination counter.
  {
    const bitmap = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    const COL = 600;
    for (let y = 10; y < 20; y++) bitmap[y * CANVAS_WIDTH + COL] = 1;
    for (let y = 200; y < 300; y++) bitmap[y * CANVAS_WIDTH + COL] = 1;
    for (let y = 400; y < CANVAS_HEIGHT; y++) bitmap[y * CANVAS_WIDTH + COL] = 1;
    let calls = 0;
    while (settleStep(bitmap, COL, COL, COLLAPSE_PX_PER_TICK)) {
      calls++;
      if (calls > maxCalls * 2) break;
    }
    if (calls > worstCase) worstCase = calls;
    ok(calls <= maxCalls, `termination (overhang-3): converged in ${calls} calls (limit=${maxCalls})`);
  }

  console.log(`  worst-case settle ticks observed: ${worstCase} (limit=${Math.ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK)})`);
  ok(worstCase >= 2, `worst-case settle ticks must be >= 2 (multi-step path is exercised), got ${worstCase}`);
}

// ---------------------------------------------------------------------------
// (4) IDEMPOTENCE — settleStep after convergence returns false and does not mutate
// ---------------------------------------------------------------------------

console.log('[4] Idempotence: calling settleStep after convergence returns false and does not change the bitmap');

{
  const seed = SEEDS[1];
  const heightLine = generate(seed);
  const baseBitmap = buildBitmap(heightLine);
  const result = applyDeforms(baseBitmap, [{ cx: 500, cy: 350, r: 50 }]);
  if (result !== null) {
    const { bitmap, xStart, xEnd } = result;

    // Converge
    while (settleStep(bitmap, xStart, xEnd, COLLAPSE_PX_PER_TICK)) { /* spin */ }

    // Snapshot
    const snapshot = bitmap.slice();

    // One more call must return false
    const moved = settleStep(bitmap, xStart, xEnd, COLLAPSE_PX_PER_TICK);
    ok(!moved, 'idempotence: settleStep after convergence returns false');

    // Bitmap must be unchanged
    let mutated = false;
    for (let i = 0; i < bitmap.length; i++) {
      if (bitmap[i] !== snapshot[i]) { mutated = true; break; }
    }
    ok(!mutated, 'idempotence: bitmap is unchanged after a no-op settleStep call');
  }
}

// ---------------------------------------------------------------------------
// (5) EMPTY RANGE — settleStep with a zero-width or out-of-bounds range is a no-op
// ---------------------------------------------------------------------------

console.log('[5] Edge: degenerate / empty column ranges');

{
  const bitmap = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  // A column of floating dirt at 200
  for (let y = 0; y < 30; y++) bitmap[y * CANVAS_WIDTH + 200] = 1;

  // xStart > xEnd: no columns — must return false and not mutate
  const snap = bitmap.slice();
  const r1 = settleStep(bitmap, 500, 100, COLLAPSE_PX_PER_TICK);
  ok(!r1, 'empty range (xStart>xEnd): returns false');
  let same = true;
  for (let i = 0; i < bitmap.length; i++) { if (bitmap[i] !== snap[i]) { same = false; break; } }
  ok(same, 'empty range (xStart>xEnd): bitmap unchanged');

  // Fully out-of-bounds range: must not throw
  let threw = false;
  try {
    const r2 = settleStep(bitmap, -100, -50, COLLAPSE_PX_PER_TICK);
    ok(!r2, 'fully OOB range: returns false');
  } catch (e) {
    threw = true;
    ok(false, `fully OOB range: threw unexpectedly — ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n===========================================');
console.log(`collapse check: ${pass} passed, ${failCount} failed`);
if (failed) {
  console.log('COLLAPSE CHECK: FAILED');
  process.exit(1);
} else {
  console.log('COLLAPSE CHECK: PASSED');
  process.exit(0);
}
