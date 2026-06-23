// BROWSELABELS check — locks the contract of the pure room-browser row label mappers
// in client/src/ui/browseLabels.ts (armsLabel / roundsLabel / botLabel). These render
// match-shape metadata on each public-room row; this harness guards their edge behavior
// (especially the armsLevel-0 "Basic" case and out-of-range clamping) since there is no
// DOM test harness for the row itself.
//
// Proves:
//   A. armsLabel: 0→"Basic", 4→"Full arsenal", 1..3→"Arms Lv {n}".
//   B. armsLabel: out-of-range input clamps into 0..4 before labeling.
//   C. roundsLabel: 1→"Single", N>1→"Best of {n}".
//   D. botLabel: 0→"" (omitted), N>0→"{n} CPU".
//
// Deterministic: no I/O, no Math.random, no Date. Pure functions only.
// Run: npx tsx scripts/checks/browselabels.mjs

import { armsLabel, roundsLabel, botLabel } from '../../client/src/ui/browseLabels.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log('FAIL: ' + m); };
const eq = (got, want, label) => { if (got !== want) fail(`${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };

// --- A: armsLabel core mapping ---
eq(armsLabel(0), 'Basic', 'A arms 0');
eq(armsLabel(4), 'Full arsenal', 'A arms 4');
eq(armsLabel(1), 'Arms Lv 1', 'A arms 1');
eq(armsLabel(2), 'Arms Lv 2', 'A arms 2');
eq(armsLabel(3), 'Arms Lv 3', 'A arms 3');
if (!failed) log('PASS: armsLabel maps 0/4/1-3 to the expected tier labels.');

// --- B: armsLabel clamps out-of-range before labeling ---
eq(armsLabel(-1), 'Basic', 'B arms below-range → 0');
eq(armsLabel(9), 'Full arsenal', 'B arms above-range → 4');
if (!failed) log('PASS: armsLabel clamps out-of-range input into 0..4.');

// --- C: roundsLabel ---
eq(roundsLabel(1), 'Single', 'C rounds 1');
eq(roundsLabel(5), 'Best of 5', 'C rounds 5');
eq(roundsLabel(3), 'Best of 3', 'C rounds 3');
if (!failed) log('PASS: roundsLabel maps single vs best-of-N.');

// --- D: botLabel ---
eq(botLabel(0), '', 'D bots 0 omitted');
eq(botLabel(1), '1 CPU', 'D bots 1');
eq(botLabel(2), '2 CPU', 'D bots 2');
if (!failed) log('PASS: botLabel omits zero and labels CPU counts.');

if (failed) { log('\nBROWSELABELS CHECK: FAILED'); process.exit(1); }
else { log('\nBROWSELABELS CHECK: PASSED'); process.exit(0); }
