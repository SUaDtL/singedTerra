// Regression contract for deterministic terrain-collapse fall damage and the
// one-use Parachute accessory. The fixture uses a deterministic Riot Bomb crater
// that remains above the protected arena floor on seed 0x1a3.

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { PARACHUTE_PRICE } from '../../shared/src/engine/WeaponSystem.ts';
import { replayNetworkAction } from '../../shared/src/net/replay.ts';

const SEED = 0x1a3;
const COLORS = ['#e84d4d', '#4d8ce8'];
const DROP = { angle: 35, power: 100, weapon: 'riot_bomb' };
const MAX_TICKS = 100_000;
let failed = false;
const fail = (message) => { failed = true; console.log(`FAIL: ${message}`); };
const log = (...args) => console.log(...args);

function fresh() {
  return new GameEngine({
    players: [{ name: 'P1', color: COLORS[0] }, { name: 'P2', color: COLORS[1] }],
    maxPlayers: 2,
    seed: SEED,
  });
}

function grant(engine, count) {
  const tank = engine.getState().tanks[0];
  tank.inventory.riot_bomb = { count, unlimited: false };
}

function fireToResolving(engine) {
  engine.applyAction({ type: 'select_weapon', weapon: DROP.weapon });
  engine.applyAction({ type: 'set_angle', angle: DROP.angle });
  engine.applyAction({ type: 'set_power', power: DROP.power });
  engine.applyAction({ type: 'fire' });
  let ticks = 0;
  while (engine.getState().phase === 'FIRING' && ticks < MAX_TICKS) {
    engine.tick();
    ticks++;
  }
  if (ticks >= MAX_TICKS || engine.getState().phase !== 'RESOLVING') {
    throw new Error(`fall-damage fixture never entered RESOLVING (phase=${engine.getState().phase})`);
  }
}

function resolve(engine) {
  let ticks = 0;
  while (engine.getState().phase === 'RESOLVING' && ticks < MAX_TICKS) {
    engine.tick();
    ticks++;
  }
  if (ticks >= MAX_TICKS) throw new Error('fall-damage fixture never resolved');
}

function fire(engine) {
  fireToResolving(engine);
  resolve(engine);
}

// Unprotected long drop: the old behavior leaves P2 at full health.
{
  const engine = fresh();
  grant(engine, 1);
  const before = { ...engine.getState().tanks[1] };
  fireToResolving(engine);
  const impact = { ...engine.getState().tanks[1] };
  resolve(engine);
  const tank = engine.getState().tanks[1];
  const drop = tank.y - impact.y;
  const expectedDamage = Math.floor(Math.max(0, drop - 32) * 1.5);
  log(`[fall] flight health ${before.health}->${impact.health}, settle y ${impact.y}->${tank.y}, settle health ${impact.health}->${tank.health}`);
  if (impact.health !== before.health) fail(`Riot Bomb must not deal direct damage before settlement (got ${before.health - impact.health})`);
  if (drop !== 48) fail(`fixture must induce the pinned 48px settlement drop (got ${drop})`);
  if (impact.health - tank.health !== expectedDamage || expectedDamage !== 24) {
    fail(`fall damage must follow the explicit formula (expected ${expectedDamage}, got ${impact.health - tank.health})`);
  }
}

// Parachute protects the same fall and is consumed exactly once.
{
  const engine = fresh();
  grant(engine, 1);
  engine.getState().tanks[1].accessories.parachute = 1;
  fireToResolving(engine);
  const impact = { ...engine.getState().tanks[1] };
  resolve(engine);
  const tank = engine.getState().tanks[1];
  const drop = tank.y - impact.y;
  const expectedDamage = Math.floor(Math.max(0, drop - 32) * 1.5);
  const protectedDamage = Math.floor(expectedDamage / 4);
  if (impact.health !== 100) fail(`Parachute fixture must enter settlement at full health (got ${impact.health})`);
  if (drop !== 48) fail(`Parachute fixture must induce the pinned 48px settlement drop (got ${drop})`);
  if (impact.health - tank.health !== protectedDamage || protectedDamage !== 6) {
    fail(`a parachute should reduce the ${expectedDamage}-point fall to ${protectedDamage} damage, got ${impact.health - tank.health}`);
  }
  if (tank.accessories.parachute !== 0) fail('a used parachute must be consumed exactly once');
}

// A sufficiently deep fall can be lethal; this is direct fall damage, not blast credit.
{
  const engine = fresh();
  grant(engine, 1);
  const tank = engine.getState().tanks[1];
  tank.y = 0;
  fireToResolving(engine);
  const impact = { health: tank.health, alive: tank.alive, y: tank.y };
  resolve(engine);
  if (impact.health !== 100 || !impact.alive) fail('the lethal fixture must enter settlement with an alive undamaged tank');
  if (tank.alive || tank.health !== 0 || tank.y <= impact.y) fail('an extreme terrain fall must kill during resolution, not at blast impact');
}

// The normal buy contract grants exactly one Parachute and charges its catalog price.
{
  const engine = fresh();
  const tank = engine.getState().tanks[0];
  tank.credits = PARACHUTE_PRICE;
  engine.applyAction({ type: 'buy', accessory: 'parachute' });
  if (tank.credits !== 0 || tank.accessories.parachute !== 1) {
    fail(`Parachute purchase should charge ${PARACHUTE_PRICE} and grant one unit`);
  }
}

// A drop within the safe distance is harmless and must not consume protection.
{
  const engine = fresh();
  grant(engine, 1);
  const tank = engine.getState().tanks[1];
  tank.y += 32;
  tank.accessories.parachute = 1;
  fire(engine);
  if (tank.health !== 100) fail('a fall within the safe distance must deal no damage');
  if (tank.accessories.parachute !== 1) fail('a safe fall must not consume a parachute');
}

// Live and replayed action streams must agree byte-for-byte on fall outcomes.
{
  const live = fresh();
  const replay = fresh();
  grant(live, 1);
  grant(replay, 1);
  replayNetworkAction(live, { type: 'fire', angle: DROP.angle, power: DROP.power, weapon: DROP.weapon });
  replayNetworkAction(replay, { type: 'fire', angle: DROP.angle, power: DROP.power, weapon: DROP.weapon });
  let ticks = 0;
  while ((live.getState().phase === 'FIRING' || live.getState().phase === 'RESOLVING') && ticks < MAX_TICKS) {
    live.tick();
    replay.tick();
    ticks++;
  }
  const snapshot = (engine) => JSON.stringify(engine.getState().tanks.map((tank) => ({
    y: tank.y,
    health: tank.health,
    alive: tank.alive,
    accessories: tank.accessories,
  })));
  if (snapshot(live) !== snapshot(replay)) fail('live and replay fall outcomes diverged');
}

if (failed) process.exit(1);
log('PASS: deterministic collapse fall damage, one-use parachute protection, and live/replay parity.');
