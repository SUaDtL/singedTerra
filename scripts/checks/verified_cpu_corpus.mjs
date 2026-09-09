import assert from 'node:assert/strict'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import { GRAVITY } from '../../shared/src/engine/Physics.ts'
import {
  VERIFIED_DUEL_CPU_MAX_PROBES,
  VERIFIED_DUEL_CPU_SIMULATION_TICKS,
  VERIFIED_DUEL_MAX_WIND,
  selectVerifiedCpuFire,
} from '../../shared/src/net/verifiedDuel.ts'
import { selectVerifiedCpuFireV3 } from '../../shared/src/net/verifiedCpuPolicyV3.ts'

const SEEDS = Array.from({ length: 32 }, (_, seed) => seed)
const HUMAN_OPENING = Object.freeze({ angle: 45, power: 50 })
const policyVersion = process.argv.includes('--policy=3') ? 3 : 2

const VERIFIED_CONFIG = Object.freeze({
  maxPlayers: 2,
  players: [
    { name: 'Commander', color: '#e84d4d' },
    { name: 'CPU', color: '#4d8ce8', ai: 'hard' },
  ],
    maxWind: VERIFIED_DUEL_MAX_WIND,
    gravity: GRAVITY,
    walls: 'open',
    hazards: 'none',
    rounds: 1,
    interestRate: 0,
    suddenDeathTurn: 0,
    armsLevel: 0,
    teamMode: false,
    starterWeaponFalloff: 'decisive',
    rulesetVersion: 4,
})

function options(seed) {
  return { ...VERIFIED_CONFIG, seed }
}

function settle(engine) {
  let ticks = 0
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    engine.tick()
    ticks += 1
    assert.ok(ticks < 5_000, 'corpus settlement exceeded diagnostic bound')
  }
  return ticks
}

function runSeed(seed) {
  const engine = new GameEngine(options(seed))
  const human = engine.getState().tanks.find((tank) => !tank.ai)
  const cpu = engine.getState().tanks.find((tank) => tank.ai)
  assert.ok(human && cpu)
  const targetHealthBeforeOpening = cpu.health
  assert.equal(engine.getState().activePlayerId, human.id)
  engine.applyAction({ type: 'set_angle', angle: HUMAN_OPENING.angle })
  engine.applyAction({ type: 'set_power', power: HUMAN_OPENING.power })
  assert.equal(engine.applyAction({ type: 'fire' }), true)
  const humanTicks = settle(engine)
  const afterHuman = engine.getState()
  const cpuAfterHuman = afterHuman.tanks.find((tank) => tank.id === cpu.id)
  const humanDamage = targetHealthBeforeOpening - (cpuAfterHuman?.health ?? targetHealthBeforeOpening)
  assert.equal(afterHuman.phase, 'PLAYER_TURN')
  assert.equal(afterHuman.activePlayerId, cpu.id)

  const choice = policyVersion === 3 ? selectVerifiedCpuFireV3(engine) : selectVerifiedCpuFire(engine)
  assert.ok(choice.probeCount <= VERIFIED_DUEL_CPU_MAX_PROBES)
  assert.ok(choice.simulationTicks <= VERIFIED_DUEL_CPU_SIMULATION_TICKS)
  const humanHealthBeforeCpuShot = afterHuman.tanks.find((tank) => tank.id === human.id)?.health ?? 0
  const cpuHealthBeforeShot = afterHuman.tanks.find((tank) => tank.id === cpu.id)?.health ?? 0
  engine.applyAction({ type: 'select_weapon', weapon: 'baby_missile' })
  engine.applyAction({ type: 'set_angle', angle: choice.angle })
  engine.applyAction({ type: 'set_power', power: choice.power })
  assert.equal(engine.applyAction({ type: 'fire' }), true)
  const cpuTicks = settle(engine)
  const afterCpu = engine.getState()
  const humanAfterCpu = afterCpu.tanks.find((tank) => tank.id === human.id)
  const cpuAfterCpu = afterCpu.tanks.find((tank) => tank.id === cpu.id)
  const cpuDamage = humanHealthBeforeCpuShot - (humanAfterCpu?.health ?? humanHealthBeforeCpuShot)
  const selfDamage = cpuHealthBeforeShot - (cpuAfterCpu?.health ?? cpuHealthBeforeShot)
  return {
    seed,
    humanOpening: HUMAN_OPENING,
    humanOpeningResult: {
      ticks: humanTicks,
      damageToCpu: humanDamage,
    },
    cpuChoice: {
      angle: choice.angle,
      power: choice.power,
      weapon: choice.weapon,
      probeCount: choice.probeCount,
      simulationTicks: choice.simulationTicks,
      coarseBest: choice.coarseBest,
    },
    cpuResult: {
      ticks: cpuTicks,
      damageToHuman: cpuDamage,
      selfDamage,
      phase: afterCpu.phase,
    },
  }
}

function generateCorpus() {
  const corpus = SEEDS.map(runSeed)
  return {
  schema: `verified-cpu-v${policyVersion}-corpus`,
  generatedBy: 'scripts/checks/verified_cpu_corpus.mjs',
  contractVersion: policyVersion,
  engineVersion: policyVersion,
  rulesetVersion: 4,
  input: {
    seeds: '0..31',
    humanOpening: HUMAN_OPENING,
    config: VERIFIED_CONFIG,
  },
  seeds: corpus,
  maxima: {
    probeCount: Math.max(...corpus.map(({ cpuChoice }) => cpuChoice.probeCount)),
    simulationTicks: Math.max(...corpus.map(({ cpuChoice }) => cpuChoice.simulationTicks)),
    humanOpeningTicks: Math.max(...corpus.map(({ humanOpeningResult }) => humanOpeningResult.ticks)),
    cpuTicks: Math.max(...corpus.map(({ cpuResult }) => cpuResult.ticks)),
  },
  }
}

const output = generateCorpus()
assert.deepEqual(generateCorpus(), output, 'verified CPU corpus generation must repeat exactly')

const fixtureUrl = new URL(`./fixtures/verified_cpu_v${policyVersion}.json`, import.meta.url)
if (process.argv.includes('--generate')) {
  console.log(JSON.stringify(output, null, 2))
} else {
  const fixture = JSON.parse(await (await import('node:fs/promises')).readFile(fixtureUrl, 'utf8'))
  assert.deepEqual(output, fixture, 'verified CPU corpus differs from pinned fixture; use --generate only after review')
  if (policyVersion === 3) {
    const v2Fixture = JSON.parse(await (await import('node:fs/promises')).readFile(
      new URL('./fixtures/verified_cpu_v2.json', import.meta.url), 'utf8',
    ))
    assert.ok(output.maxima.simulationTicks <= v2Fixture.maxima.simulationTicks)
    assert.equal(output.seeds.filter(({ cpuResult }) => cpuResult.damageToHuman > 0).length, 12)
    assert.equal(output.seeds.filter(({ cpuResult }) => cpuResult.selfDamage > 0).length, 0)
    assert.ok(output.seeds.every(({ cpuResult }) => cpuResult.damageToHuman > 0 || cpuResult.selfDamage === 0))
  }
  console.log(JSON.stringify({ kind: 'verified-cpu-corpus-pass', seeds: output.seeds.length, maxima: output.maxima }))
}
