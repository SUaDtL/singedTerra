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
  if (!failed) log('PASS: unprotected 48px settlement applies 24 damage');
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
  if (!failed) log('PASS: one parachute reduces 48px settlement damage to 6 and is consumed');
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
  if (!failed) log('PASS: lethal fall kills during resolution');
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
  if (!failed) log('PASS: parachute purchase grants one unit and charges catalog price');
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
  if (!failed) log('PASS: safe fall causes no damage and retains parachute');
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
  if (!failed) log('PASS: unprotected replay snapshots agree');
}

// These two focused groups reuse the pinned physical fixture between falls.
// This is an explicit test setup boundary, not a naturally chained match or a
// complete persisted action log. The same engine retains health, inventory,
// accessories, credits, turn count, and RNG state; only terrain, positions, wind,
// and the active shooting seat are restaged. No private engine method is called.
function physicalFixture(engine) {
  const state = engine.getState();
  return {
    terrain: state.terrain.slice(),
    positions: state.tanks.map(({ x, y }) => ({ x, y })),
    wind: state.wind,
    shooter: state.tanks[0].id,
  };
}

function restagePhysicalFixture(engine, fixture) {
  const state = engine.getState();
  if (state.phase !== 'PLAYER_TURN' || state.projectiles.length !== 0) {
    throw new Error('physical restaging requires a completed, non-terminal shot');
  }
  state.terrain.set(fixture.terrain);
  state.terrainVersion++; // Invalidate the engine's derived surface-height cache.
  state.tanks.forEach((tank, index) => Object.assign(tank, fixture.positions[index]));
  state.wind = fixture.wind;
  state.activePlayerId = fixture.shooter;
}

// A consumed parachute cannot protect a later qualifying fall on the same tank.
{
  const engine = fresh();
  grant(engine, 2);
  const tank = engine.getState().tanks[1];
  tank.accessories.parachute = 1;
  const fixture = physicalFixture(engine);
  const credits = tank.credits;

  fireToResolving(engine);
  const firstImpact = { health: tank.health, y: tank.y };
  resolve(engine);
  if (firstImpact.health !== 100 || tank.y - firstImpact.y !== 48) {
    fail('the first lifecycle fall must begin at 100 health and settle exactly 48px');
  }
  if (tank.health !== 94 || !tank.alive || tank.accessories.parachute !== 0) {
    fail('the first lifecycle fall must leave 94 health and consume the only parachute');
  }

  // Recreate only the physical drop: retain the actual post-fall 94 health,
  // consumed protection, remaining Riot Bomb, and unchanged target credits.
  restagePhysicalFixture(engine, fixture);
  if (tank.health !== 94 || tank.accessories.parachute !== 0 || tank.credits !== credits
      || engine.getState().tanks[0].inventory.riot_bomb.count !== 1) {
    fail('restaging must preserve the first fall result, inventory, and credits');
  }
  fireToResolving(engine);
  const secondImpact = { health: tank.health, y: tank.y };
  resolve(engine);
  if (secondImpact.health !== 94 || tank.y - secondImpact.y !== 48) {
    fail('the later lifecycle fall must begin at 94 health and settle exactly 48px');
  }
  if (tank.health !== 70 || secondImpact.health - tank.health !== 24 || !tank.alive
      || tank.accessories.parachute !== 0 || tank.credits !== credits
      || engine.getState().tanks[0].inventory.riot_bomb.count !== 0) {
    fail('the later qualifying fall must apply 24 unprotected damage without restoring a parachute');
  }
  if (!failed) log('PASS: subsequent qualifying fall after consumption applies unprotected damage');
}

// A real purchase and both fall results agree through two distinct public paths:
// direct GameEngine.applyAction and the shipped replayNetworkAction translator.
// The arranged P2 purchase turn and physical restaging are fixture boundaries;
// this does not claim transport, persistence, or a naturally occurring match.
{
  const direct = fresh();
  const replay = fresh();
  const engines = [direct, replay];
  engines.forEach((engine) => grant(engine, 2));
  const fixtures = engines.map(physicalFixture);
  const snapshots = (engine) => JSON.stringify({
    phase: engine.getState().phase,
    activePlayerId: engine.getState().activePlayerId,
    wind: engine.getState().wind,
    tanks: engine.getState().tanks.map((tank) => ({
      x: tank.x, y: tank.y, health: tank.health, alive: tank.alive,
      inventory: tank.inventory, accessories: tank.accessories, credits: tank.credits,
    })),
  });

  // Arrange P2 as the actual current buyer; PLAYER_TURN does not honor tankId.
  for (const engine of engines) {
    const state = engine.getState();
    state.activePlayerId = state.tanks[1].id;
    state.tanks[1].credits = PARACHUTE_PRICE + 17;
    if (state.tanks[1].accessories.parachute !== 0) fail('purchase fixture must start with no parachute');
  }
  if (!direct.applyAction({ type: 'buy', accessory: 'parachute' })) {
    fail('direct public parachute purchase must be accepted');
  }
  replayNetworkAction(replay, { type: 'buy', accessory: 'parachute' });
  for (const engine of engines) {
    const state = engine.getState();
    const tank = state.tanks[1];
    if (tank.credits !== 17 || tank.accessories.parachute !== 1 || tank.health !== 100
        || state.phase !== 'PLAYER_TURN' || state.activePlayerId !== tank.id) {
      fail('public purchase must debit exactly the catalog price, grant one parachute, and retain the buyer turn');
    }
  }
  if (snapshots(direct) !== snapshots(replay)) fail('direct and replay purchased states diverged');

  for (const [fall, beforeHealth, afterHealth, damage] of [[1, 100, 94, 6], [2, 94, 70, 24]]) {
    engines.forEach((engine, index) => restagePhysicalFixture(engine, fixtures[index]));
    for (const engine of engines) {
      const tank = engine.getState().tanks[1];
      if (tank.health !== beforeHealth || tank.accessories.parachute !== (fall === 1 ? 1 : 0)
          || tank.credits !== 17 || engine.getState().tanks[0].inventory.riot_bomb.count !== 3 - fall) {
        fail(`purchased lifecycle fall ${fall} setup must retain health, paid inventory, credits, and ammunition`);
      }
    }

    fireToResolving(direct); // This path calls only public engine actions.
    replayNetworkAction(replay, { type: 'fire', angle: DROP.angle, power: DROP.power, weapon: DROP.weapon });
    let ticks = 0;
    while (replay.getState().phase === 'FIRING' && ticks < MAX_TICKS) {
      replay.tick();
      ticks++;
    }
    if (ticks >= MAX_TICKS || replay.getState().phase !== 'RESOLVING') {
      throw new Error(`purchased replay fall ${fall} never entered RESOLVING`);
    }
    const impacts = engines.map((engine) => ({
      health: engine.getState().tanks[1].health,
      y: engine.getState().tanks[1].y,
    }));
    engines.forEach(resolve);
    engines.forEach((engine, index) => {
      const state = engine.getState();
      const tank = state.tanks[1];
      if (impacts[index].health !== beforeHealth || tank.y - impacts[index].y !== 48
          || tank.health !== afterHealth || impacts[index].health - tank.health !== damage
          || !tank.alive || tank.accessories.parachute !== 0 || tank.credits !== 17
          || state.tanks[0].inventory.riot_bomb.count !== 2 - fall || state.phase !== 'PLAYER_TURN') {
        fail(`purchased lifecycle fall ${fall} must settle 48px for ${damage} damage, leave ${afterHealth} health, and retain the purchase debit`);
      }
    });
    if (snapshots(direct) !== snapshots(replay)
        || !direct.getState().terrain.every((pixel, index) => pixel === replay.getState().terrain[index])) {
      fail(`direct and replay purchased lifecycle diverged after fall ${fall}`);
    }
  }
  if (!failed) log('PASS: purchased parachute lifecycle matches direct engine and replay execution');
}

if (failed) process.exit(1);
log('PASS: deterministic collapse fall damage, one-use parachute protection, and live/replay parity.');
