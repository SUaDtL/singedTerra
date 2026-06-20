// Terrain strata band logic check for singedTerra.
//
// Asserts the `bandForY` pure helper that maps a world-y pixel coordinate to
// one of three strata bands (0 = surface earth, 1 = mid rock, 2 = deep rock).
// This is the unit contract for the strata coloring added in the
// stabilize-and-juice sprint (T7).
//
// Boundaries (inclusive lower / exclusive upper, y grows DOWNWARD):
//   band 0: y < STRATA_BAND_A   (topsoil / surface earth)
//   band 1: y < STRATA_BAND_B   (mid rock layer)
//   band 2: y >= STRATA_BAND_B  (deep rock)
//
// Fully DOM-free: `strata.ts` must not touch `document` at import time.
// Imports via relative path so tsx runs it without a build step.
//
// Run: npx tsx scripts/checks/strata.mjs

import { bandForY, STRATA_BAND_A, STRATA_BAND_B } from '../../client/src/renderer/strata.ts';

let failed = false;
const fail = (msg) => { failed = true; console.log(`FAIL: ${msg}`); };
const pass = (msg) => console.log(`PASS: ${msg}`);

// --- Structural sanity ---
if (typeof bandForY !== 'function') fail('bandForY is not exported as a function');
if (typeof STRATA_BAND_A !== 'number') fail('STRATA_BAND_A is not a number');
if (typeof STRATA_BAND_B !== 'number') fail('STRATA_BAND_B is not a number');
if (!(STRATA_BAND_A > 0)) fail(`STRATA_BAND_A must be > 0, got ${STRATA_BAND_A}`);
if (!(STRATA_BAND_B > STRATA_BAND_A)) fail(`STRATA_BAND_B must be > STRATA_BAND_A, got ${STRATA_BAND_B} vs ${STRATA_BAND_A}`);

// --- Band 0: y < STRATA_BAND_A (surface earth) ---
{
  const label = 'band 0 (surface earth)';
  const cases = [0, 1, Math.floor(STRATA_BAND_A / 2), STRATA_BAND_A - 1];
  for (const y of cases) {
    const b = bandForY(y);
    if (b !== 0) fail(`${label}: bandForY(${y}) expected 0, got ${b}`);
    else pass(`bandForY(${y}) = 0 (${label})`);
  }
}

// --- Band 0/1 boundary: STRATA_BAND_A is the first y NOT in band 0 ---
{
  const b = bandForY(STRATA_BAND_A);
  if (b !== 1) fail(`boundary STRATA_BAND_A=${STRATA_BAND_A}: expected band 1, got ${b}`);
  else pass(`bandForY(STRATA_BAND_A=${STRATA_BAND_A}) = 1 (boundary inclusive to band 1)`);
}

// --- Band 1: STRATA_BAND_A <= y < STRATA_BAND_B (mid rock) ---
{
  const label = 'band 1 (mid rock)';
  const mid = Math.floor((STRATA_BAND_A + STRATA_BAND_B) / 2);
  const cases = [STRATA_BAND_A, STRATA_BAND_A + 1, mid, STRATA_BAND_B - 1];
  for (const y of cases) {
    const b = bandForY(y);
    if (b !== 1) fail(`${label}: bandForY(${y}) expected 1, got ${b}`);
    else pass(`bandForY(${y}) = 1 (${label})`);
  }
}

// --- Band 1/2 boundary: STRATA_BAND_B is the first y in band 2 ---
{
  const b = bandForY(STRATA_BAND_B);
  if (b !== 2) fail(`boundary STRATA_BAND_B=${STRATA_BAND_B}: expected band 2, got ${b}`);
  else pass(`bandForY(STRATA_BAND_B=${STRATA_BAND_B}) = 2 (boundary inclusive to band 2)`);
}

// --- Band 2: y >= STRATA_BAND_B (deep rock) ---
{
  const label = 'band 2 (deep rock)';
  const cases = [STRATA_BAND_B, STRATA_BAND_B + 1, STRATA_BAND_B + 100, 599];
  for (const y of cases) {
    const b = bandForY(y);
    if (b !== 2) fail(`${label}: bandForY(${y}) expected 2, got ${b}`);
    else pass(`bandForY(${y}) = 2 (${label})`);
  }
}

// --- Return values are always in {0,1,2} for the full canvas height range ---
{
  let bad = 0;
  for (let y = 0; y < 600; y++) {
    const b = bandForY(y);
    if (b !== 0 && b !== 1 && b !== 2) { bad++; fail(`bandForY(${y})=${b} not in {0,1,2}`); }
  }
  if (bad === 0) pass('bandForY returns a value in {0,1,2} for all y in [0,599]');
}

// --- Pure / deterministic: same y always returns same band ---
{
  let drifted = false;
  for (let y = 0; y < 600; y++) {
    if (bandForY(y) !== bandForY(y)) { drifted = true; fail(`bandForY(${y}) not stable`); break; }
  }
  if (!drifted) pass('bandForY is stable (same y => same band on repeat call)');
}

if (failed) {
  console.log('\nSTRATA CHECK: FAILED');
  process.exit(1);
} else {
  console.log('\nSTRATA CHECK: PASSED');
  process.exit(0);
}
