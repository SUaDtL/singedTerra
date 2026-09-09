import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import { GRAVITY, MAX_FLIGHT_TICKS } from '../../shared/src/engine/Physics.ts'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/src/engine/Terrain.ts'
import {
  VERIFIED_DUEL_CPU_MAX_PROBES,
  VERIFIED_DUEL_CPU_SIMULATION_TICKS,
  VERIFIED_DUEL_MAX_WIND,
  selectVerifiedCpuFire,
  selectVerifiedCpuFireForPolicy,
  replayVerifiedDuelForPolicy,
  VerifiedDuelController,
  verifiedCpuPolicyForTuple,
} from '../../shared/src/net/verifiedDuel.ts'
import { selectVerifiedCpuFireV3 } from '../../shared/src/net/verifiedCpuPolicyV3.ts'

const fixture = JSON.parse(await readFile(new URL('./fixtures/verified_cpu_v3.json', import.meta.url), 'utf8'))
const replayFixture = JSON.parse(await readFile(new URL('./fixtures/verified_cpu_replays.json', import.meta.url), 'utf8'))
const options = (seed) => ({ ...fixture.input.config, seed })

function settle(engine) {
  let ticks = 0
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    engine.tick(); ticks += 1
    assert.ok(ticks < 5_000)
  }
}

function afterOpening(seed) {
  const engine = new GameEngine(options(seed))
  engine.applyAction({ type: 'set_angle', angle: 45 })
  engine.applyAction({ type: 'set_power', power: 50 })
  assert.equal(engine.applyAction({ type: 'fire' }), true)
  settle(engine)
  return engine
}

function applyCpuShot(engine, shot) {
  const state = engine.getState()
  const cpu = state.tanks.find((tank) => tank.ai)
  const human = state.tanks.find((tank) => !tank.ai)
  assert.ok(cpu && human)
  const before = { cpu: cpu.health, human: human.health }
  engine.applyAction({ type: 'select_weapon', weapon: 'baby_missile' })
  engine.applyAction({ type: 'set_angle', angle: shot.angle })
  engine.applyAction({ type: 'set_power', power: shot.power })
  assert.equal(engine.applyAction({ type: 'fire' }), true)
  settle(engine)
  return {
    opponentDamage: before.human - engine.getState().tanks.find((tank) => tank.id === human.id).health,
    selfDamage: before.cpu - engine.getState().tanks.find((tank) => tank.id === cpu.id).health,
  }
}

assert.equal(verifiedCpuPolicyForTuple({ contractVersion: 2, engineVersion: 2, rulesetVersion: 4 }), 2)
assert.equal(verifiedCpuPolicyForTuple({ contractVersion: 3, engineVersion: 3, rulesetVersion: 4 }), 3)
for (const tuple of [
  undefined,
  null,
  {},
  { contractVersion: 3.5, engineVersion: 3, rulesetVersion: 4 },
  { contractVersion: 3, engineVersion: 2, rulesetVersion: 4 },
  { contractVersion: 2, engineVersion: 3, rulesetVersion: 4 },
  { contractVersion: 3, engineVersion: 3, rulesetVersion: 5 },
  { contractVersion: 4, engineVersion: 4, rulesetVersion: 4 },
  { contractVersion: 3, engineVersion: 3, rulesetVersion: 4, extra: true },
]) assert.throws(() => verifiedCpuPolicyForTuple(tuple), /unsupported_verified_replay_version/)
assert.throws(() => VerifiedDuelController.createForPolicy(999, 4), /unsupported_verified_cpu_policy/)
assert.throws(() => replayVerifiedDuelForPolicy(999, [], 4), /unsupported_verified_cpu_policy/)
assert.deepEqual(replayVerifiedDuelForPolicy(17, replayFixture.transcript, 2), replayFixture.policies['2'])
assert.deepEqual(replayVerifiedDuelForPolicy(17, replayFixture.transcript, 3), replayFixture.policies['3'])

for (const seed of [0, 17, 31]) {
  const engine = afterOpening(seed)
  assert.deepEqual(selectVerifiedCpuFireForPolicy(engine, 2), selectVerifiedCpuFire(engine))
  assert.deepEqual(selectVerifiedCpuFireForPolicy(engine, 3), selectVerifiedCpuFireV3(engine))
}
assert.throws(() => selectVerifiedCpuFireForPolicy(afterOpening(17), 1), /unsupported_verified_cpu_policy/)

const harmful = afterOpening(17)
const v2Result = applyCpuShot(harmful.clone(), selectVerifiedCpuFire(harmful))
const v3 = selectVerifiedCpuFireV3(harmful)
const v3Result = applyCpuShot(harmful.clone(), v3)
assert.equal(v2Result.opponentDamage, 0)
assert.ok(v2Result.selfDamage > 32)
assert.deepEqual(v3Result, { opponentDamage: 0, selfDamage: 0 })

const reachable = afterOpening(0)
const reachablePlan = selectVerifiedCpuFireV3(reachable)
const reachableResult = applyCpuShot(reachable.clone(), reachablePlan)
assert.ok(reachableResult.opponentDamage > 32)
assert.equal(reachableResult.selfDamage, 0)

for (const wind of [-VERIFIED_DUEL_MAX_WIND, VERIFIED_DUEL_MAX_WIND]) {
  const engine = afterOpening(7)
  engine.getState().wind = wind
  const first = selectVerifiedCpuFireV3(engine)
  assert.deepEqual(first, selectVerifiedCpuFireV3(engine))
  assert.ok(first.probeCount <= VERIFIED_DUEL_CPU_MAX_PROBES)
  assert.ok(first.simulationTicks <= VERIFIED_DUEL_CPU_SIMULATION_TICKS)
  const outcome = applyCpuShot(engine.clone(), first)
  const expected = wind === -VERIFIED_DUEL_MAX_WIND
    ? { choice: { angle: 120, power: 100 }, outcome: { opponentDamage: 32.305598591683406, selfDamage: 0 } }
    : { choice: { angle: 153, power: 100 }, outcome: { opponentDamage: 0, selfDamage: 0 } }
  assert.deepEqual({ choice: { angle: first.angle, power: first.power }, outcome }, expected)
  assert.ok(outcome.opponentDamage > 0 || outcome.selfDamage === 0)
}

const obstructed = afterOpening(9)
const [left, right] = [...obstructed.getState().tanks].sort((a, b) => a.x - b.x)
const wallX = Math.round((left.x + right.x) / 2)
for (let y = 0; y < CANVAS_HEIGHT; y += 1) obstructed.getState().terrain[y * CANVAS_WIDTH + wallX] = 1
obstructed.getState().terrainVersion += 1
const obstructedPlan = selectVerifiedCpuFireV3(obstructed)
assert.deepEqual(obstructedPlan, selectVerifiedCpuFireV3(obstructed))
assert.ok(obstructedPlan.probeCount <= VERIFIED_DUEL_CPU_MAX_PROBES)
assert.ok(obstructedPlan.simulationTicks <= VERIFIED_DUEL_CPU_SIMULATION_TICKS)
assert.deepEqual(applyCpuShot(obstructed.clone(), obstructedPlan), { opponentDamage: 0, selfDamage: 0 })

const unresolvedState = {
  phase: 'PLAYER_TURN', activePlayerId: 'cpu', projectile: null,
  tanks: [
    { id: 'human', x: 100, y: 400, health: 100 },
    { id: 'cpu', x: 700, y: 400, health: 100 },
  ],
}
const unresolvedEngine = {
  getState: () => unresolvedState,
  clone: () => {
    const state = structuredClone(unresolvedState)
    return {
      getState: () => state,
      applyAction: (action) => {
        if (action.type === 'fire') {
          state.phase = 'FIRING'
          state.projectile = { x: 700, y: 400 }
        }
        return true
      },
      tick: () => undefined,
    }
  },
}
const unresolvedPlan = selectVerifiedCpuFireV3(unresolvedEngine)
assert.equal(unresolvedPlan.probeCount, 59)
assert.equal(unresolvedPlan.simulationTicks, unresolvedPlan.probeCount * MAX_FLIGHT_TICKS)
assert.deepEqual({ angle: unresolvedPlan.angle, power: unresolvedPlan.power }, { angle: 90, power: 20 })

const mixedEngine = {
  getState: () => unresolvedState,
  clone: () => {
    const state = structuredClone(unresolvedState)
    let selected = { angle: 90, power: 20 }
    return {
      getState: () => state,
      applyAction: (action) => {
        if (action.type === 'set_angle') selected.angle = action.angle
        if (action.type === 'set_power') selected.power = action.power
        if (action.type === 'fire') {
          state.phase = 'FIRING'
          state.projectile = selected.angle === 90 && selected.power === 20
            ? { x: 100, y: 400 }
            : { x: 700, y: 400 }
        }
        return true
      },
      tick: () => {
        if (selected.angle !== 90 || selected.power !== 20) {
          state.phase = 'PLAYER_TURN'
          state.projectile = null
        }
      },
    }
  },
}
const mixedPlan = selectVerifiedCpuFireV3(mixedEngine)
assert.deepEqual({ angle: mixedPlan.angle, power: mixedPlan.power }, { angle: 90, power: 40 })

console.log(JSON.stringify({
  kind: 'verified-cpu-policy-pass',
  harmful: { v2: v2Result, v3: v3Result, choice: { angle: v3.angle, power: v3.power } },
  reachable: { ...reachableResult, choice: { angle: reachablePlan.angle, power: reachablePlan.power } },
  maxima: fixture.maxima,
}))
