// TURN ROTATION check (13th harness) — guards the P0-3 fix: in 3-4 player games
// the next active seat must SKIP eliminated players. The networked referee can't
// run physics, so the authoritative client reports the next seat index (derived
// from the engine's activePlayerId) and the server stores it. This check proves
// the two things that fix depends on:
//   1. The engine's turn rotation is DEATH-AWARE: after a shot, advanceTurn skips
//      eliminated tanks — whereas a raw modulo cursor (the old referee) would
//      land on a dead seat and deadlock the game.
//   2. The seat-index derivation the client sends (Number('p{i+1}') - 1) maps the
//      engine tank id to the correct 0-based seat, and a fresh-engine REPLAY of an
//      action log reproduces the same activePlayerId (so every client agrees on
//      the reported index — safe for the server to trust).
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/turn_rotation.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function players(n) { return Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, color: PALETTE[i] })); }
function engine(n) { return new GameEngine({ players: players(n), maxPlayers: n, seed: SEED }); }
function tickToRest(e) { let t = 0; while (e.getState().phase === 'FIRING' && t < MAX_TICKS) { e.tick(); t++; } }
const seatIndex = (id) => Number(String(id).replace(/[^0-9]/g, '')) - 1; // 'p3' -> 2

// --- Check 1: rotation skips an eliminated middle seat (p1 -> p3, NOT p2) ---
{
  const e = engine(3);
  const st = e.getState();
  if (st.activePlayerId !== 'p1') fail(`expected p1 to open, got ${st.activePlayerId}`);

  // Eliminate the MIDDLE seat before p1 acts (simulates a prior kill). getState()
  // returns the live state by reference, so this marks p2 dead in the engine.
  st.tanks[1].alive = false;
  st.tanks[1].health = 0;

  // p1 fires any resolving shot (a miss still resolves the turn).
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 80 });
  e.applyAction({ type: 'set_power', power: 30 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);

  const next = e.getState().activePlayerId;
  const nextIdx = seatIndex(next);
  // Raw modulo from seat 0 in a 3-seat room would advance to seat 1 (= dead p2).
  const moduloIdx = (0 + 1) % 3;
  log(`[skip-dead] after p1 fired with p2 dead: next active = ${next} (seat ${nextIdx}); raw modulo would give seat ${moduloIdx} (p${moduloIdx + 1})`);
  if (next === 'p2') fail('rotation advanced to the ELIMINATED seat p2 — death-skipping broken (this is the deadlock bug)');
  if (next !== 'p3') fail(`expected rotation to skip dead p2 and land on p3, got ${next}`);
  if (nextIdx === moduloIdx) fail('death-aware index equals the raw modulo index — the check has no teeth here');
  if (!failed) log('PASS: turn rotation skips eliminated seats (p1 -> p3); raw modulo would deadlock on dead p2.');
}

// --- Check 2: seat-index derivation is correct for every seat ---
{
  const e = engine(4);
  const ids = e.getState().tanks.map((t) => t.id);
  const ok = ids.every((id, i) => seatIndex(id) === i);
  if (!ok) fail(`seat-index derivation wrong: ${ids.map((id) => `${id}->${seatIndex(id)}`).join(', ')}`);
  else log(`PASS: seat-index derivation maps ${ids.join('/')} -> 0/1/2/3 correctly.`);
}

// --- Check 3: a fresh-engine REPLAY reproduces activePlayerId (clients agree) ---
{
  // Drive a few turns on a live engine, recording the fire log; replay the SAME
  // log through a fresh engine and assert identical activePlayerId at the end —
  // this is exactly how the client computes the next index, so all clients agree.
  const live = engine(3);
  const fireLog = [];
  const aim = { weapon: 'baby_missile', angle: 70, power: 40 };
  for (let i = 0; i < 5; i++) {
    live.applyAction({ type: 'select_weapon', weapon: aim.weapon });
    live.applyAction({ type: 'set_angle', angle: aim.angle });
    live.applyAction({ type: 'set_power', power: aim.power });
    live.applyAction({ type: 'fire' });
    tickToRest(live);
    fireLog.push(aim);
    if (live.getState().phase === 'GAME_OVER') break;
  }
  const liveActive = live.getState().activePlayerId;

  const replay = engine(3);
  for (const a of fireLog) {
    replay.applyAction({ type: 'select_weapon', weapon: a.weapon });
    replay.applyAction({ type: 'set_angle', angle: a.angle });
    replay.applyAction({ type: 'set_power', power: a.power });
    replay.applyAction({ type: 'fire' });
    tickToRest(replay);
  }
  const replayActive = replay.getState().activePlayerId;
  if (liveActive !== replayActive) fail(`replay diverged on active player: live=${liveActive}, replay=${replayActive}`);
  else log(`PASS: fresh-engine replay reproduces the active player (${replayActive}) — every client computes the same next index.`);
}

if (failed) { log('\nTURN ROTATION CHECK: FAILED'); process.exit(1); }
else { log('\nTURN ROTATION CHECK: PASSED'); process.exit(0); }
