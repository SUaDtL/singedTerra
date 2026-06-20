// Regression harness for the deferred-GAME_OVER bug (#14).
//
// BUG: the win-check (resolve() -> GAME_OVER) ran ONLY from tick()'s settle gate
//   `survivors.length === 0 && this.fire.size === 0`. So a kill delivered by a
//   LINGERING effect — a napalm burn DOT, or a sibling bomblet of a multi-projectile
//   weapon (cluster/mirv/deaths_head/funky) — left the dead tank at 0 HP in phase
//   FIRING with no winner banner until the shot FULLY settled (a perceptible lag the
//   player reads as "the game didn't end"). FIX: end the instant `aliveCount <= 1`,
//   regardless of in-flight projectiles or still-burning fire.
//
// This harness drives a napalm-DOT kill (the `this.fire.size` half of the gate) and
// asserts the game ends on the EXACT tick the victim dies — not deferred to fire
// burnout. The bomblet case (the `survivors.length` half) rides the SAME
// `if (settled || aliveCount <= 1)` gate, so this guards both halves. Same-seed
// determinism of the eliminating shot is asserted too (the lockstep contract).
//
// Imports the shared TypeScript source directly (tsx, no build step).
// Run: npx tsx scripts/checks/gameover.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED = 0x5eed1234;     // same seed weapons2/motion use: napalm 27/68 lands on the far tank
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];
const AIM = { angle: 27, power: 68, weapon: 'napalm' };

function freshEngine() {
  return new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }],
    maxPlayers: 2, seed: SEED,
  });
}

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

/** Grant a weapon to a tank as TEST SETUP (napalm is limited/buy-only at spawn). */
function grant(e, idx, weapon) {
  const inv = e.getState().tanks[idx].inventory[weapon];
  inv.count = 9; inv.unlimited = false;
}

/** Fire AIM from the active tank, then tick while FIRING — recording the tick the
 *  victim (tank index `victim`) first dies, the tick phase first becomes GAME_OVER,
 *  and how many ticks the engine lingered in FIRING AFTER the death. */
function fireUntilSettled(e, victim) {
  e.applyAction({ type: 'select_weapon', weapon: AIM.weapon });
  e.applyAction({ type: 'set_angle', angle: AIM.angle });
  e.applyAction({ type: 'set_power', power: AIM.power });
  e.applyAction({ type: 'fire' });
  let t = 0, deathTick = -1, gameOverTick = -1, firingAfterDeath = 0;
  while (e.getState().phase === 'FIRING' && t < MAX_TICKS) {
    e.tick(); t++;
    const st = e.getState();
    if (deathTick < 0 && !st.tanks[victim].alive) deathTick = t;
    if (deathTick > 0 && st.phase === 'FIRING') firingAfterDeath++;
    if (gameOverTick < 0 && st.phase === 'GAME_OVER') gameOverTick = t;
  }
  if (t >= MAX_TICKS) throw new Error('shot never resolved (fire never drained?)');
  return { st: e.getState(), t, deathTick, gameOverTick, firingAfterDeath };
}

// --- Control: a FULL-HP victim survives the burn; the shot resolves LATE (only once
//     the whole fire field has drained), proving the napalm naturally lingers. ---
const control = (() => {
  const e = freshEngine();
  grant(e, 0, 'napalm');
  const r = fireUntilSettled(e, 1);
  log(`[control] full-HP P2: phase=${r.st.phase} resolveTick=${r.t} p2.health=${r.st.tanks[1].health.toFixed(1)} alive=${r.st.tanks[1].alive}`);
  if (r.st.phase !== 'PLAYER_TURN') fail(`control should resolve to PLAYER_TURN (a survived burn), got ${r.st.phase}`);
  if (!r.st.tanks[1].alive) fail('control P2 should SURVIVE the burn at full HP (re-tune aim/seed)');
  if (r.deathTick !== -1) fail('control P2 should never die at full HP');
  if (!failed) log(`PASS: control — a survived napalm burns ${r.t} FIRING ticks before the turn resolves.`);
  return r;
})();

// --- Regression: a LOW-HP victim dies mid-burn; the game must end ON THE DEATH TICK,
//     not deferred to fire burnout (which is what the control shows would happen). ---
{
  const e = freshEngine();
  grant(e, 0, 'napalm');
  e.getState().tanks[1].health = 5; // TEST SETUP: the burn kills P2 partway through
  const r = fireUntilSettled(e, 1);
  const p1 = e.getState().tanks[0].id;
  log(`[regression] low-HP P2: phase=${r.st.phase} deathTick=${r.deathTick} gameOverTick=${r.gameOverTick} firingAfterDeath=${r.firingAfterDeath} fireCols=${r.st.fire.length} winner=${r.st.winner}`);
  if (r.deathTick < 0) fail('regression P2 never died from the burn (re-tune low HP / aim)');
  if (r.st.phase !== 'GAME_OVER') fail(`expected GAME_OVER after the lethal burn, got ${r.st.phase}`);
  if (r.gameOverTick !== r.deathTick) fail(`GAME_OVER deferred ${r.gameOverTick - r.deathTick} ticks past the kill — bug #14 (must end ON the death tick)`);
  if (r.firingAfterDeath !== 0) fail(`engine lingered in FIRING ${r.firingAfterDeath} ticks after the kill (deferred win-check)`);
  if (r.st.fire.length !== 0) fail(`fire field not cleared on the eliminating tick (size=${r.st.fire.length})`);
  if (r.st.winner !== p1) fail(`winner should be P1 (${p1}), got ${r.st.winner}`);
  // The kill must short-circuit the burn: it ends well before the control's full burnout.
  if (!(r.deathTick < control.t)) fail(`end tick ${r.deathTick} not earlier than full-burn resolve ${control.t} (no deferral shortcut proven)`);
  if (!failed) log(`PASS: a napalm-DOT kill ends the game ON the death tick (${r.deathTick}), not deferred to burnout (control ${control.t}).`);
}

// --- Determinism: the eliminating shot replays byte-identically (lockstep contract) ---
{
  const run = () => {
    const e = freshEngine();
    grant(e, 0, 'napalm');
    e.getState().tanks[1].health = 5;
    const r = fireUntilSettled(e, 1);
    return JSON.stringify({
      phase: r.st.phase, winner: r.st.winner, deathTick: r.deathTick, gameOverTick: r.gameOverTick,
      tanks: r.st.tanks.map((t) => ({ id: t.id, health: t.health, alive: t.alive })),
    });
  };
  const a = run(), b = run();
  if (a !== b) fail('eliminating napalm shot DIVERGED across same-seed runs (non-deterministic)');
  else log(`PASS: the eliminating napalm shot replays byte-identically (len ${a.length}).`);
}

if (failed) { log('\nGAMEOVER CHECK: FAILED'); process.exit(1); }
else { log('\nGAMEOVER CHECK: PASSED'); process.exit(0); }
