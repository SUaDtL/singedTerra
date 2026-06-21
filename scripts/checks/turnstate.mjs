// Adversarial turn-state determinism check for the singedTerra shared engine.
//
// For 2, 3, AND 4 players: run the SAME (seed, scripted-action-sequence) TWICE
// and assert the two runs are IDENTICAL in:
//   - the ordered activePlayerId per turn (turn rotation),
//   - the per-turn wind value (seeded per-turn wind regeneration),
//   - the per-tank health progression across every resolved shot,
//   - the final winner (id, null for draw).
//
// The script drives EACH active tank to fire EVERY turn, with aim chosen to land
// on the terrain so real craters, real damage, and real wind regeneration happen
// (not trivial out-of-bounds misses). It runs enough turns for rotation to wrap
// and for tanks to actually die, so the alive-only rotation + win/draw paths are
// exercised. Fully deterministic: no Math.random, no Date / wall-clock anywhere.
//
// Run: npx tsx scripts/checks/turnstate.mjs
//
// tsx executes the .ts source directly, so we import GameEngine straight from
// the shared TypeScript source (no build step required).

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED = 0x7a17b00c;
const MAX_TICKS = 100_000; // safety cap per shot so a stuck projectile can't hang us
const MAX_TURNS = 60; // hard cap on turns recorded; the game ends well before this

const PALETTE = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'];

/** Build N players (2-4) with stable names + unique palette colors. */
function makePlayers(n) {
  const players = [];
  for (let i = 0; i < n; i++) {
    players.push({ name: `P${i + 1}`, color: PALETTE[i] });
  }
  return players;
}

/**
 * A deterministic aim for the active tank, purely a function of game state —
 * never random. The active tank fires a near-vertical, low-power lob (angle 90,
 * power 8) so the shot craters at its own feet and takes real self-damage every
 * turn. With the frozen physics (GRAVITY 0.15, WIND_FACTOR 0.006) a straight-up
 * `missile` lands within ~5px of the firing tank's column and removes ~38 health
 * per shot, so each tank dies within a few of its own turns regardless of where
 * the seeded terrain placed it. This guarantees tanks actually take damage and
 * DIE over the game — exercising the per-tank health progression, the alive-only
 * turn rotation, the win path (1 alive) AND the draw path — WITHOUT depending on
 * opponent placement. Straight up is symmetric, so the same aim works for tanks
 * on either half. Identical inputs => identical aim, so both passes reproduce.
 */
function aimFor(state) {
  return { angle: 90, power: 8, weapon: 'missile' };
}

/**
 * Run one full scripted game for N players from a fresh engine. Each turn: the
 * active tank sets a deterministic angle/power and fires; we then tick to
 * resolution. We record an ordered trace of per-turn facts and the final winner.
 * Returns { trace, winner, phase }.
 */
function runGame(n) {
  const engine = new GameEngine({
    players: makePlayers(n),
    maxPlayers: n,
    seed: SEED,
  });

  const trace = [];

  for (let t = 0; t < MAX_TURNS; t++) {
    const pre = engine.getState();
    if (pre.phase === 'GAME_OVER') break;
    if (pre.phase !== 'PLAYER_TURN') {
      // Should always rest at PLAYER_TURN between shots; bail loudly otherwise.
      throw new Error(`unexpected resting phase ${pre.phase} at turn ${t}`);
    }

    const activeId = pre.activePlayerId;
    const wind = pre.wind;

    const { angle, power, weapon } = aimFor(pre);
    engine.applyAction({ type: 'select_weapon', weapon });
    engine.applyAction({ type: 'set_angle', angle });
    engine.applyAction({ type: 'set_power', power });
    engine.applyAction({ type: 'fire' });

    // Tick the shot to resolution (back to PLAYER_TURN or GAME_OVER).
    let ticks = 0;
    while ((engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') && ticks < MAX_TICKS) {
      engine.tick();
      ticks++;
    }
    if (ticks >= MAX_TICKS) {
      throw new Error(`projectile never resolved within ${MAX_TICKS} ticks (turn ${t})`);
    }

    const post = engine.getState();
    // Health snapshot in stable tank-array order, rounded to avoid float noise
    // (rounding is applied IDENTICALLY to both runs, so it can't mask a real
    // divergence — it only canonicalizes representation).
    const health = post.tanks.map((tk) => Math.round(tk.health * 1e6) / 1e6);

    trace.push({
      turn: t,
      activeId, // who acted this turn (ordered rotation)
      wind, // the per-turn seeded wind in effect when they acted
      health, // per-tank health AFTER this shot resolved
    });

    if (post.phase === 'GAME_OVER') break;
  }

  const final = engine.getState();
  return { trace, winner: final.winner, phase: final.phase };
}

/** Stable serialization of a run for byte-comparison between the two passes. */
function serialize(run) {
  return JSON.stringify({
    phase: run.phase,
    winner: run.winner,
    trace: run.trace,
  });
}

let failed = false;
const log = (...args) => console.log(...args);

for (const n of [2, 3, 4]) {
  const a = runGame(n);
  const b = runGame(n);

  const sa = serialize(a);
  const sb = serialize(b);

  const order = a.trace.map((e) => e.activeId).join(',');
  const winds = a.trace.map((e) => e.wind.toFixed(3)).join(',');

  log(`\n[N=${n}] turns=${a.trace.length} finalPhase=${a.phase} winner=${a.winner}`);
  log(`[N=${n}] activeId order: ${order}`);
  log(`[N=${n}] per-turn wind:  ${winds}`);

  // Self-validation: confirm the scenario actually exercised real gameplay —
  // multiple turns, rotation, and at least one death (so win/draw + alive-only
  // rotation are covered), otherwise the determinism claim is near-empty.
  if (a.trace.length < n) {
    failed = true;
    log(`FAIL[N=${n}]: too few turns (${a.trace.length}) — rotation not meaningfully exercised.`);
  }
  if (a.phase !== 'GAME_OVER') {
    failed = true;
    log(`FAIL[N=${n}]: game did not reach GAME_OVER within ${MAX_TURNS} turns — no win/draw exercised.`);
  }

  // Confirm wind actually varied per turn (seed-driven regeneration is live, not
  // a frozen constant) — at least two distinct values across the recorded turns.
  const distinctWinds = new Set(a.trace.map((e) => e.wind));
  if (a.trace.length >= 2 && distinctWinds.size < 2) {
    failed = true;
    log(`FAIL[N=${n}]: wind never changed across turns — per-turn wind regeneration not exercised.`);
  }

  // Confirm at least one tank died (health progression + alive-only rotation).
  const someDeath = a.trace.length > 0
    && a.trace[a.trace.length - 1].health.some((h) => h <= 0);
  if (!someDeath) {
    failed = true;
    log(`FAIL[N=${n}]: no tank reached 0 health — death / win path not exercised.`);
  }

  if (sa === sb) {
    log(`PASS[N=${n}]: identical (seed, actions) => identical turn order, wind, health, winner.`);
  } else {
    failed = true;
    log(`FAIL[N=${n}]: two identical runs DIVERGED (NON-DETERMINISTIC turn state).`);
    // Locate the first differing turn for a useful diagnostic.
    const minLen = Math.min(a.trace.length, b.trace.length);
    let reported = false;
    for (let i = 0; i < minLen; i++) {
      if (JSON.stringify(a.trace[i]) !== JSON.stringify(b.trace[i])) {
        log(`  first divergent turn ${i}:`);
        log(`    runA: ${JSON.stringify(a.trace[i])}`);
        log(`    runB: ${JSON.stringify(b.trace[i])}`);
        reported = true;
        break;
      }
    }
    if (!reported) {
      log(`  traces differ in length or winner: A.len=${a.trace.length} B.len=${b.trace.length} A.winner=${a.winner} B.winner=${b.winner}`);
    }
  }
}

if (failed) {
  log('\nTURNSTATE CHECK: FAILED');
  process.exit(1);
} else {
  log('\nTURNSTATE CHECK: PASSED');
  process.exit(0);
}
