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
import { CANVAS_WIDTH } from '../../shared/src/engine/Terrain.ts';

const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function engine(seed) {
  return new GameEngine({ players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }], maxPlayers: 2, seed });
}
function tickToRest(e) { let t = 0; while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) { e.tick(); t++; } }
function humanOpening(e) {
  e.applyAction({ type: 'set_angle', angle: 90 });
  e.applyAction({ type: 'set_power', power: 30 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
  if (e.getState().activePlayerId !== 'p2') throw new Error('human opening did not hand the first response to p2');
}

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
  // Buy-to-restock (P1-7b): a buy plan commits the turn-neutral purchase first, so
  // the select_weapon + fire below use the restocked ammo. Mirrors the real drivers.
  if (plan.buy) e.applyAction({ type: 'buy', weapon: plan.buy });
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

// --- Check 3b: Easy's first CPU opportunity after the human opener is an aiming
//     lesson, not a sniper response. Cover both wind directions and require a
//     later Easy turn to remain a credible threat, rather than making it inert.
{
  const SEEDS = [0x0a, 0x14, 0x1e, 0x28, 0x32, 0x3c, 0x46, 0x50];
  const MAX_EASY_OPENING_DAMAGE = 12;
  let worstOpeningDamage = 0;
  let laterThreats = 0;
  for (const wind of [-6, 6]) {
    for (const seed of SEEDS) {
      const opening = engine(seed);
      humanOpening(opening);
      const openingState = opening.getState();
      openingState.wind = wind;
      const before = openingState.tanks[0].health;
      aiTurn(opening, 'easy');
      const damage = before - opening.getState().tanks[0].health;
      worstOpeningDamage = Math.max(worstOpeningDamage, damage);
      if (damage > MAX_EASY_OPENING_DAMAGE) {
        fail(`easy CPU first response wind=${wind} seed=0x${seed.toString(16)} dealt ${damage} damage (max ${MAX_EASY_OPENING_DAMAGE})`);
      }

      const later = engine(seed);
      humanOpening(later);
      const laterState = later.getState();
      laterState.turn = 3;
      laterState.activePlayerId = 'p2';
      laterState.wind = wind;
      const laterBefore = laterState.tanks[0].health;
      if (!aiTurn(later, 'easy')) fail(`easy CPU later response wind=${wind} seed=0x${seed.toString(16)} had no plan`);
      if (laterBefore > later.getState().tanks[0].health) laterThreats++;
    }
  }
  log(`[easy recovery] first CPU response worst damage=${worstOpeningDamage} (max ${MAX_EASY_OPENING_DAMAGE}), later threats=${laterThreats}`);
  if (laterThreats === 0) {
    fail('Easy never regains a credible later-turn threat after the protected first response.');
  } else if (worstOpeningDamage <= MAX_EASY_OPENING_DAMAGE) {
    log('PASS: Easy leaves room to observe the opening wind, then regains threat on later turns.');
  }
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

// --- Check 7: buy-to-restock — a hard bot with credits + an exhausted ladder
//     BUYS a finisher (deterministically), but a broke bot does not (P1-7b). ---
{
  const e = engine(0x5eed1234);
  const st = e.getState();
  // Exhaust every finite-stock weapon so nothing in stock can one-shot a healthy
  // target; only the unlimited Baby Missile (34 eff dmg) remains.
  for (const w of Object.keys(st.tanks[0].inventory)) {
    if (!st.tanks[0].inventory[w].unlimited) st.tanks[0].inventory[w].count = 0;
  }
  st.tanks[1].health = 100; // needs a real finisher (eff >= 100 => nuke)

  // Affordable: 15000 credits covers the nuke (12000). Expect a BUY of nuke.
  st.tanks[0].credits = 15000;
  const a = computeAiPlan(st, 'p1', 'hard');
  const b = computeAiPlan(st, 'p1', 'hard');
  log(`[restock] plan weapon=${a?.weapon} buy=${a?.buy} (credits 15000)`);
  if (a?.buy !== 'nuke') fail(`a flush hard bot with no in-stock finisher should BUY a nuke, got buy=${a?.buy}`);
  else if (a.weapon !== a.buy) fail(`plan.buy (${a.buy}) must equal the weapon to fire (${a.weapon})`);
  if (JSON.stringify(a) !== JSON.stringify(b)) fail('buy-to-restock plan is NOT deterministic');

  // Unaffordable: 0 credits => no buy, falls back to the unlimited Baby Missile.
  st.tanks[0].credits = 0;
  const broke = computeAiPlan(st, 'p1', 'hard');
  log(`[restock] plan weapon=${broke?.weapon} buy=${broke?.buy} (credits 0)`);
  if (broke?.buy) fail(`a broke bot must not plan a buy it cannot afford, got buy=${broke.buy}`);
  if (broke?.weapon !== 'baby_missile') fail(`a broke bot with no premium stock should fall back to baby_missile, got ${broke?.weapon}`);

  if (!failed) log('PASS: hard bot buys to restock a finisher when affordable, not when broke.');
}

// --- Check 7b: hard AI buys a Parachute only for a risky ledge, when affordable and unstocked. ---
{
  const e = engine(0x5eed1234);
  const st = e.getState();
  const me = st.tanks[0];
  st.terrain.fill(0);
  const ledgeX = Math.floor(me.x);
  for (let x = 0; x < CANVAS_WIDTH; x++) {
    const surface = x < ledgeX ? 220 : 340;
    for (let y = surface; y < 500; y++) st.terrain[y * CANVAS_WIDTH + x] = 1;
  }
  me.y = 220;
  me.accessories.parachute = 0;
  me.credits = 5000;
  const risky = computeAiPlan(st, 'p1', 'hard', undefined, 1);
  log(`[parachute] risky plan accessory=${risky?.buyAccessory}`);
  if (risky?.buyAccessory !== 'parachute') fail(`risky hard bot should buy a parachute, got ${risky?.buyAccessory}`);
  me.credits = 0;
  const broke = computeAiPlan(st, 'p1', 'hard', undefined, 1);
  if (broke?.buyAccessory) fail(`broke hard bot must not buy a parachute, got ${broke.buyAccessory}`);
  me.credits = 5000;
  me.accessories.parachute = 1;
  const stocked = computeAiPlan(st, 'p1', 'hard', undefined, 1);
  if (stocked?.buyAccessory) fail(`stocked hard bot must not rebuy a parachute, got ${stocked.buyAccessory}`);
  me.accessories.parachute = 0;
  const armsLocked = computeAiPlan(st, 'p1', 'hard', undefined, 0);
  if (armsLocked?.buyAccessory) fail(`arms-level-0 hard bot must not buy a parachute, got ${armsLocked.buyAccessory}`);

  const combined = engine(0x5eed1234);
  const combinedState = combined.getState();
  combinedState.terrain.set(st.terrain);
  combinedState.tanks[0].y = 220;
  combinedState.tanks[0].accessories.parachute = 0;
  combinedState.tanks[0].credits = 15000;
  for (const w of Object.keys(combinedState.tanks[0].inventory)) {
    if (!combinedState.tanks[0].inventory[w].unlimited) combinedState.tanks[0].inventory[w].count = 0;
  }
  combinedState.tanks[1].health = 100;
  const combinedPlan = computeAiPlan(combinedState, 'p1', 'hard', undefined, 1);
  if (combinedPlan?.buy !== 'nuke' || combinedPlan.buyAccessory) {
    fail(`weapon and parachute buys must respect combined credits, got weapon=${combinedPlan?.buy} accessory=${combinedPlan?.buyAccessory}`);
  }
  if (!failed) log('PASS: hard AI buys one affordable parachute only for a deterministic risky ledge.');
}

// --- Check 8: a CPU-seat buy is IDEMPOTENT — duplicate bot buys (every networked
//     client submits one; a buy is turn-neutral so the referee can't dedupe them)
//     collapse to ONE bundle and ONE charge on replay. Humans are unaffected. ---
{
  const e = engine(0x5eed1234);
  const st = e.getState();
  st.tanks[0].ai = 'hard';                 // mark P1's seat as a CPU
  st.tanks[0].inventory.nuke.count = 0;    // lacks the weapon
  st.tanks[0].credits = 30000;             // could afford TWO bundles
  e.applyAction({ type: 'buy', weapon: 'nuke' });
  e.applyAction({ type: 'buy', weapon: 'nuke' }); // duplicate from another client
  const inv = e.getState().tanks[0].inventory.nuke.count;
  const spent = 30000 - e.getState().tanks[0].credits;
  log(`[restock-idemp] bot nuke count=${inv} spent=${spent}`);
  if (inv !== 1) fail(`a duplicate CPU-seat buy should stock ONE bundle, got ${inv}`);
  if (spent !== 12000) fail(`a duplicate CPU-seat buy should charge ONCE (12000), spent ${spent}`);

  // A HUMAN seat may still stock multiples (idempotency is bots-only).
  const e2 = engine(0x5eed1234);
  const h = e2.getState();
  h.tanks[0].inventory.nuke.count = 0;
  h.tanks[0].credits = 30000;              // ai stays null => human
  e2.applyAction({ type: 'buy', weapon: 'nuke' });
  e2.applyAction({ type: 'buy', weapon: 'nuke' });
  if (e2.getState().tanks[0].inventory.nuke.count !== 2) fail('a human should be able to buy two bundles');

  if (!failed) log('PASS: CPU-seat buy is idempotent; human multi-buy still works.');
}

// --- Check 9: a hard bot USES the premium Phase-2 weapons it owns (mirv/deaths_head/
//     hot_napalm). Before they were added to AI_EFFECTIVE_DAMAGE the picker ignored
//     them entirely — a bot holding only a Death's Head would fire a Baby Missile. ---
{
  const e = engine(0x5eed1234);
  const st = e.getState();
  // Own ONLY a Death's Head among finishers (exhaust every other finite-stock weapon).
  for (const w of Object.keys(st.tanks[0].inventory)) {
    if (!st.tanks[0].inventory[w].unlimited) st.tanks[0].inventory[w].count = 0;
  }
  st.tanks[0].inventory.deaths_head.count = 1;
  st.tanks[1].health = 100; // healthy target => needs the heavy finisher it holds
  const dh = computeAiPlan(st, 'p1', 'hard');
  log(`[arsenal] owns only Death's Head vs 100hp: weapon=${dh?.weapon}`);
  if (dh?.weapon !== 'deaths_head') fail(`a hard bot holding only a Death's Head should fire it, got ${dh?.weapon} (premium weapon ignored?)`);

  // hot_napalm (eff 75) is the weakest owned finisher vs a 70hp target => pick it.
  st.tanks[0].inventory.deaths_head.count = 0;
  st.tanks[0].inventory.hot_napalm.count = 1;
  st.tanks[1].health = 70;
  const hn = computeAiPlan(st, 'p1', 'hard');
  log(`[arsenal] owns hot_napalm vs 70hp: weapon=${hn?.weapon}`);
  if (hn?.weapon !== 'hot_napalm') fail(`a hard bot should pick hot_napalm (eff 75) as the weakest finisher vs a 70hp target, got ${hn?.weapon}`);

  // The premium weapons stay HARD-ONLY: a MEDIUM bot owning only a Death's Head must
  // NOT reach for it (it falls back to the unlimited Baby Missile).
  st.tanks[0].inventory.hot_napalm.count = 0;
  st.tanks[0].inventory.deaths_head.count = 1;
  st.tanks[1].health = 100;
  const med = computeAiPlan(st, 'p1', 'medium');
  log(`[arsenal] MEDIUM owns only Death's Head vs 100hp: weapon=${med?.weapon}`);
  if (med?.weapon === 'deaths_head') fail('a MEDIUM bot must not use the premium Death\'s Head (HEAVY_TIER is hard-only)');

  if (!failed) log("PASS: hard bots use the premium Phase-2 weapons when owned + apt; medium stays capped.");
}

// --- Check 10: explicit weapon personalities vary only deterministic loadout preference. ---
{
  const e = engine(0x5eed1234);
  const st = e.getState();
  for (const w of Object.keys(st.tanks[0].inventory)) {
    if (!st.tanks[0].inventory[w].unlimited) st.tanks[0].inventory[w].count = 5;
  }
  st.tanks[1].health = 100;
  const aggressive = computeAiPlan(st, 'p1', 'hard', undefined, Number.POSITIVE_INFINITY, 'aggressive');
  const conservative = computeAiPlan(st, 'p1', 'hard', undefined, Number.POSITIVE_INFINITY, 'conservative');
  const areaDenial = computeAiPlan(st, 'p1', 'hard', undefined, Number.POSITIVE_INFINITY, 'area_denial');
  log(`[personality] aggressive=${aggressive?.weapon} conservative=${conservative?.weapon} area=${areaDenial?.weapon}`);
  if (aggressive?.weapon !== 'deaths_head') {
    fail(`aggressive personality should prefer the strongest stocked finisher, got ${aggressive?.weapon}`);
  }
  if (conservative?.weapon !== 'nuke') {
    fail(`conservative personality should preserve the weakest sufficient finisher, got ${conservative?.weapon}`);
  }
  if (!['hot_napalm', 'napalm', 'bouncing_betty', 'cluster_bomb'].includes(areaDenial?.weapon)) {
    fail(`area-denial personality should prefer an area weapon, got ${areaDenial?.weapon}`);
  }
  for (const weapon of ['hot_napalm', 'napalm', 'bouncing_betty', 'cluster_bomb']) {
    st.tanks[0].inventory[weapon].count = 0;
  }
  const fallback = computeAiPlan(st, 'p1', 'hard', undefined, Number.POSITIVE_INFINITY, 'area_denial');
  if (['hot_napalm', 'napalm', 'bouncing_betty', 'cluster_bomb'].includes(fallback?.weapon)) {
    fail(`area-denial personality selected an unavailable area weapon: ${fallback.weapon}`);
  }
  st.tanks[0].inventory.hot_napalm.count = 1;
  const medium = computeAiPlan(st, 'p1', 'medium', undefined, Number.POSITIVE_INFINITY, 'area_denial');
  if (medium?.weapon === 'hot_napalm') fail('area-denial personality bypassed the medium difficulty heavy-tier gate');
  const derivedA = computeAiPlan(st, 'p1', 'hard');
  const derivedB = computeAiPlan(st, 'p1', 'hard');
  if (JSON.stringify(derivedA) !== JSON.stringify(derivedB)) fail('omitted personality derivation is not stable');
  if (derivedA?.weapon !== conservative?.weapon) fail('p1 omitted personality should retain the conservative baseline profile');

  const restock = engine(0x5eed1234);
  const restockState = restock.getState();
  for (const weapon of Object.keys(restockState.tanks[0].inventory)) {
    if (!restockState.tanks[0].inventory[weapon].unlimited) restockState.tanks[0].inventory[weapon].count = 0;
  }
  restockState.tanks[1].health = 70;
  restockState.tanks[0].credits = 30_000;
  const aggressiveBuy = computeAiPlan(restockState, 'p1', 'hard', undefined, Number.POSITIVE_INFINITY, 'aggressive');
  const areaBuy = computeAiPlan(restockState, 'p1', 'hard', undefined, Number.POSITIVE_INFINITY, 'area_denial');
  if (aggressiveBuy?.buy !== 'deaths_head') fail(`aggressive restock should buy the strongest finisher, got ${aggressiveBuy?.buy}`);
  if (areaBuy?.buy !== 'hot_napalm') fail(`area-denial restock should buy the preferred affordable area finisher, got ${areaBuy?.buy}`);
  restockState.tanks[0].credits = 0;
  const brokeAggressive = computeAiPlan(restockState, 'p1', 'hard', undefined, Number.POSITIVE_INFINITY, 'aggressive');
  const brokeArea = computeAiPlan(restockState, 'p1', 'hard', undefined, Number.POSITIVE_INFINITY, 'area_denial');
  if (brokeAggressive?.buy || brokeArea?.buy) fail('unaffordable personality restocks must fall back without a purchase');
  if (!failed) log('PASS: explicit and derived AI personalities are deterministic and distinct.');
}

if (failed) { log('\nAI CHECK: FAILED'); process.exit(1); }
else { log('\nAI CHECK: PASSED'); process.exit(0); }
