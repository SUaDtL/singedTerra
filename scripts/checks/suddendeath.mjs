// SUDDEN-DEATH check — guards the gravity-escalation stalemate-breaker (se-parity-
// economy sprint, Feature 2). Past a configured turn threshold T, the engine's
// EFFECTIVE gravity ramps up as a PURE FUNCTION of state.turn:
//   turn <= T  -> base gravity
//   turn  > T  -> base * (1 + (turn - T) * SUDDEN_DEATH_GRAVITY_RAMP)
// so entrenched duels lose range each turn and must resolve. Physics-input only; no
// terrain mutation; same turn => same gravity on every client. Proves:
//   1. OFF by default: with suddenDeathTurn unset, gravity is turn-INDEPENDENT
//      (byte-identical trajectories at turn 0 and turn 20).
//   2. PURE FUNCTION OF TURN (precise): firing straight up with wind 0 isolates y as a
//      function of gravity alone; the engine's mid-flight y matches a bit-faithful
//      re-sim using the exact expected effective gravity, at turn==T (base) and turn>T.
//   3. STRICTLY INCREASING: y at a fixed mid-flight tick grows monotonically with turn
//      past the threshold (projectile falls faster) — proves g strictly increases.
//   4. OBSERVABLE RANGE (AC8): under ONE config, the SAME arc fired PAST the threshold lands
//      STRICTLY SHORTER than fired AT/under the threshold (range shrinks per turn); ON-vs-OFF
//      at the same turn is also checked as a bonus.
//   5. DETERMINISM: two same-seed ON engines at the same turn fire byte-identically.
//   6. AI USES EFFECTIVE GRAVITY: getEffectiveGravity() returns the escalated value, and an
//      AI plan computed with it lands STRICTLY CLOSER to the target (under the real escalated
//      gravity) than a plan computed with base gravity — proving the bot no longer falls short
//      once sudden death kicks in.
//   7. PER-ROUND (not match-global): in a best-of-N match, round 2 OPENS at base gravity even
//      when the cumulative match turn is already past the threshold — escalation resets each round.
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/suddendeath.mjs

import { GameEngine, SUDDEN_DEATH_GRAVITY_RAMP, effectiveGravity } from '../../shared/src/engine/GameEngine.ts';
import { GRAVITY, POWER_SCALE } from '../../shared/src/engine/Physics.ts';
import { BARREL_LENGTH } from '../../shared/src/engine/Tank.ts';
import { computeAiPlan } from '../../shared/src/engine/AI.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function engine(opts = {}) {
  return new GameEngine({ players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }], maxPlayers: 2, seed: SEED, ...opts });
}
function tickToRest(e) { let t = 0; while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) { e.tick(); t++; } }

// Fire straight up (angle 90, wind 0) on a forced turn; tick K times mid-flight; return
// the in-flight projectile y + the launch y0 so the caller can compare against a re-sim.
function probeUp(opts, turn, K, P) {
  const e = engine(opts);
  const st = e.getState();
  st.turn = turn;
  st.wind = 0;
  const tankY = st.tanks[0].y;
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 90 });
  e.applyAction({ type: 'set_power', power: P });
  e.applyAction({ type: 'fire' });
  for (let i = 0; i < K; i++) e.tick();
  const p = e.getState().projectiles[0];
  // y0 = barrel tip y for angle 90: tank.y - BARREL_LENGTH*sin(90deg) = tank.y - BARREL_LENGTH.
  return { y: p ? p.y : null, y0: tankY - BARREL_LENGTH, alive: !!p };
}

// Bit-faithful re-sim of the engine's vertical integration (vx=0 with wind 0), so an
// exact effective gravity can be checked through the black box.
function resimY(gEff, K, P, y0) {
  let vy = -P * POWER_SCALE; // launchVelocity(90,P).vy
  let y = y0;
  for (let i = 0; i < K; i++) { vy += gEff; y += vy; }
  return y;
}

// Fire an arc and return the landing blast x (range proxy).
function arcLandingX(opts, turn, angle, power) {
  const e = engine(opts);
  const st = e.getState();
  st.turn = turn;
  st.wind = 0;
  e.applyAction({ type: 'select_weapon', weapon: 'missile' });
  e.applyAction({ type: 'set_angle', angle });
  e.applyAction({ type: 'set_power', power });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
  const exp = e.getState().lastExplosion;
  return exp ? exp.cx : null;
}

const K = 8, P = 80;

// --- Check 1: OFF by default — gravity is turn-independent ---
{
  const a = probeUp({}, 0, K, P);
  const b = probeUp({}, 20, K, P);
  if (a.y === null || b.y === null) fail('projectile vanished mid-flight (probe setup wrong)');
  if (!close(a.y, b.y, 0)) fail(`OFF gravity is turn-dependent: y(turn0)=${a.y} vs y(turn20)=${b.y}`);
  // And it equals the base-gravity re-sim.
  if (!close(a.y, resimY(GRAVITY, K, P, a.y0))) fail(`OFF y does not match base-gravity re-sim (${a.y} vs ${resimY(GRAVITY, K, P, a.y0)})`);
  if (!failed) log('PASS: suddenDeathTurn unset => gravity is turn-independent and equals base (back-compat).');
}

// --- Check 2: precise pure-function-of-turn (ON, T=2) ---
{
  const T = 2;
  // turn == T => no escalation (base gravity).
  const atT = probeUp({ suddenDeathTurn: T }, T, K, P);
  if (!close(atT.y, resimY(GRAVITY, K, P, atT.y0))) fail(`turn==T should use base gravity (${atT.y} vs ${resimY(GRAVITY, K, P, atT.y0)})`);
  // turn = T+3 => base * (1 + 3*RAMP).
  const past = probeUp({ suddenDeathTurn: T }, T + 3, K, P);
  const gPast = GRAVITY * (1 + 3 * SUDDEN_DEATH_GRAVITY_RAMP);
  if (!close(past.y, resimY(gPast, K, P, past.y0))) fail(`turn=T+3 gravity mismatch (engine y=${past.y} vs re-sim y=${resimY(gPast, K, P, past.y0)} at g=${gPast})`);
  if (!failed) log(`PASS: effective gravity is the exact pure-function-of-turn (base at T, base*(1+3*${SUDDEN_DEATH_GRAVITY_RAMP}) at T+3).`);
}

// --- Check 3: strictly increasing gravity (y at fixed tick grows with turn) ---
{
  const T = 2;
  const y2 = probeUp({ suddenDeathTurn: T }, 2, K, P).y; // == base
  const y3 = probeUp({ suddenDeathTurn: T }, 3, K, P).y; // 1 past
  const y6 = probeUp({ suddenDeathTurn: T }, 6, K, P).y; // 4 past
  if (!(y2 < y3 && y3 < y6)) fail(`mid-flight y should strictly increase with turn (got ${y2}, ${y3}, ${y6})`);
  if (!failed) log(`PASS: gravity strictly increases past the threshold (y ${y2.toFixed(2)} < ${y3.toFixed(2)} < ${y6.toFixed(2)}).`);
}

// --- Check 4 (AC8): within ONE config, a past-threshold shot lands shorter than at-threshold ---
{
  const cfg = { suddenDeathTurn: 2 };
  // A steep, modest-power arc so even the lower-gravity at-threshold flight lands in-bounds.
  const atT = arcLandingX(cfg, 2, 75, 68);  // turn == T => base gravity (no escalation)
  const past = arcLandingX(cfg, 8, 75, 68); // turn = T+6 => escalated gravity => shorter
  if (atT === null || past === null) fail('arc did not land in-bounds (re-tune the range probe)');
  if (!(past < atT)) fail(`same config: a past-threshold shot should land shorter (past cx=${past} should be < at-threshold cx=${atT})`);
  // Bonus: ON also lands shorter than sudden-death-OFF at the same high turn.
  const off = arcLandingX({}, 8, 75, 68);
  if (off !== null && !(past < off)) fail(`sudden death ON should also out-shorten OFF (past=${past}, off=${off})`);
  if (!failed) log(`PASS: within one config, range shrinks past the threshold (turn 8 cx ${past?.toFixed(0)} < turn 2 cx ${atT?.toFixed(0)}).`);
}

// --- Check 5: determinism — two ON engines at the same turn fire byte-identically ---
{
  function serialize(st) {
    return JSON.stringify({
      phase: st.phase, turn: st.turn, wind: st.wind, lastExp: st.lastExplosion,
      tanks: st.tanks.map((t) => ({ id: t.id, x: t.x, y: t.y, health: t.health, alive: t.alive })),
      terrain: Buffer.from(st.terrain).toString('hex'),
    });
  }
  function run() {
    const e = engine({ suddenDeathTurn: 2 });
    e.getState().turn = 6;
    e.getState().wind = 0;
    e.applyAction({ type: 'select_weapon', weapon: 'missile' });
    e.applyAction({ type: 'set_angle', angle: 55 });
    e.applyAction({ type: 'set_power', power: 75 });
    e.applyAction({ type: 'fire' });
    tickToRest(e);
    return serialize(e.getState());
  }
  const a = run(), b = run();
  if (a !== b) fail('two same-seed sudden-death runs DIVERGED');
  else log(`PASS: identical seed+driver reproduce identical sudden-death state (len ${a.length}).`);
}

// --- Check 6: the AI planner uses the engine's effective gravity (bot no longer falls short) ---
{
  const e = new GameEngine({
    players: [{ name: 'Bot', color: PALETTE[0], ai: 'hard' }, { name: 'Tgt', color: PALETTE[1] }],
    maxPlayers: 2, seed: SEED, suddenDeathTurn: 2,
  });
  const st = e.getState();
  st.turn = 6;   // 4 past threshold => gravity * (1 + 4*RAMP); target stays reachable
  st.wind = 0;   // gravity-only comparison
  // Load the bot so it fires a real shot (no buy juggling) at the target.
  for (const k of Object.keys(st.tanks[0].inventory)) st.tanks[0].inventory[k].count = 20;
  st.tanks[0].credits = 100000;
  const targetX = st.tanks[1].x;

  const escG = e.getEffectiveGravity();
  const wantG = effectiveGravity(GRAVITY, 6, 2);
  if (!close(escG, wantG, 1e-12)) fail(`getEffectiveGravity() should be the escalated value ${wantG}, got ${escG}`);
  if (!(escG > GRAVITY)) fail('effective gravity past the threshold should exceed base');

  // Fire a plan on a fresh clone (which flies the shot under the REAL escalated gravity) and
  // return the landing distance to the target (Infinity if no blast / OOB).
  const fireDist = (plan) => {
    if (!plan) return Infinity;
    const c = e.clone();
    if (plan.buy) c.applyAction({ type: 'buy', weapon: plan.buy });
    c.applyAction({ type: 'select_weapon', weapon: plan.weapon });
    c.applyAction({ type: 'set_angle', angle: plan.angle });
    c.applyAction({ type: 'set_power', power: plan.power });
    const beforeId = c.getState().lastExplosion?.id ?? 0;
    c.applyAction({ type: 'fire' });
    tickToRest(c);
    const exp = c.getState().lastExplosion;
    if (!exp || exp.id === beforeId) return Infinity;
    return Math.abs(exp.cx - targetX);
  };

  const planBase = computeAiPlan(st, 'p1', 'hard', GRAVITY); // WRONG gravity (pre-fix behavior)
  const planEsc = computeAiPlan(st, 'p1', 'hard', escG);     // engine's effective gravity (fixed)
  const dBase = fireDist(planBase);
  const dEsc = fireDist(planEsc);
  if (!(dEsc < dBase)) fail(`AI plan with effective gravity should land closer than with base gravity (dEsc=${dEsc.toFixed(1)} should be < dBase=${dBase.toFixed(1)})`);
  if (!failed) log(`PASS: AI plans with the engine's effective gravity, landing closer under sudden death (dEsc ${dEsc.toFixed(0)} < dBase ${dBase.toFixed(0)}).`);
}

// --- Check 7: sudden death is PER-ROUND — round 2 opens at base gravity despite a high global turn ---
{
  const e = new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }],
    maxPlayers: 2, seed: SEED, rounds: 3, suddenDeathTurn: 2,
  });
  // Round 1: drive the (per-round == global, since round 1 starts at turn 0) turn past T.
  e.getState().turn = 10;
  if (!(e.getEffectiveGravity() > GRAVITY)) fail('round 1 past the threshold should be escalated');
  // End round 1 with p1 the sole survivor -> ROUND_OVER -> next_round -> round 2.
  const st = e.getState();
  for (let i = 1; i < st.tanks.length; i++) { st.tanks[i].alive = false; st.tanks[i].health = 0; }
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 90 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
  if (e.getState().phase === 'ROUND_OVER') e.applyAction({ type: 'next_round' });
  if (e.getState().round !== 2) fail(`expected round 2, got ${e.getState().round}`);
  // Round 2 just opened: the match-global turn is high (> threshold) but the per-round turn is ~0,
  // so sudden death MUST be reset — base gravity again.
  if (e.getState().turn <= 2) fail(`global turn should be high entering round 2, got ${e.getState().turn}`);
  if (!close(e.getEffectiveGravity(), GRAVITY, 0)) fail(`round 2 should open at base gravity (per-round reset), got ${e.getEffectiveGravity()} vs base ${GRAVITY} at global turn ${e.getState().turn}`);
  if (!failed) log(`PASS: sudden death is per-round — round 2 opens at base gravity at global turn ${e.getState().turn}.`);
}

if (failed) { log('\nSUDDEN-DEATH CHECK: FAILED'); process.exit(1); }
else { log('\nSUDDEN-DEATH CHECK: PASSED'); process.exit(0); }
