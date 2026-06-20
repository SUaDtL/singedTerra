// SHIELD check for the singedTerra shared engine. Covers the use_shield action and
// the DAMAGE-POOL force field (REVIEW_BACKLOG P1-5 — the shield was reworked from a
// per-hit particle COUNT, which no-sold 12 nukes yet was stripped by 12 tiny napalm
// ticks, into an HP POOL that absorbs damage proportional to magnitude).
//
// Asserts:
//   1. use_shield ACTIVATES + ENDS the turn: the active tank's shieldHp is set to the
//      shield weapon's `capacity`, one shield round is spent, and the turn advances
//      (next living player, turn++, fresh wind, phase PLAYER_TURN).
//   2. COMMENSURATE absorption: a missile that deals D damage to an unshielded P1
//      (baseline) deals ZERO to a shielded P1 and drains the pool by ~D (not a flat
//      "one hit"). The field is partly — not fully — consumed by one missile.
//   3. MAGNITUDE-PROPORTIONAL: a nuke (heavier) drains strictly MORE pool than a
//      missile. A pool, not a counter.
//   4. The shield does NOT no-sell heavy fire (the headline fix): one nuke into a
//      full pool is fully soaked (health unchanged), but firing repeated nukes
//      depletes the pool and overflow KILLS P1 — contrast the old bug where 12
//      nukes were all negated.
//   5. NAPALM drains commensurate: a sustained burn drains the pool by ~its total
//      damage (many small ticks, each draining ~dotPerTick — NOT a whole particle).
//   6. Determinism: two same-seed runs of [use_shield, then a nuke hit] are
//      BYTE-IDENTICAL (serialize includes shieldHp + the use_shield action).
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

const SHIELD_CAPACITY = getWeapon('shield').behavior.shield.capacity;

// Aims swept against the real engine for THIS seed on the 1200×600 field: P2
// (x=1080) lobs left and hits P1 (x=120), 960px away. The nuke/missile SHARE
// ballistics (both plain shells), so the same aim lands for both — chosen so the
// missile clearly damages P1 (~21) and the nuke clearly exceeds it (~78), which
// the proportional-drain assertion requires.
const MISSILE_AT_P1 = { angle: 117, power: 88, weapon: 'missile' };
const NUKE_AT_P1    = { angle: 117, power: 88, weapon: 'nuke' };
const NAPALM_AT_P1  = { angle: 115, power: 86, weapon: 'napalm' };

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

function freshEngine() {
  return new GameEngine({ players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }], maxPlayers: 2, seed: SEED });
}

function tickToRest(e) {
  let t = 0;
  while (e.getState().phase === 'FIRING' && t < MAX_TICKS) { e.tick(); t++; }
  if (t >= MAX_TICKS) throw new Error('never resolved (infinite flight/fire)');
}

/** P1 wastes its turn (a harmless straight-up lob), handing the turn to P2 — so a
 *  subsequent P2 shot lands on a P1 we can pre-arrange (e.g. shielded). */
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

/** Grant a tank ammo as TEST SETUP. The premium tier (nuke/baby_nuke) is now
 *  buy-only and unaffordable at the opening wallet (REVIEW_BACKLOG P0-1), so the
 *  shield test — which needs heavy hits — stocks the firing tank directly.
 *  getState() returns the LIVE state by reference, so this mutates the engine. */
function grant(e, tankIdx, weapon, count = 99) {
  const inv = e.getState().tanks[tankIdx].inventory[weapon];
  inv.count = count;
  inv.unlimited = false;
}

/** One unshielded P2->P1 shot (P2 = index 1); returns the damage dealt to P1. */
function baselineDamage(aim) {
  const e = freshEngine();
  passP1Turn(e);
  grant(e, 1, aim.weapon);
  const hpBefore = e.getState().tanks[0].health;
  fireAt(e, aim);
  return hpBefore - e.getState().tanks[0].health;
}

const baselineMissile = baselineDamage(MISSILE_AT_P1);
const baselineNuke    = baselineDamage(NUKE_AT_P1);
const baselineNapalm  = baselineDamage(NAPALM_AT_P1);
if (baselineMissile <= 0) fail('baseline missile missed P1 — re-tune MISSILE_AT_P1');
if (baselineNuke <= baselineMissile) fail(`baseline nuke (${baselineNuke}) should exceed missile (${baselineMissile})`);
if (baselineNapalm <= 0) fail('baseline napalm dealt no damage — re-tune NAPALM_AT_P1');
log(`[baselines] missile=${baselineMissile.toFixed(1)} nuke=${baselineNuke.toFixed(1)} napalm=${baselineNapalm.toFixed(1)} (pool capacity=${SHIELD_CAPACITY})`);

// --- Check 1: use_shield activates (fills the pool) + ends the turn ---
{
  const e = freshEngine();
  const st0 = e.getState();
  const hpBefore = st0.tanks[0].shieldHp;
  const ammoBefore = st0.tanks[0].inventory.shield.count;
  const turnBefore = st0.turn;
  const activeBefore = st0.activePlayerId;
  if (hpBefore !== 0) fail(`P1 started with shieldHp=${hpBefore}, expected 0`);

  e.applyAction({ type: 'use_shield' });
  const st1 = e.getState();
  const p1b = st1.tanks[0];

  log(`[shield-activate] shieldHp ${hpBefore}->${p1b.shieldHp} (expect ${SHIELD_CAPACITY}); shield ammo ${ammoBefore}->${p1b.inventory.shield.count}; active ${activeBefore}->${st1.activePlayerId}; turn ${turnBefore}->${st1.turn}; phase=${st1.phase}`);
  if (p1b.shieldHp !== SHIELD_CAPACITY) fail(`shield did not fill the pool to ${SHIELD_CAPACITY} (got ${p1b.shieldHp})`);
  if (p1b.inventory.shield.count !== ammoBefore - 1) fail('use_shield did not spend exactly one shield round');
  if (st1.activePlayerId === activeBefore) fail('use_shield did not end the turn (active player unchanged)');
  if (st1.turn !== turnBefore + 1) fail(`use_shield did not advance the turn counter (${turnBefore}->${st1.turn})`);
  if (st1.phase !== 'PLAYER_TURN') fail(`phase after use_shield is ${st1.phase}, expected PLAYER_TURN`);
  if (!failed) log('PASS: use_shield fills the damage pool, spends a round, and ends the turn.');
}

// --- Check 2: commensurate absorption (missile drains ~baseline, health unchanged) ---
{
  const e = freshEngine();
  e.applyAction({ type: 'use_shield' }); // P1 shields, turn -> P2
  grant(e, 1, 'missile');
  const hpBefore = e.getState().tanks[0].health;
  fireAt(e, MISSILE_AT_P1); // P2 -> P1
  const p1 = e.getState().tanks[0];
  const drained = SHIELD_CAPACITY - p1.shieldHp;
  log(`[absorb-commensurate] missile drained pool ${SHIELD_CAPACITY}->${p1.shieldHp.toFixed(1)} (~baseline ${baselineMissile.toFixed(1)}); health dmg=${(hpBefore - p1.health).toFixed(1)}`);
  if (p1.health !== hpBefore) fail(`shielded P1 took ${hpBefore - p1.health} damage from a missile the pool should have soaked`);
  // eps=2: the unshielded baseline lobs a turn-passing shot that craters P1's terrain
  // slightly, so its damage differs from the pristine-terrain shielded hit by ~1px.
  if (!near(drained, baselineMissile, 2)) fail(`missile drained ${drained.toFixed(1)} pool, expected ~${baselineMissile.toFixed(1)} (commensurate with damage)`);
  if (p1.shieldHp <= 0) fail('one missile fully drained a 120 pool — the field should only be partly consumed');
  if (!failed) log('PASS: a missile is fully soaked and drains the pool by ~its damage (commensurate, partial).');
}

// --- Check 3: magnitude-proportional (a nuke drains MORE than a missile) ---
{
  const drainBy = (aim) => {
    const e = freshEngine();
    e.applyAction({ type: 'use_shield' });
    grant(e, 1, aim.weapon);
    fireAt(e, aim);
    return SHIELD_CAPACITY - e.getState().tanks[0].shieldHp;
  };
  const dMissile = drainBy(MISSILE_AT_P1);
  const dNuke = drainBy(NUKE_AT_P1);
  log(`[proportional] missile drains ${dMissile.toFixed(1)} pool vs nuke ${dNuke.toFixed(1)}`);
  if (dNuke <= dMissile) fail(`nuke drained ${dNuke.toFixed(1)} <= missile ${dMissile.toFixed(1)} — a pool must drain proportional to magnitude`);
  if (!failed) log('PASS: a heavier hit drains more of the pool (damage pool, not a hit counter).');
}

// --- Check 4: shield does NOT no-sell heavy fire; one nuke soaked, repeats kill ---
{
  const e = freshEngine();
  e.applyAction({ type: 'use_shield' }); // P1 shields, turn -> P2
  grant(e, 1, 'nuke');                   // stock P2 with nukes (premium = buy-only)
  const startHp = e.getState().tanks[0].health;
  let healthAfterFirst = null;
  let nukes = 0;
  for (let n = 0; n < 12; n++) {
    const st = e.getState();
    if (st.winner) break;                  // P1 already dead
    if (st.activePlayerId === st.tanks[1].id) {
      fireAt(e, NUKE_AT_P1);               // P2 nukes P1
      nukes++;
      if (healthAfterFirst === null) healthAfterFirst = e.getState().tanks[0].health;
    }
    const s2 = e.getState();
    if (!s2.winner && s2.activePlayerId === s2.tanks[0].id) passP1Turn(e); // hand turn back to P2
  }
  const p1 = e.getState().tanks[0];
  log(`[no-no-sell] fired ${nukes} nukes; health after 1st=${healthAfterFirst}; final health=${p1.health}, alive=${p1.alive}, shieldHp=${p1.shieldHp.toFixed(1)}`);
  if (healthAfterFirst !== startHp) fail(`first nuke into a full ${SHIELD_CAPACITY} pool dealt ${startHp - healthAfterFirst} to health — a single ≤100 nuke should be fully soaked`);
  if (p1.alive && p1.health >= startHp) fail(`P1 no-sold ${nukes} nukes behind the shield (health still ${p1.health}) — the pool must be finite (this was the bug)`);
  if (!failed) log(`PASS: one nuke is soaked, but sustained nukes drain the pool and break through (P1 ${p1.alive ? `hurt to ${p1.health}` : 'killed'}).`);
}

// --- Check 5: napalm drains commensurate (many small ticks, ~total damage) ---
{
  const e = freshEngine();
  e.applyAction({ type: 'use_shield' }); // P1 shields, turn -> P2
  grant(e, 1, 'napalm');
  const hpBefore = e.getState().tanks[0].health;
  fireAt(e, NAPALM_AT_P1);
  const p1 = e.getState().tanks[0];
  const drained = SHIELD_CAPACITY - p1.shieldHp;
  log(`[absorb-napalm] napalm drained pool ${SHIELD_CAPACITY}->${p1.shieldHp.toFixed(1)} (drained ${drained.toFixed(1)}, ~baseline ${baselineNapalm.toFixed(1)}); health dmg=${(hpBefore - p1.health).toFixed(1)}`);
  if (drained <= 0) fail('napalm drained none of the pool — burn ticks must drain the field');
  if (!near(drained, baselineNapalm, 2)) fail(`napalm drained ${drained.toFixed(1)} pool, expected ~${baselineNapalm.toFixed(1)} (commensurate with burn damage)`);
  if (!failed) log('PASS: napalm drains the pool by ~its total burn damage (per-tick, not one-particle-per-tick).');
}

// --- Check 6: determinism — [use_shield, then nuke hit] byte-identical ---
{
  function serialize(st) {
    return JSON.stringify({
      phase: st.phase, turn: st.turn, activePlayerId: st.activePlayerId, wind: st.wind, winner: st.winner,
      fire: st.fire, explosions: st.explosions,
      tanks: st.tanks.map((t) => ({ id: t.id, x: t.x, y: t.y, health: t.health, alive: t.alive, shieldHp: t.shieldHp })),
      terrain: Buffer.from(st.terrain).toString('hex'),
    });
  }
  function run() {
    const e = freshEngine();
    e.applyAction({ type: 'use_shield' });
    grant(e, 1, 'nuke');
    fireAt(e, NUKE_AT_P1);
    return serialize(e.getState());
  }
  const a = run(), b = run();
  if (a !== b) fail('two same-seed [use_shield + nuke] runs DIVERGED (non-deterministic shield/absorption)');
  else log(`PASS: two same-seed shield runs byte-identical (len ${a.length}).`);
}

if (failed) { log('\nSHIELD CHECK: FAILED'); process.exit(1); }
else { log('\nSHIELD CHECK: PASSED'); process.exit(0); }
