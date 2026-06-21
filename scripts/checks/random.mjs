// RANDOM check — locks in the contract of createRng() in shared/src/engine/Random.ts,
// the seeded mulberry32 + hashSeed stream that drives per-turn wind generation.
// Determinism is a HARD requirement (SPEC §4.4): same seed + same number of
// advances must yield an identical sequence on every client, or networked lockstep
// desyncs. Previously this was only tested indirectly via wind.mjs.
//
// Proves:
//   A. REPRODUCIBLE: two streams from the same seed yield byte-identical sequences.
//   B. SEED-SENSITIVE: two distinct finite seeds diverge (no accidental aliasing).
//   C. RANGE: every draw is a float in [0, 1).
//   D. EDGE SEEDS: NaN, ±Infinity, > 2^32, negative, and fractional seeds each
//      produce a STABLE, reproducible sequence in range. (hashSeed folds every
//      non-finite seed to 0x9e3779b9, so NaN and ±Infinity legitimately COINCIDE —
//      we assert reproducibility + range here, not distinctness, for those.)
//
// Deterministic: no I/O, no Math.random, no Date. Run: npx tsx scripts/checks/random.mjs

import { createRng } from '../../shared/src/engine/Random.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log('FAIL: ' + m); };
const draws = (rng, n) => Array.from({ length: n }, () => rng());

// --- A: same seed → identical sequence ---
{
  const a = draws(createRng(12345), 16);
  const b = draws(createRng(12345), 16);
  if (JSON.stringify(a) !== JSON.stringify(b)) fail('A: same seed produced different sequences');
  if (!failed) log('PASS: same seed yields a byte-identical sequence.');
}

// --- B: distinct finite seeds diverge ---
{
  const a = draws(createRng(1), 16);
  const b = draws(createRng(2), 16);
  if (JSON.stringify(a) === JSON.stringify(b)) fail('B: seeds 1 and 2 produced the same sequence (aliasing)');
  if (!failed) log('PASS: distinct finite seeds diverge.');
}

// --- C: every draw is in [0, 1) ---
{
  const seq = draws(createRng(999), 1000);
  const bad = seq.find((v) => !(v >= 0 && v < 1));
  if (bad !== undefined) fail(`C: draw out of [0,1): ${bad}`);
  if (!failed) log('PASS: 1000 draws all fall in [0, 1).');
}

// --- D: edge seeds are stable + in range ---
{
  const edges = [NaN, Infinity, -Infinity, 2 ** 33, -7, 3.14159];
  let dFailed = false;
  for (const seed of edges) {
    const a = draws(createRng(seed), 8);
    const b = draws(createRng(seed), 8);
    if (JSON.stringify(a) !== JSON.stringify(b)) { fail(`D: seed ${seed} not reproducible`); dFailed = true; }
    if (a.some((v) => !(v >= 0 && v < 1))) { fail(`D: seed ${seed} produced an out-of-range draw`); dFailed = true; }
  }
  // Confirm the documented non-finite fold: NaN and Infinity share one stream.
  if (JSON.stringify(draws(createRng(NaN), 4)) !== JSON.stringify(draws(createRng(Infinity), 4))) {
    fail('D: NaN and Infinity should fold to the same seed (hashSeed 0x9e3779b9)');
    dFailed = true;
  }
  if (!dFailed) log('PASS: edge seeds (NaN/±Inf/>2^32/negative/fractional) are stable and in range.');
}

if (failed) { log('\nRANDOM CHECK: FAILED'); process.exit(1); }
else { log('\nRANDOM CHECK: PASSED'); process.exit(0); }
