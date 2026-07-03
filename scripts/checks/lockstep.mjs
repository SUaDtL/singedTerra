// LOCKSTEP ORDERING check (12th harness) — guards the P0-2 fix: buffered network
// actions must be applied one-at-a-time and NEVER dropped, even when a later seq
// arrives before an earlier one and while a previous shot is still in flight.
//
// This does NOT instantiate NetworkClient (it is coupled to Supabase + rAF);
// instead it reproduces the EXACT sequencing discipline NetworkClient now uses
// against the real engine, and proves:
//   1. CORRECT discipline (apply only while phase===PLAYER_TURN; let the "rAF loop"
//      tick the flight to completion between turn-ending actions) applies BOTH of
//      two contiguous fires — even delivered out of order — and reaches a final
//      state byte-identical to a straight single-threaded replay of the same log.
//   2. The OLD buggy discipline (drain the whole buffer in one pass without the
//      phase guard) DROPS the second fire — so this check has teeth and would
//      catch a regression.
//
// The drop happens because GameEngine.applyAction ignores input unless
// phase===PLAYER_TURN: a fire applied while the engine is FIRING is silently
// discarded, and advancing nextExpectedSeq past it loses the action forever.
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/lockstep.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function freshEngine() {
  return new GameEngine({ players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }], maxPlayers: 2, seed: SEED });
}
function tickToCompletion(e) { let t = 0; while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) { e.tick(); t++; } }

// A logged fire action (NetworkFireAction shape) — baby_missile is unlimited so
// neither shot is ammo-gated; the two shots use distinct aims.
const LOG = [
  { type: 'fire', angle: 60, power: 45, weapon: 'baby_missile' },
  { type: 'fire', angle: 110, power: 50, weapon: 'baby_missile' },
];

// Mirror NetworkClient.applyNetworkAction (fire => the four sub-actions).
function applyNetworkAction(engine, a) {
  engine.applyAction({ type: 'set_angle', angle: a.angle });
  engine.applyAction({ type: 'set_power', power: a.power });
  engine.applyAction({ type: 'select_weapon', weapon: a.weapon });
  engine.applyAction({ type: 'fire' });
}

function serialize(st) {
  return JSON.stringify({
    phase: st.phase, turn: st.turn, activePlayerId: st.activePlayerId, wind: st.wind, winner: st.winner,
    tanks: st.tanks.map((t) => ({ id: t.id, x: t.x, y: t.y, health: t.health, alive: t.alive })),
    terrain: Buffer.from(st.terrain).toString('hex'),
  });
}

// Reference: straight single-threaded replay (apply, tick to completion, repeat).
function reference() {
  const e = freshEngine();
  for (const a of LOG) { applyNetworkAction(e, a); tickToCompletion(e); }
  return serialize(e.getState());
}
const REF = reference();

// --- Check 1: CORRECT discipline, with OUT-OF-ORDER delivery, drops nothing ---
{
  const e = freshEngine();
  const pending = new Map();
  let nextSeq = 0;

  // The P0-2 drain: apply contiguous buffered actions ONLY while PLAYER_TURN; a
  // fire flips to FIRING and the loop stops (the rAF loop resolves it, below).
  const drain = () => {
    while (e.getState().phase === 'PLAYER_TURN' && pending.has(nextSeq)) {
      const a = pending.get(nextSeq);
      pending.delete(nextSeq);
      nextSeq++;
      applyNetworkAction(e, a);
    }
  };

  // seq 1 ARRIVES FIRST (out of order) — buffered, cannot apply (gap at 0).
  pending.set(1, LOG[1]);
  drain();
  if (nextSeq !== 0) fail('applied an action despite a seq gap (out-of-order safety broken)');

  // seq 0 arrives — drain applies it (=> FIRING) then STOPS with seq 1 still buffered.
  pending.set(0, LOG[0]);
  drain();
  if (nextSeq !== 1) fail(`drain applied ${nextSeq} actions, expected exactly 1 (must stop once FIRING)`);
  if (e.getState().phase !== 'FIRING') fail('first fire did not put the engine into FIRING');
  if (!pending.has(1)) fail('second action was consumed while the first was still in flight (would be DROPPED)');

  // Simulate the rAF loop animating the flight to completion, then re-draining
  // (NetworkClient does this when FIRING -> PLAYER_TURN).
  tickToCompletion(e);
  drain();
  if (nextSeq !== 2) fail(`after flight resolved, expected both actions applied (nextSeq=2), got ${nextSeq}`);
  tickToCompletion(e);

  if (serialize(e.getState()) !== REF) fail('lockstep drain diverged from the single-threaded reference replay');
  if (!failed) log('PASS: out-of-order buffered fires apply one-at-a-time and match the reference (nothing dropped).');
}

// --- Check 2: the OLD buggy discipline DROPS the second fire (teeth) ---
{
  const e = freshEngine();
  // Buggy: drain the whole buffer in one synchronous pass with NO phase guard
  // and no tick between (the pre-fix behavior).
  const buggy = [LOG[0], LOG[1]];
  for (const a of buggy) applyNetworkAction(e, a); // second hits the FIRING phase guard
  tickToCompletion(e);
  const buggyState = serialize(e.getState());
  if (buggyState === REF) fail('the buggy one-pass drain did NOT drop the second fire — this regression check has no teeth');
  else log('PASS: the pre-fix one-pass drain provably DROPS the second fire (regression guard is real).');
}

if (failed) { log('\nLOCKSTEP CHECK: FAILED'); process.exit(1); }
else { log('\nLOCKSTEP CHECK: PASSED'); process.exit(0); }
