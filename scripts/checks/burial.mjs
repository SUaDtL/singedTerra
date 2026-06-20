// Regression harness for burial-as-TRAP (#15).
//
// Burial used to INSTAKILL: when risen dirt covered a tank's mid-body, the tank was
// killed outright (Tank.applyDamage(tank, tank.health)) and the shooter was credited a
// kill. #15 makes burial a TRAP instead — the tank stays ALIVE but `buried`, skipped in
// turn rotation until it is dug out (terrain cleared over its mid-body, e.g. a Riot Bomb
// or a later crater) or auto-freed after MAX_BURIED_TURNS turns. Burial deals NO damage
// and credits NO kill: being trapped IS the punishment.
//
// Proves: (1) a Dirt Bomb traps the victim rather than killing it (alive, full HP, no
// kill credited — the OLD code would leave it dead at 0 HP); (2) a buried tank is skipped
// in turn rotation; (3) clearing the dirt over it (a Riot Bomb) digs it out; (4) the
// safety valve auto-frees it after MAX_BURIED_TURNS turns even if nobody digs it out.
// Same-seed determinism of the burying shot is asserted too.
//
// Run: npx tsx scripts/checks/burial.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED = 0x5eed1234;            // same seed weapons2/motion/gameover use
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];
const BURY = { angle: 27, power: 70, weapon: 'dirt_bomb' }; // probed: buries the far tank (P2)

function freshEngine() {
  return new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }],
    maxPlayers: 2, seed: SEED,
  });
}

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

/** Grant a weapon to a tank as TEST SETUP (dirt/riot are limited at spawn). */
function grant(e, idx, weapon, n = 9) {
  const inv = e.getState().tanks[idx].inventory[weapon];
  inv.count = n; inv.unlimited = false;
}

/** Fire from the active tank; tick until the shot resolves (phase leaves FIRING). */
function fire(e, { angle, power, weapon }) {
  e.applyAction({ type: 'select_weapon', weapon });
  e.applyAction({ type: 'set_angle', angle });
  e.applyAction({ type: 'set_power', power });
  e.applyAction({ type: 'fire' });
  let t = 0;
  while (e.getState().phase === 'FIRING' && t < MAX_TICKS) { e.tick(); t++; }
  if (t >= MAX_TICKS) throw new Error(`${weapon} never resolved`);
  return e.getState();
}

// --- (1) Trap, not kill: a Dirt Bomb that buries P2 leaves it ALIVE at full HP, no kill ---
{
  const e = freshEngine();
  grant(e, 0, 'dirt_bomb');
  const st = fire(e, BURY);
  const [p1, p2] = st.tanks;
  log(`[trap] P2 buried=${p2.buried} alive=${p2.alive} health=${p2.health} | P1 kills=${p1.kills} | active=${st.activePlayerId} phase=${st.phase}`);
  if (!p2.buried) fail('Dirt Bomb did not bury P2 (re-probe the aim for this seed)');
  if (!p2.alive) fail('burial KILLED P2 — must trap, not kill (#15 regression)');
  if (p2.health !== 100) fail(`burial dealt damage (P2 health=${p2.health}, expected 100) — burial must be damage-free`);
  if (p1.kills !== 0) fail(`burial credited a kill (P1 kills=${p1.kills}, expected 0)`);
  if (st.phase !== 'PLAYER_TURN') fail(`expected PLAYER_TURN after a non-lethal shot, got ${st.phase}`);
  // (2) The buried tank is SKIPPED: with P2 trapped, the turn comes back to P1.
  if (st.activePlayerId !== p1.id) fail(`buried P2 not skipped — active=${st.activePlayerId}, expected P1 (${p1.id})`);
  if (p2.buriedTurns !== 1) fail(`P2 buriedTurns=${p2.buriedTurns}, expected 1 after one skipped rotation`);
  if (!failed) log('PASS: a Dirt Bomb TRAPS P2 (alive, full HP, no kill) and the buried tank is skipped in rotation.');
}

// --- (3) Dig-out: clearing the dirt over a buried tank frees it ---
{
  const e = freshEngine();
  grant(e, 0, 'dirt_bomb'); grant(e, 0, 'riot_bomb');
  fire(e, BURY);                       // P1 buries P2
  if (!e.getState().tanks[1].buried) fail('[dig] setup — P2 not buried before the Riot Bomb');
  const st = fire(e, { angle: 27, power: 70, weapon: 'riot_bomb' }); // P1 clears the dirt over P2
  const p2 = st.tanks[1];
  log(`[dig] after Riot Bomb: P2 buried=${p2.buried} alive=${p2.alive} health=${p2.health.toFixed(1)}`);
  if (p2.buried) fail('Riot Bomb did not dig P2 out (clearing the dirt over a buried tank must free it)');
  if (!p2.alive) fail('P2 should still be alive after being dug out');
  if (!failed) log('PASS: a Riot Bomb clears the dirt over a buried tank and digs it out (buried -> false).');
}

// --- (4) Safety valve: a buried tank auto-frees after MAX_BURIED_TURNS turns ---
{
  const e = freshEngine();
  grant(e, 0, 'dirt_bomb');
  fire(e, BURY);                       // turn 1: P1 buries P2 (buriedTurns -> 1), turn returns to P1
  if (e.getState().tanks[1].buriedTurns !== 1) fail('[valve] setup — expected buriedTurns=1 after burial');
  // P1 fires a harmless baby_missile back near itself (does NOT touch P2's dirt).
  const st = fire(e, { angle: 90, power: 30, weapon: 'baby_missile' });
  const p2 = st.tanks[1];
  log(`[valve] after 2nd turn: P2 buried=${p2.buried} buriedTurns=${p2.buriedTurns} active=${st.activePlayerId}`);
  if (p2.buried) fail('safety valve did not fire — P2 still buried after MAX_BURIED_TURNS (2) turns');
  if (st.activePlayerId !== p2.id) fail(`freed P2 should get the turn — active=${st.activePlayerId}, expected P2 (${p2.id})`);
  if (!failed) log('PASS: the safety valve auto-frees a buried tank after MAX_BURIED_TURNS turns (no lock-out).');
}

// --- (5) Multi-player: a buried tank is SKIPPED in 3P turn rotation ---
{
  const e = new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }, { name: 'P3', color: '#4de87a' }],
    maxPlayers: 3, seed: SEED,
  });
  const st = e.getState();
  // Trap the MIDDLE tank (P2) directly. use_shield ends the turn via advanceTurn WITHOUT
  // an explosion, so the burial loop (which recomputes `buried` from terrain) never runs
  // and this artificial trap persists — isolating pure rotation logic.
  st.tanks[1].buried = true; st.tanks[1].buriedTurns = 0;
  e.applyAction({ type: 'use_shield' }); // P1 (active) ends its turn
  const after = e.getState();
  log(`[3p-skip] active after P1 shield (P2 buried) = ${after.activePlayerId}; P2 buriedTurns=${after.tanks[1].buriedTurns}`);
  if (after.activePlayerId !== 'p3') fail(`3P rotation must SKIP buried P2 (p1 -> p3), got ${after.activePlayerId}`);
  if (after.tanks[1].buriedTurns !== 1) fail(`P2 buriedTurns should be 1 after one skipped rotation, got ${after.tanks[1].buriedTurns}`);
  if (!after.tanks[1].buried) fail('P2 should still be buried (1 < MAX_BURIED_TURNS)');
  if (!failed) log('PASS: 3P turn rotation skips a buried tank (p1 -> p3; P2 stays trapped).');
}

// --- (6) Deadlock guard: if EVERY alive tank is buried, one is freed (no hang) ---
{
  const e = new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }, { name: 'P3', color: '#4de87a' }],
    maxPlayers: 3, seed: SEED,
  });
  const st = e.getState();
  for (const t of st.tanks) { t.buried = true; t.buriedTurns = 0; }
  // Active P1 ends the turn; advanceTurn finds NO unburied alive tank and must free the
  // longest-trapped one rather than hang or leave an invalid activePlayerId.
  e.applyAction({ type: 'use_shield' });
  const after = e.getState();
  const active = after.tanks.find((t) => t.id === after.activePlayerId);
  log(`[deadlock] all 3 buried -> active=${after.activePlayerId} buried=${active ? active.buried : 'N/A'}`);
  if (!active) fail(`deadlock guard left an invalid activePlayerId (${after.activePlayerId})`);
  else if (active.buried) fail('deadlock guard must FREE the tank it hands the turn to');
  if (!failed) log('PASS: the all-buried deadlock guard frees a tank and keeps the match progressing.');
}

// --- Determinism: the burying shot replays byte-identically ---
{
  const run = () => {
    const e = freshEngine();
    grant(e, 0, 'dirt_bomb');
    const st = fire(e, BURY);
    return JSON.stringify({
      phase: st.phase, active: st.activePlayerId,
      tanks: st.tanks.map((t) => ({ id: t.id, health: t.health, alive: t.alive, buried: t.buried, buriedTurns: t.buriedTurns, y: t.y })),
    });
  };
  const a = run(), b = run();
  if (a !== b) fail('burying Dirt Bomb DIVERGED across same-seed runs (non-deterministic)');
  else log(`PASS: the burying Dirt Bomb replays byte-identically (len ${a.length}).`);
}

if (failed) { log('\nBURIAL CHECK: FAILED'); process.exit(1); }
else { log('\nBURIAL CHECK: PASSED'); process.exit(0); }
