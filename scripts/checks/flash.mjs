// FLASH check for the singedTerra client renderer helpers (T9 — juice effects).
// Covers the pure, DOM-free helper functions in client/src/renderer/explosionFx.ts
// that drive the canvas light-flash and scorch decal draw passes.
//
// Asserts (flashIntensity):
//   1. Returns 0 when age >= lifeFrames (effect is over).
//   2. Stays within [0, 1] for all (age, lifeFrames, radius) inputs.
//   3. Peaks near the start of life (age 0 or age 1 >= intensity at later frames).
//   4. Monotonically decays after the peak frame (once past the hold window).
//   5. Scales with radius: a larger blast produces a strictly higher intensity at
//      the same age/lifeFrames than a smaller one (up to the cap).
//   6. Returns 0 for degenerate inputs (lifeFrames <= 0, radius <= 0).
//
// Asserts (scorchAlpha):
//   7. Returns 0 when age >= lifeFrames.
//   8. Returns 1 (full opacity) at age 0.
//   9. Monotonically decays from age 0 to lifeFrames-1.
//  10. Returns 0 for degenerate input (lifeFrames <= 0).
//
// No Math.random, no Date, no DOM. Imports client TypeScript directly via tsx.
//
// Run: npx tsx scripts/checks/flash.mjs

import { flashIntensity, scorchAlpha } from '../../client/src/renderer/explosionFx.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

// --- Check 1: returns 0 at age >= lifeFrames ---
{
  const life = 20;
  const radius = 30;
  for (const age of [life, life + 1, life + 10, life * 5]) {
    const v = flashIntensity(age, life, radius);
    if (v !== 0) fail(`flashIntensity(age=${age}, life=${life}, r=${radius}) = ${v}, expected 0 (age >= life)`);
  }
  log('[1] flashIntensity returns 0 when age >= lifeFrames: OK');
}

// --- Check 2: stays in [0, 1] across a broad sweep ---
{
  let maxSeen = 0;
  for (const life of [1, 5, 10, 20, 30, 60]) {
    for (const radius of [5, 10, 30, 60, 90, 120]) {
      for (let age = 0; age <= life + 2; age++) {
        const v = flashIntensity(age, life, radius);
        if (v < 0 || v > 1) fail(`flashIntensity(${age},${life},${radius}) = ${v} outside [0,1]`);
        if (v > maxSeen) maxSeen = v;
      }
    }
  }
  log(`[2] flashIntensity always in [0,1] (max observed=${maxSeen.toFixed(4)}): OK`);
}

// --- Check 3: peaks near the start (age 0 intensity >= all later ages) ---
{
  const life = 20;
  const radius = 30;
  const i0 = flashIntensity(0, life, radius);
  if (i0 <= 0) fail(`flashIntensity at age=0 should be > 0, got ${i0}`);
  for (let age = 1; age < life; age++) {
    const iv = flashIntensity(age, life, radius);
    if (iv > i0 + 1e-12) fail(`flashIntensity at age=${age} (${iv}) exceeds peak at age=0 (${i0}) — peak must be near the start`);
  }
  log(`[3] flashIntensity peaks at age=0 (${i0.toFixed(4)}), never exceeded by later frames: OK`);
}

// --- Check 4: monotonically decays after the hold window ---
// After the hold fraction of life, each successive frame must be <= the previous.
{
  const life = 30;
  const radius = 30;
  const HOLD_FRAC = 0.12;
  const holdEnd = Math.floor(HOLD_FRAC * life);
  let prev = flashIntensity(holdEnd, life, radius);
  for (let age = holdEnd + 1; age < life; age++) {
    const cur = flashIntensity(age, life, radius);
    if (cur > prev + 1e-12) fail(`flashIntensity not monotone after hold: age ${age} (${cur.toFixed(6)}) > age ${age - 1} (${prev.toFixed(6)})`);
    prev = cur;
  }
  log('[4] flashIntensity monotonically decays after the hold window: OK');
}

// --- Check 5: scales with radius ---
{
  const life = 20;
  const age = 0;
  const small = flashIntensity(age, life, 10);
  const medium = flashIntensity(age, life, 30);
  const large = flashIntensity(age, life, 60);
  if (!(small < medium)) fail(`radius scaling broken: small(r=10)=${small} >= medium(r=30)=${medium}`);
  if (!(medium < large)) fail(`radius scaling broken: medium(r=30)=${medium} >= large(r=60)=${large}`);
  log(`[5] flashIntensity scales with radius — small=${small.toFixed(4)} medium=${medium.toFixed(4)} large=${large.toFixed(4)}: OK`);
}

// --- Check 6: degenerate inputs return 0 ---
{
  const cases = [
    [0, 0, 30],
    [0, -1, 30],
    [0, 20, 0],
    [0, 20, -5],
  ];
  for (const [age, life, radius] of cases) {
    const v = flashIntensity(age, life, radius);
    if (v !== 0) fail(`flashIntensity(${age},${life},${radius}) = ${v}, expected 0 for degenerate input`);
  }
  log('[6] flashIntensity returns 0 for degenerate inputs (life<=0, radius<=0): OK');
}

// --- Check 7: scorchAlpha returns 0 when age >= lifeFrames ---
{
  const life = 40;
  for (const age of [life, life + 1, life + 50]) {
    const v = scorchAlpha(age, life);
    if (v !== 0) fail(`scorchAlpha(age=${age}, life=${life}) = ${v}, expected 0`);
  }
  log('[7] scorchAlpha returns 0 when age >= lifeFrames: OK');
}

// --- Check 8: scorchAlpha returns 1 at age 0 ---
{
  const v = scorchAlpha(0, 40);
  if (Math.abs(v - 1) > 1e-12) fail(`scorchAlpha(0, 40) = ${v}, expected 1`);
  log(`[8] scorchAlpha at age=0 is 1 (${v}): OK`);
}

// --- Check 9: scorchAlpha monotonically decays age 0..lifeFrames-1 ---
{
  const life = 40;
  let prev = scorchAlpha(0, life);
  for (let age = 1; age < life; age++) {
    const cur = scorchAlpha(age, life);
    if (cur > prev + 1e-12) fail(`scorchAlpha not monotone: age ${age} (${cur}) > age ${age - 1} (${prev})`);
    prev = cur;
  }
  log('[9] scorchAlpha monotonically decays over its lifetime: OK');
}

// --- Check 10: scorchAlpha degenerate input ---
{
  if (scorchAlpha(0, 0) !== 0) fail('scorchAlpha(0, 0) should be 0 (degenerate life=0)');
  if (scorchAlpha(0, -1) !== 0) fail('scorchAlpha(0, -1) should be 0 (degenerate life=-1)');
  log('[10] scorchAlpha returns 0 for degenerate inputs: OK');
}

if (failed) {
  log('\nFLASH CHECK: FAILED');
  process.exit(1);
} else {
  log('\nFLASH CHECK: PASSED');
  process.exit(0);
}
