// GameEngine.clone() field-parity guard (architecture-004 / #60).
//
// clone() hand-enumerates every private field + rebuilds GameState. When a new
// engine field is added but NOT added to clone(), the clone silently diverges
// from the original — and because clone() feeds the networked next-seat
// derivation (NetworkClient.computeNextSeat), that divergence can desync lockstep
// with NO type error and NO hot-seat symptom. This check fails the build if a
// clone is missing any own-property key the original has, or if any copied field
// differs in value, or if the clone shares the terrain buffer with the original.
//
// Run: npx tsx scripts/checks/engine_clone_parity.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED = 0xc0ffee;

/** Structural value-equality that understands typed arrays + Maps, and treats two
 *  functions as equal (closures like the wind RNG can't be compared — their
 *  PRESENCE as a key is what the parity check verifies). */
function valEq(a, b) {
  if (a === b) return true;
  if (typeof a === 'function' && typeof b === 'function') return true;
  if (a == null || b == null) return a === b;
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !valEq(v, b.get(k))) return false;
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => valEq(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => valEq(a[k], b[k]));
  }
  return false;
}

// Build an engine and drive it through a fire + partial resolution so as many
// fields as possible are populated (shooterId, shotDamage, fire field, pendingSettle, ...).
const engine = new GameEngine({ maxPlayers: 2, seed: SEED });
engine.applyAction({ type: 'set_angle', angle: 45 });
engine.applyAction({ type: 'set_power', power: 40 });
engine.applyAction({ type: 'fire' });
for (let i = 0; i < 40 && (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING'); i++) {
  engine.tick();
}

const clone = engine.clone();

let failed = false;
const log = (...a) => console.log(...a);

// 1) Key-set parity — the core drift catcher (a field omitted from clone() is absent here).
const oKeys = Object.keys(engine).sort();
const cKeys = Object.keys(clone).sort();
const missingInClone = oKeys.filter((k) => !cKeys.includes(k));
const extraInClone = cKeys.filter((k) => !oKeys.includes(k));
if (missingInClone.length || extraInClone.length) {
  failed = true;
  log('FAIL: clone() own-property keys diverge from the original.');
  if (missingInClone.length) log(`  missing in clone (field not copied by clone()): ${missingInClone.join(', ')}`);
  if (extraInClone.length) log(`  extra in clone: ${extraInClone.join(', ')}`);
} else {
  log(`PASS: clone() copies all ${oKeys.length} own-property fields.`);
}

// 2) Value parity — a field copied with a wrong/empty value.
const valueMismatches = oKeys.filter((k) => cKeys.includes(k) && !valEq(engine[k], clone[k]));
if (valueMismatches.length) {
  failed = true;
  log(`FAIL: clone() fields differ in value from the original: ${valueMismatches.join(', ')}`);
} else {
  log('PASS: every copied field is value-equal to the original.');
}

// 3) Terrain independence — clone must deep-copy the 720k-byte bitmap, not alias it
//    (an aliased buffer would silently share deformations across the clone/original).
const idx = 0;
const originalPixel = engine.getState().terrain[idx];
clone.getState().terrain[idx] = 255; // 255 never occurs in a 0/1 bitmap
if (engine.getState().terrain[idx] === 255) {
  failed = true;
  log('FAIL: clone() shares the terrain buffer with the original (aliased, not deep-copied).');
} else {
  log('PASS: clone() terrain is an independent buffer.');
}
engine.getState().terrain[idx] = originalPixel; // restore (harness hygiene)

// 4) Construction-option ownership — later caller mutation must not change the
// roster, loadout, or hazards used when either the original or an existing clone
// starts its next round. This is a one-time small config ownership check; it is
// deliberately separate from the live 720,000-byte terrain bitmap publication contract.
const callerOptions = {
  maxPlayers: 2,
  seed: SEED,
  rounds: 3,
  hazards: 'lava',
  players: [
    {
      name: 'Owned Ranger',
      color: '#e8554d',
      loadout: { treads: 'ranger', hull: 'bulwark', turret: 'jackal', barrel: 'foundry' },
    },
    { name: 'Owned CPU', color: '#3f78b8', ai: 'hard' },
  ],
};
const expectedOptions = structuredClone(callerOptions);
const optionOwner = new GameEngine(callerOptions);
const optionOwnerClone = optionOwner.clone();
const expectedOwner = new GameEngine(expectedOptions);

callerOptions.hazards = 'none';
callerOptions.players[0].name = 'MUTATED NAME';
callerOptions.players[0].loadout.treads = 'foundry';

function enterNextRound(candidate) {
  const state = candidate.getState();
  state.tanks[1].alive = false;
  state.tanks[1].health = 0;
  if (!candidate.applyAction({ type: 'use_shield', weapon: 'shield' })
    || candidate.getState().phase !== 'ROUND_OVER'
    || !candidate.applyAction({ type: 'next_round' })) {
    throw new Error('clone option-ownership fixture could not enter its next round');
  }
}

for (const candidate of [optionOwner, optionOwnerClone, expectedOwner]) enterNextRound(candidate);
const expectedNextRound = expectedOwner.getState();
const optionOwnershipFailures = [optionOwner, optionOwnerClone].flatMap((candidate, candidateIndex) => {
  const next = candidate.getState();
  const label = candidateIndex === 0 ? 'original' : 'clone';
  const failures = [];
  if (next.tanks[0].playerName !== expectedNextRound.tanks[0].playerName) failures.push(`${label} roster`);
  if (!valEq(next.tanks[0].loadout, expectedNextRound.tanks[0].loadout)) failures.push(`${label} loadout`);
  if (!valEq(next.terrain, expectedNextRound.terrain)) failures.push(`${label} hazards`);
  return failures;
});
if (optionOwnershipFailures.length) {
  failed = true;
  log(`FAIL: caller mutation changed retained construction options: ${optionOwnershipFailures.join(', ')}`);
} else {
  log('PASS: original and clone own roster, loadout, and hazard config across the next round.');
}

if (failed) {
  log('\nCLONE PARITY CHECK: FAILED — GameEngine.clone() drifted from the engine fields. Add the missing field(s) to clone().');
  process.exit(1);
} else {
  log('\nCLONE PARITY CHECK: PASSED');
  process.exit(0);
}
