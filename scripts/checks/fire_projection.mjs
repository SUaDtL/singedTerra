// Regression contract for the napalm fire projection.
//
// GameEngine keeps its mutation-friendly fire Map private and publishes a
// sorted state.fire array to renderers and lockstep serializers. A burn usually
// spends several ticks changing only cell life. Those decay-only ticks must
// update the existing projection in place instead of allocating and sorting an
// equivalent array; topology changes (ignite, spread, expiry) must replace it.
// The trace digest pins the player-visible deterministic state while this
// allocation path is optimized.

import { createHash } from 'node:crypto';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const EXPECTED_TRACE_DIGEST = '2f86c04e39e1f4d5bb916df6e4bc6b05649c54a1ffa673df9e3278eb34636466';

function projectionEngine() {
  return new GameEngine({
    players: [
      { name: 'P1', color: '#e84d4d' },
      { name: 'P2', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 0x5eed1234,
  });
}

function expectRebuiltProjection(label, published, authoritative) {
  const engine = projectionEngine();
  engine.getState().fire = published;
  engine.fire = new Map(authoritative);
  const before = engine.getState().fire;

  engine.syncFire();

  const after = engine.getState().fire;
  const expected = [...authoritative]
    .map(([x, life]) => ({ x, life }))
    .sort((a, b) => a.x - b.x);
  if (after === before) throw new Error(`${label} reused an invalid projection`);
  if (JSON.stringify(after) !== JSON.stringify(expected)) {
    throw new Error(`${label} did not rebuild a sorted authoritative projection`);
  }
}

// Equal cardinality is not equal topology: length-only reuse would retain x=10
// and omit x=30. The other two cases kill removal of the sorted-order guard.
expectRebuiltProjection(
  'equal-cardinality key swap',
  [{ x: 10, life: 5 }, { x: 20, life: 4 }],
  [[20, 3], [30, 2]],
);
expectRebuiltProjection(
  'disordered projection',
  [{ x: 30, life: 2 }, { x: 20, life: 3 }],
  [[20, 3], [30, 2]],
);
expectRebuiltProjection(
  'duplicate projection',
  [{ x: 20, life: 3 }, { x: 20, life: 3 }],
  [[20, 3], [30, 2]],
);
expectRebuiltProjection(
  'null projection',
  null,
  [[20, 3], [30, 2]],
);
expectRebuiltProjection(
  'null projection cell',
  [{ x: 20, life: 3 }, null],
  [[20, 3], [30, 2]],
);
console.log('projection recovery: 5/5 topology guards rebuilt sorted authoritative state');

const engine = projectionEngine();

engine.applyAction({ type: 'select_weapon', weapon: 'napalm' });
engine.applyAction({ type: 'set_angle', angle: 65 });
engine.applyAction({ type: 'set_power', power: 40 });
engine.applyAction({ type: 'fire' });

const trace = [];
let decayOnlyTicks = 0;
let stableDecayProjections = 0;
let topologyChanges = 0;
let replacedTopologyProjections = 0;

for (let tick = 1; tick <= 10_000; tick++) {
  const beforeRef = engine.getState().fire;
  const before = beforeRef.map(({ x, life }) => ({ x, life }));

  engine.tick();

  const state = engine.getState();
  const after = state.fire;
  trace.push({
    phase: state.phase,
    fire: after.map(({ x, life }) => [x, life]),
    health: state.tanks.map(({ health }) => health),
  });

  const sameColumns = before.length === after.length
    && before.every(({ x }, index) => after[index]?.x === x);
  const pureDecay = before.length > 0
    && sameColumns
    && before.every(({ life }, index) => after[index]?.life === life - 1);
  const topologyChanged = !sameColumns;

  if (pureDecay) {
    decayOnlyTicks++;
    if (after === beforeRef) stableDecayProjections++;
  }
  if (topologyChanged) {
    topologyChanges++;
    if (after !== beforeRef) replacedTopologyProjections++;
  }

  if (state.phase !== 'FIRING' && state.projectiles.length === 0 && after.length === 0) break;
  if (tick === 10_000) throw new Error('napalm projection check exceeded 10,000 ticks');
}

const digest = createHash('sha256').update(JSON.stringify(trace)).digest('hex');
console.log(`fire projection trace: ${digest}`);
console.log(`decay-only ticks: ${stableDecayProjections}/${decayOnlyTicks} reused projection`);
console.log(`topology changes: ${replacedTopologyProjections}/${topologyChanges} replaced projection`);

if (digest !== EXPECTED_TRACE_DIGEST) {
  throw new Error(`fire projection trace changed: expected ${EXPECTED_TRACE_DIGEST}, got ${digest}`);
}
if (decayOnlyTicks === 0) throw new Error('fixture produced no decay-only fire ticks');
if (stableDecayProjections !== decayOnlyTicks) {
  throw new Error(`${decayOnlyTicks - stableDecayProjections} decay-only fire ticks rebuilt the projection`);
}
if (topologyChanges === 0) throw new Error('fixture produced no fire topology changes');
if (replacedTopologyProjections !== topologyChanges) {
  throw new Error(`${topologyChanges - replacedTopologyProjections} topology changes reused a stale projection`);
}
