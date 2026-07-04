// REPLAY DETERMINISM check — pins AC-02 of the rejoin-after-refresh spec
// (.codearbiter/specs/rejoin-after-refresh.md): for an identical
// (seed + ordered action log), the engine state after a CHUNKED replay
// (via replayInChunks, the path NetworkClient.initialize() uses on rejoin)
// is byte-identical to the state after the current SYNCHRONOUS replay (apply
// each logged action then tick to completion, one after another).
//
// This harness is test-only — it does not modify NetworkClient, replay.ts, or
// any engine source. It exercises the real GameEngine (not a stub), through
// the SAME log->engine translation (replayNetworkAction) the live client uses,
// so a divergence here would mean chunking the replay changes the outcome —
// exactly the risk a rejoin-after-refresh flow (which replays in chunks so a
// long match doesn't freeze the tab) must not introduce.
//
// Fixed scenario (deterministic — no Math.random/Date.now/performance.now):
//   seed: 0xC0FFEE (2-player GameOptions, baby_missile is unlimited ammo)
//   log:  [fire(P1), fire(P2), fire(P1)]  — 3 NetworkActions, each a 'fire',
//         so a full ballistic arc + RESOLVING settle is exercised 3 times
//         (covers terrain deformation + tank health + turn advancement).
//
// Engine A: synchronous replay — replayNetworkAction(engineA, action) then
//           tick engineA to completion, once per logged action, in order.
// Engine B: chunked replay — the SAME log via replayInChunks(log, applyOne,
//           chunkSize=2, syncYield) where applyOne does the identical
//           replayNetworkAction + tick-to-completion, and syncYield is a
//           no-op async function (mirrors the live client's yield-to-event-loop
//           between chunks, which must never change engine outcome).
//
// Assert A and B are byte-identical on: activePlayerId, phase, turn,
// JSON.stringify(tanks), and a terrain digest (byte-sum over the per-pixel
// Uint8Array bitmap — cheap and sufficient to catch any deformation drift).
//
// Run: npx tsx scripts/checks/replay_determinism.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { replayInChunks, replayNetworkAction } from '../../shared/src/net/replay.ts';

const SEED = 0xC0FFEE;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function freshEngine() {
  return new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }],
    maxPlayers: 2,
    seed: SEED,
  });
}

function tickToCompletion(e) {
  let t = 0;
  while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) {
    e.tick();
    t++;
  }
}

// Fixed, deterministic log: three 'fire' NetworkActions (baby_missile — unlimited
// ammo, so no shot is ammo-gated). Alternating aims so both tanks fire in turn.
const LOG = [
  { type: 'fire', angle: 60,  power: 45, weapon: 'baby_missile' },
  { type: 'fire', angle: 110, power: 50, weapon: 'baby_missile' },
  { type: 'fire', angle: 75,  power: 60, weapon: 'baby_missile' },
];

function terrainDigest(terrain) {
  // Cheap rolling-sum digest over the per-pixel Uint8Array bitmap — sufficient
  // to catch any deformation/collapse drift between the two replay paths.
  let sum = 0;
  for (let i = 0; i < terrain.length; i++) sum = (sum + terrain[i] * (i + 1)) >>> 0;
  return sum;
}

function snapshot(engine) {
  const st = engine.getState();
  return {
    activePlayerId: st.activePlayerId,
    phase: st.phase,
    turn: st.turn,
    tanksJson: JSON.stringify(st.tanks),
    terrainDigest: terrainDigest(st.terrain),
  };
}

// --- Engine A: synchronous replay ---
const engineA = freshEngine();
for (const action of LOG) {
  replayNetworkAction(engineA, action);
  tickToCompletion(engineA);
}
const snapA = snapshot(engineA);

// --- Engine B: chunked replay (identical seed/options, SAME log) ---
const engineB = freshEngine();
const syncYield = async () => {};
await replayInChunks(
  LOG,
  (action) => {
    replayNetworkAction(engineB, action);
    tickToCompletion(engineB);
  },
  2, // chunkSize
  syncYield,
);
const snapB = snapshot(engineB);

// --- Assertions: byte-identical end states ---
if (snapA.activePlayerId !== snapB.activePlayerId) {
  fail(`activePlayerId diverged: sync=${snapA.activePlayerId} chunked=${snapB.activePlayerId}`);
} else {
  log(`PASS: activePlayerId identical (${snapA.activePlayerId}).`);
}

if (snapA.phase !== snapB.phase) {
  fail(`phase diverged: sync=${snapA.phase} chunked=${snapB.phase}`);
} else {
  log(`PASS: phase identical (${snapA.phase}).`);
}

if (snapA.turn !== snapB.turn) {
  fail(`turn diverged: sync=${snapA.turn} chunked=${snapB.turn}`);
} else {
  log(`PASS: turn identical (${snapA.turn}).`);
}

if (snapA.tanksJson !== snapB.tanksJson) {
  fail('tanks diverged between synchronous and chunked replay');
  log(`  sync:    ${snapA.tanksJson}`);
  log(`  chunked: ${snapB.tanksJson}`);
} else {
  log('PASS: tanks (JSON) identical.');
}

if (snapA.terrainDigest !== snapB.terrainDigest) {
  fail(`terrain digest diverged: sync=${snapA.terrainDigest} chunked=${snapB.terrainDigest}`);
} else {
  log(`PASS: terrain digest identical (${snapA.terrainDigest}).`);
}

if (failed) { log('\nREPLAY DETERMINISM CHECK: FAILED'); process.exit(1); }
else { log('\nREPLAY DETERMINISM CHECK: PASSED'); process.exit(0); }
