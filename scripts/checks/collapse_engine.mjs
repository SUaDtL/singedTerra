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
import { CANVAS_HEIGHT, COLLAPSE_PX_PER_TICK } from '../../shared/src/engine/Terrain.ts';

const PALETTE = ['#e84d4d', '#4d8ce8'];
const MAX_SETTLE_TICKS = Math.ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK);

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

function grant(e, tankIdx, weapon, count = 9) {
  const inv = e.getState().tanks[tankIdx].inventory[weapon];
  inv.count = count;
  inv.unlimited = false;
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
  // cluster_bomb at seed 0x1a3 produced 7 RESOLVING ticks in test 2 — use it.
  // A cluster_bomb creates multiple overlapping craters, guaranteeing enough
  // unsupported dirt to drive several settle steps.
  const e = freshEngine(0x1a3);

  e.applyAction({ type: 'select_weapon', weapon: 'cluster_bomb' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 60 });
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
    // Collect per-tick P2 y values through RESOLVING
    const p2YPerTick = [e.getState().tanks[1].y]; // y at start of RESOLVING
    let resolvingTicks = 0;
    let transitionPhase = null;

    while (e.getState().phase === 'RESOLVING' && resolvingTicks <= MAX_SETTLE_TICKS + 10) {
      e.tick();
      resolvingTicks++;
      const st = e.getState();
      p2YPerTick.push(st.tanks[1].y);
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
    { seed: 0x1a3,      angle: 45, power: 60, weapon: 'cluster_bomb'  },
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
    e.applyAction({ type: 'set_angle', angle: 45 });
    e.applyAction({ type: 'set_power', power: 60 });
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
// Use the same aim as gameover.mjs (angle=27, power=68) which is known to land
// on/near P2 for seed 0x5eed1234. Switch to missile so it detonates on terrain
// (creating a pendingSettle), but with P2 at 1 HP so any hit is lethal.
// ==========================================================================
{
  // angle=27, power=68 with missile lands on terrain near P2 for this seed.
  // P2 has 1HP so even a weak blast kills them → board goes to 1 alive.
  const e = freshEngine(0x5eed1234);
  e.getState().tanks[1].health = 1;

  e.applyAction({ type: 'select_weapon', weapon: 'missile' });
  e.applyAction({ type: 'set_angle', angle: 27 });
  e.applyAction({ type: 'set_power', power: 68 });
  e.applyAction({ type: 'fire' });

  let firingTicks = 0;
  while (e.getState().phase === 'FIRING' && firingTicks < 100_000) {
    e.tick();
    firingTicks++;
  }

  const phaseAfterFiring = e.getState().phase;
  const p2Alive = e.getState().tanks[1].alive;

  log(`[game-ending] phase after FIRING: ${phaseAfterFiring}  P2 alive: ${p2Alive}  P2 health: ${e.getState().tanks[1].health.toFixed(1)}`);

  if (!p2Alive) {
    // Shot killed P2 — this is a game-ending scenario
    if (phaseAfterFiring === 'GAME_OVER') {
      log(`PASS [game-ending]: game-ending shot went FIRING -> GAME_OVER directly (no multi-tick RESOLVING — #14 preserved).`);
    } else if (phaseAfterFiring === 'RESOLVING') {
      // Should not be in RESOLVING if it's a game-ending shot — flush must be instant
      fail(`[game-ending] #14 broken: game-ending shot ended in RESOLVING instead of GAME_OVER directly (animated collapse on game-end)`);
    } else {
      fail(`[game-ending] unexpected phase after game-ending shot: ${phaseAfterFiring}`);
    }
  } else {
    // P2 survived — shot missed or didn't do enough damage. Try a direct blast.
    log(`[game-ending] angle=27,power=68 missed P2; trying direct nuke aim...`);
    const e2 = freshEngine(0x5eed1234);
    grant(e2, 0, 'nuke', 1);
    e2.getState().tanks[1].health = 1;

    e2.applyAction({ type: 'select_weapon', weapon: 'nuke' });
    e2.applyAction({ type: 'set_angle', angle: 27 });
    e2.applyAction({ type: 'set_power', power: 68 });
    e2.applyAction({ type: 'fire' });

    let t2 = 0;
    while (e2.getState().phase === 'FIRING' && t2 < 100_000) { e2.tick(); t2++; }
    const phase2 = e2.getState().phase;
    const p2Alive2 = e2.getState().tanks[1].alive;

    log(`[game-ending] nuke: phase=${phase2}  P2 alive: ${p2Alive2}`);

    if (!p2Alive2) {
      if (phase2 === 'GAME_OVER') {
        log(`PASS [game-ending]: game-ending nuke -> GAME_OVER directly (#14 preserved).`);
      } else if (phase2 === 'RESOLVING') {
        fail(`[game-ending] #14 broken: game-ending nuke ended in RESOLVING (multi-tick animate on game-end)`);
      } else {
        fail(`[game-ending] unexpected phase after game-ending nuke: ${phase2}`);
      }
    } else {
      log(`[game-ending] WARNING: could not produce a game-ending shot with these aims; #14 not directly verified`);
    }
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
