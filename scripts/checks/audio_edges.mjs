// AUDIO_EDGES check for singedTerra client renderer helpers (T11 — render-side audio signals).
// Covers the pure, DOM-free edge-detection functions in
// client/src/renderer/audioEdges.ts that drive the three new audio cues:
//   - fireActiveEdge    → napalm crackle sustained source (start / stop)
//   - bettyHopCount     → per-bounce tick (bouncing-betty)
//   - isOobFizzle       → off-screen miss soft fizzle
//
// Contract proved:
//   fireActiveEdge:
//     1. (0 → >0)  returns 'start'
//     2. (>0 → 0)  returns 'stop'
//     3. (>0 → >0) returns null  (sustained; no edge)
//     4. (0  → 0)  returns null  (nothing happening)
//
//   bettyHopCount:
//     5. (3 → 2)  returns 1 (one bounce occurred)
//     6. (2 → 2)  returns 0 (no change)
//     7. (0 → 3)  returns 0 (increase = new shot reset, not a hop)
//     8. (1 → 0)  returns 1 (final bounce before detonation still a hop tick)
//     9. (5 → 3)  returns 2 (multi-step decrease yields correct delta)
//
//   isOobFizzle (truth table):
//    10. (true,  false, false) → true   (projectile gone, no explosion = OOB)
//    11. (true,  false, true)  → false  (projectile gone, but exploded = hit)
//    12. (true,  true,  false) → false  (still in flight)
//    13. (false, false, false) → false  (nothing happening; no prior projectile)
//    14. (false, true,  false) → false  (new projectile appeared; not a fizzle)
//
// No Math.random, no Date, no DOM. Imports client TypeScript directly via tsx.
//
// Run: npx tsx scripts/checks/audio_edges.mjs

import {
  fireActiveEdge,
  bettyHopCount,
  isOobFizzle,
} from '../../client/src/renderer/audioEdges.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

// ---- fireActiveEdge -----------------------------------------------------------

// Check 1: 0 → >0 = 'start'
{
  const result = fireActiveEdge(0, 3);
  if (result !== 'start') fail(`[1] fireActiveEdge(0, 3) = "${result}", expected "start"`);
  else log(`[1] fireActiveEdge(0, 3) = "start": OK`);
}

// Check 2: >0 → 0 = 'stop'
{
  const result = fireActiveEdge(3, 0);
  if (result !== 'stop') fail(`[2] fireActiveEdge(3, 0) = "${result}", expected "stop"`);
  else log(`[2] fireActiveEdge(3, 0) = "stop": OK`);
}

// Check 3: >0 → >0 = null (sustained; no edge)
{
  const result = fireActiveEdge(3, 5);
  if (result !== null) fail(`[3] fireActiveEdge(3, 5) = "${result}", expected null`);
  else log(`[3] fireActiveEdge(3, 5) = null: OK`);
}

// Check 4: 0 → 0 = null (nothing happening)
{
  const result = fireActiveEdge(0, 0);
  if (result !== null) fail(`[4] fireActiveEdge(0, 0) = "${result}", expected null`);
  else log(`[4] fireActiveEdge(0, 0) = null: OK`);
}

// ---- bettyHopCount ------------------------------------------------------------

// Check 5: 3 → 2 = 1 hop
{
  const result = bettyHopCount(3, 2);
  if (result !== 1) fail(`[5] bettyHopCount(3, 2) = ${result}, expected 1`);
  else log(`[5] bettyHopCount(3, 2) = 1: OK`);
}

// Check 6: 2 → 2 = 0 hops (no change)
{
  const result = bettyHopCount(2, 2);
  if (result !== 0) fail(`[6] bettyHopCount(2, 2) = ${result}, expected 0`);
  else log(`[6] bettyHopCount(2, 2) = 0: OK`);
}

// Check 7: 0 → 3 = 0 hops (increase = new shot/reset, not a hop)
{
  const result = bettyHopCount(0, 3);
  if (result !== 0) fail(`[7] bettyHopCount(0, 3) = ${result}, expected 0`);
  else log(`[7] bettyHopCount(0, 3) = 0 (increase ignored): OK`);
}

// Check 8: 1 → 0 = 1 hop (final bounce before detonation is still a hop tick)
{
  const result = bettyHopCount(1, 0);
  if (result !== 1) fail(`[8] bettyHopCount(1, 0) = ${result}, expected 1`);
  else log(`[8] bettyHopCount(1, 0) = 1: OK`);
}

// Check 9: 5 → 3 = 2 hops (multi-step decrease yields correct delta)
{
  const result = bettyHopCount(5, 3);
  if (result !== 2) fail(`[9] bettyHopCount(5, 3) = ${result}, expected 2`);
  else log(`[9] bettyHopCount(5, 3) = 2: OK`);
}

// ---- isOobFizzle (truth table) -----------------------------------------------

// Check 10: present → absent + no explosion = fizzle (OOB miss)
{
  const result = isOobFizzle(true, false, false);
  if (result !== true) fail(`[10] isOobFizzle(true, false, false) = ${result}, expected true`);
  else log(`[10] isOobFizzle(true, false, false) = true (OOB fizzle): OK`);
}

// Check 11: present → absent + explosion = NOT a fizzle (it hit something)
{
  const result = isOobFizzle(true, false, true);
  if (result !== false) fail(`[11] isOobFizzle(true, false, true) = ${result}, expected false`);
  else log(`[11] isOobFizzle(true, false, true) = false (detonated, not OOB): OK`);
}

// Check 12: present → present = NOT a fizzle (still in flight)
{
  const result = isOobFizzle(true, true, false);
  if (result !== false) fail(`[12] isOobFizzle(true, true, false) = ${result}, expected false`);
  else log(`[12] isOobFizzle(true, true, false) = false (still in flight): OK`);
}

// Check 13: no prior projectile + none now = NOT a fizzle
{
  const result = isOobFizzle(false, false, false);
  if (result !== false) fail(`[13] isOobFizzle(false, false, false) = ${result}, expected false`);
  else log(`[13] isOobFizzle(false, false, false) = false (nothing was in flight): OK`);
}

// Check 14: no prior projectile + new projectile appeared = NOT a fizzle
{
  const result = isOobFizzle(false, true, false);
  if (result !== false) fail(`[14] isOobFizzle(false, true, false) = ${result}, expected false`);
  else log(`[14] isOobFizzle(false, true, false) = false (new projectile, not a fizzle): OK`);
}

if (failed) {
  log('\nAUDIO_EDGES CHECK: FAILED');
  process.exit(1);
} else {
  log('\nAUDIO_EDGES CHECK: PASSED');
  process.exit(0);
}
