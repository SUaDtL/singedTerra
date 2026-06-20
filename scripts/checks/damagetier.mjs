// DAMAGETIER check for singedTerra client renderer helper (T10 — damage states).
// Covers the pure, DOM-free damageTier() helper in client/src/renderer/tankFx.ts
// which maps authoritative tank.health to a visual tier.
//
// Contract proved:
//   1. health=100  → 'healthy'
//   2. health=34   → 'healthy'  (strictly above the 33-threshold)
//   3. health=33   → 'damaged'  (inclusive at the threshold — < 34)
//   4. health=32   → 'damaged'
//   5. health=1    → 'damaged'
//   6. health=0    → 'dead'
//   7. health=-5   → 'dead'     (over-killed tanks go negative)
//   8. Output is exactly one of the three string literals (type-safety check)
//
// No Math.random, no Date, no DOM. Imports client TypeScript directly via tsx.
//
// Run: npx tsx scripts/checks/damagetier.mjs

import { damageTier } from '../../client/src/renderer/tankFx.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

const VALID = new Set(['healthy', 'damaged', 'dead']);

function check(health, expected, label) {
  const result = damageTier(health);
  if (!VALID.has(result)) fail(`damageTier(${health}) returned unknown tier "${result}"`);
  if (result !== expected) fail(`[${label}] damageTier(${health}) = "${result}", expected "${expected}"`);
  else log(`[${label}] damageTier(${health}) = "${result}": OK`);
}

// --- Check 1: full health → healthy ---
check(100, 'healthy', '1');

// --- Check 2: just above threshold → healthy ---
check(34, 'healthy', '2');

// --- Check 3: at threshold (33) → damaged (inclusive boundary) ---
check(33, 'damaged', '3');

// --- Check 4: below threshold → damaged ---
check(32, 'damaged', '4');

// --- Check 5: nearly dead → damaged ---
check(1, 'damaged', '5');

// --- Check 6: exactly zero → dead ---
check(0, 'dead', '6');

// --- Check 7: negative (overkill) → dead ---
check(-5, 'dead', '7');

// --- Check 8: output is always one of the three literals ---
{
  const sample = [100, 50, 33, 1, 0, -10];
  let allValid = true;
  for (const h of sample) {
    const t = damageTier(h);
    if (!VALID.has(t)) { fail(`damageTier(${h}) = "${t}" is not a valid tier`); allValid = false; }
  }
  if (allValid) log('[8] All sampled outputs are valid tier literals: OK');
}

if (failed) {
  log('\nDAMAGETIER CHECK: FAILED');
  process.exit(1);
} else {
  log('\nDAMAGETIER CHECK: PASSED');
  process.exit(0);
}
