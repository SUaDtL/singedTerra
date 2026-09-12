// TEAMS check — RED first for the opt-in deterministic 2v2 ruleset.
// Guards assignment, team-aware resolution, friendly-fire suppression, and legacy parity.

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { computeAiPlan } from '../../shared/src/engine/AI.ts';

const SEED = 0x7ea15;
const MAX_TICKS = 100_000;
const COLORS = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'];
let failed = false;
const fail = (m) => { failed = true; console.log(`FAIL: ${m}`); };
const pass = (m) => console.log(`PASS: ${m}`);
const players = () => COLORS.map((color, i) => ({ name: `P${i + 1}`, color }));
const teamEngine = (extra = {}) => new GameEngine({
  players: players(), maxPlayers: 4, seed: SEED, teamMode: true, rounds: 3, ...extra,
});
const tickToRest = (e) => {
  let ticks = 0;
  while ((e.getState().phase === 'FIRING' || e.getState().phase === 'RESOLVING') && ticks < MAX_TICKS) {
    e.tick(); ticks++;
  }
  if (ticks >= MAX_TICKS) fail('engine did not settle');
};
const resolveWithSurvivors = (e, survivorIds) => {
  for (const tank of e.getState().tanks) {
    if (!survivorIds.includes(tank.id)) { tank.alive = false; tank.health = 0; }
  }
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 90 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
};
const terrainChanged = (before, after) => before.some((value, i) => value !== after[i]);

// Ordinary CPU targeting must ignore a nearer living teammate and plan against
// the farther enemy. The target remains internal; health-scaled weapon selection
// makes the production computeAiPlan result observable without exposing it.
{
  const e = teamEngine({ rounds: 1 });
  const st = e.getState();
  const [cpu, enemy, ally, otherEnemy] = st.tanks;
  Object.assign(cpu, { x: 100, y: 300 });
  Object.assign(ally, { x: 130, y: 300, health: 12 });
  Object.assign(enemy, { x: 700, y: 300, health: 100 });
  Object.assign(otherEnemy, { x: 780, y: 300, health: 0, alive: false });
  cpu.inventory.nuke.count = 1;
  const plan = computeAiPlan(st, cpu.id, 'hard', undefined, Number.POSITIVE_INFINITY, 'conservative');
  if (plan?.weapon !== 'nuke') {
    fail(`D04 CPU should target the farther 100hp enemy instead of its nearer 12hp teammate, got ${plan?.weapon}`);
  } else {
    pass('D04 ordinary CPU targets the enemy rather than its nearer teammate');
  }

  enemy.alive = false;
  enemy.health = 0;
  if (computeAiPlan(st, cpu.id, 'hard', undefined, Number.POSITIVE_INFINITY, 'conservative') !== null) {
    fail('a CPU with only a living teammate and no living enemies should return null');
  } else {
    pass('ordinary CPU returns null when every enemy is eliminated');
  }
}

// Assignment and state surface.
{
  const st = teamEngine().getState();
  if (st.tanks.map((t) => t.team).join(',') !== '1,2,1,2') fail(`expected alternating teams, got ${st.tanks.map((t) => t.team)}`);
  if (st.winnerTeam !== null || st.lastRoundWinnerTeam !== null) fail('fresh team state should have null winner-team fields');
  else pass('four-seat team mode assigns deterministic alternating teams');
}

// Team elimination: two living tanks on one team end the round, whereas old logic
// would continue because two tanks remain alive.
{
  const e = teamEngine();
  resolveWithSurvivors(e, ['p1', 'p3']);
  const st = e.getState();
  if (st.phase !== 'ROUND_OVER') fail(`single surviving team should end round, got ${st.phase}`);
  if (st.lastRoundWinnerTeam !== 1 || st.winnerTeam !== null) fail(`round winner team should be 1 and match winner null, got ${st.lastRoundWinnerTeam}/${st.winnerTeam}`);
  if (st.tanks[0].roundWins !== 1 || st.tanks[2].roundWins !== 1) fail('both members of the winning team should receive the round score');
  else pass('team survival ends the round and scores both teammates');
}

// Legacy two-player behavior remains tank-based and has no team activation.
{
  const e = new GameEngine({ players: players().slice(0, 2), maxPlayers: 2, seed: SEED, teamMode: true });
  const st = e.getState();
  if (st.tanks.some((t) => t.team !== null) || st.winnerTeam !== null || st.lastRoundWinnerTeam !== null) fail('team mode must fail closed outside four seats');
  else pass('team option fails closed for legacy two-seat rooms');
}

// Malformed or one-sided explicit roster metadata must fail closed to the stable
// alternating assignment instead of allowing a one-team room to be created.
{
  for (const explicit of [[1, 1, 1, 1], [1, 1, 1, 2]]) {
    const e = teamEngine({ players: players().map((player, i) => ({ ...player, team: explicit[i] })) });
    if (e.getState().tanks.map((t) => t.team).join(',') !== '1,2,1,2') fail(`invalid explicit teams ${explicit} must normalize to alternating teams`);
  }
  if (!failed) pass('invalid and unbalanced explicit team metadata fails closed to alternating assignment');
}

// A same-team blast must not reduce teammate health, while the shared damage gate
// still allows the enemy case (covered by the terminal team-resolution checks).
{
  const e = teamEngine();
  const st = e.getState();
  st.tanks[2].x = st.tanks[0].x;
  st.tanks[2].y = st.tanks[0].y;
  const before = st.tanks[2].health;
  const shooterBefore = st.tanks[0].health;
  const terrainBefore = Uint8Array.from(st.terrain);
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 1 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
  if (st.explosions.length === 0) fail('friendly-fire fixture did not produce a blast');
  else if (st.tanks[2].health !== before) fail(`friendly fire should be suppressed, health ${before} -> ${st.tanks[2].health}`);
  else if (st.tanks[0].health >= shooterBefore) fail('team mode must preserve self-damage semantics');
  else if (!terrainChanged(terrainBefore, st.terrain)) fail('friendly-fire suppression must not suppress terrain deformation');
  else pass('team mode suppresses same-team blast damage');
}

// Every other damage-producing weapon family must use the same gate, including
// multi-blast and delayed-burn paths.
{
  for (const weapon of ['bouncing_betty', 'cluster_bomb', 'napalm', 'hot_napalm']) {
    const e = teamEngine({ rounds: 1 });
    const st = e.getState();
    st.tanks[2].x = st.tanks[0].x;
    st.tanks[2].y = st.tanks[0].y;
    st.tanks[0].inventory[weapon] = { count: 1, unlimited: false };
    const before = st.tanks[2].health;
    e.applyAction({ type: 'select_weapon', weapon });
    e.applyAction({ type: 'set_angle', angle: 45 });
    e.applyAction({ type: 'set_power', power: 1 });
    e.applyAction({ type: 'fire' });
    tickToRest(e);
    if (st.explosions.length === 0 || st.tanks[2].health !== before) fail(`${weapon} friendly-fire path should resolve without teammate damage`);
  }
  if (!failed) pass('cluster, bouncing, and napalm damage paths suppress teammate damage');
}

// Friendly-fire suppression must not turn team mode into invulnerability: an
// enemy placed at the same deterministic impact point still takes damage.
{
  const e = teamEngine({ rounds: 1 });
  const st = e.getState();
  st.tanks[1].x = st.tanks[0].x;
  st.tanks[1].y = st.tanks[0].y;
  const before = st.tanks[1].health;
  e.applyAction({ type: 'select_weapon', weapon: 'baby_missile' });
  e.applyAction({ type: 'set_angle', angle: 45 });
  e.applyAction({ type: 'set_power', power: 1 });
  e.applyAction({ type: 'fire' });
  tickToRest(e);
  if (st.tanks[1].health >= before) fail('enemy damage should remain active in team mode');
  else pass('team mode preserves enemy damage');
}

// A best-of-3 aggregates team wins, exposes the winning team, and keeps a stable
// representative tank ID for the existing terminal transport contract.
{
  const e = teamEngine();
  resolveWithSurvivors(e, ['p1', 'p3']);
  e.applyAction({ type: 'next_round' });
  resolveWithSurvivors(e, ['p1']);
  const st = e.getState();
  if (st.phase !== 'GAME_OVER' || st.winnerTeam !== 1 || st.winner !== 'p1') fail(`team match winner should be Team 1/p1, got ${st.phase}/${st.winnerTeam}/${st.winner}`);
  if (st.tanks[0].roundWins !== 2 || st.tanks[2].roundWins !== 2 || st.tanks[1].roundWins !== 0 || st.tanks[3].roundWins !== 0) fail(`team score aggregation should give both Team 1 members 2 wins and Team 2 zero, got ${st.tanks.map((t) => t.roundWins)}`);
  else pass('team match aggregation exposes winnerTeam and compatibility winner ID');
}

// If both teams are eliminated, the terminal state is a draw rather than a
// fabricated representative winner.
{
  const e = teamEngine({ rounds: 1 });
  resolveWithSurvivors(e, []);
  const st = e.getState();
  if (st.phase !== 'GAME_OVER' || st.winner !== null || st.winnerTeam !== null || st.lastRoundWinnerTeam !== null) fail('two-team mutual elimination should be a draw');
  else pass('two-team mutual elimination remains a draw');
}

if (failed) { console.log('\nTEAMS CHECK: FAILED'); process.exit(1); }
console.log('\nTEAMS CHECK: PASSED');
