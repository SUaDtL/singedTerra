// STORE / ECONOMY check for the singedTerra shared engine (the 10th harness).
// Covers the buy action + the deterministic credit economy (SPEC §9 weapon shop).
//
// Asserts:
//   1. Tanks start with STARTING_CREDITS.
//   2. buy SPENDS the weapon's price and grants its bundleSize, and does NOT end
//      the turn (a player may buy repeatedly, then fire) — active player + phase
//      unchanged across a buy.
//   3. buy is REJECTED when the tank can't afford it (no credit/inventory change).
//   4. buy is REJECTED for an unlimited-stock weapon (baby_missile) — nothing to buy.
//   5. EARNING: a shot that damages an opponent pays the shooter
//      round(damage*CREDITS_PER_DAMAGE)+TURN_STIPEND; a clean miss still pays the
//      flat stipend.
//   6. Determinism: two same-seed runs of [buy, then a damaging fire] are
//      BYTE-IDENTICAL (serialize includes credits + inventory).
//
// Fully deterministic: no Math.random, no Date. Imports the shared TS directly.
// Run: npx tsx scripts/checks/store.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import {
  getWeapon,
  STARTING_CREDITS,
  CREDITS_PER_DAMAGE,
  TURN_STIPEND,
} from '../../shared/src/engine/WeaponSystem.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];

// P1 (x=80) lands a missile on P2 (x=720) for this seed (swept against the engine).
const HIT_P2 = { angle: 52, power: 40, weapon: 'missile' };

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function freshEngine() {
  return new GameEngine({ players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }], maxPlayers: 2, seed: SEED });
}
function tickToRest(e) { let t = 0; while (e.getState().phase === 'FIRING' && t < MAX_TICKS) { e.tick(); t++; } }

// --- Check 1: starting credits ---
{
  const e = freshEngine();
  const c = e.getState().tanks[0].credits;
  log(`[start] credits=${c} (expect ${STARTING_CREDITS})`);
  if (c !== STARTING_CREDITS) fail(`tank starts with ${c} credits, expected ${STARTING_CREDITS}`);
  if (!failed) log('PASS: tanks start with STARTING_CREDITS.');
}

// --- Check 2: buy spends + grants, does NOT end the turn ---
{
  const e = freshEngine();
  const def = getWeapon('missile');
  const creditsBefore = e.getState().tanks[0].credits;
  const ammoBefore = e.getState().tanks[0].inventory.missile.count;
  const activeBefore = e.getState().activePlayerId;
  const phaseBefore = e.getState().phase;

  e.applyAction({ type: 'buy', weapon: 'missile' });

  const st = e.getState();
  const t0 = st.tanks[0];
  log(`[buy] missile $${def.price} x${def.bundleSize}: credits ${creditsBefore}->${t0.credits}; missile ammo ${ammoBefore}->${t0.inventory.missile.count}; active ${activeBefore}->${st.activePlayerId}; phase ${phaseBefore}->${st.phase}`);
  if (t0.credits !== creditsBefore - def.price) fail(`buy did not spend exactly the price (${creditsBefore}->${t0.credits}, price ${def.price})`);
  if (t0.inventory.missile.count !== ammoBefore + def.bundleSize) fail(`buy did not grant bundleSize (${ammoBefore}->${t0.inventory.missile.count}, bundle ${def.bundleSize})`);
  if (st.activePlayerId !== activeBefore) fail('buy ENDED the turn (active player changed) — it must not');
  if (st.phase !== phaseBefore) fail(`buy changed phase to ${st.phase} — it must stay ${phaseBefore}`);
  if (!failed) log('PASS: buy spends price, grants a bundle, and does NOT end the turn.');
}

// --- Check 3: buy rejected when unaffordable ---
{
  const e = freshEngine();
  // Drain credits by buying the most expensive affordable items until broke-ish,
  // then attempt a buy we cannot afford. Simplest: read credits, attempt to buy
  // something pricier than the balance by first spending down.
  // Spend down to < nuke price by buying nukes while affordable.
  const nuke = getWeapon('nuke');
  let guard = 0;
  while (e.getState().tanks[0].credits >= nuke.price && guard++ < 100) {
    e.applyAction({ type: 'buy', weapon: 'nuke' });
  }
  const creditsBefore = e.getState().tanks[0].credits;
  const ammoBefore = e.getState().tanks[0].inventory.nuke.count;
  if (creditsBefore >= nuke.price) fail('could not drain credits below a nuke price for the affordability test');
  e.applyAction({ type: 'buy', weapon: 'nuke' }); // should be rejected
  const t0 = e.getState().tanks[0];
  log(`[afford] credits=${creditsBefore} (< nuke $${nuke.price}); after rejected buy credits=${t0.credits} nukeAmmo=${ammoBefore}->${t0.inventory.nuke.count}`);
  if (t0.credits !== creditsBefore) fail('unaffordable buy still spent credits');
  if (t0.inventory.nuke.count !== ammoBefore) fail('unaffordable buy still granted ammo');
  if (!failed) log('PASS: an unaffordable buy is rejected (no credit/ammo change).');
}

// --- Check 4: buy rejected for unlimited-stock weapon ---
{
  const e = freshEngine();
  const creditsBefore = e.getState().tanks[0].credits;
  e.applyAction({ type: 'buy', weapon: 'baby_missile' }); // unlimited — nothing to buy
  const t0 = e.getState().tanks[0];
  if (t0.credits !== creditsBefore) fail('buying an unlimited weapon spent credits (should be a no-op)');
  if (!t0.inventory.baby_missile.unlimited) fail('baby_missile lost its unlimited flag');
  if (!failed) log('PASS: buying an unlimited-stock weapon is a no-op (no charge).');
}

// --- Check 5: earning from damage + flat stipend on a miss ---
{
  // Damaging shot.
  const e = freshEngine();
  const before = e.getState().tanks[0].credits;
  const p2Before = e.getState().tanks[1].health;
  e.applyAction({ type: 'select_weapon', weapon: HIT_P2.weapon });
  e.applyAction({ type: 'set_angle', angle: HIT_P2.angle });
  e.applyAction({ type: 'set_power', power: HIT_P2.power });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
  const dmg = p2Before - e.getState().tanks[1].health;
  const earned = e.getState().tanks[0].credits - before;
  const expected = Math.round(dmg * CREDITS_PER_DAMAGE) + TURN_STIPEND;
  log(`[earn] P2 dmg=${dmg.toFixed(1)}; P1 earned=${earned} (expect ${expected})`);
  if (dmg <= 0) fail('earning test shot dealt no damage (re-tune HIT_P2)');
  if (earned !== expected) fail(`earning mismatch: earned ${earned}, expected round(${dmg.toFixed(2)}*${CREDITS_PER_DAMAGE})+${TURN_STIPEND}=${expected}`);

  // Clean miss (straight up, low power) still pays the flat stipend.
  const e2 = freshEngine();
  const b2 = e2.getState().tanks[0].credits;
  e2.applyAction({ type: 'select_weapon', weapon: 'missile' });
  e2.applyAction({ type: 'set_angle', angle: 90 });
  e2.applyAction({ type: 'set_power', power: 6 });
  e2.applyAction({ type: 'fire' });
  tickToRest(e2);
  const missEarned = e2.getState().tanks[0].credits - b2;
  // The lob may self-damage; allow >= stipend (self-damage doesn't pay, so it is
  // exactly the stipend unless the shot somehow hits the opponent — it can't here).
  if (missEarned !== TURN_STIPEND) fail(`a non-damaging shot paid ${missEarned}, expected the flat stipend ${TURN_STIPEND}`);
  if (!failed) log(`PASS: a damaging shot pays per-damage + stipend; a miss pays the flat stipend (${TURN_STIPEND}).`);
}

// --- Check 6: determinism — [buy, then damaging fire] byte-identical ---
{
  function serialize(st) {
    return JSON.stringify({
      phase: st.phase, turn: st.turn, activePlayerId: st.activePlayerId, wind: st.wind, winner: st.winner,
      tanks: st.tanks.map((t) => ({ id: t.id, x: t.x, y: t.y, health: t.health, alive: t.alive, credits: t.credits, inv: t.inventory })),
      terrain: Buffer.from(st.terrain).toString('hex'),
    });
  }
  function run() {
    const e = freshEngine();
    e.applyAction({ type: 'buy', weapon: 'cluster_bomb' });
    e.applyAction({ type: 'select_weapon', weapon: HIT_P2.weapon });
    e.applyAction({ type: 'set_angle', angle: HIT_P2.angle });
    e.applyAction({ type: 'set_power', power: HIT_P2.power });
    e.applyAction({ type: 'fire' });
    tickToRest(e);
    return serialize(e.getState());
  }
  const a = run(), b = run();
  if (a !== b) fail('two same-seed [buy + fire] runs DIVERGED (non-deterministic economy)');
  else log(`PASS: two same-seed store runs byte-identical (len ${a.length}).`);
}

if (failed) { log('\nSTORE CHECK: FAILED'); process.exit(1); }
else { log('\nSTORE CHECK: PASSED'); process.exit(0); }
