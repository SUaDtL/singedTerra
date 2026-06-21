// INTEREST check — guards the ROUND_OVER credit-interest economy (se-parity-economy
// sprint, Feature 1). At each round boundary every tank earns floor(credits * rate)
// interest, applied to the post-payout balance, INTEGER-only (no replay float drift),
// and a pure function of (carried credits, configured rate). Proves:
//   1. BACK-COMPAT: interestRate unset (or 0) carries credits unchanged (no interest).
//   2. EARNS: interestRate r => a tank's carried credits become c + floor(c*r).
//   3. INTEGER-ONLY: the credited interest is floored; credits never go fractional.
//   4. NO BOUNDARY, NO INTEREST: a single-round match never applies interest; interest
//      is applied exactly once per round transition.
//   5. DETERMINISM + clone parity: same seed + driver => byte-identical credits; a clone
//      mid-match advances identically (interestRate is copied by clone()).
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/interest.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { TURN_STIPEND } from '../../shared/src/engine/WeaponSystem.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function players(n) { return Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, color: PALETTE[i] })); }
function engine(n, opts = {}) { return new GameEngine({ players: players(n), maxPlayers: n, seed: SEED, ...opts }); }
function tickToRest(e) { let t = 0; while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) { e.tick(); t++; } }

// End the current round with p1 as the sole survivor (winner + shooter), exactly like
// rounds.mjs: mark every other tank dead, then p1 fires a far harmless shot that resolves.
function p1WinsRound(e) {
  const st = e.getState();
  for (let i = 1; i < st.tanks.length; i++) { st.tanks[i].alive = false; st.tanks[i].health = 0; }
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 90 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
}
function startNextRound(e) { e.applyAction({ type: 'next_round' }); }

// --- Check 1: back-compat — no interestRate carries credits unchanged ---
{
  const e = engine(2, { rounds: 3 }); // no interestRate
  e.getState().tanks[0].credits = 10000;
  e.getState().tanks[1].credits = 10000;
  p1WinsRound(e);
  const st = e.getState();
  if (st.phase !== 'ROUND_OVER') fail(`expected ROUND_OVER after round 1, got ${st.phase}`);
  // p2 (loser, fired nothing) carries exactly its balance — no interest, no payout.
  if (st.tanks[1].credits !== 10000) fail(`no-interest p2 should carry 10000, got ${st.tanks[1].credits}`);
  // p1 (winner + shooter) carries balance + the flat stipend ONLY (no interest).
  if (st.tanks[0].credits !== 10000 + TURN_STIPEND) fail(`no-interest p1 should be 10000+stipend=${10000 + TURN_STIPEND}, got ${st.tanks[0].credits}`);
  if (!failed) log('PASS: interestRate unset carries credits unchanged (back-compat).');
}

// --- Check 2 + 3: earns floor(c*r); integer-only ---
{
  const e = engine(2, { rounds: 3, interestRate: 0.1 });
  e.getState().tanks[0].credits = 10000;
  e.getState().tanks[1].credits = 10001; // fractional interest 1000.1 -> floors to 1000
  p1WinsRound(e);
  const st = e.getState();
  // p2: 10001 + floor(10001*0.1=1000.1)=1000 => 11001 (NOT 11001.1).
  const expP2 = 10001 + Math.floor(10001 * 0.1);
  if (st.tanks[1].credits !== expP2) fail(`p2 interest: expected ${expP2}, got ${st.tanks[1].credits}`);
  if (!Number.isInteger(st.tanks[1].credits)) fail(`p2 credits not integer: ${st.tanks[1].credits}`);
  // p1: (10000 + stipend) then + floor(*0.1).
  const p1Base = 10000 + TURN_STIPEND;
  const expP1 = p1Base + Math.floor(p1Base * 0.1);
  if (st.tanks[0].credits !== expP1) fail(`p1 interest: expected ${expP1}, got ${st.tanks[0].credits}`);
  if (!Number.isInteger(st.tanks[0].credits)) fail(`p1 credits not integer: ${st.tanks[0].credits}`);
  if (!failed) log(`PASS: interest = c + floor(c*rate), integer-only (p2 ${10001}->${expP2}).`);
}

// --- Check 4: a single-round match never applies interest ---
{
  const e = engine(2, { rounds: 1, interestRate: 0.5 });
  e.getState().tanks[1].credits = 10000;
  p1WinsRound(e);
  const st = e.getState();
  if (st.phase !== 'GAME_OVER') fail(`single-round should end at GAME_OVER, got ${st.phase}`);
  if (st.tanks[1].credits !== 10000) fail(`single-round must not apply interest, p2=${st.tanks[1].credits}`);
  if (!failed) log('PASS: a single-round match never applies interest (no round boundary).');
}

// --- Check 4b: interest applied exactly ONCE per transition (two rounds) ---
{
  const e = engine(2, { rounds: 5, interestRate: 0.1 });
  e.getState().tanks[1].credits = 10000;
  p1WinsRound(e); startNextRound(e); // after round 1: p2 = 11000
  const afterR1 = e.getState().tanks[1].credits;
  if (afterR1 !== 11000) fail(`after 1 transition p2 should be 11000, got ${afterR1}`);
  p1WinsRound(e); // after round 2: p2 = 11000 + floor(11000*0.1)=1100 => 12100
  const afterR2 = e.getState().tanks[1].credits;
  if (afterR2 !== 11000 + Math.floor(11000 * 0.1)) fail(`after 2 transitions p2 should be 12100, got ${afterR2}`);
  if (!failed) log('PASS: interest compounds exactly once per round transition.');
}

// --- Check 5: determinism + clone parity ---
{
  function serialize(st) {
    return JSON.stringify({
      phase: st.phase, round: st.round, turn: st.turn, wind: st.wind,
      tanks: st.tanks.map((t) => ({ id: t.id, credits: t.credits, health: t.health, alive: t.alive })),
    });
  }
  const a = engine(3, { rounds: 5, interestRate: 0.1 });
  const b = engine(3, { rounds: 5, interestRate: 0.1 });
  for (const e of [a, b]) { e.getState().tanks[0].credits = 7777; e.getState().tanks[1].credits = 4242; e.getState().tanks[2].credits = 999; }
  p1WinsRound(a); startNextRound(a);
  p1WinsRound(b); startNextRound(b);
  if (serialize(a.getState()) !== serialize(b.getState())) fail('two same-seed interest runs DIVERGED');

  // Clone parity: clone after seeding, advance both one round, compare credits.
  const c = engine(2, { rounds: 5, interestRate: 0.2 });
  c.getState().tanks[0].credits = 5000; c.getState().tanks[1].credits = 5000;
  const cl = c.clone();
  p1WinsRound(c);
  p1WinsRound(cl);
  if (serialize(c.getState()) !== serialize(cl.getState())) fail('a clone diverged from its origin after a round transition (interestRate not copied?)');
  if (!failed) log('PASS: identical seed+driver reproduce identical credits; clone carries interestRate.');
}

if (failed) { log('\nINTEREST CHECK: FAILED'); process.exit(1); }
else { log('\nINTEREST CHECK: PASSED'); process.exit(0); }
