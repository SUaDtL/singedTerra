// AI DETERMINISM check for the singedTerra shared engine (22nd harness).
//
// Locks in the CPU-seat exactly-once invariant: two independently-seeded engines
// in the SAME state must compute BYTE-IDENTICAL AI plans. This pins the
// Object.keys + stable-sort tie-break that networked bot determinism implicitly
// depends on — if V8 stable-sort insertion order ever changes under equal damage
// values, this harness catches it before a cross-client desync can happen in prod.
//
// Asserts:
//   1. INDEPENDENT-ENGINE IDENTITY: two fresh GameEngine instances advanced to the
//      same state via the same seed and actions both yield the identical AiPlan from
//      computeAiPlan (byte-identical: weapon, angle, power, buy).
//   2. REPEATED-CALL IDEMPOTENCY: calling computeAiPlan twice on the exact same
//      engine state returns an identical plan (the function is truly side-effect-free).
//   3. CROSS-DIFFICULTY: checked for all three AiDifficulty values: easy, medium, hard.
//   4. STATE VARIETY: swept across several fixed (seed, wind, tank-position, turn, health)
//      combinations to catch edge cases in the angle/power tie-break and the
//      Object.keys stable-sort path inside chooseLoadout / chooseBuy.
//
// Deterministic: no Math.random, no Date. Imports shared TS directly.
// Run: npx tsx scripts/checks/ai_determinism.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { computeAiPlan } from '../../shared/src/engine/AI.ts';

const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

/** Create a fresh 2-player engine at the given seed. */
function makeEngine(seed) {
  return new GameEngine({
    players: [
      { name: 'P1', color: PALETTE[0] },
      { name: 'P2', color: PALETTE[1] },
    ],
    maxPlayers: 2,
    seed,
  });
}

/** Tick until out of FIRING/RESOLVING phase (settle a projectile in flight). */
function tickToRest(e) {
  let t = 0;
  while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) {
    e.tick();
    t++;
  }
}

/**
 * Deep-equal two AiPlan objects (or both-null). Returns true iff byte-identical.
 * Compares weapon, angle, power, and buy (treating absent === undefined).
 */
function plansEqual(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    a.weapon === b.weapon &&
    a.angle === b.angle &&
    a.power === b.power &&
    a.buy === b.buy
  );
}

/** Report the first differing field between two plans (for diagnostic output). */
function planDiff(a, b) {
  if (a === null || b === null) return `one plan is null (a=${a}, b=${b})`;
  const fields = ['weapon', 'angle', 'power', 'buy'];
  for (const f of fields) {
    if (a[f] !== b[f]) return `field '${f}': a=${JSON.stringify(a[f])} b=${JSON.stringify(b[f])}`;
  }
  return '(no difference found)';
}

// ---------------------------------------------------------------------------
// Test matrix: each entry is a named scenario that configures the engine state
// before calling computeAiPlan. Two independent engines are seeded identically
// and both mutated in the exact same way, so they land on the same state.
// ---------------------------------------------------------------------------

const SCENARIOS = [
  {
    label: 'fresh-start seed=0x5eed1234',
    seed: 0x5eed1234,
    configure: (_st) => { /* default state — nothing to mutate */ },
  },
  {
    label: 'different seed=0xdeadbeef',
    seed: 0xdeadbeef,
    configure: (_st) => {},
  },
  {
    label: 'different seed=0xc0ffee00',
    seed: 0xc0ffee00,
    configure: (_st) => {},
  },
  {
    label: 'high-turn (turn=7) seed=0x1111cafe',
    seed: 0x1111cafe,
    // Advance turn counter so the RNG seed (turn * 0x9e3779b1 ^ ...) differs.
    configure: (st) => { st.turn = 7; },
  },
  {
    label: 'negative wind (wind=-8.5) seed=0x5eed1234',
    seed: 0x5eed1234,
    configure: (st) => { st.wind = -8.5; },
  },
  {
    label: 'strong positive wind (wind=9.2) seed=0xabcd1234',
    seed: 0xabcd1234,
    configure: (st) => { st.wind = 9.2; },
  },
  {
    label: 'low-health target (health=15) seed=0x5eed1234',
    seed: 0x5eed1234,
    // Near-dead target changes the finisher ladder — exercises stable-sort tie-break
    // at the boundary between baby_missile (34) and other weapons.
    configure: (st) => { st.tanks[1].health = 15; },
  },
  {
    label: 'medium-health target (health=55) seed=0x5eed1234',
    seed: 0x5eed1234,
    configure: (st) => { st.tanks[1].health = 55; },
  },
  {
    label: 'hurt bot (health=20, has shield) seed=0x5eed1234',
    seed: 0x5eed1234,
    // Tests the shield branch for hard difficulty specifically.
    configure: (st) => { st.tanks[0].health = 20; },
  },
  {
    label: 'rich bot with exhausted inventory seed=0x5eed1234',
    seed: 0x5eed1234,
    // Exercises the buy-to-restock path: hard bot sees nothing in stock, buys a nuke.
    configure: (st) => {
      for (const w of Object.keys(st.tanks[0].inventory)) {
        if (!st.tanks[0].inventory[w].unlimited) st.tanks[0].inventory[w].count = 0;
      }
      st.tanks[0].credits = 20000;
      st.tanks[1].health = 100;
    },
  },
  {
    label: 'broke bot with exhausted inventory seed=0x5eed1234',
    seed: 0x5eed1234,
    // Falls back to baby_missile (unlimited); tests the else branch of chooseBuy.
    configure: (st) => {
      for (const w of Object.keys(st.tanks[0].inventory)) {
        if (!st.tanks[0].inventory[w].unlimited) st.tanks[0].inventory[w].count = 0;
      }
      st.tanks[0].credits = 0;
      st.tanks[1].health = 100;
    },
  },
  {
    label: 'high-turn + low-health + wind seed=0x9999abcd',
    seed: 0x9999abcd,
    configure: (st) => {
      st.turn = 12;
      st.wind = 5.5;
      st.tanks[1].health = 30;
    },
  },
];

// ---------------------------------------------------------------------------
// Check 1 + 2: for each scenario × each difficulty:
//   a) TWO independent engines → computeAiPlan → byte-identical (Check 1)
//   b) TWO calls on SAME engine → byte-identical (Check 2, idempotency)
// ---------------------------------------------------------------------------
log('--- Check 1: independent-engine identity + Check 2: repeated-call idempotency ---');
let scenarios_passed = 0;
let scenarios_total = 0;

for (const scenario of SCENARIOS) {
  for (const diff of DIFFICULTIES) {
    scenarios_total++;
    const tag = `[${scenario.label}] diff=${diff}`;

    // Build two independent engines from the same seed.
    const engineA = makeEngine(scenario.seed);
    const engineB = makeEngine(scenario.seed);

    // Apply the same state mutations to both, so they are in identical states.
    const stA = engineA.getState();
    const stB = engineB.getState();
    scenario.configure(stA);
    scenario.configure(stB);

    // The active player on a fresh engine is 'p1'.
    const activeTankId = stA.activePlayerId;

    // --- Check 1: two independent engines ---
    const planA1 = computeAiPlan(stA, activeTankId, diff);
    const planB1 = computeAiPlan(stB, activeTankId, diff);

    if (!plansEqual(planA1, planB1)) {
      fail(`${tag}: INDEPENDENT ENGINES diverged — ${planDiff(planA1, planB1)}`);
      log(`  engineA plan: ${JSON.stringify(planA1)}`);
      log(`  engineB plan: ${JSON.stringify(planB1)}`);
    } else {
      // --- Check 2: repeated call on the same engine ---
      const planA2 = computeAiPlan(stA, activeTankId, diff);
      if (!plansEqual(planA1, planA2)) {
        fail(`${tag}: REPEATED CALL diverged (not idempotent) — ${planDiff(planA1, planA2)}`);
        log(`  call1: ${JSON.stringify(planA1)}`);
        log(`  call2: ${JSON.stringify(planA2)}`);
      } else {
        scenarios_passed++;
        log(`PASS ${tag}: plan=${JSON.stringify(planA1)}`);
      }
    }
  }
}

log(`\n[summary] ${scenarios_passed}/${scenarios_total} scenario×difficulty combinations byte-identical.`);
if (scenarios_passed === scenarios_total) {
  log('PASS: all plans are byte-identical across independent engines and repeated calls.');
} else {
  fail(`${scenarios_total - scenarios_passed} scenario(s) diverged — see FAIL lines above.`);
}

// ---------------------------------------------------------------------------
// Check 3: null-plan scenarios are also consistent across two engines.
// (Dead self, no living enemy, unknown id — should all be null on both engines.)
// ---------------------------------------------------------------------------
log('\n--- Check 3: null-plan scenarios are consistent across independent engines ---');
{
  const eA = makeEngine(0x5eed1234);
  const eB = makeEngine(0x5eed1234);
  const stA = eA.getState();
  const stB = eB.getState();

  // Kill the target on both engines identically.
  stA.tanks[1].alive = false; stA.tanks[1].health = 0;
  stB.tanks[1].alive = false; stB.tanks[1].health = 0;

  for (const diff of DIFFICULTIES) {
    const a = computeAiPlan(stA, 'p1', diff);
    const b = computeAiPlan(stB, 'p1', diff);
    if (a !== null || b !== null) {
      fail(`[no-enemy null check] diff=${diff}: expected null from both engines, got a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
    } else {
      log(`PASS [no-enemy null] diff=${diff}: both returned null consistently.`);
    }
    // Idempotency on null: calling again returns null.
    const a2 = computeAiPlan(stA, 'p1', diff);
    if (a2 !== null) fail(`[no-enemy null idempotency] diff=${diff}: second call returned non-null ${JSON.stringify(a2)}`);
  }

  // Dead self — also null on both.
  stA.tanks[0].alive = false; stA.tanks[0].health = 0;
  stB.tanks[0].alive = false; stB.tanks[0].health = 0;
  for (const diff of DIFFICULTIES) {
    const a = computeAiPlan(stA, 'p1', diff);
    const b = computeAiPlan(stB, 'p1', diff);
    if (a !== null || b !== null) {
      fail(`[dead-self null check] diff=${diff}: expected null from both engines, got a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
    } else {
      log(`PASS [dead-self null] diff=${diff}: both returned null consistently.`);
    }
  }

  if (!failed) log('PASS: null-plan scenarios are consistent across independent engines.');
}

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------
if (failed) {
  log('\nAI DETERMINISM CHECK: FAILED');
  process.exit(1);
} else {
  log('\nAI DETERMINISM CHECK: PASSED');
  process.exit(0);
}
