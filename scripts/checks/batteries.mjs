// BATTERIES check — guards the Battery accessory (se-parity-economy sprint, Feature 4).
// A Battery raises a tank's per-tank powerCap above the 100 baseline (catalog: $5000 /
// bundle of 10, +10 power/unit, arms-level 2), letting a player INVEST credits to EXTEND
// RANGE on the 1200px field. Bought via the `buy` action's optional `accessory` field, so
// it flows through the same engine/replay/referee path as a weapon buy. Proves:
//   1. DEFAULT cap 100: a fresh tank caps power at 100 (set_power 150 -> 100, no battery).
//   2. BUY raises cap: buy accessory:'battery' spends BATTERY_PRICE, raises powerCap by
//      BATTERY_POWER_PER_UNIT*BATTERY_BUNDLE_SIZE, and does NOT end the turn; an
//      unaffordable buy rejects with no spend / no cap change.
//   3. CAP takes effect: after a battery, set_power accepts >100 (clamped to the new cap)
//      and the higher-power shot travels STRICTLY FARTHER (more muzzle vx).
//   4. CARRIES across rounds: powerCap is carried into the next round (not reset to 100).
//   5. CONTRACT + GATE: replayNetworkAction with a battery buy raises powerCap (the only
//      sanctioned log->engine path), and the arms-level gate blocks a battery (lvl 2) in a
//      low-arms room.
//   6. DETERMINISM: same seed + driver (battery + high-power fire) => byte-identical state.
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/batteries.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { replayNetworkAction } from '../../shared/src/net/replay.ts';
import {
  BATTERY_PRICE,
  BATTERY_BUNDLE_SIZE,
  BATTERY_POWER_PER_UNIT,
} from '../../shared/src/engine/WeaponSystem.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];
const CAP_GAIN = BATTERY_POWER_PER_UNIT * BATTERY_BUNDLE_SIZE;

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function engine(opts = {}) {
  return new GameEngine({ players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }], maxPlayers: 2, seed: SEED, ...opts });
}
function tickToRest(e) { let t = 0; while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) { e.tick(); t++; } }
// Mid-flight x after K ticks (range proxy: higher muzzle vx => larger x), wind zeroed.
function midflightX(e, angle, power, K = 5) {
  e.getState().wind = 0;
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle });
  e.applyAction({ type: 'set_power', power });
  e.applyAction({ type: 'fire' });
  for (let i = 0; i < K; i++) e.tick();
  const p = e.getState().projectiles[0];
  return p ? p.x : null;
}

// --- Check 1: default cap is 100 (set_power clamps to 100 with no battery) ---
{
  const e = engine();
  if (e.getState().tanks[0].powerCap !== 100) fail(`fresh powerCap should be 100, got ${e.getState().tanks[0].powerCap}`);
  e.applyAction({ type: 'set_power', power: 150 });
  if (e.getState().tanks[0].power !== 100) fail(`set_power 150 with no battery should clamp to 100, got ${e.getState().tanks[0].power}`);
  if (!failed) log('PASS: a fresh tank caps power at 100.');
}

// --- Check 2: buying a battery raises the cap, spends, is turn-neutral ---
{
  const e = engine();
  e.getState().tanks[0].credits = 100000;
  const cBefore = e.getState().tanks[0].credits;
  const capBefore = e.getState().tanks[0].powerCap;
  const activeBefore = e.getState().activePlayerId;
  const phaseBefore = e.getState().phase;
  e.applyAction({ type: 'buy', accessory: 'battery' });
  const t0 = e.getState().tanks[0];
  if (t0.credits !== cBefore - BATTERY_PRICE) fail(`battery buy should spend ${BATTERY_PRICE} (${cBefore}->${t0.credits})`);
  if (t0.powerCap !== capBefore + CAP_GAIN) fail(`battery buy should raise cap by ${CAP_GAIN} (${capBefore}->${t0.powerCap})`);
  if (e.getState().activePlayerId !== activeBefore) fail('battery buy ENDED the turn (active player changed)');
  if (e.getState().phase !== phaseBefore) fail(`battery buy changed phase to ${e.getState().phase}`);

  // Unaffordable battery rejects with no change.
  const e2 = engine();
  e2.getState().tanks[0].credits = BATTERY_PRICE - 1;
  const cap2 = e2.getState().tanks[0].powerCap;
  e2.applyAction({ type: 'buy', accessory: 'battery' });
  if (e2.getState().tanks[0].credits !== BATTERY_PRICE - 1) fail('unaffordable battery still spent credits');
  if (e2.getState().tanks[0].powerCap !== cap2) fail('unaffordable battery still raised the cap');
  if (!failed) log(`PASS: battery spends ${BATTERY_PRICE}, raises cap by ${CAP_GAIN}, turn-neutral; unaffordable rejects.`);
}

// --- Check 2b: a both-fields buy is rejected in the ENGINE too (two-context symmetry) ---
{
  const e = engine();
  e.getState().tanks[0].credits = 100000;
  const cBefore = e.getState().tanks[0].credits;
  const capBefore = e.getState().tanks[0].powerCap;
  const ammoBefore = e.getState().tanks[0].inventory.missile.count;
  // weapon + accessory together: the referee 400s this; the engine must also no-op it so
  // hot-seat can't diverge (resolving the accessory first would silently drop the weapon).
  e.applyAction({ type: 'buy', weapon: 'missile', accessory: 'battery' });
  const t0 = e.getState().tanks[0];
  if (t0.credits !== cBefore) fail(`both-fields buy must not spend (${cBefore}->${t0.credits})`);
  if (t0.powerCap !== capBefore) fail(`both-fields buy must not raise the cap (${capBefore}->${t0.powerCap})`);
  if (t0.inventory.missile.count !== ammoBefore) fail(`both-fields buy must not grant ammo (${ammoBefore}->${t0.inventory.missile.count})`);
  if (!failed) log('PASS: a buy with BOTH weapon and accessory is a no-op in the engine (matches the referee 400).');
}

// --- Check 3: the raised cap takes effect and extends range ---
{
  const withBat = engine();
  withBat.getState().tanks[0].credits = 100000;
  withBat.applyAction({ type: 'buy', accessory: 'battery' }); // cap -> 100 + CAP_GAIN
  withBat.applyAction({ type: 'set_power', power: 150 });
  if (withBat.getState().tanks[0].power !== 150) fail(`after a battery, set_power 150 should be accepted, got ${withBat.getState().tanks[0].power}`);

  const a = engine(); // no battery, power 100
  const b = engine(); // battery, power 150
  b.getState().tanks[0].credits = 100000;
  b.applyAction({ type: 'buy', accessory: 'battery' });
  const xA = midflightX(a, 45, 100);
  const xB = midflightX(b, 45, 150);
  if (xA === null || xB === null) fail('projectile vanished mid-flight (range probe setup wrong)');
  if (!(xB > xA)) fail(`battery-enabled power 150 should out-range power 100 (xB=${xB} should be > xA=${xA})`);
  if (!failed) log(`PASS: the raised cap accepts power 150 and out-ranges power 100 (x ${xB?.toFixed(1)} > ${xA?.toFixed(1)}).`);
}

// --- Check 4: powerCap carries across rounds ---
{
  const e = engine({ rounds: 3 });
  e.getState().tanks[0].credits = 100000;
  e.applyAction({ type: 'buy', accessory: 'battery' });
  const capAfterBuy = e.getState().tanks[0].powerCap;
  // End round 1 (p1 survivor) -> ROUND_OVER, then start round 2.
  for (let i = 1; i < e.getState().tanks.length; i++) { e.getState().tanks[i].alive = false; e.getState().tanks[i].health = 0; }
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 90 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
  e.applyAction({ type: 'next_round' });
  if (e.getState().tanks[0].powerCap !== capAfterBuy) fail(`powerCap should carry across rounds (${capAfterBuy} -> ${e.getState().tanks[0].powerCap})`);
  if (!failed) log('PASS: powerCap carries into the next round (like credits/inventory).');
}

// --- Check 5: replay pass-through + arms-level gate ---
{
  // The ONLY sanctioned log->engine path raises the cap.
  const e = engine();
  e.getState().tanks[0].credits = 100000;
  const capBefore = e.getState().tanks[0].powerCap;
  replayNetworkAction(e, { type: 'buy', accessory: 'battery' });
  if (e.getState().tanks[0].powerCap !== capBefore + CAP_GAIN) fail('replayNetworkAction battery buy did not raise the cap');

  // Battery is arms-level 2 — a low-arms room blocks it.
  const e2 = engine({ armsLevel: 1 });
  e2.getState().tanks[0].credits = 100000;
  const cap2 = e2.getState().tanks[0].powerCap;
  e2.applyAction({ type: 'buy', accessory: 'battery' });
  if (e2.getState().tanks[0].powerCap !== cap2) fail('armsLevel 1 should gate the battery (arms-level 2)');
  if (e2.getState().tanks[0].credits !== 100000) fail('a gated battery buy must not spend');
  if (!failed) log('PASS: replay raises the cap; the arms gate blocks a battery below its level.');
}

// --- Check 5b: the ENGINE is the authoritative power clamp (why the referee may relax to >100) ---
// A networked fire row may carry power > 100 (a battery-boosted shot). On replay, EVERY client's
// engine clamps set_power to that tank's powerCap, so an over-committed power is harmless and
// deterministic — which is exactly why the stateless referee can drop its [0,100] fire ceiling.
{
  // Battery tank (powerCap 200): a replayed fire at power 150 keeps 150.
  const withBat = engine();
  withBat.getState().tanks[0].credits = 100000;
  withBat.applyAction({ type: 'buy', accessory: 'battery' });
  replayNetworkAction(withBat, { type: 'fire', angle: 45, power: 150, weapon: 'baby_missile' });
  if (withBat.getState().tanks[0].power !== 150) fail(`battery tank should fire at 150 on replay, got ${withBat.getState().tanks[0].power}`);

  // No-battery tank (powerCap 100): the SAME replayed power-150 row clamps to 100 — the engine,
  // not the wire, is authoritative, so an over-large committed power can never desync.
  const noBat = engine();
  replayNetworkAction(noBat, { type: 'fire', angle: 45, power: 150, weapon: 'baby_missile' });
  if (noBat.getState().tanks[0].power !== 100) fail(`no-battery tank should clamp a 150 row to 100 on replay, got ${noBat.getState().tanks[0].power}`);
  if (!failed) log('PASS: the engine clamps fire power to powerCap on replay (authoritative; referee may relax >100).');
}

// --- Check 6: determinism ---
{
  function serialize(st) {
    return JSON.stringify({
      phase: st.phase, turn: st.turn, wind: st.wind,
      tanks: st.tanks.map((t) => ({ id: t.id, x: t.x, y: t.y, power: t.power, powerCap: t.powerCap, credits: t.credits, health: t.health, alive: t.alive })),
      terrain: Buffer.from(st.terrain).toString('hex'),
    });
  }
  function run() {
    const e = engine();
    e.getState().tanks[0].credits = 100000;
    e.applyAction({ type: 'buy', accessory: 'battery' });
    e.getState().wind = 0;
    e.applyAction({ type: 'select_weapon', weapon: 'missile' });
    e.applyAction({ type: 'set_angle', angle: 70 });
    e.applyAction({ type: 'set_power', power: 150 });
    e.applyAction({ type: 'fire' });
    tickToRest(e);
    return serialize(e.getState());
  }
  const a = run(), b = run();
  if (a !== b) fail('two same-seed battery runs DIVERGED');
  else log(`PASS: identical seed+driver reproduce identical battery state (len ${a.length}).`);
}

if (failed) { log('\nBATTERIES CHECK: FAILED'); process.exit(1); }
else { log('\nBATTERIES CHECK: PASSED'); process.exit(0); }
