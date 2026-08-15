// FUEL-LIMITED MOVEMENT deterministic engine harness.
//
// Pins the movement contract across terrain, fuel, collisions, phase gates,
// economy, round reset, and replay-sensitive state. No clock or random reads.
// Run: npx tsx scripts/checks/movement.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/src/engine/Terrain.ts';
import { TANK_WIDTH } from '../../shared/src/engine/Tank.ts';
import { replayNetworkAction } from '../../shared/src/net/replay.ts';

const SEED = 0x5eed1234;
const SURFACE = 300;
const START_FUEL = 100;
const MOVE_STEP = 8;
const FUEL_TANK_PRICE = 10_000;

let failed = false;
const log = (...args) => console.log(...args);
const fail = (message) => {
  failed = true;
  log(`FAIL: ${message}`);
};

function freshEngine(extra = {}) {
  return new GameEngine({
    players: [
      { name: 'P1', color: '#e84d4d' },
      { name: 'P2', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: SEED,
    ...extra,
  });
}

function flatten(engine) {
  const state = engine.getState();
  state.terrain.fill(0);
  for (let y = SURFACE; y < CANVAS_HEIGHT; y++) {
    state.terrain.fill(1, y * CANVAS_WIDTH, (y + 1) * CANVAS_WIDTH);
  }
  state.terrainVersion += 1;
  state.tanks[0].x = 300;
  state.tanks[0].y = SURFACE;
  state.tanks[1].x = 700;
  state.tanks[1].y = SURFACE;
  return state;
}

function setColumnSurface(state, x, surface) {
  const xi = Math.floor(x);
  for (let y = 0; y < CANVAS_HEIGHT; y++) {
    state.terrain[y * CANVAS_WIDTH + xi] = y >= surface ? 1 : 0;
  }
  state.terrainVersion += 1;
}

function tickToRest(engine) {
  let ticks = 0;
  while (
    (engine.getState().phase === 'FIRING' ||
      engine.getState().phase === 'RESOLVING') &&
    ticks < 100_000
  ) {
    engine.tick();
    ticks += 1;
  }
}

function endRoundWithP1(engine) {
  const state = engine.getState();
  state.tanks[1].alive = false;
  state.tanks[1].health = 0;
  engine.applyAction({ type: 'set_angle', angle: 45 });
  engine.applyAction({ type: 'set_power', power: 90 });
  engine.applyAction({ type: 'fire' });
  tickToRest(engine);
}

// Fresh fuel and ordinary deterministic movement.
{
  const engine = freshEngine();
  const state = flatten(engine);
  const tank = state.tanks[0];
  if (tank.fuel !== START_FUEL) {
    fail(`fresh tank fuel=${tank.fuel}; expected ${START_FUEL}`);
  }
  const before = {
    x: tank.x,
    y: tank.y,
    fuel: tank.fuel,
    phase: state.phase,
    active: state.activePlayerId,
    turn: state.turn,
    wind: state.wind,
    angle: tank.angle,
    power: tank.power,
  };
  engine.applyAction({ type: 'move', delta: MOVE_STEP });
  if (tank.x !== before.x + MOVE_STEP) fail(`move +8 landed at x=${tank.x}`);
  if (tank.y !== before.y) fail(`flat move changed y ${before.y}->${tank.y}`);
  if (tank.fuel !== before.fuel - MOVE_STEP) fail(`move spent ${before.fuel - tank.fuel} fuel`);
  if (
    state.phase !== before.phase ||
    state.activePlayerId !== before.active ||
    state.turn !== before.turn ||
    state.wind !== before.wind ||
    tank.angle !== before.angle ||
    tank.power !== before.power
  ) {
    fail('movement changed turn, phase, wind, or aim');
  }
}

// Invalid deltas are exact no-ops.
{
  const engine = freshEngine();
  const state = flatten(engine);
  const tank = state.tanks[0];
  const before = `${tank.x}:${tank.y}:${tank.fuel}`;
  for (const delta of [0, 9, -9, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    engine.applyAction({ type: 'move', delta });
  }
  if (`${tank.x}:${tank.y}:${tank.fuel}` !== before) {
    fail('an invalid delta mutated movement state');
  }
}

// Partial movement spends only actual traversed distance.
{
  const engine = freshEngine();
  const state = flatten(engine);
  const tank = state.tanks[0];
  tank.fuel = 3;
  engine.applyAction({ type: 'move', delta: MOVE_STEP });
  if (tank.x !== 303 || tank.fuel !== 0) {
    fail(`fuel-limited partial move landed x=${tank.x}, fuel=${tank.fuel}`);
  }
}

// Battlefield bounds stop a step without charging rejected distance.
{
  const engine = freshEngine();
  const state = flatten(engine);
  const tank = state.tanks[0];
  tank.x = CANVAS_WIDTH - TANK_WIDTH / 2 - 2;
  tank.y = SURFACE;
  engine.applyAction({ type: 'move', delta: MOVE_STEP });
  if (tank.x !== CANVAS_WIDTH - TANK_WIDTH / 2 || tank.fuel !== START_FUEL - 2) {
    fail(`right boundary resolution x=${tank.x}, fuel=${tank.fuel}`);
  }
}

// A >4px terrain rise or drop is impassable.
{
  const engine = freshEngine();
  const state = flatten(engine);
  const tank = state.tanks[0];
  setColumnSurface(state, tank.x + 1, SURFACE - 5);
  engine.applyAction({ type: 'move', delta: MOVE_STEP });
  if (tank.x !== 300 || tank.fuel !== START_FUEL) fail('tank climbed a five-pixel wall');

  setColumnSurface(state, tank.x + 1, SURFACE + 5);
  engine.applyAction({ type: 'move', delta: MOVE_STEP });
  if (tank.x !== 300 || tank.fuel !== START_FUEL) fail('tank dropped down a five-pixel cliff');
}

// Another living tank blocks the candidate footprint.
{
  const engine = freshEngine();
  const state = flatten(engine);
  const tank = state.tanks[0];
  state.tanks[1].x = tank.x + TANK_WIDTH + 3;
  state.tanks[1].y = SURFACE;
  engine.applyAction({ type: 'move', delta: MOVE_STEP });
  if (tank.x !== 303 || tank.fuel !== START_FUEL - 3) {
    fail(`tank collision should allow 3px then stop; x=${tank.x}, fuel=${tank.fuel}`);
  }
}

// Dead, buried, off-phase, and off-turn tanks cannot move.
{
  const cases = [
    (state) => { state.tanks[0].alive = false; },
    (state) => { state.tanks[0].buried = true; },
    (state) => { state.phase = 'FIRING'; },
    (state) => { state.activePlayerId = 'p2'; },
  ];
  for (const arrange of cases) {
    const engine = freshEngine();
    const state = flatten(engine);
    const tank = state.tanks[0];
    arrange(state);
    engine.applyAction({ type: 'move', delta: MOVE_STEP });
    if (tank.x !== 300 || tank.fuel !== START_FUEL) {
      fail('a gated tank moved or spent fuel');
    }
  }
}

// Fuel Tank purchase uses canonical economy and is turn-neutral.
{
  const engine = freshEngine({ armsLevel: 3 });
  const state = flatten(engine);
  const tank = state.tanks[0];
  tank.credits = FUEL_TANK_PRICE * 2;
  const before = {
    active: state.activePlayerId,
    phase: state.phase,
    turn: state.turn,
  };
  engine.applyAction({ type: 'buy', accessory: 'fuel_tank' });
  if (tank.fuel !== START_FUEL + 100) fail(`Fuel Tank granted ${tank.fuel - START_FUEL}`);
  if (tank.credits !== FUEL_TANK_PRICE) fail(`Fuel Tank left credits=${tank.credits}`);
  if (
    state.activePlayerId !== before.active ||
    state.phase !== before.phase ||
    state.turn !== before.turn
  ) {
    fail('Fuel Tank purchase ended or changed the turn');
  }

  const gated = freshEngine({ armsLevel: 2 });
  const gatedTank = gated.getState().tanks[0];
  gatedTank.credits = FUEL_TANK_PRICE * 2;
  gated.applyAction({ type: 'buy', accessory: 'fuel_tank' });
  if (gatedTank.fuel !== START_FUEL || gatedTank.credits !== FUEL_TANK_PRICE * 2) {
    fail('arms-level 2 accepted the arms-level 3 Fuel Tank');
  }
}

// Fuel resets on a staged fresh round instead of carrying.
{
  const engine = freshEngine({ rounds: 3 });
  const state = engine.getState();
  state.tanks[0].fuel = 7;
  endRoundWithP1(engine);
  const staged = engine.getState();
  if (staged.phase !== 'ROUND_OVER') fail(`expected ROUND_OVER, got ${staged.phase}`);
  if (!staged.tanks.every((tank) => tank.fuel === START_FUEL)) {
    fail(`fresh-round fuel did not reset: ${staged.tanks.map((tank) => tank.fuel)}`);
  }
}

// The sanctioned log translator preserves ordered movement and byte parity.
{
  const a = freshEngine();
  const b = freshEngine();
  flatten(a);
  flatten(b);
  const actions = [
    { type: 'move', delta: 8 },
    { type: 'move', delta: -8 },
    { type: 'move', delta: -3 },
  ];
  for (const action of actions) {
    replayNetworkAction(a, action);
    replayNetworkAction(b, action);
  }
  const snapshot = (engine) => JSON.stringify(
    engine.getState().tanks.map(({ id, x, y, fuel }) => ({ id, x, y, fuel })),
  );
  if (snapshot(a) !== snapshot(b)) fail('ordered movement replay diverged');
  if (a.getState().tanks[0].x !== 297 || a.getState().tanks[0].fuel !== 81) {
    fail(`movement replay landed at x=${a.getState().tanks[0].x}, fuel=${a.getState().tanks[0].fuel}`);
  }
}

if (failed) {
  log('\nMOVEMENT CHECK: FAILED');
  process.exit(1);
}
log('PASS: deterministic fuel-limited movement contract.');
log('\nMOVEMENT CHECK: PASSED');
