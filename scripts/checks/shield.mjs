// SHIELD check for the singedTerra shared engine (Sprint 4, Slice 3.4 — the 9th
// harness). Covers the destructible particle force field + the use_shield action,
// the FIRST non-fire action carried by the deterministic replay log.
//
// Asserts:
//   1. use_shield ACTIVATES + ENDS the turn: the active tank's shieldParticles is
//      set to the shield weapon's particle count, one shield round is spent, and
//      the turn advances (next living player, turn++, fresh wind, phase PLAYER_TURN).
//   2. SINGLE-blast absorption: a missile that damages an unshielded P1 (baseline)
//      deals ZERO to a shielded P1 and strips exactly ONE particle.
//   3. MULTI-blast shredding: a cluster bomb strips MORE THAN ONE particle in a
//      single shot (each damaging bomblet strips one) — area weapons shred faster.
//   4. Napalm BURN strips per-tick and the shield can be OUTLASTED: a sustained
//      napalm fire drains the field to 0, after which burn damage applies.
//   5. Determinism: two same-seed runs of [use_shield, then a cluster hit] are
//      BYTE-IDENTICAL (the serialize includes shieldParticles + the new action).
//
// Fully deterministic: no Math.random, no Date / wall-clock. Imports the shared
// TypeScript source directly (tsx runs .ts without a build step).
//
// Run: npx tsx scripts/checks/shield.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { getWeapon } from '../../shared/src/engine/WeaponSystem.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];

const SHIELD_PARTICLES = getWeapon('shield').behavior.shield.particles;

// Aims swept against the real engine for THIS seed: P2 (x=720) hits P1 (x=80).
const MISSILE_AT_P1 = { angle: 116, power: 50, weapon: 'missile' };
const CLUSTER_AT_P1 = { angle: 140, power: 46, weapon: 'cluster_bomb' };
const NAPALM_AT_P1 = { angle: 112, power: 50, weapon: 'napalm' };

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function freshEngine() {
  return new GameEngine({ players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }], maxPlayers: 2, seed: SEED });
}

function tickToRest(e) {
  let t = 0;
  while (e.getState().phase === 'FIRING' && t < MAX_TICKS) { e.tick(); t++; }
  if (t >= MAX_TICKS) throw new Error('never resolved (infinite flight/fire)');
}

/** P1 wastes its opening turn (a harmless straight-up lob), handing the turn to
 *  P2 — so a subsequent P2 shot lands on a P1 we can pre-arrange (e.g. shielded). */
function passP1Turn(e) {
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 90 });
  e.applyAction({ type: 'set_power', power: 8 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
}

function fireAt(e, { angle, power, weapon }) {
  e.applyAction({ type: 'select_weapon', weapon });
  e.applyAction({ type: 'set_angle', angle });
  e.applyAction({ type: 'set_power', power });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
}

// --- Check 1: use_shield activates + ends the turn ---
{
  const e = freshEngine();
  // getState() returns the LIVE state by reference, so capture every "before"
  // value as a PRIMITIVE here — holding the object would alias the post-state.
  const st0 = e.getState();
  const particlesBefore = st0.tanks[0].shieldParticles;
  const ammoBefore = st0.tanks[0].inventory.shield.count;
  const turnBefore = st0.turn;
  const activeBefore = st0.activePlayerId;
  if (particlesBefore !== 0) fail(`P1 started with shieldParticles=${particlesBefore}, expected 0`);

  e.applyAction({ type: 'use_shield' });
  const st1 = e.getState();
  const p1b = st1.tanks[0];

  log(`[shield-activate] particles ${particlesBefore}->${p1b.shieldParticles} (expect ${SHIELD_PARTICLES}); shield ammo ${ammoBefore}->${p1b.inventory.shield.count}; active ${activeBefore}->${st1.activePlayerId}; turn ${turnBefore}->${st1.turn}; phase=${st1.phase}`);
  if (p1b.shieldParticles !== SHIELD_PARTICLES) fail(`shield did not grant ${SHIELD_PARTICLES} particles (got ${p1b.shieldParticles})`);
  if (p1b.inventory.shield.count !== ammoBefore - 1) fail('use_shield did not spend exactly one shield round');
  if (st1.activePlayerId === activeBefore) fail('use_shield did not end the turn (active player unchanged)');
  if (st1.turn !== turnBefore + 1) fail(`use_shield did not advance the turn counter (${turnBefore}->${st1.turn})`);
  if (st1.phase !== 'PLAYER_TURN') fail(`phase after use_shield is ${st1.phase}, expected PLAYER_TURN`);
  if (!failed) log('PASS: use_shield grants the field, spends a round, and ends the turn (fresh wind, next player).');
}

// --- Baseline: how much does the missile hurt an UNSHIELDED P1? ---
let baselineMissileDmg = 0;
{
  const e = freshEngine();
  passP1Turn(e);
  const hpBefore = e.getState().tanks[0].health;
  fireAt(e, MISSILE_AT_P1);
  baselineMissileDmg = hpBefore - e.getState().tanks[0].health;
  if (baselineMissileDmg <= 0) fail(`baseline missile dealt no damage to P1 (aim ${JSON.stringify(MISSILE_AT_P1)} missed — re-tune)`);
}

// --- Check 2: single-blast absorption (missile) ---
{
  const e = freshEngine();
  e.applyAction({ type: 'use_shield' }); // P1 shields, turn -> P2
  const hpBefore = e.getState().tanks[0].health;
  fireAt(e, MISSILE_AT_P1); // P2 -> P1
  const p1 = e.getState().tanks[0];
  log(`[absorb-single] baseline dmg=${baselineMissileDmg.toFixed(1)}; shielded dmg=${(hpBefore - p1.health).toFixed(1)}; particles=${p1.shieldParticles}`);
  if (p1.health !== hpBefore) fail(`shielded P1 took ${hpBefore - p1.health} damage from a single missile — shield should fully negate it`);
  if (p1.shieldParticles !== SHIELD_PARTICLES - 1) fail(`single blast stripped ${SHIELD_PARTICLES - p1.shieldParticles} particles, expected exactly 1`);
  if (!failed) log('PASS: a single blast is fully absorbed and strips exactly one particle.');
}

// --- Check 3: multi-blast cluster strips MORE THAN ONE particle ---
{
  const e = freshEngine();
  e.applyAction({ type: 'use_shield' }); // P1 shields, turn -> P2
  const hpBefore = e.getState().tanks[0].health;
  fireAt(e, CLUSTER_AT_P1);
  const p1 = e.getState().tanks[0];
  const stripped = SHIELD_PARTICLES - p1.shieldParticles;
  log(`[absorb-multi] cluster stripped ${stripped} particles; shielded dmg=${(hpBefore - p1.health).toFixed(1)}`);
  if (stripped < 2) fail(`cluster stripped only ${stripped} particle(s) — a multi-blast weapon must strip several (each damaging bomblet strips one)`);
  if (!failed) log(`PASS: a cluster bomb strips ${stripped} particles in one shot (area weapons shred the field faster).`);
}

// --- Check 4: sustained napalm OUTLASTS the shield (per-tick strip, then damage) ---
{
  const e = freshEngine();
  e.applyAction({ type: 'use_shield' }); // P1 shields, turn -> P2
  const hpBefore = e.getState().tanks[0].health;
  fireAt(e, NAPALM_AT_P1);
  const p1 = e.getState().tanks[0];
  log(`[absorb-burn] napalm drained particles to ${p1.shieldParticles}; P1 dmg after shield failed=${(hpBefore - p1.health).toFixed(1)}`);
  if (p1.shieldParticles !== 0) fail(`sustained napalm left ${p1.shieldParticles} particles — a long burn should drain the whole field`);
  if (p1.health >= hpBefore) fail('napalm that outlasted the shield dealt no damage — burn should apply once particles hit 0');
  if (!failed) log('PASS: napalm strips a particle per burn tick, drains the field, then burns through.');
}

// --- Check 5: determinism — [use_shield, then cluster hit] byte-identical ---
{
  function serialize(st) {
    return JSON.stringify({
      phase: st.phase, turn: st.turn, activePlayerId: st.activePlayerId, wind: st.wind, winner: st.winner,
      fire: st.fire, explosions: st.explosions,
      tanks: st.tanks.map((t) => ({ id: t.id, x: t.x, y: t.y, health: t.health, alive: t.alive, shieldParticles: t.shieldParticles })),
      terrain: Buffer.from(st.terrain).toString('hex'),
    });
  }
  function run() {
    const e = freshEngine();
    e.applyAction({ type: 'use_shield' });
    fireAt(e, CLUSTER_AT_P1);
    return serialize(e.getState());
  }
  const a = run(), b = run();
  if (a !== b) fail('two same-seed [use_shield + cluster] runs DIVERGED (non-deterministic shield/absorption)');
  else log(`PASS: two same-seed shield runs byte-identical (len ${a.length}).`);
}

if (failed) { log('\nSHIELD CHECK: FAILED'); process.exit(1); }
else { log('\nSHIELD CHECK: PASSED'); process.exit(0); }
