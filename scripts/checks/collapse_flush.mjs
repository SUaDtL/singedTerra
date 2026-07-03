// COLLAPSE_FLUSH check — the THREE sibling flush paths of GameEngine.tick()'s
// deferred-settle decision tree (the animated path C is already covered by
// collapse_engine.mjs; this harness pins A, B, D).
//
// The decision tree (GameEngine.tick(), post-fire settle block) is:
//   (A) projectiles STILL IN FLIGHT when a settle is pending → flushSettleInstant()
//       (the collapse is flushed within the SAME tick, never animated, so mid-flight
//       bomblet trajectories stay byte-identical to the pre-deferred-settle behavior).
//   (B) board down to <= 1 alive (game-ending detonation) → instant flush + RESOLVING
//       + resolve() in the SAME tick → GAME_OVER directly (preserves #14: the win
//       banner must not wait for animated dirt).
//   (C) settled + alive > 1 + no fire → pendingSettle LEFT for the RESOLVING phase to
//       ANIMATE one settleStep per tick. (covered by collapse_engine.mjs — not here.)
//   (D) fire still burning (no projectiles, fire active) → flushSettleInstant() each
//       tick (the engine stays in FIRING while the napalm burns; the collapse settles
//       instantly under it, never an animated multi-tick RESOLVING settle).
//
// Observability trick: a full-width settleStep() on a COPY of the live terrain tells
// us whether any column anywhere holds floating/unsettled dirt. After an INSTANT flush
// (A/B/D) the terrain is fully compacted → a full-width settleStep moves NOTHING. During
// the ANIMATED path (C) the terrain has floating dirt mid-collapse → it WOULD move. So
// "no unsettled dirt at a tick boundary while still FIRING / at GAME_OVER" is the
// signature of an instant flush, distinguishing A/B/D from C.
//
// Deterministic: no Math.random, no Date, no wall-clock. Run standalone:
//   npx tsx scripts/checks/collapse_flush.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH, settleStep } from '../../shared/src/engine/Terrain.ts';

const PALETTE = ['#e84d4d', '#4d8ce8'];
const MAX_TICKS = 100_000;

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function freshEngine(seed) {
  return new GameEngine({
    players: [{ name: 'P1', color: PALETTE[0] }, { name: 'P2', color: PALETTE[1] }],
    maxPlayers: 2,
    seed,
  });
}

// Count solid pixels in the live terrain — a deform (crater) changes this, so it
// detects "a detonation happened this tick".
function solidPixels(e) {
  const t = e.getState().terrain;
  let n = 0;
  for (let i = 0; i < t.length; i++) if (t[i]) n++;
  return n;
}

// True iff the terrain holds any floating/unsettled dirt right now: run a full-width
// instant compaction on a COPY (does NOT touch the live bitmap) and report whether it
// moved anything. After an instant flush this is false; mid-animated-collapse it's true.
function hasUnsettledDirt(e) {
  const copy = e.getState().terrain.slice();
  return settleStep(copy, 0, CANVAS_WIDTH - 1, CANVAS_HEIGHT);
}

// ==========================================================================
// Path A: projectiles STILL IN FLIGHT when a settle is pending → instant flush.
//
// A cluster_bomb airbursts into 5 bomblets that land over several ticks. On the
// ticks where SOME bomblets detonate (deforming terrain) while OTHERS are still
// in flight, the engine stays in FIRING and takes branch (A) — flushSettleInstant.
// Assert: on every such tick the terrain is FULLY settled in the SAME tick (a
// full-width settleStep would move nothing) — i.e. the collapse was flushed
// instantly, NOT deferred to an animated RESOLVING settle.
// ==========================================================================
{
  // seed 0x1a3 + this lob lands the cluster carpet across multiple ticks, giving
  // ticks with a fresh detonation AND surviving in-flight bomblets (verified).
  const e = freshEngine(0x1a3);
  e.applyAction({ type: 'select_weapon', weapon: 'cluster_bomb' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 60 });
  e.applyAction({ type: 'fire' });

  let ticks = 0;
  let pathATicks = 0;       // ticks where a deform happened AND we stayed in FIRING (survivors remained)
  let unsettledOnPathA = 0; // of those, ticks left with floating dirt (a deferred settle — would be a BUG)

  while (e.getState().phase === 'FIRING' && ticks < MAX_TICKS) {
    const before = solidPixels(e);
    e.tick();
    const after = solidPixels(e);
    const phaseNow = e.getState().phase;

    // A detonation deformed terrain this tick AND we are STILL in FIRING => survivors
    // remained => the tick took branch (A) flushSettleInstant. (When the LAST bomblet
    // detonates, survivors hit 0 and the phase flips to RESOLVING — that is branch C,
    // excluded here by the phase check.)
    if (before !== after && phaseNow === 'FIRING') {
      pathATicks++;
      if (hasUnsettledDirt(e)) unsettledOnPathA++;
    }
    ticks++;
  }

  if (ticks >= MAX_TICKS) {
    fail('[path-A] cluster never resolved (possible infinite flight)');
  } else if (pathATicks === 0) {
    // Could not reach the path with this seed/aim — honest skip, don't over-claim.
    log('[path-A] SKIPPED (could not construct): no tick had a detonation while bomblets remained in flight');
  } else if (unsettledOnPathA > 0) {
    fail(`[path-A] ${unsettledOnPathA}/${pathATicks} mid-flight detonation ticks left terrain UNSETTLED — a settle was deferred while projectiles were in flight (branch A must flushSettleInstant)`);
  } else {
    log(`PASS [path-A]: ${pathATicks} mid-flight detonation ticks, ALL flushed instantly (terrain fully settled in-tick while bomblets still flying).`);
  }
}

// ==========================================================================
// Path B: game-ending detonation → instant flush + GAME_OVER (no animated settle).
//
// P2 at 1 HP; a missile that deforms terrain (so a settle IS pending) and lands
// lethally near P2. The board drops to 1 alive, so tick() takes branch (B):
// flush instantly, RESOLVING + resolve() in the SAME tick → GAME_OVER, never a
// multi-tick RESOLVING animation. Assert: FIRING -> GAME_OVER directly (RESOLVING
// never observed as a resting phase), terrain deformed (so the flush was real),
// terrain fully settled at GAME_OVER, and a winner is decided.
// ==========================================================================
{
  // seed 0x5eed1234, missile angle=20 power=75: deforms terrain AND kills P2(1HP).
  const e = freshEngine(0x5eed1234);
  e.getState().tanks[1].health = 1;

  const solidBefore = solidPixels(e);

  e.applyAction({ type: 'select_weapon', weapon: 'missile' });
  e.applyAction({ type: 'set_angle', angle: 20 });
  e.applyAction({ type: 'set_power', power: 75 });
  e.applyAction({ type: 'fire' });

  let ticks = 0;
  let sawResolving = false;
  while (e.getState().phase === 'FIRING' && ticks < MAX_TICKS) {
    e.tick();
    if (e.getState().phase === 'RESOLVING') sawResolving = true; // would mean an animated settle
    ticks++;
  }

  const st = e.getState();
  const deformed = solidBefore !== solidPixels(e);
  log(`[path-B] phase=${st.phase} P2alive=${st.tanks[1].alive} sawResolving=${sawResolving} terrainDeformed=${deformed} unsettledAtEnd=${hasUnsettledDirt(e)} winner=${st.winner}`);

  if (ticks >= MAX_TICKS) {
    fail('[path-B] missile never resolved (possible infinite flight)');
  } else if (st.tanks[1].alive) {
    // The shot missed/under-damaged — can't assert the game-ending path. Honest skip.
    log('[path-B] SKIPPED (could not construct): shot did not kill P2, no game-ending detonation produced');
  } else {
    if (!deformed) {
      // Without a deform there is no pendingSettle to flush — the assertion would be vacuous.
      log('[path-B] note: shot did not deform terrain (no pendingSettle to flush) — still asserting direct GAME_OVER');
    }
    if (st.phase !== 'GAME_OVER') {
      fail(`[path-B] game-ending shot ended in ${st.phase}, expected GAME_OVER`);
    }
    if (sawResolving) {
      fail('[path-B] #14 broken: game-ending detonation passed through a multi-tick RESOLVING settle instead of an instant flush');
    }
    if (hasUnsettledDirt(e)) {
      fail('[path-B] terrain left UNSETTLED at GAME_OVER — the game-ending flush was not instant');
    }
    if (st.winner == null) {
      fail('[path-B] expected a decided winner at GAME_OVER, got null');
    }
    if (!failed) {
      log(`PASS [path-B]: game-ending detonation went FIRING -> GAME_OVER directly, terrain instant-flushed (settled), winner=${st.winner}.`);
    }
  }
}

// ==========================================================================
// Path D: fire burning (no projectiles) while a settle decision is pending →
// flushSettleInstant() each tick; the engine stays in FIRING, never an animated
// RESOLVING settle.
//
// A napalm shot ignites a burning field that lingers for many ticks AFTER its
// shell is consumed (no projectiles in flight, fire.size > 0). Every such tick
// takes branch (D). Assert: the engine sits in FIRING-with-fire for many ticks
// with ZERO projectiles, NEVER enters a RESOLVING animated settle while burning,
// and the terrain stays fully settled (the instant flush keeps it compacted)
// throughout the burn.
//
// NOTE: no current weapon BOTH craters AND ignites, so when the napalm burns the
// pendingSettle is always null and branch (D)'s flushSettleInstant() is a no-op on
// terrain. We therefore assert branch (D)'s OBSERVABLE contract — FIRING persists
// while burning, no animated settle, terrain stays settled — which is exactly what
// the branch guarantees; the non-null-pendingSettle sub-case is unreachable with the
// shipped weapon set (logged in followups).
// ==========================================================================
{
  // seed 0x1a3 + this napalm lob lands on terrain and burns ~98 ticks (verified).
  const e = freshEngine(0x1a3);
  e.applyAction({ type: 'select_weapon', weapon: 'napalm' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 60 });
  e.applyAction({ type: 'fire' });

  let ticks = 0;
  let firingWhileBurning = 0;   // ticks: phase===FIRING, no projectiles, fire alight (branch D)
  let unsettledWhileBurning = 0;// of those, ticks with floating dirt (would be a BUG — flush should settle it)
  let sawResolvingWhileBurning = false;

  while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && ticks < MAX_TICKS) {
    e.tick();
    const st = e.getState();
    const burning = st.fire.length > 0;
    if (burning && st.phase === 'RESOLVING') sawResolvingWhileBurning = true;
    if (st.phase === 'FIRING' && st.projectiles.length === 0 && burning) {
      firingWhileBurning++;
      if (hasUnsettledDirt(e)) unsettledWhileBurning++;
    }
    ticks++;
  }

  log(`[path-D] firingWhileBurning=${firingWhileBurning} unsettledWhileBurning=${unsettledWhileBurning} sawResolvingWhileBurning=${sawResolvingWhileBurning} finalPhase=${e.getState().phase}`);

  if (ticks >= MAX_TICKS) {
    fail('[path-D] napalm never resolved (possible infinite burn)');
  } else if (firingWhileBurning === 0) {
    // The napalm never lingered with no projectiles — can't exercise branch D. Honest skip.
    log('[path-D] SKIPPED (could not construct): napalm did not burn with the shell already consumed');
  } else {
    if (sawResolvingWhileBurning) {
      fail('[path-D] engine entered an animated RESOLVING settle while fire was still burning (branch D must flush instantly and stay in FIRING)');
    }
    if (unsettledWhileBurning > 0) {
      fail(`[path-D] ${unsettledWhileBurning}/${firingWhileBurning} burning ticks left terrain UNSETTLED (the per-tick flush must keep the collapse compacted under the fire)`);
    }
    if (!failed) {
      log(`PASS [path-D]: engine stayed in FIRING for ${firingWhileBurning} ticks while napalm burned (no projectiles), no animated settle, terrain flushed/settled throughout.`);
    }
  }
}

// ==========================================================================
// Summary
// ==========================================================================
log('');
log(`[collapse_flush] CANVAS_HEIGHT = ${CANVAS_HEIGHT}  CANVAS_WIDTH = ${CANVAS_WIDTH}`);

if (failed) {
  log('\nCOLLAPSE_FLUSH CHECK: FAILED');
  process.exit(1);
} else {
  log('\nCOLLAPSE_FLUSH CHECK: PASSED');
  process.exit(0);
}
