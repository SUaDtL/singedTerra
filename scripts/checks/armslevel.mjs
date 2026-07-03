// ARMS-LEVEL check — guards the store arms-level gate (se-parity-economy sprint,
// Feature 3). Each weapon carries an armsLevel (0–4); a room's GameOptions.armsLevel
// caps what is buyable, so a "basic" room is a low-level duel and a max room is a full
// arsenal. The gate lives in the shared applyBuy, so it covers BOTH the PLAYER_TURN
// store and the ROUND_OVER between-rounds shop. Proves:
//   1. EVERYTHING by default: armsLevel unset => any affordable buy succeeds (funky_bomb,
//      arms-level 4).
//   2. GATE rejects above-level: armsLevel 0 => an above-level buy (nuke lvl1, cluster
//      lvl2) is rejected with NO credit/ammo change; a level-0 buy (missile) succeeds.
//   3. BOUNDARY: armsLevel 2 => level-<=2 (napalm lvl2) succeeds, level->=3 (shield lvl3,
//      deaths_head lvl4) rejected.
//   4. BOTH PATHS: the gate applies in the ROUND_OVER shop too.
//   5. DETERMINISM: same seed + driver => byte-identical credits/inventory.
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/armslevel.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { getWeapon } from '../../shared/src/engine/WeaponSystem.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function engine(opts = {}) {
  return new GameEngine({ players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }], maxPlayers: 2, seed: SEED, ...opts });
}
function tickToRest(e) { let t = 0; while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) { e.tick(); t++; } }

// Attempt a PLAYER_TURN buy for the active tank (p1); report whether inventory grew and
// how much was spent. Credits are pre-loaded so affordability is never the reason.
function tryBuy(e, weapon) {
  const t0 = e.getState().tanks[0];
  const before = t0.inventory[weapon].count;
  const cBefore = t0.credits;
  e.applyAction({ type: 'buy', weapon });
  const after = e.getState().tanks[0].inventory[weapon].count;
  const cAfter = e.getState().tanks[0].credits;
  return { bought: after > before, spent: cBefore - cAfter, level: getWeapon(weapon).armsLevel };
}

// --- Check 1: everything buyable by default (armsLevel unset) ---
{
  const e = engine();
  e.getState().tanks[0].credits = 100000;
  const fk = tryBuy(e, 'funky_bomb'); // arms-level 4
  if (!fk.bought) fail(`default (no armsLevel) should allow a level-4 buy, but funky_bomb was rejected`);
  if (fk.spent !== getWeapon('funky_bomb').price) fail(`funky_bomb buy should spend its price, spent ${fk.spent}`);
  if (!failed) log('PASS: armsLevel unset => everything buyable (level-4 funky_bomb succeeds).');
}

// --- Check 2: armsLevel 0 gates above-level, allows level-0 ---
{
  const e = engine({ armsLevel: 0 });
  e.getState().tanks[0].credits = 100000;
  const missile = tryBuy(e, 'missile'); // lvl 0
  const nuke = tryBuy(e, 'nuke'); // lvl 1
  const cluster = tryBuy(e, 'cluster_bomb'); // lvl 2
  if (!missile.bought) fail('armsLevel 0 should allow a level-0 buy (missile)');
  if (nuke.bought) fail('armsLevel 0 must reject a level-1 buy (nuke)');
  if (nuke.spent !== 0) fail(`a gated nuke buy must not spend, spent ${nuke.spent}`);
  if (cluster.bought) fail('armsLevel 0 must reject a level-2 buy (cluster_bomb)');
  if (cluster.spent !== 0) fail(`a gated cluster buy must not spend, spent ${cluster.spent}`);
  if (!failed) log('PASS: armsLevel 0 allows level-0, rejects level-1/2 with no spend.');
}

// --- Check 3: boundary at armsLevel 2 ---
{
  const e = engine({ armsLevel: 2 });
  e.getState().tanks[0].credits = 100000;
  const napalm = tryBuy(e, 'napalm'); // lvl 2 (== cap, allowed)
  const shield = tryBuy(e, 'shield'); // lvl 3 (rejected)
  const dh = tryBuy(e, 'deaths_head'); // lvl 4 (rejected)
  if (!napalm.bought) fail('armsLevel 2 should allow a level-2 buy (napalm)');
  if (shield.bought) fail('armsLevel 2 must reject a level-3 buy (shield)');
  if (dh.bought) fail('armsLevel 2 must reject a level-4 buy (deaths_head)');
  if (!failed) log('PASS: armsLevel 2 boundary — level-2 allowed, level-3/4 rejected.');
}

// --- Check 4: the gate applies in the ROUND_OVER between-rounds shop ---
{
  const e = engine({ armsLevel: 0, rounds: 3 });
  e.getState().tanks[0].credits = 100000;
  // End round 1 with p1 the survivor -> ROUND_OVER shop.
  for (let i = 1; i < e.getState().tanks.length; i++) { e.getState().tanks[i].alive = false; e.getState().tanks[i].health = 0; }
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 90 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
  if (e.getState().phase !== 'ROUND_OVER') fail(`expected ROUND_OVER for the shop test, got ${e.getState().phase}`);
  const before = e.getState().tanks[0].inventory.nuke.count;
  e.applyAction({ type: 'buy', weapon: 'nuke', tankId: 'p1' }); // lvl 1 — must be gated
  const after = e.getState().tanks[0].inventory.nuke.count;
  if (after !== before) fail(`ROUND_OVER shop must honor the arms gate (nuke ${before}->${after})`);
  // A level-0 buy in the shop still works.
  const mBefore = e.getState().tanks[0].inventory.missile.count;
  e.applyAction({ type: 'buy', weapon: 'missile', tankId: 'p1' });
  if (e.getState().tanks[0].inventory.missile.count <= mBefore) fail('ROUND_OVER shop should still allow a level-0 buy (missile)');
  if (!failed) log('PASS: the arms gate applies in the ROUND_OVER between-rounds shop too.');
}

// --- Check 5: determinism ---
{
  function serialize(st) {
    return JSON.stringify(st.tanks.map((t) => ({ id: t.id, credits: t.credits, inv: t.inventory })));
  }
  function run() {
    const e = engine({ armsLevel: 1 });
    e.getState().tanks[0].credits = 100000;
    e.applyAction({ type: 'buy', weapon: 'missile' }); // lvl0 ok
    e.applyAction({ type: 'buy', weapon: 'heavy_missile' }); // lvl1 ok
    e.applyAction({ type: 'buy', weapon: 'cluster_bomb' }); // lvl2 rejected
    return serialize(e.getState());
  }
  const a = run(), b = run();
  if (a !== b) fail('two same-seed arms-level runs DIVERGED');
  else log('PASS: identical seed+driver reproduce identical credits/inventory.');
}

if (failed) { log('\nARMS-LEVEL CHECK: FAILED'); process.exit(1); }
else { log('\nARMS-LEVEL CHECK: PASSED'); process.exit(0); }
