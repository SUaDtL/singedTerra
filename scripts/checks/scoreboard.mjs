// SCOREBOARD check (15th harness) — guards the V1 scoreboard stats (Sprint 6
// Slice 2): per-tank `kills` and `totalDamage`, attributed to the SHOOTER and
// accumulated across rounds. Reuses store.mjs's swept known-good shot
// (P1 angle 52 / power 40 / missile lands on P2 for this seed) for a deterministic
// hit. Asserts:
//   1. DAMAGE: a hit on a healthy opponent adds exactly the effective (post-clamp)
//      damage to the shooter's totalDamage; the victim's own totalDamage stays 0;
//      a survived hit is NOT a kill.
//   2. KILL + OVERKILL: a hit that takes a low-HP opponent to 0 credits exactly one
//      kill, and totalDamage counts only the effective damage (overkill excluded).
//   3. SELF-DAMAGE: a tank lobbing onto itself accrues no kills and no totalDamage.
//   4. CARRY: kills + totalDamage accumulate across rounds in a best-of-N match.
//   5. DETERMINISM: two same-seed kill runs produce identical kills/totalDamage.
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/scoreboard.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];
const HIT_P2 = { angle: 49, power: 71, weapon: 'missile' }; // P1 -> P2, 1200×600 field (swept, ~49 dmg)

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function engine(rounds) {
  return new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }],
    maxPlayers: 2, seed: SEED, rounds,
  });
}
function tickToRest(e) { let t = 0; while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) { e.tick(); t++; } }
function fireHit(e) {
  e.applyAction({ type: 'select_weapon', weapon: HIT_P2.weapon });
  e.applyAction({ type: 'set_angle', angle: HIT_P2.angle });
  e.applyAction({ type: 'set_power', power: HIT_P2.power });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
}

// --- Check 1: damage attribution on a survived hit (no kill) ---
{
  const e = engine();
  const p2Before = e.getState().tanks[1].health;
  fireHit(e);
  const st = e.getState();
  const dealt = p2Before - st.tanks[1].health;
  log(`[damage] P1 dealt ${dealt.toFixed(1)} to P2; P1.totalDamage=${st.tanks[0].totalDamage}, kills=${st.tanks[0].kills}`);
  if (dealt <= 0) fail('test shot dealt no damage (re-tune HIT_P2)');
  // totalDamage accrues the exact health delta (the same figure the economy pays for).
  if (Math.abs(st.tanks[0].totalDamage - dealt) > 1e-9) fail(`totalDamage ${st.tanks[0].totalDamage} != dealt ${dealt}`);
  if (st.tanks[1].totalDamage !== 0) fail(`victim P2 should have 0 totalDamage, got ${st.tanks[1].totalDamage}`);
  if (st.tanks[0].kills !== 0) fail(`a survived hit should not be a kill, got kills=${st.tanks[0].kills}`);
  if (!failed) log('PASS: damage is attributed to the shooter; a survived hit is not a kill.');
}

// --- Check 2: kill + overkill exclusion ---
{
  const e = engine();
  e.getState().tanks[1].health = 5; // P2 on the brink
  fireHit(e);
  const st = e.getState();
  if (st.tanks[1].alive) fail('P2 should be dead after the killing hit');
  if (st.tanks[0].kills !== 1) fail(`shooter should have exactly 1 kill, got ${st.tanks[0].kills}`);
  // Effective damage is the health actually removed (5), NOT the missile's full power.
  if (st.tanks[0].totalDamage !== 5) fail(`overkill should not count: totalDamage should be 5, got ${st.tanks[0].totalDamage}`);
  log(`[kill] P1 killed P2 from 5 HP: kills=${st.tanks[0].kills}, totalDamage=${st.tanks[0].totalDamage} (overkill excluded)`);
  if (!failed) log('PASS: a lethal hit credits exactly one kill; overkill is excluded from totalDamage.');
}

// --- Check 3: self-damage accrues nothing ---
{
  const e = engine();
  e.applyAction({ type: 'select_weapon', weapon: 'missile' });
  e.applyAction({ type: 'set_angle', angle: 90 });
  e.applyAction({ type: 'set_power', power: 6 }); // straight up, lands near self
  e.applyAction({ type: 'fire' });
  tickToRest(e);
  const t0 = e.getState().tanks[0];
  if (t0.kills !== 0) fail(`self-damage should not be a kill, got kills=${t0.kills}`);
  if (t0.totalDamage !== 0) fail(`self-damage should not add totalDamage, got ${t0.totalDamage}`);
  if (!failed) log('PASS: self-damage credits no kills and no totalDamage.');
}

// --- Check 4: stats carry across rounds ---
{
  const e = engine(3);
  e.getState().tanks[1].health = 5;
  fireHit(e); // P1 kills P2 -> round 1 to P1, advance to round 2
  const st = e.getState();
  if (st.round !== 2) fail(`expected round 2 after a round-ending kill, got round ${st.round}`);
  if (st.tanks[0].kills !== 1) fail(`kills should carry into round 2, got ${st.tanks[0].kills}`);
  if (st.tanks[0].totalDamage < 5) fail(`totalDamage should carry into round 2 (>=5), got ${st.tanks[0].totalDamage}`);
  log(`[carry] into round ${st.round}: P1 kills=${st.tanks[0].kills}, totalDamage=${st.tanks[0].totalDamage}`);
  if (!failed) log('PASS: kills + totalDamage accumulate across rounds.');
}

// --- Check 5: determinism of the kill scenario ---
{
  function run() {
    const e = engine();
    e.getState().tanks[1].health = 5;
    fireHit(e);
    const t = e.getState().tanks[0];
    return `${t.kills}|${t.totalDamage}`;
  }
  const a = run(), b = run();
  if (a !== b) fail(`kill scenario diverged across runs: ${a} vs ${b}`);
  else log(`PASS: kill scenario is deterministic (${a}).`);
}

if (failed) { log('\nSCOREBOARD CHECK: FAILED'); process.exit(1); }
else { log('\nSCOREBOARD CHECK: PASSED'); process.exit(0); }
