// Adversarial AMMO replay-determinism check for the singedTerra shared engine
// (Sprint 4, Slice 1.4 — the 7th harness).
//
// The ammo model (Slice 0/1.1) makes weapon inventory a Record<WeaponType,
// { count: number; unlimited: boolean }>, with NO Infinity sentinel. A finite
// weapon decrements exactly once per ACCEPTED fire; once its count hits 0 the
// fire is REJECTED (side-effect-free, tank stays in PLAYER_TURN). The unlimited
// weapon (baby_missile) never decrements. This must be bit-identical on lockstep
// replay from the same seed + ordered fire-action log, or networked clients
// silently diverge.
//
// Asserts:
//   1. Decrement: a finite weapon's count drops by EXACTLY ONE per accepted
//      fire, never below 0, never by more than 1.
//   2. Rejection at zero: once count hits 0, a `fire` is REJECTED — engine stays
//      in PLAYER_TURN, no projectile launches, no turn advance, count stays 0.
//      A switch to a still-stocked weapon then fires normally (the gate is
//      per-weapon, not a global lockout).
//   3. Unlimited never decrements: baby_missile fires repeatedly and its entry
//      stays { count: 0, unlimited: true } forever (count untouched).
//   4. Anti-Infinity (Slice 0): a JSON round-trip of the inventory yields NO
//      null and NO NaN for any count, and `unlimited` survives as a boolean.
//      (JSON.stringify(Infinity) === 'null' — the old sentinel would corrupt the
//      JSONB / lockstep snapshot; the boolean flag must round-trip cleanly.)
//   5. Replay determinism: replaying the SAME seed + SAME ordered fire-action log
//      through a FRESH engine yields a BYTE-IDENTICAL final state (inventory of
//      every tank + winner + terrain + turn + wind especially). A shot that
//      fired LIVE is never rejected on REPLAY, and vice versa.
//
// Fully deterministic: no Math.random, no Date / wall-clock. Imports the shared
// TypeScript source directly (tsx runs .ts without a build step).
//
// Run: npx tsx scripts/checks/ammo.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED = 0xa117a330;
const MAX_TICKS = 100_000; // safety cap per shot so a stuck projectile can't hang us

const PALETTE = ['#e84d4d', '#4d8ce8'];

function makePlayers(n) {
  const players = [];
  for (let i = 0; i < n; i++) players.push({ name: `P${i + 1}`, color: PALETTE[i % PALETTE.length] });
  return players;
}

function freshEngine() {
  return new GameEngine({ players: makePlayers(2), maxPlayers: 2, seed: SEED });
}

let failed = false;
const log = (...args) => console.log(...args);
const fail = (msg) => { failed = true; log(`FAIL: ${msg}`); };

/** Tick a shot to resolution (back to PLAYER_TURN / GAME_OVER). */
function resolveShot(engine) {
  let ticks = 0;
  while ((engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') && ticks < MAX_TICKS) {
    engine.tick();
    ticks++;
  }
  if (ticks >= MAX_TICKS) throw new Error('projectile never resolved (possible infinite flight)');
  return ticks;
}

/** The active tank in the current state. */
function activeTank(engine) {
  const s = engine.getState();
  return s.tanks.find((t) => t.id === s.activePlayerId);
}

/**
 * A deliberately HARMLESS aim: a flat, full-power shot that sails off the right
 * edge of the field and resolves out-of-bounds with NO damage to anyone. This
 * keeps BOTH tanks alive indefinitely so a single tank can take the >9 turns
 * needed to exhaust a finite (count:9) weapon — without the game ending first.
 * Purely a function of nothing (constant), so both the live run and the replay
 * issue the identical action sequence. (angle 0 = right, power 100.)
 */
const HARMLESS = { angle: 0, power: 100 };

/**
 * Apply select+aim+fire for the active tank, then resolve. Returns whether the
 * fire was ACCEPTED (the engine actually entered FIRING / advanced a turn) by
 * observing the turn counter: an accepted fire advances `turn` by exactly 1 (one
 * resolve), a rejected fire leaves phase PLAYER_TURN with turn unchanged.
 */
function fireOnce(engine, weapon) {
  const before = engine.getState();
  const turnBefore = before.turn;
  const phaseBefore = before.phase;

  engine.applyAction({ type: 'select_weapon', weapon });
  engine.applyAction({ type: 'set_angle', angle: HARMLESS.angle });
  engine.applyAction({ type: 'set_power', power: HARMLESS.power });
  engine.applyAction({ type: 'fire' });

  const afterFire = engine.getState();
  const accepted = afterFire.phase === 'FIRING';
  if (accepted) resolveShot(engine);

  const after = engine.getState();
  // Cross-check: an accepted fire advanced the turn by 1; a rejected fire did not
  // change turn and left us resting in PLAYER_TURN.
  if (accepted && after.turn !== turnBefore + 1 && after.phase !== 'GAME_OVER') {
    fail(`accepted fire did not advance turn (was ${turnBefore}, now ${after.turn})`);
  }
  if (!accepted && (after.turn !== turnBefore || phaseBefore !== 'PLAYER_TURN' || after.phase !== 'PLAYER_TURN')) {
    fail(`rejected fire mutated turn/phase (turn ${turnBefore}->${after.turn}, phase ${phaseBefore}->${after.phase})`);
  }
  return accepted;
}

/**
 * Build the canonical scripted fire-action LOG used by both the live run and the
 * replay. Each entry names the weapon the (then-active) tank should fire. The
 * sequence is a pure constant — no state-dependence — so live and replay are
 * guaranteed to issue identical inputs.
 *
 * Design: a 2-tank game with both tanks firing 'missile' (finite, count:9) on
 * their alternating turns. Over 22 turns each tank fires 11 times: the first 9
 * succeed and decrement, the 10th & 11th are rejected (count already 0). Then a
 * few baby_missile (unlimited) shots prove the unlimited path keeps firing after
 * the finite weapon is dry, and finally one cluster_bomb (still stocked) proves
 * the per-weapon gate is not a global lockout.
 */
function buildLog() {
  const log = [];
  for (let i = 0; i < 22; i++) log.push('missile'); // 11 per tank: 9 ok + 2 rejected
  for (let i = 0; i < 4; i++) log.push('baby_missile'); // unlimited, post-exhaustion
  log.push('cluster_bomb'); // still stocked => per-weapon gate, not global lockout
  return log;
}

const ACTION_LOG = buildLog();

/** Serialize the parts of GameState the ammo determinism claim covers. */
function serialize(state) {
  return JSON.stringify({
    phase: state.phase,
    turn: state.turn,
    activePlayerId: state.activePlayerId,
    wind: state.wind,
    winner: state.winner,
    tanks: state.tanks.map((t) => ({
      id: t.id,
      health: t.health,
      alive: t.alive,
      selectedWeapon: t.selectedWeapon,
      inventory: t.inventory, // {count,unlimited} per weapon — the heart of the check
    })),
    terrain: Buffer.from(state.terrain).toString('hex'),
  });
}

/** Drive a fresh engine through ACTION_LOG. Returns final state + accept trace. */
function runLog() {
  const engine = freshEngine();
  const accepts = [];
  for (const weapon of ACTION_LOG) {
    accepts.push(fireOnce(engine, weapon));
  }
  return { state: engine.getState(), accepts };
}

// =====================================================================
// Check 1+2+3: decrement-exactly-once, reject-at-zero, unlimited-never-spends.
// Drive ONE engine, watching a single tank's 'missile' entry across its turns.
// =====================================================================
{
  const engine = freshEngine();

  // Identify the two tank ids in stable order. The active tank rotates each
  // accepted shot, so tank A acts on even turns, tank B on odd turns.
  const ids = engine.getState().tanks.map((t) => t.id);
  // Read the starting count from the engine so this check is robust to loadout
  // tuning (the economy slice reduced default ammo; the MECHANIC is what matters).
  const startCount = engine.getState().tanks[0].inventory.missile.count;
  if (startCount < 1) fail(`expected a finite starting missile count >= 1, got ${startCount}`);
  if (engine.getState().tanks[0].inventory.missile.unlimited) fail('missile should be finite, not unlimited');
  if (!engine.getState().tanks[0].inventory.baby_missile.unlimited) fail('baby_missile should be unlimited');

  // Per-tank record of that tank's own missile fires. NOTE: a REJECTED fire does
  // NOT advance the turn (resolve never runs), so the active player does NOT
  // rotate on rejection — a dry tank stays active and keeps getting rejected.
  // The loop therefore drives by ACCEPTED-fire counts, not a fixed turn count:
  // fire 'missile' until BOTH tanks have 9 accepted fires, observing along the
  // way that every accepted finite fire decrements by exactly 1 and every fire
  // attempted at count 0 is rejected (count untouched, never negative).
  const perTank = new Map(ids.map((id) => [id, { fires: 0, accepted: 0, rejected: 0, lastCount: startCount }]));

  let guard = 0;
  const GUARD_MAX = 200; // generous; expected ~18 accepted + a handful of rejects
  while (guard++ < GUARD_MAX) {
    const tank = activeTank(engine);
    const id = tank.id;
    const rec = perTank.get(id);
    const before = tank.inventory.missile.count;

    const accepted = fireOnce(engine, 'missile');
    rec.fires++;

    // Re-read THIS tank by id (active rotated away iff accepted).
    const after = engine.getState().tanks.find((t) => t.id === id).inventory.missile.count;

    if (accepted) {
      rec.accepted++;
      // Decrement EXACTLY one on an accepted finite fire.
      if (after !== before - 1) fail(`tank ${id} accepted fire #${rec.accepted}: missile ${before}->${after}, expected ${before - 1}`);
    } else {
      rec.rejected++;
      // Rejected fire must not touch the count, and count must already be 0.
      if (after !== before) fail(`tank ${id} rejected fire mutated missile count ${before}->${after}`);
      if (before !== 0) fail(`tank ${id} fire rejected while count=${before} (>0) — should only reject at 0`);
    }
    if (after < 0) fail(`tank ${id} missile count went NEGATIVE (${after})`);
    rec.lastCount = after;

    // Stop once BOTH tanks are exhausted AND we've observed at least one
    // rejection from a dry tank (so the reject-at-zero path is exercised).
    const allDry = [...perTank.values()].every((r) => r.accepted >= startCount);
    const sawReject = [...perTank.values()].some((r) => r.rejected > 0);
    if (allDry && sawReject) break;
  }
  if (guard >= GUARD_MAX) fail(`missile-exhaustion loop did not terminate within ${GUARD_MAX} fires`);

  // Each tank: exactly `startCount` ACCEPTED missile fires (count startCount->0),
  // then rejected at 0.
  for (const [id, rec] of perTank) {
    if (rec.accepted !== startCount) fail(`tank ${id} expected ${startCount} ACCEPTED missile fires (count was ${startCount}), got ${rec.accepted}`);
    if (rec.lastCount !== 0) fail(`tank ${id} missile count not 0 after exhaustion (got ${rec.lastCount})`);
    if (rec.rejected > 0 && rec.lastCount !== 0) fail(`tank ${id} rejected a fire while count != 0`);
  }
  const totalRejects = [...perTank.values()].reduce((s, r) => s + r.rejected, 0);
  if (totalRejects === 0) fail('no missile fire was ever rejected — reject-at-zero path not exercised');
  if (!failed) log(`PASS: each tank's missile decremented exactly 1/accepted-fire; ${startCount} accepted then rejected at 0 (count never < 0; ${totalRejects} rejections observed).`);

  // Check 2 (cont.): a still-stocked weapon fires fine AFTER missile is dry —
  // the gate is per-weapon, not a global lockout.
  {
    const tank = activeTank(engine);
    const id = tank.id;
    const clusterBefore = tank.inventory.cluster_bomb.count;
    const accepted = fireOnce(engine, 'cluster_bomb');
    const clusterAfter = engine.getState().tanks.find((t) => t.id === id).inventory.cluster_bomb.count;
    if (!accepted) fail('cluster_bomb (still stocked) was REJECTED even though missile-only was exhausted — gate is wrongly global');
    else if (clusterAfter !== clusterBefore - 1) fail(`cluster_bomb did not decrement by 1 (${clusterBefore}->${clusterAfter})`);
    else log('PASS: per-weapon gate — a stocked weapon (cluster_bomb) still fires after a different weapon ran dry.');
  }

  // Check 3: unlimited (baby_missile) NEVER decrements no matter how often fired.
  {
    let everChanged = false;
    let everRejected = false;
    for (let i = 0; i < 8; i++) {
      const tank = activeTank(engine);
      const id = tank.id;
      const before = tank.inventory.baby_missile;
      if (before.count !== 0 || !before.unlimited) everChanged = true;
      const accepted = fireOnce(engine, 'baby_missile');
      if (!accepted) everRejected = true;
      const after = engine.getState().tanks.find((t) => t.id === id).inventory.baby_missile;
      if (after.count !== 0 || after.unlimited !== true) everChanged = true;
    }
    if (everChanged) fail('baby_missile (unlimited) inventory entry mutated — unlimited weapons must never decrement');
    else if (everRejected) fail('baby_missile (unlimited) fire was REJECTED — unlimited weapons must never be gated');
    else log('PASS: unlimited baby_missile fired repeatedly with count stuck at 0 and unlimited=true (never spent, never gated).');
  }
}

// =====================================================================
// Check 4: anti-Infinity — JSON round-trip yields no null / NaN, flags survive.
// =====================================================================
{
  const engine = freshEngine();
  // Fire some finite + unlimited shots so counts are mid-range, then round-trip.
  fireOnce(engine, 'missile');
  fireOnce(engine, 'missile'); // (other tank)
  fireOnce(engine, 'baby_missile');

  for (const tank of engine.getState().tanks) {
    const roundTripped = JSON.parse(JSON.stringify(tank.inventory));
    for (const [weapon, entry] of Object.entries(roundTripped)) {
      if (entry === null) { fail(`inventory[${weapon}] serialized to null (Infinity sentinel leak?)`); continue; }
      if (entry.count === null) fail(`inventory[${weapon}].count round-tripped to null (Infinity sentinel leak)`);
      if (typeof entry.count !== 'number' || Number.isNaN(entry.count)) fail(`inventory[${weapon}].count is NaN/non-number after round-trip`);
      if (!Number.isFinite(entry.count)) fail(`inventory[${weapon}].count is non-finite (${entry.count}) — no Infinity allowed`);
      if (typeof entry.unlimited !== 'boolean') fail(`inventory[${weapon}].unlimited did not survive as boolean (got ${typeof entry.unlimited})`);
    }
  }
  if (!failed) log('PASS: inventory JSON round-trips cleanly — no null, no NaN, no Infinity; counts finite, unlimited stays boolean.');
}

// =====================================================================
// Check 5: replay determinism — same seed + same ordered fire log => identical
// final state. Live accept/reject pattern must reproduce byte-for-byte.
// =====================================================================
{
  const live = runLog();
  const replay = runLog();

  const sLive = serialize(live.state);
  const sReplay = serialize(replay.state);

  // The accept/reject vectors must match exactly: a shot that fired live must
  // not be rejected on replay (and vice versa).
  const accLive = live.accepts.join(',');
  const accReplay = replay.accepts.join(',');
  if (accLive !== accReplay) {
    fail('accept/reject pattern DIVERGED between live and replay (a live shot was rejected on replay or vice versa)');
    log(`  live:   ${accLive}`);
    log(`  replay: ${accReplay}`);
  } else {
    // Sanity: the log must contain BOTH accepted and rejected fires, else the
    // replay-of-rejection path isn't actually exercised.
    const accepts = live.accepts.filter(Boolean).length;
    const rejects = live.accepts.length - accepts;
    if (rejects === 0) fail('action log produced NO rejected fires — the reject-replay path was not exercised');
    if (accepts === 0) fail('action log produced NO accepted fires — nothing meaningful exercised');
    log(`[ammo] action log: ${live.accepts.length} fires => ${accepts} accepted, ${rejects} rejected (both paths exercised).`);
  }

  if (sLive === sReplay) {
    log(`PASS: live and replay (same seed + same fire log) byte-identical final state (len ${sLive.length}) — inventory + winner + terrain match.`);
  } else {
    fail('live vs replay DIVERGED (NON-DETERMINISTIC ammo/state)');
    const len = Math.min(sLive.length, sReplay.length);
    for (let i = 0; i < len; i++) {
      if (sLive[i] !== sReplay[i]) {
        const from = Math.max(0, i - 40);
        log(`  first diff at index ${i}`);
        log(`  live:   ...${sLive.slice(from, i + 40)}...`);
        log(`  replay: ...${sReplay.slice(from, i + 40)}...`);
        break;
      }
    }
    if (sLive.length !== sReplay.length) log(`  length differs: live=${sLive.length} replay=${sReplay.length}`);
  }
}

if (failed) {
  log('\nAMMO CHECK: FAILED');
  process.exit(1);
} else {
  log('\nAMMO CHECK: PASSED');
  process.exit(0);
}
