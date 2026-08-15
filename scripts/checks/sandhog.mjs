// Deterministic Sandhog contract: ballistic ground contact becomes a bounded,
// fixed-step underground drill, carves a persistent corridor, then detonates.
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { getWeapon } from '../../shared/src/engine/WeaponSystem.ts';
import { ARENA_FLOOR_Y, CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/src/engine/Terrain.ts';

const SEED = 0x5a7d406;
// Leave the full 22-tick drill path above the protected floor. The fixture
// verifies Sandhog's authored tunnel, while separate boundary tests own the
// shared floor contract.
const SURFACE_Y = 280;
const ENTRY_START_Y = SURFACE_Y - 6;
const MAX_TICKS = 10_000;
const PLAYERS = [
  { name: 'P1', color: '#e84d4d' },
  { name: 'P2', color: '#4d8ce8' },
];

let failed = false;
const fail = (message) => {
  failed = true;
  console.log(`FAIL: ${message}`);
};
const pass = (message) => console.log(`PASS: ${message}`);
const check = (condition, message) => {
  if (condition) pass(message);
  else fail(message);
};
const close = (actual, expected, message, epsilon = 1e-8) =>
  check(Math.abs(actual - expected) <= epsilon, `${message} (${actual} ~= ${expected})`);

let SANDHOG;
try {
  SANDHOG = getWeapon('sandhog');
} catch {
  fail('getWeapon("sandhog") is absent');
  console.log('\nSANDHOG CHECK: FAILED');
  process.exit(1);
}

const BURROW = SANDHOG.behavior?.sandhog;
if (BURROW === undefined) {
  fail('sandhog behavior definition is absent');
  console.log('\nSANDHOG CHECK: FAILED');
  process.exit(1);
}

function makeFlatEngine(surfaceY = SURFACE_Y, options = {}) {
  const engine = new GameEngine({
    players: PLAYERS,
    maxPlayers: 2,
    seed: SEED,
    ...options,
  });
  const state = engine.getState();
  state.terrain.fill(0);
  if (surfaceY < CANVAS_HEIGHT) {
    for (let y = surfaceY; y < CANVAS_HEIGHT; y++) {
      state.terrain.fill(1, y * CANVAS_WIDTH, (y + 1) * CANVAS_WIDTH);
    }
  }
  state.terrainVersion++;
  state.tanks[0].x = 60;
  state.tanks[0].y = surfaceY;
  state.tanks[1].x = CANVAS_WIDTH - 60;
  state.tanks[1].y = surfaceY;
  state.tanks.forEach((tank) => {
    tank.health = 100;
    tank.alive = true;
    tank.buried = false;
    tank.shieldHp = 0;
  });
  return engine;
}

function installProjectile(engine, projectile) {
  const state = engine.getState();
  state.phase = 'FIRING';
  state.explosions = [];
  state.lastExplosion = null;
  state.projectiles = [{
    x: projectile.x,
    y: projectile.y,
    vx: projectile.vx,
    vy: projectile.vy,
    weaponType: 'sandhog',
    age: projectile.age ?? 2,
    hasSplit: false,
    bounces: 0,
    ...(projectile.burrowTicksRemaining === undefined
      ? {}
      : { burrowTicksRemaining: projectile.burrowTicksRemaining }),
  }];
  state.projectile = state.projectiles[0];
}

function pixelAt(terrain, x, y) {
  const px = Math.max(0, Math.min(CANVAS_WIDTH - 1, Math.round(x)));
  const py = Math.max(0, Math.min(CANVAS_HEIGHT - 1, Math.round(y)));
  return terrain[py * CANVAS_WIDTH + px];
}

function tickUntilRest(engine) {
  let ticks = 0;
  while (
    (engine.getState().phase === 'FIRING'
      || engine.getState().phase === 'RESOLVING')
    && ticks < MAX_TICKS
  ) {
    engine.tick();
    ticks++;
  }
  if (ticks >= MAX_TICKS) throw new Error('Sandhog did not resolve');
  return ticks;
}

function fingerprint(engine) {
  const state = engine.getState();
  const terrainBytes = Buffer.from(state.terrain).toString('base64');
  return JSON.stringify({
    phase: state.phase,
    turn: state.turn,
    activePlayerId: state.activePlayerId,
    wind: state.wind,
    terrainBytes,
    terrainVersion: state.terrainVersion,
    projectiles: state.projectiles,
    explosions: state.explosions,
    tanks: state.tanks,
    winner: state.winner,
  });
}

// 1. Definition/economy and exact fixed-step constants.
check(SANDHOG.type === 'sandhog', 'catalog exposes the exact sandhog id');
check(SANDHOG.name === 'Sandhog', 'catalog exposes the player-facing Sandhog name');
check(SANDHOG.implemented === true, 'Sandhog is implemented');
check(SANDHOG.price === 16_750, 'Sandhog uses the canonical $16,750 price');
check(SANDHOG.bundleSize === 5, 'Sandhog uses the canonical five-round bundle');
check(SANDHOG.armsLevel === 0, 'Sandhog is available at arms level zero');
check(BURROW.ticks === 22, 'Sandhog burrows for exactly 22 ticks');
close(BURROW.horizontalSpeed, 3.2, 'Sandhog horizontal drill speed is fixed');
close(BURROW.verticalSpeed, 2.4, 'Sandhog downward drill speed is fixed');
check(BURROW.tunnelRadius === 7, 'Sandhog tunnel radius is exactly seven pixels');

// 2. Ground impact converts to a drill without detonating.
const main = makeFlatEngine();
installProjectile(main, { x: 200, y: ENTRY_START_Y, vx: 4, vy: 6 });
main.tick();
const entryState = main.getState();
const entry = entryState.projectiles[0];
check(entryState.phase === 'FIRING', 'ground entry keeps the shot in FIRING');
check(entryState.explosions.length === 0, 'ground entry does not detonate');
check(entryState.projectiles.length === 1, 'ground entry retains one drill projectile');
check(
  entry?.burrowTicksRemaining === BURROW.ticks,
  'ground entry arms the exact fixed burrow budget',
);
close(entry.vx, BURROW.horizontalSpeed, 'right-moving impact fixes a rightward drill vector');
close(entry.vy, BURROW.verticalSpeed, 'ground impact fixes a downward drill vector');

const entryX = entry.x;
const entryY = entry.y;
const initialTerrainVersion = entryState.terrainVersion;
const speed = Math.hypot(BURROW.horizontalSpeed, BURROW.verticalSpeed);
const normalX = -BURROW.verticalSpeed / speed;
const normalY = BURROW.horizontalSpeed / speed;

// 3. Every underground tick moves exactly, clears the corridor, and defers
// collapse until the drill endpoint so the tunnel remains visible.
for (let tick = 1; tick <= BURROW.ticks; tick++) {
  const beforeRemaining = main.getState().projectiles[0].burrowTicksRemaining;
  main.tick();
  const state = main.getState();
  if (tick < BURROW.ticks) {
    const drill = state.projectiles[0];
    close(
      drill.x,
      entryX + BURROW.horizontalSpeed * tick,
      `burrow tick ${tick} has exact x`,
    );
    close(
      drill.y,
      entryY + BURROW.verticalSpeed * tick,
      `burrow tick ${tick} has exact y`,
    );
    check(
      drill.burrowTicksRemaining === BURROW.ticks - tick,
      `burrow tick ${tick} decrements the fixed budget once`,
    );
    check(
      state.terrainVersion === initialTerrainVersion + tick,
      `burrow tick ${tick} bumps terrainVersion exactly once`,
    );
    check(
      pixelAt(state.terrain, drill.x, drill.y) === 0,
      `burrow tick ${tick} clears its drill center`,
    );
    if (tick === 8) {
      check(
        pixelAt(
          state.terrain,
          drill.x + normalX * (BURROW.tunnelRadius - 1),
          drill.y + normalY * (BURROW.tunnelRadius - 1),
        ) === 0,
        'the deep corridor clears through its declared inner radius',
      );
      check(
        pixelAt(
          state.terrain,
          drill.x + normalX * (BURROW.tunnelRadius + 2),
          drill.y + normalY * (BURROW.tunnelRadius + 2),
        ) === 1,
        'the deep corridor does not over-clear beyond its declared radius',
      );
    }
    check(
      beforeRemaining > drill.burrowTicksRemaining,
      `burrow tick ${tick} advances one state cell`,
    );
  }
}

const endpoint = main.getState();
check(endpoint.projectiles.length === 0, 'the drill is consumed at its fixed endpoint');
check(endpoint.explosions.length === 1, 'the fixed endpoint emits one blast');
check(endpoint.explosions[0]?.weaponType === 'sandhog', 'endpoint blast retains Sandhog provenance');
close(
  endpoint.explosions[0].cx,
  entryX + BURROW.horizontalSpeed * BURROW.ticks,
  'endpoint blast x matches the fixed drill path',
);
close(
  endpoint.explosions[0].cy,
  entryY + BURROW.verticalSpeed * BURROW.ticks,
  'endpoint blast y matches the fixed drill path',
);
check(
  endpoint.phase === 'RESOLVING',
  'endpoint hands the carved terrain to the existing animated settle phase',
);

// 4. A target above the endpoint takes damage through intervening terrain.
const covered = makeFlatEngine();
installProjectile(covered, { x: 200, y: ENTRY_START_Y, vx: 4, vy: 6 });
covered.tick();
const coveredEntry = covered.getState().projectiles[0];
const target = covered.getState().tanks[1];
target.x = coveredEntry.x + BURROW.horizontalSpeed * BURROW.ticks;
target.y = SURFACE_Y;
const targetHealthBefore = target.health;
for (let i = 0; i < BURROW.ticks; i++) covered.tick();
check(target.health < targetHealthBefore, 'endpoint blast damages a tank through terrain cover');

// 5. A direct tank contact detonates immediately and never enters drill state.
const direct = makeFlatEngine(ARENA_FLOOR_Y);
const directTarget = direct.getState().tanks[1];
directTarget.x = 203;
directTarget.y = 210;
installProjectile(direct, { x: 195, y: 203, vx: 8, vy: 0 });
direct.tick();
check(direct.getState().projectiles.length === 0, 'direct tank contact consumes the shell');
check(direct.getState().explosions.length === 1, 'direct tank contact emits one blast');
check(
  direct.getState().explosions[0]?.impactType === 'tank',
  'direct tank contact retains tank impact material',
);

// 6. A boundary truncates safely at the last in-bounds drill position.
const boundary = makeFlatEngine();
installProjectile(boundary, { x: 1180, y: ENTRY_START_Y, vx: 7, vy: 6 });
boundary.tick();
let boundaryTicks = 0;
while (boundary.getState().phase === 'FIRING' && boundaryTicks < BURROW.ticks) {
  boundary.tick();
  boundaryTicks++;
}
const boundaryBlast = boundary.getState().explosions[0];
check(boundaryTicks < BURROW.ticks, 'right boundary ends the drill before its full budget');
check(
  boundaryBlast?.cx >= 0 && boundaryBlast?.cx < CANVAS_WIDTH,
  'boundary endpoint blast stays inside horizontal bounds',
);
check(
  boundaryBlast?.cy >= 0 && boundaryBlast?.cy <= CANVAS_HEIGHT,
  'boundary endpoint blast stays inside vertical bounds',
);

// 7. The implicit bottom floor terminates at the last in-bounds point instead
// of arming a drill whose entry point already escaped below the battlefield.
const floorBoundary = makeFlatEngine(ARENA_FLOOR_Y);
installProjectile(floorBoundary, { x: 600, y: ARENA_FLOOR_Y - 10, vx: 0, vy: 20 });
floorBoundary.tick();
const floorBoundaryState = floorBoundary.getState();
const floorBoundaryBlast = floorBoundaryState.explosions[0];
check(
  floorBoundaryState.projectiles.length === 0,
  'bottom-floor contact consumes the shell instead of arming an out-of-bounds drill',
);
check(
  floorBoundaryBlast?.cy >= 0 && floorBoundaryBlast?.cy < ARENA_FLOOR_Y,
  'bottom-floor endpoint blast stays strictly inside vertical bounds',
);
check(
  floorBoundaryBlast?.cx >= 0 && floorBoundaryBlast?.cx < CANVAS_WIDTH,
  'bottom-floor endpoint blast stays strictly inside horizontal bounds',
);

// 8. Clone and future evolution remain identical mid-burrow.
const original = makeFlatEngine();
installProjectile(original, { x: 200, y: ENTRY_START_Y, vx: -4, vy: 6 });
original.tick();
for (let i = 0; i < 6; i++) original.tick();
const cloned = original.clone();
tickUntilRest(original);
tickUntilRest(cloned);
check(
  fingerprint(original) === fingerprint(cloned),
  'mid-burrow clone preserves the complete future evolution',
);

// 9. A Sandhog endpoint can decide both a single-round match and one round of
// a multi-round match through the normal resolution state machine.
function endpointKill(rounds) {
  const engine = makeFlatEngine(ARENA_FLOOR_Y, { rounds });
  const state = engine.getState();
  const victim = state.tanks[1];
  victim.x = 603.2;
  victim.y = ARENA_FLOOR_Y;
  victim.health = 1;
  installProjectile(engine, {
    x: 600,
    y: ARENA_FLOOR_Y - 10.4,
    vx: BURROW.horizontalSpeed,
    vy: BURROW.verticalSpeed,
    burrowTicksRemaining: 1,
  });
  tickUntilRest(engine);
  return engine.getState();
}

const singleRoundKill = endpointKill(1);
check(singleRoundKill.phase === 'GAME_OVER', 'lethal endpoint ends a single-round match');
check(singleRoundKill.winner === 'p1', 'single-round endpoint credits the sole survivor');
check(
  singleRoundKill.tanks.find((tank) => tank.id === 'p1')?.roundWins === 1,
  'single-round endpoint records the round win',
);

const multiRoundKill = endpointKill(3);
check(
  multiRoundKill.phase === 'ROUND_OVER',
  'lethal endpoint opens the between-round shop in a multi-round match',
);
check(multiRoundKill.round === 2, 'lethal endpoint advances a multi-round match to round two');
check(
  multiRoundKill.tanks.find((tank) => tank.id === 'p1')?.roundWins === 1,
  'multi-round endpoint carries the round win into the fresh roster',
);
check(
  multiRoundKill.tanks.every((tank) => tank.alive && tank.health === 100),
  'multi-round endpoint resets both tanks for the next round',
);

// 10. The real action path spends one round, resolves, and replays byte-identically.
function actionRun() {
  const engine = new GameEngine({
    players: PLAYERS,
    maxPlayers: 2,
    seed: SEED,
  });
  const actions = [
    { type: 'select_weapon', weapon: 'sandhog' },
    { type: 'set_angle', angle: 90 },
    { type: 'set_power', power: 30 },
    { type: 'fire' },
  ];
  actions.forEach((action) => engine.applyAction(action));
  const afterFire = engine.getState();
  check(afterFire.phase === 'FIRING', 'real action path launches Sandhog');
  check(
    afterFire.tanks[0].inventory.sandhog.count === 0,
    'real action path spends exactly one starting Sandhog',
  );
  tickUntilRest(engine);
  return engine;
}

const actionA = actionRun();
const actionB = actionRun();
check(actionA.getState().turn === 1, 'resolved Sandhog advances exactly one turn');
check(
  actionA.getState().explosions.some((event) => event.weaponType === 'sandhog'),
  'real action path reaches a Sandhog endpoint blast',
);
check(
  fingerprint(actionA) === fingerprint(actionB),
  'same seed and Sandhog action log replay byte-identically',
);

if (failed) {
  console.log('\nSANDHOG CHECK: FAILED');
  process.exit(1);
}
console.log('\nSANDHOG CHECK: PASSED');
