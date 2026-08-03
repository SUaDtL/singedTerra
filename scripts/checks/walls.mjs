/**
 * Reflective sidewall contract through the real engine and AI simulation paths.
 */
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { simulateImpact } from '../../shared/src/engine/AiShotSearch.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/src/engine/Terrain.ts';
import {
  MAX_FLIGHT_TICKS,
  WALL_INSET,
  wrapSideWall,
} from '../../shared/src/engine/Physics.ts';

let passed = 0;
let failed = 0;

function check(condition, label, detail = '') {
  if (condition) {
    passed++;
    console.log(`PASS: ${label}`);
  } else {
    failed++;
    console.error(`FAIL: ${label}${detail ? ` (${detail})` : ''}`);
  }
}

function projectile(overrides = {}) {
  return {
    x: 1,
    y: 80,
    vx: -4,
    vy: 0,
    weaponType: 'missile',
    age: 8,
    hasSplit: true,
    bounces: 0,
    ...overrides,
  };
}

function engineWith(walls, p) {
  const engine = new GameEngine({ seed: 0x51de, walls });
  const state = engine.getState();
  state.phase = 'FIRING';
  state.wind = 0;
  state.explosions = [];
  state.lastExplosion = null;
  state.projectiles = [p];
  state.projectile = p;
  return { engine, state };
}

{
  const shot = projectile();
  const { engine, state } = engineWith('open', shot);
  engine.tick();
  check(state.projectiles.length === 0, 'open sidewall keeps the legacy OOB miss');
  check((state.wallImpacts ?? []).length === 0, 'open miss emits no wall contact');
}

for (const side of ['left', 'right']) {
  const shot = projectile({
    x: side === 'left' ? 1 : CANVAS_WIDTH - 1,
    vx: side === 'left' ? -4 : 4,
    vy: 1.15,
  });
  const { engine, state } = engineWith('concrete', shot);
  engine.tick();
  const contact = state.wallImpacts?.[0];
  check(state.projectiles.length === 0, `${side} concrete wall resolves the projectile`);
  check(contact?.side === side, `${side} concrete wall emits its contact`, `contact=${JSON.stringify(contact)}`);
  check(
    state.lastExplosion?.impactType === 'ground',
    `${side} concrete wall detonates through the ground-impact path`,
    `impact=${state.lastExplosion?.impactType}`,
  );
  check(
    state.lastExplosion?.cx === contact?.x && state.lastExplosion?.cy === contact?.y,
    `${side} concrete explosion is centered on the exact wall contact`,
    `explosion=${JSON.stringify(state.lastExplosion)} contact=${JSON.stringify(contact)}`,
  );
  check(
    Math.abs((contact?.y ?? 0) - 80.325) < 1e-9,
    `${side} concrete contact interpolates the exact wall-crossing height`,
    `y=${contact?.y}`,
  );
  const enemy = state.tanks[1];
  enemy.x = side === 'left' ? 20 : CANVAS_WIDTH - 20;
  enemy.y = contact?.y ?? 80;
  const healthBefore = enemy.health;
  const followUp = engineWith('concrete', projectile({
    x: side === 'left' ? 1 : CANVAS_WIDTH - 1,
    vx: side === 'left' ? -4 : 4,
    vy: 0,
  }));
  followUp.state.tanks[1].x = enemy.x;
  followUp.state.tanks[1].y = enemy.y;
  followUp.engine.tick();
  check(
    followUp.state.tanks[1].health < healthBefore,
    `${side} concrete detonation applies nearby damage`,
  );
  check(
    followUp.state.terrainVersion > 0,
    `${side} concrete detonation deforms terrain through the normal blast path`,
  );
}

for (const weaponType of ['bouncing_betty', 'sandhog']) {
  const { engine, state } = engineWith('concrete', projectile({
    x: 1,
    vx: -4,
    weaponType,
    bounces: 3,
  }));
  engine.tick();
  check(state.projectiles.length === 0, `concrete consumes a ${weaponType} at the wall`);
  check(
    state.lastExplosion?.impactType === 'ground',
    `concrete ${weaponType} uses the normal ground blast path`,
  );
}

{
  const shot = projectile();
  const { engine, state } = engineWith('reflective', shot);
  engine.tick();
  check(state.projectiles.length === 1, 'left rail keeps the shot in flight');
  check(shot.x > 0 && shot.x < CANVAS_WIDTH, 'left rail snaps the shot inside', `x=${shot.x}`);
  check(shot.vx > 0, 'left rail reflects horizontal velocity', `vx=${shot.vx}`);
  check(state.wallImpacts?.[0]?.side === 'left', 'left rail emits an authoritative contact');
}

{
  const shot = projectile({ x: CANVAS_WIDTH - 1, vx: 4 });
  const { engine, state } = engineWith('reflective', shot);
  engine.tick();
  check(state.projectiles.length === 1, 'right rail keeps the shot in flight');
  check(shot.x > 0 && shot.x < CANVAS_WIDTH, 'right rail snaps the shot inside', `x=${shot.x}`);
  check(shot.vx < 0, 'right rail reflects horizontal velocity', `vx=${shot.vx}`);
  check(state.wallImpacts?.[0]?.side === 'right', 'right rail emits an authoritative contact');
}

{
  const shot = projectile({
    x: 1,
    y: 80,
    vx: -4,
    vy: 1,
    age: 8,
    hasSplit: true,
    bounces: 2,
  });
  const { engine, state } = engineWith('wrap', shot);
  engine.tick();
  check(state.projectiles.length === 1, 'left wrap keeps the shot in flight');
  check(
    shot.x > CANVAS_WIDTH - 10 && shot.x < CANVAS_WIDTH,
    'left exit enters at the right rail with integrated overshoot',
    `x=${shot.x}`,
  );
  check(
    Math.abs(shot.x - (CANVAS_WIDTH - WALL_INSET - 3)) < 1e-9,
    'left wrap preserves the exact unsampled remainder',
    `x=${shot.x}`,
  );
  check(
    Math.abs(shot.y - 81.15) < 1e-9,
    'left wrap preserves the complete integrated vertical endpoint',
    `y=${shot.y}`,
  );
  check(shot.vx === -4, 'left wrap preserves horizontal velocity', `vx=${shot.vx}`);
  check(shot.age === 9, 'left wrap preserves the advancing flight age', `age=${shot.age}`);
  check(shot.bounces === 2, 'left wrap preserves weapon bounce state', `bounces=${shot.bounces}`);
  check(state.wallImpacts?.[0]?.side === 'left', 'left wrap emits an authoritative contact');
}

{
  const shot = projectile({
    x: CANVAS_WIDTH - 1,
    y: 80,
    vx: 4,
    vy: 1,
  });
  const { engine, state } = engineWith('wrap', shot);
  engine.tick();
  check(state.projectiles.length === 1, 'right wrap keeps the shot in flight');
  check(
    shot.x > 0 && shot.x < 10,
    'right exit enters at the left rail with integrated overshoot',
    `x=${shot.x}`,
  );
  check(
    Math.abs(shot.x - (WALL_INSET + 3)) < 1e-9,
    'right wrap preserves the exact unsampled remainder',
    `x=${shot.x}`,
  );
  check(shot.vx === 4, 'right wrap preserves horizontal velocity', `vx=${shot.vx}`);
  check(state.wallImpacts?.[0]?.side === 'right', 'right wrap emits an authoritative contact');
}

{
  const shot = projectile({ x: 1, y: 80, vx: -4, vy: 0 });
  const { engine, state } = engineWith('wrap', shot);
  state.tanks[1].x = CANVAS_WIDTH - 3;
  state.tanks[1].y = 81;
  engine.tick();
  check(
    state.projectiles.length === 0,
    'wrap resolves an entry-side target in the same fixed tick',
  );
  check(
    state.lastExplosion?.impactType === 'tank',
    'entry-side swept collision preserves the tank impact material',
    `impact=${state.lastExplosion?.impactType}`,
  );
}

for (const side of ['left', 'right']) {
  const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  const entryColumn = side === 'left' ? CANVAS_WIDTH - 1 : 0;
  terrain[80 * CANVAS_WIDTH + entryColumn] = 1;
  const shot = projectile({
    x: side === 'left' ? -2 : CANVAS_WIDTH + 2,
    y: 80,
  });
  const result = wrapSideWall(
    shot,
    {
      type: 'wall',
      side,
      x: side === 'left' ? WALL_INSET : CANVAS_WIDTH - WALL_INSET,
      y: 80,
      remainingX: side === 'left' ? -2 : 2,
      remainingY: 0,
    },
    terrain,
    [],
  );
  check(
    result.type === 'ground',
    `${side} wrap collision-tests the exact paired entry pixel`,
    `result=${JSON.stringify(result)} shot=${JSON.stringify(shot)}`,
  );
}

{
  const shot = projectile({
    vx: -7.25,
    vy: -3.5,
    weaponType: 'mirv',
    age: 37,
    hasSplit: false,
    bounces: 2,
    burrowTicksRemaining: 11,
  });
  const preserved = {
    vx: shot.vx,
    vy: shot.vy,
    weaponType: shot.weaponType,
    age: shot.age,
    hasSplit: shot.hasSplit,
    bounces: shot.bounces,
    burrowTicksRemaining: shot.burrowTicksRemaining,
  };
  wrapSideWall(
    shot,
    {
      type: 'wall',
      side: 'left',
      x: WALL_INSET,
      y: 80,
      remainingX: -2,
      remainingY: -1,
    },
    new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT),
    [],
  );
  check(
    JSON.stringify({
      vx: shot.vx,
      vy: shot.vy,
      weaponType: shot.weaponType,
      age: shot.age,
      hasSplit: shot.hasSplit,
      bounces: shot.bounces,
      burrowTicksRemaining: shot.burrowTicksRemaining,
    }) === JSON.stringify(preserved),
    'wrap preserves every non-position projectile field',
  );
}

{
  const shot = projectile({
    x: 1,
    y: CANVAS_HEIGHT - 1,
    vx: -4,
    vy: 2,
    weaponType: 'sandhog',
  });
  const { engine, state } = engineWith('wrap', shot);
  state.terrain.fill(0);
  engine.tick();
  check(
    state.projectiles.length === 0,
    'a Sandhog that wraps into the floor resolves instead of drilling out of bounds',
    `shot=${JSON.stringify(state.projectiles[0])} impacts=${JSON.stringify(state.wallImpacts)}`,
  );
  check(
    (state.lastExplosion?.cx ?? 0) > CANVAS_WIDTH - 10,
    'wrapped floor endpoint is clamped from the paired entry segment',
    `cx=${state.lastExplosion?.cx}`,
  );
}

{
  function trace(walls) {
    const shot = projectile({ x: CANVAS_WIDTH / 2, vx: 18, vy: -8 });
    const { engine, state } = engineWith(walls, shot);
    for (let i = 0; i < 180 && state.phase === 'FIRING'; i++) engine.tick();
    return {
      contacts: state.wallImpacts,
      projectile: state.projectile,
      phase: state.phase,
      explosions: state.explosions,
    };
  }
  for (const walls of ['reflective', 'wrap']) {
    const a = trace(walls);
    const b = trace(walls);
    check(
      (a.contacts?.length ?? 0) >= 2,
      `one shot can contact ${walls} rails repeatedly`,
    );
    check(
      JSON.stringify(a) === JSON.stringify(b),
      `${walls} multi-contact trace is byte-identical`,
    );
  }
}

{
  for (const walls of ['reflective', 'wrap']) {
    const shot = projectile({ age: MAX_FLIGHT_TICKS - 2 });
    const { engine, state } = engineWith(walls, shot);
    engine.tick();
    engine.tick();
    check(
      state.projectiles.length === 0,
      `flight cap still resolves a ${walls} shot`,
    );
    check(
      state.explosions.length === 1,
      `${walls} flight cap keeps its existing air detonation`,
    );
  }
}

{
  const actions = [
    { type: 'set_angle', angle: 150 },
    { type: 'set_power', power: 90 },
    { type: 'fire' },
  ];
  function replayBank(walls) {
    const engine = new GameEngine({ seed: 0x51de, walls });
    for (const action of actions) engine.applyAction(action);
    for (let tick = 0; tick < MAX_FLIGHT_TICKS + 20 && engine.getState().phase === 'FIRING'; tick++) {
      engine.tick();
    }
    return engine.getState();
  }
  for (const walls of ['reflective', 'wrap', 'concrete']) {
    const first = replayBank(walls);
    const replay = replayBank(walls);
    check(
      first.wallImpacts.length > 0,
      `real applyAction shot contacts a ${walls} rail`,
    );
    check(
      JSON.stringify(first) === JSON.stringify(replay),
      `fresh-engine action replay preserves the complete ${walls} result`,
    );
  }
}

{
  for (const walls of ['reflective', 'wrap']) {
    const shot = projectile();
    const { engine, state } = engineWith(walls, shot);
    engine.tick();
    const clone = engine.clone();
    engine.tick();
    clone.tick();
    check(
      JSON.stringify(engine.getState()) === JSON.stringify(clone.getState()),
      `clone preserves ${walls} mode, contact sequence, and future flight`,
    );
    clone.getState().projectiles[0].x += 10;
    check(
      clone.getState().projectiles[0].x !== state.projectiles[0].x,
      `clone keeps ${walls} projectile state independent`,
    );
  }
}

{
  const first = new GameEngine({ seed: 0x51de, walls: 'concrete' });
  const second = first.clone();
  for (const engine of [first, second]) {
    const state = engine.getState();
    state.projectiles = [projectile()];
    state.projectile = state.projectiles[0];
    state.phase = 'FIRING';
    state.wind = 0;
    engine.tick();
  }
  check(
    JSON.stringify(first.getState()) === JSON.stringify(second.getState()),
    'concrete clone preserves exact wall-contact resolution',
  );
}

{
  const engine = new GameEngine({ seed: 0x51de, walls: 'reflective' });
  const state = engine.getState();
  state.wind = 0;
  const me = { ...state.tanks[0], x: 90, angle: 150, power: 90 };
  const reflected = simulateImpact(
    { ...state, walls: 'reflective', tanks: [me] },
    me,
    me.angle,
    me.power,
    0.15,
  );
  const open = simulateImpact(
    { ...state, walls: 'open', tanks: [me] },
    me,
    me.angle,
    me.power,
    0.15,
  );
  check(open === null, 'AI open-wall probe treats the left exit as a miss');
  check(reflected !== null, 'AI reflective-wall probe follows the bank to impact');
}

{
  const engine = new GameEngine({ seed: 0x51de, walls: 'reflective', gravity: 0.05 });
  const state = engine.getState();
  state.wind = 0;
  const me = { ...state.tanks[0], x: 90, angle: 30, power: 80 };
  const predicted = simulateImpact(
    { ...state, tanks: [me] },
    me,
    me.angle,
    me.power,
    0.05,
  );

  state.tanks[0].x = me.x;
  state.tanks[0].angle = me.angle;
  state.tanks[0].power = me.power;
  engine.applyAction({ type: 'fire' });
  for (let tick = 0; tick < MAX_FLIGHT_TICKS + 20 && state.phase === 'FIRING'; tick++) {
    engine.tick();
  }
  const live = state.explosions.at(-1);
  check(live !== undefined, 'supported low-gravity bank resolves through the live engine');
  check(
    predicted !== null
      && live !== undefined
      && Math.abs(predicted.x - live.cx) < 1e-9
      && Math.abs(predicted.y - live.cy) < 1e-9,
    'AI probe scores the same 240-tick cap detonation as live execution',
    `predicted=${JSON.stringify(predicted)} live=${live ? `${live.cx},${live.cy}` : 'none'}`,
  );
}

{
  const engine = new GameEngine({ seed: 0x51de, walls: 'wrap', gravity: 0.05 });
  const state = engine.getState();
  state.wind = 0;
  const me = { ...state.tanks[0], x: 90, angle: 150, power: 90 };
  const predicted = simulateImpact(
    { ...state, tanks: [me] },
    me,
    me.angle,
    me.power,
    0.05,
  );

  state.tanks[0].x = me.x;
  state.tanks[0].angle = me.angle;
  state.tanks[0].power = me.power;
  engine.applyAction({ type: 'fire' });
  for (let tick = 0; tick < MAX_FLIGHT_TICKS + 20 && state.phase === 'FIRING'; tick++) {
    engine.tick();
  }
  const live = state.explosions.at(-1);
  check(state.wallImpacts.length > 0, 'supported wrap shot crosses a portal in live execution');
  check(live !== undefined, 'supported wrap shot resolves through the live engine');
  check(
    predicted !== null
      && live !== undefined
      && Math.abs(predicted.x - live.cx) < 1e-9
      && Math.abs(predicted.y - live.cy) < 1e-9,
    'AI probe scores the same wrapped endpoint as live execution',
    `predicted=${JSON.stringify(predicted)} live=${live ? `${live.cx},${live.cy}` : 'none'}`,
  );
}

{
  const engine = new GameEngine({ seed: 0x51de, walls: 'concrete', gravity: 0.05 });
  const state = engine.getState();
  state.wind = 0;
  const me = { ...state.tanks[0], x: 90, angle: 150, power: 90 };
  const predicted = simulateImpact(
    { ...state, walls: 'concrete', tanks: [me] },
    me,
    me.angle,
    me.power,
    0.05,
  );

  state.tanks[0].x = me.x;
  state.tanks[0].angle = me.angle;
  state.tanks[0].power = me.power;
  engine.applyAction({ type: 'fire' });
  for (let tick = 0; tick < MAX_FLIGHT_TICKS + 20 && state.phase === 'FIRING'; tick++) {
    engine.tick();
  }
  const live = state.explosions.at(-1);
  check(predicted !== null, 'AI concrete-wall probe predicts the terminating contact');
  check(state.wallImpacts.length > 0, 'supported concrete shot contacts a sidewall in live execution');
  check(live !== undefined, 'supported concrete shot resolves through the live engine');
  check(
    predicted !== null
      && live !== undefined
      && Math.abs(predicted.x - live.cx) < 1e-9
      && Math.abs(predicted.y - live.cy) < 1e-9,
    'AI probe scores the same concrete endpoint as live execution',
    `predicted=${JSON.stringify(predicted)} live=${live ? `${live.cx},${live.cy}` : 'none'}`,
  );
}

{
  const two = new GameEngine({ seed: 0x51de }).getState().tanks;
  check(two[0].angle === 45, 'left tank starts aimed toward its opponent');
  check(two[1].angle === 135, 'right tank starts aimed toward its opponent');

  const three = new GameEngine({
    seed: 0x51de,
    players: [
      { name: 'P1', color: '#e84d4d' },
      { name: 'P2', color: '#4d8ce8' },
      { name: 'P3', color: '#4de87a' },
    ],
  }).getState().tanks;
  check(three[0].angle === 45, 'leftmost multi-seat tank aims at its nearest opponent');
  check(three[1].angle === 135, 'equidistant center tank uses deterministic left tie-break');
  check(three[2].angle === 135, 'rightmost multi-seat tank aims at its nearest opponent');
}

if (failed > 0) {
  console.error(`\nWALL CHECK: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\nWALL CHECK: PASSED (${passed} assertions)`);
