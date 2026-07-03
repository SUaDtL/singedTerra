// Local-input gate policy (GH #52): keyboard/mouse/touch aim+fire must be
// dropped while a CPU tank holds the turn OR the in-game Pause overlay is open.
// Run: npx tsx scripts/checks/inputgate.mjs
//
// REFUTES "a paused player can still change aim or fire by reflex" and the
// regression "the pause gate broke the existing AI input-drop guard." This pins
// the pure decision policy (shouldAcceptLocalInput) — DOM-free so it runs under
// tsx with no browser. The DOM wiring (HUD.isPaused + main.ts emit gate) rides
// on this same predicate and is covered by the strict typecheck.

import { shouldAcceptLocalInput } from '../../client/src/input/inputGate.ts';

let failures = 0;
let checks = 0;
function fail(msg) {
  failures++;
  console.log('  FAIL: ' + msg);
}
function ok(msg) {
  checks++;
  console.log('  ok:   ' + msg);
}
function eq(actual, expected, label) {
  if (actual === expected) ok(`${label} => ${actual}`);
  else fail(`${label}: expected ${expected}, got ${actual}`);
}

console.log('inputgate: local-input accept policy');

// OB3 — normal play: a human turn, not paused → input is honored.
eq(shouldAcceptLocalInput({ activeIsAi: false, paused: false }), true,
  'human turn, not paused -> accept');

// OB1 — the fix: pause overlay open (human turn) → input is suppressed.
eq(shouldAcceptLocalInput({ activeIsAi: false, paused: true }), false,
  'human turn, PAUSED -> drop');

// OB2 — regression: a CPU turn still drops input (existing activeIsAi guard).
eq(shouldAcceptLocalInput({ activeIsAi: true, paused: false }), false,
  'AI turn, not paused -> drop');

// Either condition alone drops; together they still drop (no XOR foot-gun).
eq(shouldAcceptLocalInput({ activeIsAi: true, paused: true }), false,
  'AI turn AND paused -> drop');

console.log(`\ninputgate: ${checks} ok, ${failures} failed`);
if (failures > 0) process.exit(1);
