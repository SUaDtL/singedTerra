// Adversarial harness for the Phase-2 weapon additions:
//   mirv, deaths_head   — apex multi-warhead (reuse the cluster airburst split)
//   riot_bomb           — earth-mover crater: clears terrain, ZERO blast damage
//   hot_napalm          — hotter/wider/longer variant of the napalm fire field
//
// These add NO new physics code — they ride the existing deterministic machinery
// (splitAirburst / detonate crater / processFire). This harness proves each one
// behaves per its data AND stays byte-identical across same-seed runs (the lockstep
// contract). Imports the shared TypeScript source directly (tsx, no build step).
//
// Run: npx tsx scripts/checks/weapons2.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { getWeapon } from '../../shared/src/engine/WeaponSystem.ts';
import { CANVAS_WIDTH } from '../../shared/src/engine/Terrain.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];

function freshEngine() {
  return new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }],
    maxPlayers: 2, seed: SEED,
  });
}

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

/** Grant ammo as TEST SETUP (the new premium tiers are buy-only at spawn). */
function grant(e, idx, weapon) {
  const inv = e.getState().tanks[idx].inventory[weapon];
  inv.count = 9;
  inv.unlimited = false;
}

/** Fire one shot from the active tank and tick to resolution, tracing in-flight
 *  projectile count + napalm fire ticks. */
function fireTrace(e, { angle, power, weapon }) {
  e.applyAction({ type: 'select_weapon', weapon });
  e.applyAction({ type: 'set_angle', angle });
  e.applyAction({ type: 'set_power', power });
  e.applyAction({ type: 'fire' });
  let maxInFlight = 0;
  let fireTicks = 0;
  let ticks = 0;
  while (e.getState().phase === 'FIRING' && ticks < MAX_TICKS) {
    e.tick(); ticks++;
    const st = e.getState();
    maxInFlight = Math.max(maxInFlight, st.projectiles.length);
    if (st.fire.length > 0) fireTicks++;
  }
  if (ticks >= MAX_TICKS) throw new Error(`${weapon} never resolved`);
  return { st: e.getState(), maxInFlight, fireTicks };
}

function serialize(state) {
  return JSON.stringify({
    phase: state.phase, turn: state.turn, wind: state.wind, winner: state.winner,
    explosions: state.explosions, terrainVersion: state.terrainVersion,
    tanks: state.tanks.map((t) => ({ id: t.id, x: t.x, y: t.y, health: t.health, alive: t.alive })),
    terrain: Buffer.from(state.terrain).toString('hex'),
  });
}

// --- MIRV + Death's Head: apex-split into `count` warheads => `count` blasts ---
for (const type of ['mirv', 'deaths_head']) {
  const def = getWeapon(type);
  const count = def.behavior.airburst.count;
  const e = freshEngine();
  grant(e, 0, type);
  const r = fireTrace(e, { angle: 75, power: 50, weapon: type });
  const ex = r.st.explosions;
  log(`[${type}] count=${count} maxInFlight=${r.maxInFlight} blasts=${ex.length} cx=[${ex.map((b) => b.cx.toFixed(0)).join(', ')}]`);
  if (r.maxInFlight !== count) fail(`${type} did not split into ${count} submunitions (maxInFlight=${r.maxInFlight})`);
  if (ex.length !== count) fail(`${type} produced ${ex.length} blasts, expected ${count} (all warheads in-bounds for this lob)`);
  for (const b of ex) if (b.cx < 0 || b.cx >= CANVAS_WIDTH) fail(`${type} warhead cx=${b.cx} out of field`);
  if (!failed) log(`PASS: ${type} apex-splits into ${count} independently-cratering warheads.`);
}

// --- Riot Bomb: zero blast damage, but CLEARS terrain (crater bumps version) ---
{
  const def = getWeapon('riot_bomb');
  if (def.detonation.maxDamage !== 0) fail(`riot_bomb maxDamage should be 0, got ${def.detonation.maxDamage}`);
  if (def.detonation.raisesTerrain) fail('riot_bomb must CLEAR terrain, not raise it');
  const e = freshEngine();
  grant(e, 0, 'riot_bomb');
  const v0 = e.getState().terrainVersion;
  const r = fireTrace(e, { angle: 60, power: 45, weapon: 'riot_bomb' });
  log(`[riot_bomb] terrainVersion ${v0} -> ${r.st.terrainVersion}`);
  if (!(r.st.terrainVersion > v0)) fail('riot_bomb did not change terrain (should clear a crater)');
  if (!failed) log('PASS: riot_bomb clears a terrain crater with zero blast damage.');
}

// --- Hot Napalm: hotter than napalm (data) + ignites a fire field that burns ---
{
  const hot = getWeapon('hot_napalm').behavior.napalm;
  const reg = getWeapon('napalm').behavior.napalm;
  if (!(hot.burnTicks > reg.burnTicks)) fail(`hot_napalm burnTicks ${hot.burnTicks} !> napalm ${reg.burnTicks}`);
  if (!(hot.dotPerTick > reg.dotPerTick)) fail(`hot_napalm dotPerTick ${hot.dotPerTick} !> napalm ${reg.dotPerTick}`);
  if (!(hot.maxSpread > reg.maxSpread)) fail(`hot_napalm maxSpread ${hot.maxSpread} !> napalm ${reg.maxSpread}`);
  const e = freshEngine();
  grant(e, 0, 'hot_napalm');
  const before = e.getState().tanks.map((t) => t.health);
  // Same flat long lob the motion harness uses to land napalm on the far tank.
  const r = fireTrace(e, { angle: 27, power: 68, weapon: 'hot_napalm' });
  const after = r.st.tanks.map((t) => t.health);
  const dmg = before.reduce((s, h, i) => s + (h - after[i]), 0);
  log(`[hot_napalm] fireTicks=${r.fireTicks} totalDOT=${dmg.toFixed(1)} healths ${before.join('/')} -> ${after.map((h) => h.toFixed(1)).join('/')}`);
  if (r.fireTicks === 0) fail('hot_napalm did not ignite a fire field');
  if (!(dmg > 0)) fail('hot_napalm dealt no burn damage to a tank (re-tune aim)');
  if (!failed) log('PASS: hot_napalm ignites a hotter/wider/longer fire field that burns a tank.');
}

// --- Hot Napalm ignition FLASH uses its OWN detonation visual (regression, #16) ---
// Both napalm and hot_napalm route through igniteNapalm() (each sets behavior.napalm),
// so neither ever calls detonate(). The ignition flash is the ONLY ExplosionEvent these
// weapons emit — it must render with the FIRING weapon's detonation look, not a hardcoded
// napalm one. radius/color/durationFrames all differ between the two defs, and radius also
// drives screen-shake/boom scaling, so a wrong flash is a real (cosmetic) output bug.
{
  const hotDet = getWeapon('hot_napalm').detonation;
  const napDet = getWeapon('napalm').detonation;
  const e = freshEngine();
  grant(e, 0, 'hot_napalm');
  const r = fireTrace(e, { angle: 27, power: 68, weapon: 'hot_napalm' });
  // napalm-type weapons emit exactly one ExplosionEvent: the ignition flash.
  const flash = r.st.explosions[r.st.explosions.length - 1];
  if (flash === undefined) {
    fail('hot_napalm produced no ignition-flash ExplosionEvent');
  } else {
    log(`[hot_napalm flash] radius=${flash.radius} color=${flash.color} dur=${flash.durationFrames} (own def: ${hotDet.radius}/${hotDet.color}/${hotDet.durationFrames}, napalm def: ${napDet.radius}/${napDet.color}/${napDet.durationFrames})`);
    if (flash.radius !== hotDet.radius) fail(`hot_napalm flash radius ${flash.radius} != own detonation radius ${hotDet.radius} (got ${flash.radius === napDet.radius ? "napalm's" : 'an unexpected'} value)`);
    if (flash.color !== hotDet.color) fail(`hot_napalm flash color ${flash.color} != own detonation color ${hotDet.color} (got ${flash.color === napDet.color ? "napalm's" : 'an unexpected'} value)`);
    if (flash.durationFrames !== hotDet.durationFrames) fail(`hot_napalm flash durationFrames ${flash.durationFrames} != own detonation ${hotDet.durationFrames} (got ${flash.durationFrames === napDet.durationFrames ? "napalm's" : 'an unexpected'} value)`);
  }
  if (!failed) log("PASS: hot_napalm ignition flash uses its OWN detonation visual (radius/color/duration).");
}

// --- Determinism: two same-seed runs byte-identical for each new weapon ---
for (const [type, aim] of [
  ['mirv', { angle: 75, power: 50 }],
  ['deaths_head', { angle: 75, power: 50 }],
  ['riot_bomb', { angle: 60, power: 45 }],
  ['hot_napalm', { angle: 27, power: 68 }],
]) {
  const run = () => { const e = freshEngine(); grant(e, 0, type); return serialize(fireTrace(e, { ...aim, weapon: type }).st); };
  const a = run();
  const b = run();
  if (a !== b) fail(`${type} two same-seed runs DIVERGED (non-deterministic)`);
  else log(`PASS: ${type} two same-seed runs byte-identical (len ${a.length}).`);
}

// --- Robustness fuzz: every new weapon resolves (no crash/hang) across many seeds ×
//     aims — exercises airburst splits near the field edge, napalm spread at columns
//     0/1199, OOB bomblets, etc. — plus a determinism spot-check on sampled combos. ---
{
  const WEAPONS = ['mirv', 'deaths_head', 'riot_bomb', 'hot_napalm', 'dirt_bomb'];
  const SEEDS = [0x1, 0x9, 0x1a3, 0xbeef, 0x5eed, 0xc0ffee, 0x1234, 0xfade, 0x77, 0xabcd];
  const AIMS = [
    { angle: 15, power: 85 }, { angle: 45, power: 60 }, { angle: 75, power: 50 },
    { angle: 90, power: 35 }, { angle: 30, power: 75 },
  ];
  let runs = 0;
  for (const type of WEAPONS) {
    for (const seed of SEEDS) {
      for (const aim of AIMS) {
        try {
          const e = new GameEngine({
            players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }],
            maxPlayers: 2, seed,
          });
          grant(e, 0, type);
          fireTrace(e, { ...aim, weapon: type }); // throws on hang (MAX_TICKS) or engine error
          runs++;
        } catch (err) {
          fail(`${type} @seed 0x${seed.toString(16)} ${JSON.stringify(aim)} crashed/hung: ${err && err.message}`);
        }
      }
    }
  }
  log(`[fuzz] ${runs}/${WEAPONS.length * SEEDS.length * AIMS.length} runs resolved (${WEAPONS.length} weapons × ${SEEDS.length} seeds × ${AIMS.length} aims)`);
  if (!failed) log('PASS: every new weapon resolves without crashing or hanging across many seeds/aims.');

  // Determinism spot-check: sampled weapon/aim combos replay byte-identically.
  for (const [type, aim] of [['deaths_head', { angle: 75, power: 50 }], ['hot_napalm', { angle: 30, power: 75 }], ['mirv', { angle: 45, power: 60 }]]) {
    const one = () => {
      const e = new GameEngine({ players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }], maxPlayers: 2, seed: 0x1a3 });
      grant(e, 0, type);
      return serialize(fireTrace(e, { ...aim, weapon: type }).st);
    };
    if (one() !== one()) fail(`${type} fuzz combo DIVERGED across same-seed runs`);
  }
  if (!failed) log('PASS: fuzz determinism spot-check — sampled combos replay byte-identically.');
}

if (failed) {
  log('\nWEAPONS2 CHECK: FAILED');
  process.exit(1);
} else {
  log('\nWEAPONS2 CHECK: PASSED');
  process.exit(0);
}
