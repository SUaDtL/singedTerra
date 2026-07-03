// MATH check — locks in the contract of clamp() in shared/src/engine/math.ts,
// the single numeric primitive the engine, AI, terrain, and UI all share. A
// silent change to its edge behavior (especially the INTENTIONAL NaN passthrough)
// could diverge hot-seat vs networked replay — exactly the drift this harness
// guards against.
//
// Proves:
//   A. In-range value passes through unchanged.
//   B. Below-lo clamps up to lo; above-hi clamps down to hi.
//   C. Both inclusive boundaries (v === lo, v === hi) return v.
//   D. NaN is PRESERVED (returned unchanged) — the documented behavior callers
//      rely on; "fixing" it would be a determinism break.
//   E. +Infinity clamps to hi, -Infinity clamps to lo.
//
// Deterministic: no I/O, no Math.random, no Date. Zero engine state.
// Run: npx tsx scripts/checks/math.mjs

import { clamp } from '../../shared/src/engine/math.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log('FAIL: ' + m); };
const eq = (got, want, label) => { if (got !== want) fail(`${label}: expected ${want}, got ${got}`); };

// --- A: in-range passthrough ---
eq(clamp(5, 0, 10), 5, 'A in-range');
eq(clamp(3.5, 0, 10), 3.5, 'A in-range fractional');
if (!failed) log('PASS: in-range value passes through unchanged.');

// --- B: out-of-range clamps to the nearer bound ---
eq(clamp(-1, 0, 10), 0, 'B below-lo');
eq(clamp(11, 0, 10), 10, 'B above-hi');
eq(clamp(-100, -10, -5), -10, 'B below-lo (negative range)');
if (!failed) log('PASS: out-of-range values clamp to lo / hi.');

// --- C: inclusive boundaries ---
eq(clamp(0, 0, 10), 0, 'C v===lo');
eq(clamp(10, 0, 10), 10, 'C v===hi');
if (!failed) log('PASS: inclusive boundaries return the boundary value.');

// --- D: NaN preservation (the load-bearing edge case) ---
{
  const got = clamp(NaN, 0, 10);
  if (!Number.isNaN(got)) fail(`D: clamp(NaN,0,10) must return NaN (documented), got ${got}`);
  if (!failed) log('PASS: NaN is preserved unchanged (documented determinism contract).');
}

// --- E: infinities ---
eq(clamp(Infinity, 0, 10), 10, 'E +Infinity → hi');
eq(clamp(-Infinity, 0, 10), 0, 'E -Infinity → lo');
if (!failed) log('PASS: ±Infinity clamp to hi / lo.');

if (failed) { log('\nMATH CHECK: FAILED'); process.exit(1); }
else { log('\nMATH CHECK: PASSED'); process.exit(0); }
