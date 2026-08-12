import assert from 'node:assert/strict'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import { MAX_FLIGHT_TICKS } from '../../shared/src/engine/Physics.ts'
import { CANVAS_HEIGHT, COLLAPSE_PX_PER_TICK } from '../../shared/src/engine/Terrain.ts'
import {
  VERIFIED_DUEL_ALLOWED_SEEDS,
  VERIFIED_DUEL_CPU_MAX_PROBES,
  VERIFIED_DUEL_CPU_SIMULATION_TICKS,
  VERIFIED_DUEL_LIVE_TICKS_PER_SALVO,
  VERIFIED_DUEL_LIVE_TICKS_TOTAL,
  VERIFIED_DUEL_SETTLE_TICKS,
  VERIFIED_DUEL_SWEEP_SAMPLES_PER_TICK,
  VERIFIED_DUEL_SWEPT_SAMPLES,
  adjudicateVerifiedDuelCap,
  VerifiedDuelController,
  createVerifiedDuelOptions,
  replayVerifiedDuel,
  selectVerifiedCpuFire,
} from '../../shared/src/net/verifiedDuel.ts'

assert.deepEqual(VERIFIED_DUEL_ALLOWED_SEEDS, [17, 42, 73, 109])
assert.equal(MAX_FLIGHT_TICKS, 240)
assert.equal(CANVAS_HEIGHT, 600)
assert.equal(COLLAPSE_PX_PER_TICK, 4)
assert.equal(VERIFIED_DUEL_CPU_MAX_PROBES, 60)
assert.equal(VERIFIED_DUEL_SETTLE_TICKS, Math.ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK) + 1)
assert.equal(VERIFIED_DUEL_LIVE_TICKS_PER_SALVO, MAX_FLIGHT_TICKS + VERIFIED_DUEL_SETTLE_TICKS)
assert.equal(VERIFIED_DUEL_LIVE_TICKS_TOTAL, VERIFIED_DUEL_LIVE_TICKS_PER_SALVO * 12)
assert.equal(VERIFIED_DUEL_CPU_SIMULATION_TICKS, VERIFIED_DUEL_CPU_MAX_PROBES * MAX_FLIGHT_TICKS * 6)
assert.equal(VERIFIED_DUEL_SWEPT_SAMPLES, 2_073_600)
assert.equal(VERIFIED_DUEL_SWEEP_SAMPLES_PER_TICK, 24)

assert.throws(
  () => new VerifiedDuelController(new GameEngine(createVerifiedDuelOptions(42)), 17),
  /private_verified_duel_controller_constructor/,
)

for (const seed of VERIFIED_DUEL_ALLOWED_SEEDS) {
  const options = createVerifiedDuelOptions(seed)
  assert.equal(options.seed, seed)
  assert.equal(options.players?.[0]?.ai, undefined)
  assert.equal(options.players?.[1]?.ai, 'hard')
  const game = new GameEngine(options)
  game.getState().activePlayerId = game.getState().tanks[1].id
  const first = selectVerifiedCpuFire(game)
  const second = selectVerifiedCpuFire(game)
  assert.deepEqual(first, second)
  assert.equal(first.weapon, 'baby_missile')
  assert.ok(first.probeCount <= 60)
  assert.equal(new Set(first.probes.map(({ angle, power }) => `${angle}:${power}`)).size, first.probes.length)
  const expectedLeftAngles = [90, 105, 120, 135, 150, 165, 175]
  assert.deepEqual(first.probes.slice(0, 35), expectedLeftAngles.flatMap((angle) =>
    [20, 40, 60, 80, 100].map((power) => ({ angle, power }))))

  const rightGame = new GameEngine(options)
  rightGame.getState().tanks[0].ai = 'hard'
  rightGame.getState().tanks[1].ai = undefined
  const right = selectVerifiedCpuFire(rightGame)
  assert.deepEqual(right.probes.slice(0, 35), [5, 20, 35, 50, 65, 80, 90].flatMap((angle) =>
    [20, 40, 60, 80, 100].map((power) => ({ angle, power }))))
  const refinement = right.probes.slice(35)
  const expectedRefinement = [-6, -3, 0, 3, 6].flatMap((angleOffset) =>
    [-8, -4, 0, 4, 8].map((powerOffset) => ({
      angle: Math.max(0, Math.min(180, right.coarseBest.angle + angleOffset)),
      power: Math.max(0, Math.min(100, right.coarseBest.power + powerOffset)),
    }))).filter((shot, index, all) =>
      !right.probes.slice(0, 35).some((coarse) => coarse.angle === shot.angle && coarse.power === shot.power)
      && all.findIndex((candidate) => candidate.angle === shot.angle && candidate.power === shot.power) === index)
  assert.deepEqual(refinement, expectedRefinement)

  const noResult = new GameEngine(options)
  noResult.getState().activePlayerId = 'missing'
  assert.deepEqual(selectVerifiedCpuFire(noResult), {
    angle: 90, power: 20, weapon: 'baby_missile', probeCount: 0, simulationTicks: 0, probes: [],
    coarseBest: { angle: 90, power: 20 },
  })
}

const capState = new GameEngine(createVerifiedDuelOptions(17)).getState()
const [human, cpu] = capState.tanks
human.alive = true; cpu.alive = true
human.health = 80; cpu.health = 70
assert.deepEqual(adjudicateVerifiedDuelCap(capState), { outcome: 'human_win', winnerId: human.id, reason: 'health' })
cpu.health = 80; human.totalDamage = 12; cpu.totalDamage = 20
assert.deepEqual(adjudicateVerifiedDuelCap(capState), { outcome: 'cpu_win', winnerId: cpu.id, reason: 'total_damage' })
human.totalDamage = 20
assert.deepEqual(adjudicateVerifiedDuelCap(capState), { outcome: 'draw', winnerId: null, reason: 'draw' })
human.alive = false
assert.deepEqual(adjudicateVerifiedDuelCap(capState), { outcome: 'cpu_win', winnerId: cpu.id, reason: 'alive' })
human.alive = true; cpu.alive = false
assert.deepEqual(adjudicateVerifiedDuelCap(capState), { outcome: 'human_win', winnerId: human.id, reason: 'alive' })
cpu.alive = true; human.health = 60; cpu.health = 80
assert.deepEqual(adjudicateVerifiedDuelCap(capState), { outcome: 'cpu_win', winnerId: cpu.id, reason: 'health' })
human.health = 80; human.totalDamage = 30; cpu.totalDamage = 20
assert.deepEqual(adjudicateVerifiedDuelCap(capState), { outcome: 'human_win', winnerId: human.id, reason: 'total_damage' })
capState.phase = 'GAME_OVER'; capState.winner = human.id
assert.deepEqual(adjudicateVerifiedDuelCap(capState), { outcome: 'human_win', winnerId: human.id, reason: 'terminal' })
capState.winner = cpu.id
assert.deepEqual(adjudicateVerifiedDuelCap(capState), { outcome: 'cpu_win', winnerId: cpu.id, reason: 'terminal' })
capState.winner = null
assert.deepEqual(adjudicateVerifiedDuelCap(capState), { outcome: 'draw', winnerId: null, reason: 'terminal' })

const replayA = replayVerifiedDuel(17, Array.from({ length: 6 }, () => ({ angle: 0, power: 5 })))
const replayB = replayVerifiedDuel(17, Array.from({ length: 6 }, () => ({ angle: 0, power: 5 })))
assert.deepEqual(replayA, replayB)
assert.ok(replayA.humanSalvos <= 6)
assert.ok(replayA.cpuSalvos <= 6)
assert.ok(replayA.liveTicks <= VERIFIED_DUEL_LIVE_TICKS_TOTAL)
assert.ok(replayA.cpuSimulationTicks <= VERIFIED_DUEL_CPU_SIMULATION_TICKS)
assert.throws(
  () => replayVerifiedDuel(17, Array.from({ length: 6 }, () => ({ angle: 90, power: 8 }))),
  /trailing_verified_duel_action/,
)
for (let length = 1; length <= 5; length += 1) {
  assert.throws(
    () => replayVerifiedDuel(17, Array.from({ length }, () => ({ angle: 0, power: 5 }))),
    /incomplete_verified_duel/,
  )
}
for (const { seed, length, angle, power } of [
  { seed: 17, length: 3, angle: 45, power: 0 },
  { seed: 42, length: 4, angle: 45, power: 0 },
  { seed: 17, length: 5, angle: 20, power: 20 },
]) {
  const earlyTerminal = replayVerifiedDuel(seed, Array.from({ length }, () => ({ angle, power })))
  assert.equal(earlyTerminal.reason, 'terminal')
  assert.equal(earlyTerminal.humanSalvos, length)
}

const incremental = VerifiedDuelController.create(17)
for (const shot of Array.from({ length: 6 }, () => ({ angle: 0, power: 5 }))) {
  assert.equal(incremental.applyHumanAction({ type: 'set_angle', angle: shot.angle }), true)
  assert.equal(incremental.applyHumanAction({ type: 'set_power', power: shot.power }), true)
  assert.equal(incremental.applyHumanAction({ type: 'fire' }), true)
  let ticks = 0
  while (!incremental.complete && incremental.engine.getState().phase !== 'PLAYER_TURN' && ticks < 5_000) {
    incremental.tick(); ticks += 1
  }
  assert.ok(ticks < 5_000)
}
assert.equal(JSON.stringify(incremental.result()), JSON.stringify(replayA))
assert.ok(incremental.engine.getState().terrainVersion > 0)
assert.equal(incremental.result().maximumProbeCount, 59)

let exhaustiveCases = 0
let measuredMaxTicks = 0
let measuredMaxDisplacement = 0
for (const seed of VERIFIED_DUEL_ALLOWED_SEEDS) {
  for (let angle = 0; angle <= 180; angle += 1) {
    for (let power = 0; power <= 100; power += 1) {
      const game = new GameEngine(createVerifiedDuelOptions(seed))
      game.applyAction({ type: 'set_angle', angle })
      game.applyAction({ type: 'set_power', power })
      assert.equal(game.applyAction({ type: 'fire' }), true)
      let ticks = 0
      let previous = game.getState().projectile && { x: game.getState().projectile.x, y: game.getState().projectile.y }
      while (game.getState().phase === 'FIRING' || game.getState().phase === 'RESOLVING') {
        game.tick(); ticks += 1
        const projectile = game.getState().projectile
        if (projectile && previous) measuredMaxDisplacement = Math.max(
          measuredMaxDisplacement,
          Math.hypot(projectile.x - previous.x, projectile.y - previous.y),
        )
        previous = projectile && { x: projectile.x, y: projectile.y }
        assert.ok(ticks <= VERIFIED_DUEL_LIVE_TICKS_PER_SALVO)
      }
      measuredMaxTicks = Math.max(measuredMaxTicks, ticks)
      exhaustiveCases += 1
    }
  }
}
assert.equal(exhaustiveCases, 73_124)
assert.ok(measuredMaxDisplacement < 24)

const workloadTimes = []
const adversarialCorpus = [
  [17, 0, 5], [42, 45, 20], [73, 90, 20], [109, 180, 20],
]
for (const [seed, angle, power] of adversarialCorpus) {
  const started = performance.now()
  const result = replayVerifiedDuel(seed, Array.from({ length: 6 }, () => ({ angle, power })))
  assert.equal(result.cpuSalvos, 6)
  assert.ok(result.maximumProbeCount >= 59)
  workloadTimes.push(performance.now() - started)
}
workloadTimes.sort((a, b) => a - b)
assert.ok(workloadTimes.at(-1) < 100, `verified duel corpus max ${workloadTimes.at(-1)}ms exceeded 100ms`)

console.log(JSON.stringify({ kind: 'verified-duel-pass', exhaustiveCases, measuredMaxTicks, measuredMaxDisplacement, medianMs: workloadTimes[2] }))
