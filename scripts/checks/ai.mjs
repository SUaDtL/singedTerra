// AI (computer-opponent) check for the singedTerra shared engine (11th harness).
// Verifies the pure shot-planner in shared/src/engine/AI.ts.
//
// Asserts:
//   1. DETERMINISM: computeAiPlan(state, id, diff) is a pure function — two calls
//      on the same state return an identical plan; and a full AI-vs-AI game driven
//      by the planner replays BYTE-IDENTICAL from the same seed.
//   2. COMPETENCE / TERMINATION: a 'hard' AI-vs-AI game ENDS with a winner within
//      a sane turn cap — i.e. the bots actually land damaging shots and the game
//      resolves (no stalemate / infinite lobbing).
//   3. DIFFICULTY ORDERING: across many maps, 'hard' deals MORE mean damage with
//      its opening shot than 'easy' (finer search + far smaller aim error).
//   4. EDGE CASES: a dead tank or a tank with no living enemy yields null (no shot).
//
// Deterministic: no Math.random, no Date. Imports shared TS directly.
// Run: npx tsx scripts/checks/ai.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { computeAiPlan } from '../../shared/src/engine/AI.ts';

const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function engine(seed) {
  return new GameEngine({ players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }], maxPlayers: 2, seed });
}
function tickToRest(e) { let t = 0; while (e.getState().phase === 'FIRING' && t < MAX_TICKS) { e.tick(); t++; } }

/** Apply one AI turn for the active tank; returns false if the bot could not act.
 *  Mirrors the real drivers: a 'shield' plan becomes use_shield, not a fire. */
function aiTurn(e, difficulty) {
  const st = e.getState();
  const plan = computeAiPlan(st, st.activePlayerId, difficulty);
  if (!plan) return false;
  if (plan.weapon === 'shield') {
    e.applyAction({ type: 'use_shield' });
    tickToRest(e);
    return true;
  }
  e.applyAction({ type: 'select_weapon', weapon: plan.weapon });
  e.applyAction({ type: 'set_angle', angle: plan.angle });
  e.applyAction({ type: 'set_power', power: plan.power });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
  return true;
}

/** Drive a full AI-vs-AI game to GAME_OVER (or the turn cap). */
function playGame(seed, difficulty, turnCap = 120) {
  const e = engine(seed);
  let turns = 0;
  while (e.getState().phase !== 'GAME_OVER' && turns < turnCap) {
    if (!aiTurn(e, difficulty)) break;
    turns++;
  }
  return { state: e.getState(), turns };
}

// --- Check 1a: computeAiPlan is pure (same state => same plan) ---
{
  const e = engine(0x5eed1234);
  const st = e.getState();
  const a = computeAiPlan(st, st.activePlayerId, 'hard');
  const b = computeAiPlan(st, st.activePlayerId, 'hard');
  log(`[pure] plan a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
  if (!a || !b) fail('computeAiPlan returned null on a fresh 2-tank board (should find a shot)');
  else if (a.weapon !== b.weapon || a.angle !== b.angle || a.power !== b.power) fail('computeAiPlan is NOT pure — two calls diverged');
  else log('PASS: computeAiPlan is a pure function of state.');
}

// --- Check 1b: a full AI-vs-AI game replays byte-identical ---
{
  function serialize(st) {
    return JSON.stringify({
      phase: st.phase, turn: st.turn, winner: st.winner, wind: st.wind,
      tanks: st.tanks.map((t) => ({ id: t.id, x: t.x, y: t.y, health: t.health, alive: t.alive })),
    });
  }
  const r1 = playGame(0x5eed1234, 'hard');
  const r2 = playGame(0x5eed1234, 'hard');
  if (serialize(r1.state) !== serialize(r2.state) || r1.turns !== r2.turns) fail('two same-seed AI-vs-AI games DIVERGED (non-deterministic AI)');
  else log(`PASS: AI-vs-AI game is deterministic (replayed identically; ${r1.turns} turns).`);
}

// --- Check 2: a hard AI-vs-AI game resolves with a winner ---
{
  // Try several maps; a few terrains can be awkward, but the bots should close out
  // the large majority well within the cap.
  let resolved = 0;
  const SEEDS = [0x1111, 0x2222, 0x3333, 0x4444, 0x5555, 0x6666];
  let sumTurns = 0;
  for (const s of SEEDS) {
    const r = playGame(s, 'hard', 120);
    if (r.state.phase === 'GAME_OVER' && r.state.winner) { resolved++; sumTurns += r.turns; }
  }
  log(`[competence] hard AI resolved ${resolved}/${SEEDS.length} games; avg ${resolved ? (sumTurns / resolved).toFixed(1) : '—'} turns`);
  if (resolved < SEEDS.length - 1) fail(`hard AI only resolved ${resolved}/${SEEDS.length} games — bots should reliably close games out`);
  else log('PASS: hard AI-vs-AI games reliably resolve with a winner.');
}

// --- Check 3: hard deals more mean opening-shot damage than easy ---
{
  const SEEDS = [0x0a, 0x14, 0x1e, 0x28, 0x32, 0x3c, 0x46, 0x50, 0x5a, 0x64];
  function openingDamage(seed, difficulty) {
    const e = engine(seed);
    const before = e.getState().tanks[1].health; // P2 is P1's target on turn 0
    aiTurn(e, difficulty);
    return before - e.getState().tanks[1].health;
  }
  let easySum = 0, hardSum = 0;
  for (const s of SEEDS) { easySum += openingDamage(s, 'easy'); hardSum += openingDamage(s, 'hard'); }
  const easyMean = easySum / SEEDS.length, hardMean = hardSum / SEEDS.length;
  log(`[difficulty] mean opening dmg: easy=${easyMean.toFixed(1)} hard=${hardMean.toFixed(1)} (over ${SEEDS.length} maps)`);
  if (!(hardMean > easyMean)) fail(`hard (${hardMean.toFixed(1)}) did not out-damage easy (${easyMean.toFixed(1)}) — difficulty ordering broken`);
  else log('PASS: hard bots land harder than easy bots (difficulty ordering holds).');
}

// --- Check 4: edge cases yield null (no shot) ---
{
  const e = engine(0x5eed1234);
  const st = e.getState();
  // A dead tank cannot plan.
  if (computeAiPlan(st, 'p1', 'hard') === null) fail('a living tank with a living enemy should produce a plan, got null');
  // Kill P2 directly and ask P1 to plan — no living enemy => null.
  st.tanks[1].alive = false;
  st.tanks[1].health = 0;
  if (computeAiPlan(st, 'p1', 'hard') !== null) fail('with no living enemy, computeAiPlan should return null');
  // An unknown / dead self => null.
  if (computeAiPlan(st, 'p2', 'hard') !== null) fail('a dead tank should not produce a plan');
  if (computeAiPlan(st, 'nope', 'hard') !== null) fail('an unknown tank id should return null');
  if (!failed) log('PASS: edge cases (dead self / no enemy / unknown id) return null.');
}

// --- Check 5: a hurt hard bot with a shield raises it; a healthy one does not ---
{
  const e = engine(0x5eed1234);
  const st = e.getState();
  // P1 starts with 1 shield (default loadout). Hurt it below the threshold.
  st.tanks[0].health = 20;
  const hurt = computeAiPlan(st, 'p1', 'hard');
  log(`[shield] low-HP hard bot plan weapon=${hurt?.weapon}`);
  if (hurt?.weapon !== 'shield') fail(`a low-HP hard bot holding a shield should use_shield, got ${hurt?.weapon}`);
  // At full health it should attack, not shield.
  st.tanks[0].health = 100;
  const healthy = computeAiPlan(st, 'p1', 'hard');
  if (healthy?.weapon === 'shield') fail('a full-health hard bot should attack, not shield');
  // With no shield in stock, even a hurt bot attacks (can't shield).
  st.tanks[0].health = 15;
  st.tanks[0].inventory.shield.count = 0;
  const noShield = computeAiPlan(st, 'p1', 'hard');
  if (noShield?.weapon === 'shield') fail('a hurt bot with no shield in stock must not pick shield');
  if (!failed) log('PASS: hard bot shields when hurt+stocked, attacks otherwise.');
}

// --- Check 6: weapon choice scales to target health (no nuke on a near-dead tank) ---
{
  const e = engine(0x5eed1234);
  const st = e.getState();
  // Stock P1 with the full premium tier so the scaling has room to choose.
  st.tanks[0].inventory.nuke.count = 5;
  st.tanks[0].inventory.heavy_missile.count = 5;
  // Near-dead target => the WEAKEST one-shot finisher (free Baby Missile), not a nuke.
  st.tanks[1].health = 12;
  const small = computeAiPlan(st, 'p1', 'hard');
  log(`[scale] vs 12hp target: ${small?.weapon}; vs 100hp target: (below)`);
  if (small?.weapon !== 'baby_missile') fail(`vs a 12hp target a hard bot should pick baby_missile, not ${small?.weapon} (no overkill)`);
  // Full-health target => the strongest stocked finisher (nuke, effective 100 >= 100).
  st.tanks[1].health = 100;
  const big = computeAiPlan(st, 'p1', 'hard');
  log(`[scale] vs 100hp target: ${big?.weapon}`);
  if (big?.weapon !== 'nuke') fail(`vs a full-health target a hard bot with a nuke should pick nuke, got ${big?.weapon}`);
  if (!failed) log('PASS: weapon choice scales to target health (small for near-dead, heavy for healthy).');
}

if (failed) { log('\nAI CHECK: FAILED'); process.exit(1); }
else { log('\nAI CHECK: PASSED'); process.exit(0); }
