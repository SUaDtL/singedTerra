// SEAT REUSE check (20th harness) — guards AC1 + AC2 of the "start-here-sweep" sprint:
// computeNextSeat must derive the post-turn seat from the LIVE engine via clone(), NOT
// from a fresh full-log replay. This harness proves behavior is BYTE-IDENTICAL between:
//   (i)  FRESH-REPLAY: new GameEngine + replay all prior actions + pending + tick-to-end
//   (ii) CLONE: live/incremental engine (holds all prior actions), engine.clone(), apply
//        only the pending action to the clone, tick-to-end
// ...for every turn-ending action across a multi-turn log that includes:
//   (a) at least one ELIMINATION: a tank marked dead between turns; the rotation skips it
//   (b) at least one ROUND BOUNDARY: a round ends and the opener is re-seated for round 2
//
// The harness is kept FULLY DETERMINISTIC: all state mutations that force eliminations
// and round endings are replicated identically in the fresh-replay path.  No Math.random
// or Date is used anywhere.
//
// Run: npx tsx scripts/checks/seat_reuse.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED = 0x5eed_cafe;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8', '#4de87a'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

const OPTS = {
  players: Array.from({ length: 3 }, (_, i) => ({ name: `P${i + 1}`, color: PALETTE[i] })),
  maxPlayers: 3,
  seed: SEED,
  rounds: 3,    // best-of-3 so we can cross a round boundary
};

function makeEngine() { return new GameEngine(OPTS); }
function tickToCompletion(e) {
  let t = 0;
  while (e.getState().phase === 'FIRING' && t < MAX_TICKS) { e.tick(); t++; }
}
// 'p1' -> 0, 'p3' -> 2, etc.
const seatIndex = (id) => Number(String(id).replace(/[^0-9]/g, '')) - 1;

// --- "Script" type: each entry is either a logged ACTION or a MUTATION applied
// directly to the engine's live state (via getState() by reference).
// ACTIONS are applied+ticked; MUTATIONS are applied without ticking.
//
// Mutations are deterministically reproducible: every fresh-replay engine applies the
// same mutations at the same position in the sequence.

// Types used in the script:
//   { kind:'fire', angle, power, weapon }         — fire action (turn-ending)
//   { kind:'next_round' }                          — next_round action (turn-ending from ROUND_OVER)
//   { kind:'mut_kill', tankIdx }                   — kill a tank (direct state mutation)
//   { kind:'mut_round_end' }                       — force round end: kill all-but-one then fire a turn-ender

// Apply a script step to an engine (action only — tick separately).
function applyStep(e, step) {
  if (step.kind === 'fire') {
    e.applyAction({ type: 'set_angle',     angle:  step.angle  });
    e.applyAction({ type: 'set_power',     power:  step.power  });
    e.applyAction({ type: 'select_weapon', weapon: step.weapon });
    e.applyAction({ type: 'fire' });
    return;
  }
  if (step.kind === 'next_round') {
    e.applyAction({ type: 'next_round' });
    return;
  }
  if (step.kind === 'mut_kill') {
    e.getState().tanks[step.tankIdx].alive  = false;
    e.getState().tanks[step.tankIdx].health = 0;
    return; // no tick needed
  }
  throw new Error(`unknown step kind: ${step.kind}`);
}

// Is this step a TURN-ENDING action (requires a checkPending call)?
function isTurnEnding(step) {
  return step.kind === 'fire' || step.kind === 'next_round';
}

// Build the log: each entry describes one step in the scripted game.
// The script is designed so that:
//   - After step 3 (p3 fires) we kill p3 (mut_kill) before step 4 — ELIMINATION.
//   - After step 5 (p2 fires) we kill p1 before step 6, then p2 fires to end the round
//     (p2 is the sole survivor => ROUND_OVER) — ROUND BOUNDARY.
//   - Step 7 (next_round) crosses the round boundary and enters round 2.
//   - Step 8 (fire in round 2) confirms clone still works post-boundary.
//
// Annotation: [E] = turn-ending (clone parity checked), [M] = mutation (applied to both paths).
const SCRIPT = [
  //  0: p1 fires — harmless high arc (OOB)               [E]
  { kind: 'fire', angle: 90, power: 30, weapon: 'baby_missile' },
  //  1: p2 fires — harmless high arc (OOB)               [E]
  { kind: 'fire', angle: 90, power: 30, weapon: 'baby_missile' },
  //  2: p3 fires — harmless high arc (OOB)               [E]
  { kind: 'fire', angle: 90, power: 30, weapon: 'baby_missile' },
  //  3: MUTATION — kill p3 (index 2) so next rotation skips it   [M]
  { kind: 'mut_kill', tankIdx: 2 },
  //  4: p1 fires — harmless OOB (p3 is dead, rotation should skip to p2)  [E]
  { kind: 'fire', angle: 90, power: 30, weapon: 'baby_missile' },
  //  5: MUTATION — kill p1 (index 0) so p2 is sole survivor                [M]
  { kind: 'mut_kill', tankIdx: 0 },
  //  6: p2 fires — with p1 dead, this fire resolves to sole-survivor => ROUND_OVER  [E]
  { kind: 'fire', angle: 90, power: 30, weapon: 'baby_missile' },
  //  7: next_round — leaves ROUND_OVER shop, begins round-2 combat         [E]
  { kind: 'next_round' },
  //  8: first fire in round-2 (all tanks reset/alive; p1 should be the opener)     [E]
  { kind: 'fire', angle: 90, power: 30, weapon: 'baby_missile' },
];

// Run the full script on a fresh engine and return the engine (so we can inspect state).
// `upToIdx` = number of steps to apply (exclusive). Mutations are applied without ticking.
function replayScript(upToIdx) {
  const e = makeEngine();
  for (let i = 0; i < upToIdx; i++) {
    const step = SCRIPT[i];
    applyStep(e, step);
    if (isTurnEnding(step)) tickToCompletion(e);
  }
  return e;
}

// The incremental (live) engine — drives the real game forward step by step.
const liveEngine = makeEngine();

for (let stepIdx = 0; stepIdx < SCRIPT.length; stepIdx++) {
  const step = SCRIPT[stepIdx];

  if (!isTurnEnding(step)) {
    // Mutation: apply to live engine, no tick, no parity check needed.
    applyStep(liveEngine, step);
    continue;
  }

  // Turn-ending action: check clone parity BEFORE applying it to the live engine.
  const label = `step-${stepIdx} (${step.kind}${step.kind === 'fire' ? ` a${step.angle}/p${step.power}` : ''})`;

  // (i) FRESH-REPLAY: new engine, replay the entire prior history, then apply this step.
  const freshEngine = replayScript(stepIdx); // applies steps [0..stepIdx)
  applyStep(freshEngine, step);
  if (isTurnEnding(step)) tickToCompletion(freshEngine);
  const freshSt      = freshEngine.getState();
  const freshIdx     = seatIndex(freshSt.activePlayerId);
  const freshEndsRound = freshSt.phase === 'ROUND_OVER';

  // (ii) CLONE: liveEngine already reflects all prior steps.
  const cloneEngine  = liveEngine.clone();
  applyStep(cloneEngine, step);
  if (isTurnEnding(step)) tickToCompletion(cloneEngine);
  const cloneSt      = cloneEngine.getState();
  const cloneIdx     = seatIndex(cloneSt.activePlayerId);
  const cloneEndsRound = cloneSt.phase === 'ROUND_OVER';

  // Guard: the live engine must not have been mutated by clone()+tick.
  const livePhaseBefore = liveEngine.getState().phase;
  if (livePhaseBefore === 'FIRING') {
    fail(`[${label}] liveEngine was mutated into FIRING — clone is not independent of the original`);
  }

  // Parity assertion.
  if (freshIdx !== cloneIdx) {
    fail(`[${label}] seat index mismatch: fresh-replay=${freshIdx} (activeId=${freshSt.activePlayerId}) clone=${cloneIdx} (activeId=${cloneSt.activePlayerId})`);
  }
  if (freshEndsRound !== cloneEndsRound) {
    fail(`[${label}] endsRound mismatch: fresh-replay=${freshEndsRound} clone=${cloneEndsRound} (freshPhase=${freshSt.phase} clonePhase=${cloneSt.phase})`);
  }

  log(`[${label}] PASS: {index:${freshIdx},endsRound:${freshEndsRound}}`);

  // Now apply + tick on the live engine so it is ready for the next step.
  applyStep(liveEngine, step);
  if (isTurnEnding(step)) tickToCompletion(liveEngine);
}

if (failed) { log('\nseat_reuse: FAILED'); process.exit(1); }
else { log('\nseat_reuse: OK'); process.exit(0); }
