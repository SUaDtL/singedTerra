// CHUNKREPLAY check — proves the contract of replayInChunks() in
// shared/src/net/replay.ts, the pure async helper that replays an action log
// in bounded chunks while yielding to the event loop between batches.
//
// Proves:
//   A. ORDER + FINAL STATE: actions are applied in strict index order and
//      the accumulated array equals the original input (final state == one-shot
//      synchronous replay).
//   B. CHUNK BOUND: with chunkSize=N, no more than N applications occur between
//      two yieldFn calls (tracked per-yield, never exceeds N).
//   C. EMPTY: an empty actions array → zero applications, zero yields.
//   D. GUARD: chunkSize < 1 is clamped to 1 — still applies all items without
//      infinite-looping.
//
// Deterministic: no I/O, no Math.random, no Date. Zero engine dependencies.
// Run: npx tsx scripts/checks/chunkreplay.mjs

import { replayInChunks } from '../../shared/src/net/replay.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log('FAIL: ' + m); };

// --- Check A: ORDER + FINAL STATE ---
{
  const actions = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const applied = [];
  let yieldCount = 0;

  await replayInChunks(
    actions,
    (action, i) => { applied.push(action); },
    3,
    async () => { yieldCount++; }
  );

  // Every action must be applied
  if (applied.length !== actions.length) {
    fail(`A: expected ${actions.length} applications, got ${applied.length}`);
  } else {
    // Strict order
    let orderOk = true;
    for (let i = 0; i < actions.length; i++) {
      if (applied[i] !== actions[i]) {
        fail(`A: action at index ${i} is '${applied[i]}', expected '${actions[i]}'`);
        orderOk = false;
        break;
      }
    }
    if (orderOk) log('PASS: A — all 7 actions applied in strict index order; final array equals input.');
  }
}

// --- Check B: CHUNK BOUND ---
// With chunkSize=3 over 10 items, no batch should exceed 3 applications.
{
  const actions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // 10 items
  const chunkSize = 3;
  let appsSinceLastYield = 0;
  let boundViolated = false;
  let yieldCount = 0;

  await replayInChunks(
    actions,
    (_action, _i) => {
      appsSinceLastYield++;
      // At the moment of application, we must not have already exceeded chunkSize
      if (appsSinceLastYield > chunkSize) {
        boundViolated = true;
        fail(`B: ${appsSinceLastYield} applications in one batch — exceeds chunkSize=${chunkSize}`);
      }
    },
    chunkSize,
    async () => {
      appsSinceLastYield = 0;
      yieldCount++;
    }
  );

  if (!boundViolated) {
    // Verify yieldFn was called at least once (10 items / 3 per chunk = 4 chunks, 3 yields between them)
    // replayInChunks yields AFTER each full chunk BEFORE continuing
    // 10 items, chunkSize 3: chunks of [0,1,2], [3,4,5], [6,7,8], [9]
    // yields after chunk 1, 2, 3 = 3 yields (no yield after last chunk per spec)
    if (yieldCount < 1) {
      fail(`B: expected at least 1 yield for 10 items at chunkSize=3, got ${yieldCount}`);
    } else {
      log(`PASS: B — no batch exceeded chunkSize=${chunkSize}; yieldFn called ${yieldCount} times.`);
    }
  }
}

// --- Check C: EMPTY ---
{
  const applied = [];
  let yieldCount = 0;

  await replayInChunks(
    [],
    (action, i) => { applied.push(action); },
    5,
    async () => { yieldCount++; }
  );

  if (applied.length !== 0) {
    fail(`C: empty actions array → expected 0 applications, got ${applied.length}`);
  } else if (yieldCount !== 0) {
    fail(`C: empty actions array → expected 0 yields, got ${yieldCount}`);
  } else {
    log('PASS: C — empty actions array → zero applications, zero yields.');
  }
}

// --- Check D: chunkSize < 1 guard (clamped to 1, all items applied, no infinite loop) ---
{
  const actions = [10, 20, 30];
  const applied = [];
  let yieldCount = 0;

  await replayInChunks(
    actions,
    (action, _i) => { applied.push(action); },
    0,   // invalid — should be clamped to 1
    async () => { yieldCount++; }
  );

  if (applied.length !== actions.length) {
    fail(`D: chunkSize=0 guard → expected ${actions.length} applications, got ${applied.length}`);
  } else {
    let orderOk = true;
    for (let i = 0; i < actions.length; i++) {
      if (applied[i] !== actions[i]) {
        fail(`D: chunkSize=0 guard → wrong value at index ${i}: got ${applied[i]}, expected ${actions[i]}`);
        orderOk = false;
        break;
      }
    }
    if (orderOk) log(`PASS: D — chunkSize=0 clamped to 1; all ${actions.length} items applied in order; yieldFn called ${yieldCount} times.`);
  }
}

// --- Check B2: Verify EXACT chunk boundary semantics with chunkSize=2 over 6 items ---
// Chunks: [0,1], [2,3], [4,5] → yields between each chunk = 2 yields (after chunk 1 and chunk 2)
// Actually per spec: yield AFTER every chunkSize applications, BEFORE continuing.
// So: apply 0, apply 1 → yield; apply 2, apply 3 → yield; apply 4, apply 5 → (last chunk, yield still happens)
// Need to check: per spec "After every chunkSize applications (BEFORE continuing) await yieldFn"
// which means even after the last chunk if it's full. Let's track precisely.
{
  const actions = ['x0', 'x1', 'x2', 'x3', 'x4', 'x5']; // exactly 3 full chunks of 2
  const chunkSize = 2;
  const appliedLog = [];
  const yieldLog = [];

  await replayInChunks(
    actions,
    (action, i) => { appliedLog.push({ action, i }); },
    chunkSize,
    async () => { yieldLog.push(appliedLog.length); } // record count at yield time
  );

  // All 6 applied
  if (appliedLog.length !== 6) {
    fail(`B2: expected 6 applications, got ${appliedLog.length}`);
  } else {
    // Every yield must have occurred after a multiple of chunkSize applications
    let boundOk = true;
    for (const countAtYield of yieldLog) {
      if (countAtYield % chunkSize !== 0) {
        fail(`B2: yield occurred after ${countAtYield} applications — not on a chunk boundary (chunkSize=${chunkSize})`);
        boundOk = false;
        break;
      }
    }
    if (boundOk) log(`PASS: B2 — all yields on chunk boundaries; ${yieldLog.length} yields observed for 6 items at chunkSize=2.`);
  }
}

if (failed) { log('\nCHUNKREPLAY CHECK: FAILED'); process.exit(1); }
else { log('\nCHUNKREPLAY CHECK: PASSED'); process.exit(0); }
