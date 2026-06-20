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

if (failed) {
  log('\nWEAPONS2 CHECK: FAILED');
  process.exit(1);
} else {
  log('\nWEAPONS2 CHECK: PASSED');
  process.exit(0);
}
