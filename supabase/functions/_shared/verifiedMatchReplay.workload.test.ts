import { GameEngine } from '../../../shared/src/engine/GameEngine.ts'
import { replayNetworkAction } from '../../../shared/src/net/replay.ts'
import type { WeaponType } from '../../../shared/src/engine/WeaponSystem.ts'
import {
  replayVerifiedTranscript,
  VERIFIED_REPLAY_MAX_ACTIONS,
  VERIFIED_REPLAY_MAX_TICKS,
  VERIFIED_REPLAY_MAX_TICKS_PER_TURN,
  VERIFIED_REPLAY_MAX_TURN_ACTIONS,
} from './verifiedMatchReplay.ts'
import { VERIFIED_REPLAY_PROBE_FIXTURES } from './verifiedReplayProbeFixture.ts'

function assertDeepFrozen(value: unknown, path: string): void {
  if (typeof value !== 'object' || value === null) return
  if (!Object.isFrozen(value)) throw new Error(`${path} must be frozen`)
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${path}.${key}`)
}

Deno.test('verified replay probe fixture graph is immutable at runtime', () => {
  assertDeepFrozen(VERIFIED_REPLAY_PROBE_FIXTURES, 'fixtures')
})

Deno.test('verified replay probe fixture graph matches its reviewed canonical digest', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(VERIFIED_REPLAY_PROBE_FIXTURES))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const actual = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
  const expected = '6de7dc423d2493d4b1e58dbe2c3c331dcbbcc279b700549fc026f003f33380ab'
  if (actual !== expected) throw new Error(`fixture digest drifted: ${actual}`)
})

const CONFIG = {
  engineVersion: 1,
  rulesetVersion: 3,
  options: {
    players: [
      { name: 'P1', color: '#e84d4d' },
      { name: 'P2', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 0x7a17b00c,
    maxWind: 10,
    gravity: 0.15,
    walls: 'open',
    hazards: 'none',
    rounds: 1,
    interestRate: 0,
    suddenDeathTurn: 0,
    armsLevel: 4,
    teamMode: false,
    starterWeaponFalloff: 'decisive',
  },
} as const

const MISSILE = { type: 'fire' as const, angle: 90, power: 8, weapon: 'missile' }
const TERMINAL_CASES = [
  {
    name: 'bouncing-betty',
    first: { type: 'fire' as const, angle: 25, power: 14, weapon: 'bouncing_betty' },
    missiles: 3,
    winner: 'p1',
    ticks: 293,
  },
  {
    name: 'dirt-bomb',
    first: { type: 'fire' as const, angle: 15, power: 100, weapon: 'dirt_bomb' },
    missiles: 3,
    winner: 'p1',
    ticks: 167,
  },
  {
    name: 'riot-bomb',
    first: { type: 'fire' as const, angle: 60, power: 45, weapon: 'riot_bomb' },
    missiles: 3,
    winner: 'p1',
    ticks: 186,
  },
  {
    name: 'sandhog',
    first: { type: 'fire' as const, angle: 90, power: 30, weapon: 'sandhog' },
    missiles: 3,
    winner: 'p1',
    ticks: 202,
  },
] as const

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY
}

Deno.test('verified replay terrain-work fixtures remain deterministic and below the local CPU target', () => {
  const measurements: Record<string, { medianMs: number; maxTurnTicks: number }> = {}
  for (const scenario of TERMINAL_CASES) {
    const transcript = [
      scenario.first,
      ...Array.from({ length: scenario.missiles }, () => MISSILE),
    ]
    const timings: number[] = []
    let maxTurnTicks = 0
    for (let iteration = 0; iteration < 7; iteration += 1) {
      const startedAt = performance.now()
      const result = replayVerifiedTranscript(CONFIG, transcript)
      timings.push(performance.now() - startedAt)
      maxTurnTicks = Math.max(maxTurnTicks, result.maxTurnTickCount)
      if (result.winner !== scenario.winner || result.tickCount !== scenario.ticks) {
        throw new Error(`${scenario.name} replay drifted: ${JSON.stringify(result)}`)
      }
    }
    measurements[scenario.name] = { medianMs: median(timings), maxTurnTicks }
  }

  const slowest = Math.max(...Object.values(measurements).map(({ medianMs }) => medianMs))
  const peakTurnTicks = Math.max(...Object.values(measurements).map(({ maxTurnTicks }) => maxTurnTicks))
  console.log(JSON.stringify({ kind: 'verified-replay-local-median-ms', measurements }))
  if (slowest >= 100) throw new Error(`local replay median ${slowest.toFixed(2)}ms exceeds 100ms target`)
  if (peakTurnTicks !== VERIFIED_REPLAY_MAX_TICKS_PER_TURN) {
    throw new Error(`measured peak ${peakTurnTicks} does not reach the accepted per-turn ceiling`)
  }
})

function selfShots(count: number) {
  return Array.from({ length: count }, () => MISSILE)
}

Deno.test('verified replay covers exact best-of-three and four-seat team lifecycle transcripts', () => {
  const multiRoundConfig = {
    ...CONFIG,
    options: { ...CONFIG.options, rounds: 3 },
  }
  const multiRound = replayVerifiedTranscript(multiRoundConfig, [
    ...selfShots(3),
    { type: 'next_round' },
    ...selfShots(3),
  ])
  if (
    multiRound.winner !== 'p2'
    || multiRound.winnerTeam !== null
    || multiRound.turn !== 5
    || multiRound.tickCount !== 190
  ) throw new Error(`multi-round replay drifted: ${JSON.stringify(multiRound)}`)

  const { config: teamConfig, transcript: maximumTranscript } = VERIFIED_REPLAY_PROBE_FIXTURES.maximumLifecycle
  const timings: number[] = []
  const heapBefore = Deno.memoryUsage().heapUsed
  let team = replayVerifiedTranscript(teamConfig, maximumTranscript)
  for (let iteration = 0; iteration < 7; iteration += 1) {
    const startedAt = performance.now()
    team = replayVerifiedTranscript(teamConfig, maximumTranscript)
    timings.push(performance.now() - startedAt)
  }
  const heapDelta = Deno.memoryUsage().heapUsed - heapBefore
  if (
    team.winner !== 'p2'
    || team.winnerTeam !== 2
    || team.turn !== 13
    || team.tickCount !== 448
    || team.actionCount !== VERIFIED_REPLAY_MAX_ACTIONS
  ) throw new Error(`team replay drifted: ${JSON.stringify(team)}`)
  if (VERIFIED_REPLAY_MAX_TURN_ACTIONS !== 14 || VERIFIED_REPLAY_MAX_TICKS !== 448) {
    throw new Error('maximum accepted workload constants exceed the measured terminal fixture')
  }
  console.log(JSON.stringify({
    kind: 'verified-replay-maximum-accepted-workload',
    actions: team.actionCount,
    turnActions: 14,
    ticks: team.tickCount,
    maxTurnTicks: team.maxTurnTickCount,
    medianMs: median(timings),
    heapDelta,
  }))
})

Deno.test('verified replay accepts exactly 448 total ticks and rejects a 447-tick budget', () => {
  const { config: teamConfig, transcript: maximumTranscript } = VERIFIED_REPLAY_PROBE_FIXTURES.maximumLifecycle
  const accepted = replayVerifiedTranscript(teamConfig, maximumTranscript, { maxTicks: 448 })
  if (accepted.tickCount !== 448) {
    throw new Error(`exact total-tick ceiling drifted: ${JSON.stringify(accepted)}`)
  }

  let code = ''
  try {
    replayVerifiedTranscript(teamConfig, maximumTranscript, { maxTicks: 447 })
  } catch (error) {
    code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  }
  if (code !== 'tick_limit') throw new Error(`447-tick budget returned ${JSON.stringify(code)}`)
})

Deno.test('verified replay accepts exactly 198 ticks in one turn and rejects a 197-tick budget', () => {
  const { config, transcript } = VERIFIED_REPLAY_PROBE_FIXTURES.maximumTurn
  const accepted = replayVerifiedTranscript(config, transcript, { maxTicksPerTurn: 198 })
  if (accepted.maxTurnTickCount !== 198) {
    throw new Error(`exact per-turn ceiling drifted: ${JSON.stringify(accepted)}`)
  }

  let code = ''
  try {
    replayVerifiedTranscript(config, transcript, { maxTicksPerTurn: 197 })
  } catch (error) {
    code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  }
  if (code !== 'turn_tick_limit') throw new Error(`197-tick turn budget returned ${JSON.stringify(code)}`)
})

const MAX_COST_OPTIONS = {
  players: [
    { name: 'P1', color: '#e84d4d', team: 1 as const },
    { name: 'P2', color: '#4d8ce8', team: 2 as const },
    { name: 'P3', color: '#4de884', team: 1 as const },
    { name: 'P4', color: '#e8c44d', team: 2 as const },
  ],
  maxPlayers: 4,
  seed: 0x1a3,
  maxWind: 10,
  gravity: 0.15,
  walls: 'reflective' as const,
  hazards: 'lava' as const,
  rounds: 3,
  interestRate: 0.5,
  suddenDeathTurn: 50,
  armsLevel: 4,
  teamMode: true,
  starterWeaponFalloff: 'decisive' as const,
  rulesetVersion: 3 as const,
}

const PREMIUM_COST_CASES = [
  ['deaths_head', 75, 50, 112],
  ['hot_napalm', 30, 75, 179],
] as const

Deno.test('four-seat premium weapon cost probes fit one fixed turn budget without changing production inventory', () => {
  const measurements: Record<string, { elapsedMs: number; ticks: number; heapDelta: number }> = {}
  for (const [weapon, angle, power, expectedTicks] of PREMIUM_COST_CASES) {
    const engine = new GameEngine(MAX_COST_OPTIONS)
    const tank = engine.getState().tanks[0]
    if (!tank) throw new Error('missing active tank')

    // Test-only inventory seeding isolates the production engine's maximum-cost
    // execution path. The verifier itself still accepts only earned/bought ammo.
    tank.inventory[weapon as WeaponType].count = 1
    const heapBefore = Deno.memoryUsage().heapUsed
    const startedAt = performance.now()
    replayNetworkAction(engine, { type: 'fire', angle, power, weapon })
    let ticks = 0
    while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
      if (ticks >= VERIFIED_REPLAY_MAX_TICKS_PER_TURN) {
        throw new Error(`${weapon} exceeded the production per-turn ceiling`)
      }
      engine.tick()
      ticks += 1
    }
    if (ticks !== expectedTicks) {
      throw new Error(`${weapon} tick cost drifted: expected ${expectedTicks}, got ${ticks}`)
    }
    measurements[weapon] = {
      elapsedMs: performance.now() - startedAt,
      ticks,
      heapDelta: Deno.memoryUsage().heapUsed - heapBefore,
    }
  }

  console.log(JSON.stringify({ kind: 'verified-replay-premium-cost', measurements }))
  const slowest = Math.max(...Object.values(measurements).map(({ elapsedMs }) => elapsedMs))
  if (slowest >= 100) throw new Error(`premium path ${slowest.toFixed(2)}ms exceeds 100ms target`)
})
