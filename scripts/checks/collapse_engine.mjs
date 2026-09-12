// COLLAPSE_ENGINE check — AC-02: progressive end-of-turn terrain collapse animates
// over multiple RESOLVING ticks, deterministically, with ZERO change to final outcomes.
//
// Proves:
//   1. Tank y is MONOTONICALLY NON-DECREASING across RESOLVING settle ticks (sinks,
//      never jitters up) for a crater opened under/near a tank.
//   2. The engine stays in phase === 'RESOLVING' for >= 2 ticks for a crater scenario.
//   3. After convergence, the engine transitions to PLAYER_TURN (or ROUND_OVER/GAME_OVER).
//   4. Bounded: RESOLVING settle converges within ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK)
//      ticks. Reports worst observed.
//   5. Determinism: two engines built with the same seed + same actions produce
//      byte-identical terrain + tank state at EVERY tick through the settle.
//   6. A game-ending shot (board -> 1 alive) resolves to GAME_OVER WITHOUT a
//      multi-tick RESOLVING delay (preserves #14 — win banner must not wait for dirt).
//
// Deterministic: no Math.random, no Date, no wall-clock. Run standalone:
//   npx tsx scripts/checks/collapse_engine.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH, COLLAPSE_PX_PER_TICK, settleStep } from '../../shared/src/engine/Terrain.ts';

const PALETTE = ['#e84d4d', '#4d8ce8'];
const MAX_SETTLE_TICKS = Math.ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK);
const PATH_B_TARGET_X = 754;
const PATH_B_OVERHANG_X_START = 765;
const PATH_B_OVERHANG_X_END = 770;
const PATH_B_OVERHANG_TOP = 340;

let failed = false;
let worstResolvingTicks = 0;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function freshEngine(seed = 0x5eed1234) {
  return new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }],
    maxPlayers: 2,
    seed,
  });
}

function solidPixels(e) {
  let count = 0;
  for (const pixel of e.getState().terrain) if (pixel !== 0) count++;
  return count;
}

function surfaceYAt(e, x) {
  const terrain = e.getState().terrain;
  for (let y = 0; y < CANVAS_HEIGHT; y++) {
    if (terrain[y * CANVAS_WIDTH + x] !== 0) return y;
  }
  throw new Error(`[game-ending] fixture prerequisite failed: no terrain surface at x=${x}`);
}

function hasUnsettledDirt(e) {
  const copy = e.getState().terrain.slice();
  return settleStep(copy, 0, CANVAS_WIDTH - 1, CANVAS_HEIGHT);
}

function buildGameEndingFixture() {
  const e = freshEngine(0x5eed1234);
  const terrain = e.getState().terrain;
  const target = e.getState().tanks[1];
  target.x = PATH_B_TARGET_X;
  target.y = surfaceYAt(e, PATH_B_TARGET_X);
  target.health = 1;

  // The wall is initially compact. The real tank-impact blast cuts through its
  // middle after hitting P2, creating an overhang that Path B must flush.
  for (let x = PATH_B_OVERHANG_X_START; x <= PATH_B_OVERHANG_X_END; x++) {
    for (let y = PATH_B_OVERHANG_TOP; y < CANVAS_HEIGHT; y++) {
      terrain[y * CANVAS_WIDTH + x] = 1;
    }
  }
  if (hasUnsettledDirt(e)) {
    throw new Error('[game-ending] fixture prerequisite failed: constructed terrain was already unsettled before the shot');
  }

  e.applyAction({ type: 'select_weapon', weapon: 'missile' });
  e.applyAction({ type: 'set_angle', angle: 20 });
  e.applyAction({ type: 'set_power', power: 75 });
  e.applyAction({ type: 'fire' });
  return e;
}

// Helper: terrain snapshot as hex string
function terrainHex(e) {
  return Buffer.from(e.getState().terrain).toString('hex');
}

// Helper: tank snapshot (y, buried, buriedTurns, alive, health, credits, kills, totalDamage)
function tankSnap(e) {
  return JSON.stringify(e.getState().tanks.map((t) => ({
    y: t.y, buried: t.buried, buriedTurns: t.buriedTurns, alive: t.alive,
    health: t.health, credits: t.credits, kills: t.kills, totalDamage: t.totalDamage,
  })));
}

// ==========================================================================
// Test 1: Monotonic non-decreasing tank y through RESOLVING settle, and
//         RESOLVING lasts >= 2 ticks for a crater scenario.
//
// Use a nuke (large crater) or cluster_bomb to create enough unsettled terrain
// that the animated settle spans multiple RESOLVING ticks.
// ==========================================================================
{
  // cluster_bomb at seed 0x1a3 with the low, short 15°/40 solution produces
  // ten RESOLVING ticks — use it.
  // A cluster_bomb creates multiple overlapping craters, guaranteeing enough
  // unsupported dirt to drive several settle steps.
  const e = freshEngine(0x1a3);

  e.applyAction({ type: 'select_weapon', weapon: 'cluster_bomb' });
  e.applyAction({ type: 'set_angle', angle: 15 });
  e.applyAction({ type: 'set_power', power: 40 });
  e.applyAction({ type: 'fire' });

  // Run FIRING phase to completion (one step per tick, no RESOLVING yet)
  let firingTicks = 0;
  while (e.getState().phase === 'FIRING' && firingTicks < 100_000) {
    e.tick();
    firingTicks++;
  }

  const phaseAfterFiring = e.getState().phase;

  // ASSERT: A terrain-hitting shot must enter RESOLVING (not stay in PLAYER_TURN directly)
  if (phaseAfterFiring === 'GAME_OVER') {
    log(`[monotonic] game ended (both dead?); no multi-tick RESOLVING expected — skip monotonic`);
  } else if (phaseAfterFiring !== 'RESOLVING') {
    fail(`[monotonic] expected RESOLVING after FIRING (terrain-hitting shot), got ${phaseAfterFiring}`);
  } else {
    // Collect rendered-relevant settle state through RESOLVING. A timed
    // RESOLVING countdown without evolving terrain is not an animation.
    const p2YPerTick = [e.getState().tanks[1].y]; // y at start of RESOLVING
    const terrainPerTick = [terrainHex(e)];
    let resolvingTicks = 0;
    let transitionPhase = null;

    while (e.getState().phase === 'RESOLVING' && resolvingTicks <= MAX_SETTLE_TICKS + 10) {
      e.tick();
      resolvingTicks++;
      const st = e.getState();
      p2YPerTick.push(st.tanks[1].y);
      terrainPerTick.push(terrainHex(e));
      if (st.phase !== 'RESOLVING') {
        transitionPhase = st.phase;
        break;
      }
    }

    log(`[monotonic] RESOLVING ticks: ${resolvingTicks}, final phase: ${transitionPhase ?? e.getState().phase}`);
    log(`[monotonic] P2 y per tick (first 10): [${p2YPerTick.slice(0, 10).join(', ')}${p2YPerTick.length > 10 ? '...' : ''}]`);

    // Assert: tank y monotonically non-decreasing (y grows downward — sinking)
    for (let i = 1; i < p2YPerTick.length; i++) {
      if (p2YPerTick[i] < p2YPerTick[i - 1]) {
        fail(`[monotonic] P2 y went UP at RESOLVING tick ${i}: ${p2YPerTick[i - 1]} -> ${p2YPerTick[i]} (must only sink)`);
        break;
      }
    }

    // Assert: RESOLVING spans >= 2 ticks (animation actually happens)
    if (resolvingTicks < 2) {
      fail(`[monotonic] RESOLVING lasted only ${resolvingTicks} tick(s); expected >= 2 for a crater scenario (AC-02 requires multi-tick animation)`);
    } else {
      log(`PASS [monotonic]: P2 y monotonically non-decreasing across ${resolvingTicks} RESOLVING ticks.`);
    }

    if (new Set(terrainPerTick).size < 2) {
      fail('[monotonic] RESOLVING had no terrain-state change; a countdown alone is not progressive collapse');
    } else {
      log(`PASS [monotonic]: terrain evolved across ${new Set(terrainPerTick).size} distinct settle snapshots.`);
    }

    // Assert: transitions to the right terminal phase
    const finalPhase = transitionPhase ?? e.getState().phase;
    if (finalPhase !== 'PLAYER_TURN' && finalPhase !== 'ROUND_OVER' && finalPhase !== 'GAME_OVER') {
      fail(`[monotonic] after RESOLVING, expected PLAYER_TURN/ROUND_OVER/GAME_OVER, got ${finalPhase}`);
    } else {
      log(`PASS [monotonic]: transitions to ${finalPhase} after RESOLVING converges.`);
    }

    if (resolvingTicks > worstResolvingTicks) worstResolvingTicks = resolvingTicks;
  }
}

// ==========================================================================
// Test 2: Bounded convergence — resolves within ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK)
// ==========================================================================
{
  const shots = [
    { seed: 0xc0ffee,   angle: 50, power: 80, weapon: 'missile'      },
    { seed: 0x5eed1234, angle: 45, power: 70, weapon: 'missile'      },
    { seed: 0xbeef,     angle: 60, power: 65, weapon: 'heavy_missile' },
    { seed: 0x1a3,      angle: 15, power: 40, weapon: 'cluster_bomb'  },
    { seed: 0xfade,     angle: 45, power: 75, weapon: 'missile'      },
  ];

  for (const { seed, angle, power, weapon } of shots) {
    const e = freshEngine(seed);

    e.applyAction({ type: 'select_weapon', weapon });
    e.applyAction({ type: 'set_angle', angle });
    e.applyAction({ type: 'set_power', power });
    e.applyAction({ type: 'fire' });

    let firingTicks = 0;
    while (e.getState().phase === 'FIRING' && firingTicks < 100_000) {
      e.tick();
      firingTicks++;
    }

    const phaseAfterFiring = e.getState().phase;

    if (phaseAfterFiring === 'GAME_OVER') {
      log(`[bounded] seed=0x${seed.toString(16)} weapon=${weapon}: game ended, no RESOLVING`);
      continue;
    }

    if (phaseAfterFiring !== 'RESOLVING') {
      // Shot missed (OOB) or produced no terrain deformation — no settle to bound.
      log(`[bounded] seed=0x${seed.toString(16)} weapon=${weapon}: no RESOLVING (phase=${phaseAfterFiring}) — shot may have missed; skip bounded check`);
      continue;
    }

    let resolvingTicks = 0;
    while (e.getState().phase === 'RESOLVING' && resolvingTicks <= MAX_SETTLE_TICKS + 10) {
      e.tick();
      resolvingTicks++;
    }

    if (e.getState().phase === 'RESOLVING') {
      fail(`[bounded] seed=0x${seed.toString(16)} weapon=${weapon}: RESOLVING did not converge within ${MAX_SETTLE_TICKS + 10} ticks`);
    } else {
      log(`[bounded] seed=0x${seed.toString(16)} weapon=${weapon}: RESOLVING converged in ${resolvingTicks} ticks (limit ${MAX_SETTLE_TICKS})`);
      if (resolvingTicks > MAX_SETTLE_TICKS) {
        fail(`[bounded] seed=0x${seed.toString(16)} weapon=${weapon}: ${resolvingTicks} ticks > limit ${MAX_SETTLE_TICKS}`);
      }
      if (resolvingTicks > worstResolvingTicks) worstResolvingTicks = resolvingTicks;
    }
  }
  if (!failed) log(`PASS [bounded]: all shots converged within ceil(CANVAS_HEIGHT/COLLAPSE_PX_PER_TICK)=${MAX_SETTLE_TICKS} ticks.`);
}

// ==========================================================================
// Test 3: Determinism — two engines with same seed + actions are byte-identical
// at EVERY tick through the settle. Use cluster_bomb (seed 0x1a3) to get
// multiple RESOLVING ticks to actually verify per-tick byte-identity.
// ==========================================================================
{
  function buildEngineAndFireToResolving(seed) {
    const e = freshEngine(seed);
    e.applyAction({ type: 'select_weapon', weapon: 'cluster_bomb' });
    e.applyAction({ type: 'set_angle', angle: 15 });
    e.applyAction({ type: 'set_power', power: 40 });
    e.applyAction({ type: 'fire' });
    while (e.getState().phase === 'FIRING') { e.tick(); }
    return e;
  }

  const e1 = buildEngineAndFireToResolving(0x1a3);
  const e2 = buildEngineAndFireToResolving(0x1a3);

  let phase1 = e1.getState().phase;
  let phase2 = e2.getState().phase;

  if (phase1 !== phase2) {
    fail(`[determinism] engines have different phases after FIRING: ${phase1} vs ${phase2}`);
  } else if (phase1 !== 'RESOLVING') {
    // If shot missed (game ended or PLAYER_TURN) — determinism still holds but can't test per-tick
    const match = terrainHex(e1) === terrainHex(e2) && tankSnap(e1) === tankSnap(e2);
    if (!match) fail('[determinism] engines diverged at final state (no RESOLVING)');
    else log(`[determinism] no RESOLVING settle (phase=${phase1}); final states match (determinism ok)`);
  } else {
    let detTicks = 0;
    let diverged = false;

    while (e1.getState().phase === 'RESOLVING' && detTicks <= MAX_SETTLE_TICKS + 10) {
      e1.tick();
      e2.tick();
      detTicks++;

      const t1 = terrainHex(e1) + tankSnap(e1);
      const t2 = terrainHex(e2) + tankSnap(e2);
      if (t1 !== t2) {
        fail(`[determinism] engines diverged at RESOLVING tick ${detTicks}`);
        diverged = true;
        break;
      }
    }

    if (!diverged) {
      const finalMatch =
        terrainHex(e1) === terrainHex(e2) &&
        tankSnap(e1) === tankSnap(e2) &&
        e1.getState().phase === e2.getState().phase;
      if (!finalMatch) {
        fail('[determinism] engines diverged at final state after RESOLVING');
      } else {
        log(`PASS [determinism]: two same-seed engines byte-identical through all ${detTicks} RESOLVING ticks.`);
      }
      if (detTicks > worstResolvingTicks) worstResolvingTicks = detTicks;
    }
  }
}

// ==========================================================================
// Test 4: Game-ending shot resolves to GAME_OVER WITHOUT multi-tick RESOLVING
// (#14 preserved — win banner must not wait for dirt)
//
// The fixture puts P2 on the deterministic impact path. Run two identical
// engines in lockstep so this required terminal path also carries its own
// determinism proof; Test 3 above retains the nonterminal collapse proof.
// ==========================================================================
{
  const e1 = buildGameEndingFixture();
  const e2 = buildGameEndingFixture();
  const solidBefore = solidPixels(e1);

  let firingTicks = 0;
  let diverged = false;
  let sawResolving = false;
  while (e1.getState().phase === 'FIRING' && firingTicks < 100_000) {
    e1.tick();
    e2.tick();
    firingTicks++;

    sawResolving ||= e1.getState().phase === 'RESOLVING';
    const sameTick =
      e1.getState().phase === e2.getState().phase &&
      e1.getState().winner === e2.getState().winner &&
      terrainHex(e1) === terrainHex(e2) &&
      tankSnap(e1) === tankSnap(e2);
    if (!sameTick) {
      fail(`[game-ending] same-seed engines diverged at FIRING tick ${firingTicks}`);
      diverged = true;
      break;
    }
  }

  const state = e1.getState();
  const deformed = solidBefore !== solidPixels(e1);
  log(`[game-ending] phase=${state.phase} P2alive=${state.tanks[1].alive} terrainDeformed=${deformed} sawResolving=${sawResolving} winner=${state.winner}`);

  if (firingTicks >= 100_000) {
    fail('[game-ending] missile never resolved (possible infinite flight)');
  }
  if (state.tanks[1].alive) {
    fail('[game-ending] fixture prerequisite failed: shot did not eliminate P2');
  }
  if (!deformed) {
    fail('[game-ending] fixture prerequisite failed: shot did not deform terrain');
  }
  if (state.phase !== 'GAME_OVER') {
    fail(`[game-ending] expected direct GAME_OVER, got ${state.phase}`);
  }
  if (sawResolving) {
    fail('[game-ending] game-ending shot exposed a delayed RESOLVING phase');
  }
  if (state.winner == null) {
    fail('[game-ending] expected a decided winner at GAME_OVER, got null');
  }
  if (hasUnsettledDirt(e1) || hasUnsettledDirt(e2)) {
    fail('[game-ending] terminal engines retained unsupported dirt after the required instant flush');
  }
  if (!diverged && !failed) {
    log(`PASS [game-ending]: two same-seed lethal deformations stayed byte-identical for ${firingTicks} ticks and went directly to GAME_OVER.`);
  }
}

// ==========================================================================
// Summary
// ==========================================================================
log('');
log(`[collapse_engine] COLLAPSE_PX_PER_TICK = ${COLLAPSE_PX_PER_TICK}`);
log(`[collapse_engine] CANVAS_HEIGHT = ${CANVAS_HEIGHT}`);
log(`[collapse_engine] MAX_SETTLE_TICKS = ${MAX_SETTLE_TICKS} (ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK))`);
log(`[collapse_engine] worst observed RESOLVING settle ticks: ${worstResolvingTicks}`);
log(`[collapse_engine] headroom: ${MAX_SETTLE_TICKS - worstResolvingTicks} ticks below the theoretical limit`);

if (failed) {
  log('\nCOLLAPSE_ENGINE CHECK: FAILED');
  process.exit(1);
} else {
  log('\nCOLLAPSE_ENGINE CHECK: PASSED');
  process.exit(0);
}
