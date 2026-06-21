// ROUNDS check (14th harness) — guards the V1 match-structure round system
// (Sprint 6 Slice 1). A best-of-N match runs multiple rounds; the round transition
// must be a PURE deterministic function of (base seed, round number, action log) so
// networked lockstep replays it identically with no new action. This check proves:
//   1. BACK-COMPAT: with no `rounds` option (default 1) the first elimination still
//      ends the game at GAME_OVER — byte-for-byte the old single-round behavior.
//   2. ADVANCE + CARRY + RESET: in a best-of-N match a round end advances to the next
//      round (PLAYER_TURN, round++) instead of ending; the winner's roundWins ticks;
//      credits + inventory CARRY; health/alive RESET; terrain REGENERATES (distinct
//      map + bumped terrainVersion).
//   3. DETERMINISM: two engines with the same seed + same driver land on identical
//      round / roundWins / activePlayerId / wind AND byte-identical terrain mid-match.
//   4. CLINCH: a best-of-3 ends at GAME_OVER the moment a tank reaches 2 round wins,
//      with `winner` set to that tank.
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/rounds.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;
const PALETTE = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'];

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

function players(n) { return Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, color: PALETTE[i] })); }
function engine(n, rounds) { return new GameEngine({ players: players(n), maxPlayers: n, seed: SEED, rounds }); }
function tickToRest(e) { let t = 0; while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && t < MAX_TICKS) { e.tick(); t++; } }

// End the current round with p1 (seat 0, always the active opener) as the winner:
// mark every other tank dead, then have p1 fire a far harmless shot that resolves —
// resolve() then sees a single survivor and runs the round-end branch.
function p1WinsRound(e) {
  const st = e.getState();
  for (let i = 1; i < st.tanks.length; i++) { st.tanks[i].alive = false; st.tanks[i].health = 0; }
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 90 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
}
/** Leave the ROUND_OVER between-rounds shop and start the next round's combat. */
function startNextRound(e) { e.applyAction({ type: 'next_round' }); }
/** Win a round AND advance past the between-rounds shop into the next round. */
function p1WinsAndAdvances(e) { p1WinsRound(e); if (e.getState().phase === 'ROUND_OVER') startNextRound(e); }

function terrainsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// --- Check 1: back-compat — no `rounds` => first elimination ends the game ---
{
  const e = engine(2, undefined);
  if (e.getState().round !== 1) fail(`fresh game should be round 1, got ${e.getState().round}`);
  if (e.getState().totalRounds !== 1) fail(`default totalRounds should be 1, got ${e.getState().totalRounds}`);
  p1WinsRound(e);
  const st = e.getState();
  if (st.phase !== 'GAME_OVER') fail(`single-round game should be GAME_OVER after one elimination, got ${st.phase}`);
  if (st.winner !== 'p1') fail(`single-round winner should be p1, got ${st.winner}`);
  if (st.round !== 1) fail(`single-round game should stay on round 1, got ${st.round}`);
  if (!failed) log('PASS: default (rounds=1) game ends at GAME_OVER on first elimination — back-compat intact.');
}

// --- Check 2: best-of-N advances, carries credits/inventory, resets health/terrain ---
{
  const e = engine(2, 3);
  const before = e.getState();
  const terrainR1 = Uint8Array.from(before.terrain);
  const versionR1 = before.terrainVersion;
  // Give p1 something to carry: spend nothing, just earn via the win path + tweak credits.
  before.tanks[0].credits = 4242;
  before.tanks[0].inventory.nuke.count = 2; // pretend a purchase carried in
  before.tanks[1].health = 37; // p2 wounded; must reset to 100 next round

  p1WinsRound(e);
  const st = e.getState();
  if (st.phase !== 'ROUND_OVER') fail(`best-of-3 should pause in the between-rounds shop after round 1, got ${st.phase}`);
  if (st.round !== 2) fail(`should have staged round 2, got ${st.round}`);
  if (st.lastRoundWinnerId !== 'p1') fail(`round-1 winner should be p1, got ${st.lastRoundWinnerId}`);
  if (st.tanks[0].roundWins !== 1) fail(`p1 should have 1 round win, got ${st.tanks[0].roundWins}`);
  if (st.tanks[1].roundWins !== 0) fail(`p2 should have 0 round wins, got ${st.tanks[1].roundWins}`);
  // Credits CARRY (>= the 4242 we seeded); the round-ending shot also pays its normal
  // TURN_STIPEND, so the carried total is 4242 + stipend, NOT a reset to STARTING_CREDITS.
  if (st.tanks[0].credits < 4242) fail(`credits should carry (>= 4242) between rounds, got ${st.tanks[0].credits} — looks reset`);
  if (st.tanks[0].inventory.nuke.count !== 2) fail(`inventory should carry between rounds, got ${st.tanks[0].inventory.nuke.count}`);
  if (st.tanks[0].health !== 100 || st.tanks[1].health !== 100) fail(`health should reset to 100, got ${st.tanks.map((t) => t.health)}`);
  if (!st.tanks.every((t) => t.alive)) fail('all tanks should be alive again at the start of a new round');
  if (st.terrainVersion <= versionR1) fail(`terrainVersion should bump on regen (was ${versionR1}, now ${st.terrainVersion})`);
  if (terrainsEqual(terrainR1, st.terrain)) fail('round 2 terrain should differ from round 1 (derived seed) — got an identical map');
  // next_round leaves the shop and begins combat.
  startNextRound(e);
  if (e.getState().phase !== 'PLAYER_TURN') fail(`next_round should start combat, got ${e.getState().phase}`);
  if (!failed) log('PASS: best-of-3 pauses in ROUND_OVER then next_round starts round 2; credits/inventory carry, health/terrain reset.');
}

// --- Check 2b: the between-rounds shop — a buy in ROUND_OVER carries into the round ---
{
  const e = engine(2, 3);
  e.getState().tanks[0].credits = 99999; // ensure affordability
  const nukeBefore = e.getState().tanks[0].inventory.nuke.count;
  p1WinsRound(e);
  if (e.getState().phase !== 'ROUND_OVER') fail('expected ROUND_OVER for the shop test');
  // Buy a nuke for p1 (named tank) during the between-rounds shop.
  e.applyAction({ type: 'buy', weapon: 'nuke', tankId: 'p1' });
  const bought = e.getState().tanks[0].inventory.nuke.count;
  if (bought <= nukeBefore) fail(`ROUND_OVER buy did not add inventory (${nukeBefore} -> ${bought})`);
  startNextRound(e);
  if (e.getState().tanks[0].inventory.nuke.count !== bought) fail('ROUND_OVER purchase did not carry into the round');
  // A fire/aim action during ROUND_OVER must be ignored (shop, not combat).
  const phaseBeforeFire = (() => { const e2 = engine(2, 3); p1WinsRound(e2); e2.applyAction({ type: 'fire' }); return e2.getState().phase; })();
  if (phaseBeforeFire !== 'ROUND_OVER') fail(`fire during ROUND_OVER should be ignored, phase became ${phaseBeforeFire}`);
  if (!failed) log('PASS: ROUND_OVER shop accepts buys (carried into the round) and ignores fire.');
}

// --- Check 3: two engines, same seed + same driver => identical mid-match state ---
{
  const a = engine(3, 5);
  const b = engine(3, 5);
  p1WinsAndAdvances(a); p1WinsAndAdvances(a); // a in round-3 shop, p1 wins = 2
  p1WinsAndAdvances(b); p1WinsAndAdvances(b);
  const sa = a.getState(); const sb = b.getState();
  if (sa.round !== sb.round) fail(`round diverged: ${sa.round} vs ${sb.round}`);
  if (sa.tanks[0].roundWins !== sb.tanks[0].roundWins) fail('roundWins diverged across identical engines');
  if (sa.activePlayerId !== sb.activePlayerId) fail(`activePlayerId diverged: ${sa.activePlayerId} vs ${sb.activePlayerId}`);
  if (sa.wind !== sb.wind) fail(`wind diverged: ${sa.wind} vs ${sb.wind}`);
  if (!terrainsEqual(sa.terrain, sb.terrain)) fail('terrain diverged across identical engines — round seed not deterministic');
  log(`[determinism] both engines at round ${sa.round}, p1 wins=${sa.tanks[0].roundWins}, wind=${sa.wind.toFixed(4)}`);
  if (!failed) log('PASS: identical seed + driver reproduce identical round/score/terrain/wind (networked-replay safe).');
}

// --- Check 4: best-of-3 clinches at 2 wins => GAME_OVER with the right winner ---
{
  const e = engine(2, 3);
  p1WinsRound(e); // round 1 -> p1 1 win, pause in ROUND_OVER
  if (e.getState().phase !== 'ROUND_OVER') fail('match should pause in the shop, still live, after 1 of 3 round wins');
  startNextRound(e); // begin round 2
  p1WinsRound(e); // round 2 -> p1 2 wins -> clinch (ceil(3/2)=2) -> GAME_OVER (no shop)
  const st = e.getState();
  if (st.phase !== 'GAME_OVER') fail(`match should end on the 2nd round win, got ${st.phase}`);
  if (st.winner !== 'p1') fail(`match winner should be p1, got ${st.winner}`);
  if (st.tanks[0].roundWins !== 2) fail(`p1 should have clinched with 2 wins, got ${st.tanks[0].roundWins}`);
  log(`[clinch] best-of-3 ended at round ${st.round} with winner ${st.winner} (${st.tanks[0].roundWins} wins)`);
  if (!failed) log('PASS: best-of-3 ends the moment a tank reaches 2 round wins.');
}

if (failed) { log('\nROUNDS CHECK: FAILED'); process.exit(1); }
else { log('\nROUNDS CHECK: PASSED'); process.exit(0); }
