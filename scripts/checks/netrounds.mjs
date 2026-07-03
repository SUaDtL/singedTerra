// NETROUNDS check (16th harness) — guards the NETWORKED round-boundary replay
// contract (Sprint 6 Slice 3, the deferred networked best-of-N). Where rounds.mjs
// proves the ENGINE advances rounds deterministically, this proves the LOG→engine
// translation in shared/src/net/replay.ts carries a round boundary in lockstep — the
// exact code every networked client runs. It exercises the SAME replayNetworkAction()
// the live NetworkClient calls, so a regression here is a regression in production.
//
// Proves:
//   A. ROUND-BOUNDARY LOCKSTEP: two engines replaying an identical action log
//      (fire that ends a round → next_round) land on byte-identical state — round,
//      activePlayerId, wind, terrain. This is the desync the deferred deploy risks.
//   B. PER-TANK BUY SURVIVES THE LOG: a `buy` row with tankId='p2' during ROUND_OVER
//      lands on P2 (the named tank), NOT the active opener P1. If replay dropped
//      tankId, the engine's ROUND_OVER buy falls back to the active tank and the
//      wrong tank gets the inventory — a silent cross-client desync. This is the bug
//      class the referee must also honor (it must persist tankId on the logged row).
//   C. BUY-IN-LOG LOCKSTEP: two engines replaying fire→buy(p2)→next_round reproduce
//      identical inventories + round state.
//   D. KILLER == ROUND-STARTER edge case: P1 (always the opener) fires the killing
//      blow, so the next round's starter equals the last shooter — the case the
//      referee's "you can't keep your own turn" cursor guard gets wrong; next_round
//      must re-seat the opener regardless. Here we confirm the engine side lands P1.
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/netrounds.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { replayNetworkAction } from '../../shared/src/net/replay.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function players(n) { return Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, color: PALETTE[i] })); }
function engine(n, rounds) { return new GameEngine({ players: players(n), maxPlayers: n, seed: SEED, rounds }); }
function tickToRest(e) { let t = 0; while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) { e.tick(); t++; } }

// Apply a logged NetworkAction through the canonical SHARED replay path (the same
// call the live NetworkClient makes), then settle any projectile flight.
function applyLogged(e, action) { replayNetworkAction(e, action); tickToRest(e); }

// Set up a sole-survivor (P1) scenario the way rounds.mjs does — mark the others dead
// out-of-band on EACH engine identically — so the next LOGGED fire resolves into the
// round-end branch. Real death is replay-derived from damage; this is the harness
// shortcut that keeps both engines identical before the log diverges nothing.
function killOthers(e) {
  const st = e.getState();
  for (let i = 1; i < st.tanks.length; i++) { st.tanks[i].alive = false; st.tanks[i].health = 0; }
}

function terrainsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const FIRE = { type: 'fire', angle: 45, power: 90, weapon: 'baby_missile' };
const NEXT = { type: 'next_round' };

// --- Check A: round-boundary lockstep through the action log ---
{
  const a = engine(2, 3);
  const b = engine(2, 3);
  killOthers(a); killOthers(b);
  applyLogged(a, FIRE); applyLogged(b, FIRE);
  if (a.getState().phase !== 'ROUND_OVER') fail(`A: engine A should pause in ROUND_OVER after the round-ending fire, got ${a.getState().phase}`);
  if (a.getState().activePlayerId !== 'p1') fail(`A: round 2 opener should be staged as p1 in ROUND_OVER, got ${a.getState().activePlayerId}`);
  applyLogged(a, NEXT); applyLogged(b, NEXT);
  const sa = a.getState(); const sb = b.getState();
  if (sa.phase !== 'PLAYER_TURN') fail(`A: next_round should begin combat, got ${sa.phase}`);
  if (sa.round !== sb.round) fail(`A: round diverged across the log: ${sa.round} vs ${sb.round}`);
  if (sa.activePlayerId !== sb.activePlayerId) fail(`A: activePlayerId diverged: ${sa.activePlayerId} vs ${sb.activePlayerId}`);
  if (sa.wind !== sb.wind) fail(`A: wind diverged: ${sa.wind} vs ${sb.wind}`);
  if (!terrainsEqual(sa.terrain, sb.terrain)) fail('A: terrain diverged — round seed not reproduced through the log');
  log(`[A] both engines: round=${sa.round}, opener=${sa.activePlayerId}, wind=${sa.wind.toFixed(4)}`);
  if (!failed) log('PASS: a round boundary (fire→next_round) replays in lockstep through the shared log path.');
}

// --- Check B: per-tank ROUND_OVER buy survives the log and lands on the NAMED tank ---
{
  const e = engine(2, 3);
  e.getState().tanks[0].credits = 99999;
  e.getState().tanks[1].credits = 99999;
  killOthers(e); applyLogged(e, FIRE);
  if (e.getState().phase !== 'ROUND_OVER') fail('B: expected ROUND_OVER for the per-tank shop test');
  const p1Before = e.getState().tanks[0].inventory.nuke.count;
  const p2Before = e.getState().tanks[1].inventory.nuke.count;
  applyLogged(e, { type: 'buy', weapon: 'nuke', tankId: 'p2' });
  const p1After = e.getState().tanks[0].inventory.nuke.count;
  const p2After = e.getState().tanks[1].inventory.nuke.count;
  if (p2After <= p2Before) fail(`B: buy(tankId=p2) did not add inventory to P2 (${p2Before} -> ${p2After}) — tankId likely dropped in replay`);
  if (p1After !== p1Before) fail(`B: buy(tankId=p2) wrongly altered P1 (${p1Before} -> ${p1After}) — fell back to the active opener`);
  log(`[B] P2 nuke ${p2Before} -> ${p2After}, P1 nuke unchanged at ${p1After}`);
  if (!failed) log('PASS: a ROUND_OVER buy with tankId replays onto the named tank (P2), not the active opener.');
}

// --- Check C: two engines replaying fire→buy(p2)→next_round reproduce identical state ---
{
  const a = engine(2, 3);
  const b = engine(2, 3);
  for (const e of [a, b]) { e.getState().tanks[0].credits = 99999; e.getState().tanks[1].credits = 99999; }
  killOthers(a); killOthers(b);
  const BUY = { type: 'buy', weapon: 'nuke', tankId: 'p2' };
  applyLogged(a, FIRE); applyLogged(b, FIRE);
  applyLogged(a, BUY);  applyLogged(b, BUY);
  applyLogged(a, NEXT); applyLogged(b, NEXT);
  const sa = a.getState(); const sb = b.getState();
  if (sa.tanks[1].inventory.nuke.count !== sb.tanks[1].inventory.nuke.count) fail('C: P2 inventory diverged across the identical log');
  if (sa.round !== sb.round) fail(`C: round diverged: ${sa.round} vs ${sb.round}`);
  if (sa.activePlayerId !== sb.activePlayerId) fail(`C: opener diverged: ${sa.activePlayerId} vs ${sb.activePlayerId}`);
  if (!terrainsEqual(sa.terrain, sb.terrain)) fail('C: terrain diverged with a buy in the log');
  if (!failed) log('PASS: a log carrying a per-tank buy replays identically across clients (fire→buy→next_round).');
}

// --- Check D: killer == round-starter (P1) — next_round re-seats the opener ---
{
  const e = engine(2, 3);
  killOthers(e); applyLogged(e, FIRE); // P1 (the opener) fires the killing blow
  applyLogged(e, NEXT);
  if (e.getState().activePlayerId !== 'p1') fail(`D: round 2 opener should be p1 even though p1 fired the killing blow, got ${e.getState().activePlayerId}`);
  if (e.getState().round !== 2) fail(`D: should be in round 2, got ${e.getState().round}`);
  log(`[D] killer was the opener (p1); round ${e.getState().round} opener = ${e.getState().activePlayerId}`);
  if (!failed) log('PASS: next_round re-seats the opener (p1) even when p1 fired the round-ending shot.');
}

if (failed) { log('\nNETROUNDS CHECK: FAILED'); process.exit(1); }
else { log('\nNETROUNDS CHECK: PASSED'); process.exit(0); }
