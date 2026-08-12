import { GameEngine } from '../engine/GameEngine.ts'
import type { GameOptions } from '../types/GameOptions.ts'
import type { GameState, TankState } from '../types/GameState.ts'
import type { PlayerAction } from '../types/PlayerAction.ts'
import {
  GRAVITY,
  MAX_FLIGHT_TICKS,
  POWER_SCALE,
  PROJECTILE_DRAG,
  SWEEP_STEP,
  WIND_FACTOR,
} from '../engine/Physics.ts'
import { CANVAS_HEIGHT, COLLAPSE_PX_PER_TICK } from '../engine/Terrain.ts'

export const VERIFIED_DUEL_ALLOWED_SEEDS = Object.freeze([17, 42, 73, 109] as const)
export const VERIFIED_DUEL_MAX_HUMAN_SALVOS = 6
export const VERIFIED_DUEL_CPU_MAX_PROBES = 60
export const VERIFIED_DUEL_MAX_POWER = 100
export const VERIFIED_DUEL_MAX_WIND = 6
export const VERIFIED_DUEL_SETTLE_TICKS = Math.ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK) + 1
export const VERIFIED_DUEL_LIVE_TICKS_PER_SALVO = MAX_FLIGHT_TICKS + VERIFIED_DUEL_SETTLE_TICKS
export const VERIFIED_DUEL_LIVE_TICKS_TOTAL = VERIFIED_DUEL_LIVE_TICKS_PER_SALVO * VERIFIED_DUEL_MAX_HUMAN_SALVOS * 2
export const VERIFIED_DUEL_CPU_SIMULATION_TICKS = VERIFIED_DUEL_CPU_MAX_PROBES * MAX_FLIGHT_TICKS * VERIFIED_DUEL_MAX_HUMAN_SALVOS
const VERIFIED_DUEL_DRAG_RETENTION = 1 - PROJECTILE_DRAG
const VERIFIED_DUEL_MAX_INITIAL_COMPONENT_SPEED = VERIFIED_DUEL_MAX_POWER * POWER_SCALE
const VERIFIED_DUEL_MAX_HORIZONTAL_SPEED = Math.max(
  VERIFIED_DUEL_MAX_INITIAL_COMPONENT_SPEED,
  VERIFIED_DUEL_DRAG_RETENTION * VERIFIED_DUEL_MAX_WIND * WIND_FACTOR / PROJECTILE_DRAG,
)
const VERIFIED_DUEL_MAX_VERTICAL_SPEED = Math.max(
  VERIFIED_DUEL_MAX_INITIAL_COMPONENT_SPEED,
  VERIFIED_DUEL_DRAG_RETENTION * GRAVITY / PROJECTILE_DRAG,
)
export const VERIFIED_DUEL_SWEEP_SAMPLES_PER_TICK = Math.max(
  1,
  Math.ceil(Math.hypot(VERIFIED_DUEL_MAX_HORIZONTAL_SPEED, VERIFIED_DUEL_MAX_VERTICAL_SPEED) / SWEEP_STEP),
)
export const VERIFIED_DUEL_SWEPT_SAMPLES = VERIFIED_DUEL_CPU_SIMULATION_TICKS * VERIFIED_DUEL_SWEEP_SAMPLES_PER_TICK

const VERIFIED_DUEL_CONTROLLER_CONSTRUCTION = Symbol('verified-duel-controller-construction')

export interface VerifiedHumanFire { readonly angle: number; readonly power: number }
export interface VerifiedCpuFire extends VerifiedHumanFire {
  readonly weapon: 'baby_missile'
  readonly probeCount: number
  readonly simulationTicks: number
  readonly probes: readonly VerifiedHumanFire[]
  readonly coarseBest: VerifiedHumanFire
}
export type VerifiedDuelOutcome = 'human_win' | 'cpu_win' | 'draw'
export interface VerifiedDuelAdjudication {
  readonly outcome: VerifiedDuelOutcome
  readonly winnerId: string | null
  readonly reason: 'terminal' | 'alive' | 'health' | 'total_damage' | 'draw'
}
export interface VerifiedDuelReplayResult extends VerifiedDuelAdjudication {
  readonly seed: number
  readonly humanSalvos: number
  readonly cpuSalvos: number
  readonly liveTicks: number
  readonly cpuSimulationTicks: number
  readonly maximumProbeCount: number
  readonly transcript: readonly VerifiedHumanFire[]
}

export function createVerifiedDuelOptions(seed: number): GameOptions {
  if (!(VERIFIED_DUEL_ALLOWED_SEEDS as readonly number[]).includes(seed)) throw new Error('invalid_verified_duel_seed')
  return {
    maxPlayers: 2,
    players: [
      { name: 'Commander', color: '#e84d4d' },
      { name: 'CPU', color: '#4d8ce8', ai: 'hard' },
    ],
    seed, maxWind: VERIFIED_DUEL_MAX_WIND, gravity: GRAVITY, walls: 'open', hazards: 'none', rounds: 1,
    interestRate: 0, suddenDeathTurn: 0, armsLevel: 0, teamMode: false,
    starterWeaponFalloff: 'decisive', rulesetVersion: 3,
  }
}

function settled(state: GameState): boolean { return state.phase !== 'FIRING' && state.phase !== 'RESOLVING' }
function targetFor(state: GameState, shooter: TankState): TankState | undefined {
  return state.tanks.find((tank) => tank.id !== shooter.id)
}

function simulateProbe(engine: GameEngine, shot: VerifiedHumanFire): { score: number; ticks: number } | null {
  const clone = engine.clone()
  const before = clone.getState()
  const shooter = before.tanks.find((tank) => tank.id === before.activePlayerId)
  if (!shooter) return null
  const target = targetFor(before, shooter)
  if (!target) return null
  const priorHealth = target.health
  clone.applyAction({ type: 'select_weapon', weapon: 'baby_missile' })
  clone.applyAction({ type: 'set_angle', angle: shot.angle })
  clone.applyAction({ type: 'set_power', power: shot.power })
  if (!clone.applyAction({ type: 'fire' })) return null
  let ticks = 0
  while (!settled(clone.getState()) && ticks < MAX_FLIGHT_TICKS) { clone.tick(); ticks += 1 }
  const afterTarget = clone.getState().tanks.find((tank) => tank.id === target.id)
  const damage = priorHealth - (afterTarget?.health ?? 0)
  const projectile = clone.getState().projectile
  const proximity = projectile ? Math.abs(projectile.x - target.x) + Math.abs(projectile.y - target.y) : 0
  return { score: damage * 1_000_000 - proximity, ticks }
}

function uniqueShots(shots: readonly VerifiedHumanFire[]): VerifiedHumanFire[] {
  const seen = new Set<string>()
  return shots.filter((shot) => {
    const key = `${shot.angle}:${shot.power}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function selectVerifiedCpuFire(engine: GameEngine): VerifiedCpuFire {
  const state = engine.getState()
  const cpu = state.tanks.find((tank) => tank.id === state.activePlayerId)
  const target = cpu ? targetFor(state, cpu) : undefined
  if (!cpu || !target) return Object.freeze({
    angle: 90, power: 20, weapon: 'baby_missile', probeCount: 0, simulationTicks: 0,
    probes: Object.freeze([]), coarseBest: Object.freeze({ angle: 90, power: 20 }),
  })
  const angles = cpu && target && target.x < cpu.x
    ? [90, 105, 120, 135, 150, 165, 175]
    : [5, 20, 35, 50, 65, 80, 90]
  const coarse = angles.flatMap((angle) => [20, 40, 60, 80, 100].map((power) => ({ angle, power })))
  let simulationTicks = 0
  let best = coarse[0] ?? { angle: 90, power: 20 }
  let bestScore = Number.NEGATIVE_INFINITY
  for (const shot of coarse) {
    const result = simulateProbe(engine, shot)
    simulationTicks += result?.ticks ?? 0
    if (result && result.score > bestScore) { best = shot; bestScore = result.score }
  }
  const coarseBest = Object.freeze({ ...best })
  const refinement = [-6, -3, 0, 3, 6].flatMap((angleOffset) =>
    [-8, -4, 0, 4, 8].map((powerOffset) => ({
      angle: Math.max(0, Math.min(180, best.angle + angleOffset)),
      power: Math.max(0, Math.min(100, best.power + powerOffset)),
    })))
  const probes = uniqueShots([...coarse, ...refinement]).slice(0, VERIFIED_DUEL_CPU_MAX_PROBES)
  for (const shot of probes.slice(coarse.length)) {
    const result = simulateProbe(engine, shot)
    simulationTicks += result?.ticks ?? 0
    if (result && result.score > bestScore) { best = shot; bestScore = result.score }
  }
  if (!Number.isFinite(bestScore)) best = { angle: 90, power: 20 }
  return Object.freeze({
    ...best, weapon: 'baby_missile', probeCount: probes.length, simulationTicks,
    probes: Object.freeze(probes.map((probe) => Object.freeze({ ...probe }))), coarseBest,
  })
}

export function adjudicateVerifiedDuelCap(state: GameState): VerifiedDuelAdjudication {
  const [human, cpu] = state.tanks
  if (!human || !cpu) return { outcome: 'draw', winnerId: null, reason: 'draw' }
  if (state.phase === 'GAME_OVER') {
    const outcome = state.winner === human.id ? 'human_win' : state.winner === cpu.id ? 'cpu_win' : 'draw'
    return { outcome, winnerId: state.winner, reason: 'terminal' }
  }
  if (human.alive !== cpu.alive) return human.alive
    ? { outcome: 'human_win', winnerId: human.id, reason: 'alive' }
    : { outcome: 'cpu_win', winnerId: cpu.id, reason: 'alive' }
  if (human.health !== cpu.health) return human.health > cpu.health
    ? { outcome: 'human_win', winnerId: human.id, reason: 'health' }
    : { outcome: 'cpu_win', winnerId: cpu.id, reason: 'health' }
  if (human.totalDamage !== cpu.totalDamage) return human.totalDamage > cpu.totalDamage
    ? { outcome: 'human_win', winnerId: human.id, reason: 'total_damage' }
    : { outcome: 'cpu_win', winnerId: cpu.id, reason: 'total_damage' }
  return { outcome: 'draw', winnerId: null, reason: 'draw' }
}

export class VerifiedDuelController {
  readonly engine: GameEngine
  private readonly seed: number
  private readonly commitments: VerifiedHumanFire[] = []
  private activeSalvo: 'human' | 'cpu' | null = null
  private currentSalvoTicks = 0
  private humanSalvos = 0
  private cpuSalvos = 0
  private liveTicks = 0
  private cpuSimulationTicks = 0
  private maximumProbeCount = 0
  private completed = false

  static create(seed: number): VerifiedDuelController {
    return new VerifiedDuelController(
      VERIFIED_DUEL_CONTROLLER_CONSTRUCTION,
      new GameEngine(createVerifiedDuelOptions(seed)),
      seed,
    )
  }

  private constructor(construction: symbol, engine: GameEngine, seed: number) {
    if (construction !== VERIFIED_DUEL_CONTROLLER_CONSTRUCTION) {
      throw new Error('private_verified_duel_controller_constructor')
    }
    if (!(VERIFIED_DUEL_ALLOWED_SEEDS as readonly number[]).includes(seed)) throw new Error('invalid_verified_duel_seed')
    this.engine = engine
    this.seed = seed
  }

  get complete(): boolean { return this.completed }

  get transcript(): readonly VerifiedHumanFire[] {
    return Object.freeze(this.commitments.map((entry) => Object.freeze({ ...entry })))
  }

  applyHumanAction(action: PlayerAction): boolean {
    const state = this.engine.getState()
    const active = state.tanks.find((tank) => tank.id === state.activePlayerId)
    if (this.completed || this.activeSalvo !== null || state.phase !== 'PLAYER_TURN' || !active || active.ai) return false
    if (action.type === 'set_angle') {
      return Number.isInteger(action.angle) && action.angle >= 0 && action.angle <= 180
        ? this.engine.applyAction(action)
        : false
    }
    if (action.type === 'set_power') {
      return Number.isInteger(action.power) && action.power >= 0 && action.power <= VERIFIED_DUEL_MAX_POWER
        ? this.engine.applyAction(action)
        : false
    }
    if (action.type !== 'fire' || this.humanSalvos >= VERIFIED_DUEL_MAX_HUMAN_SALVOS) return false
    this.engine.applyAction({ type: 'select_weapon', weapon: 'baby_missile' })
    const shot = Object.freeze({ angle: active.angle, power: active.power })
    if (!this.engine.applyAction(action)) return false
    this.commitments.push(shot)
    this.humanSalvos += 1
    this.activeSalvo = 'human'
    this.currentSalvoTicks = 0
    return true
  }

  tick(): void {
    if (this.completed || this.activeSalvo === null) return
    if (!settled(this.engine.getState())) {
      this.engine.tick()
      this.currentSalvoTicks += 1
      this.liveTicks += 1
      if (this.currentSalvoTicks > VERIFIED_DUEL_LIVE_TICKS_PER_SALVO) throw new Error('verified_duel_salvo_tick_limit')
    }
    if (!settled(this.engine.getState())) return

    const settledSalvo = this.activeSalvo
    this.activeSalvo = null
    this.currentSalvoTicks = 0
    if (this.engine.getState().phase === 'GAME_OVER') {
      this.completed = true
      return
    }
    if (settledSalvo === 'cpu') {
      if (this.cpuSalvos >= VERIFIED_DUEL_MAX_HUMAN_SALVOS) this.completed = true
      return
    }

    const cpu = this.engine.getState().tanks.find((tank) => tank.id === this.engine.getState().activePlayerId)
    if (!cpu?.ai) throw new Error('verified_duel_turn_mismatch')
    const plan = selectVerifiedCpuFire(this.engine)
    this.cpuSimulationTicks += plan.simulationTicks
    this.maximumProbeCount = Math.max(this.maximumProbeCount, plan.probeCount)
    this.engine.applyAction({ type: 'select_weapon', weapon: 'baby_missile' })
    this.engine.applyAction({ type: 'set_angle', angle: plan.angle })
    this.engine.applyAction({ type: 'set_power', power: plan.power })
    if (!this.engine.applyAction({ type: 'fire' })) throw new Error('verified_duel_illegal_cpu_fire')
    this.cpuSalvos += 1
    this.activeSalvo = 'cpu'
  }

  result(): VerifiedDuelReplayResult {
    if (!this.completed) throw new Error('incomplete_verified_duel')
    if (this.liveTicks > VERIFIED_DUEL_LIVE_TICKS_TOTAL || this.cpuSimulationTicks > VERIFIED_DUEL_CPU_SIMULATION_TICKS) {
      throw new Error('verified_duel_work_limit')
    }
    return Object.freeze({
      seed: this.seed,
      ...adjudicateVerifiedDuelCap(this.engine.getState()),
      humanSalvos: this.humanSalvos,
      cpuSalvos: this.cpuSalvos,
      liveTicks: this.liveTicks,
      cpuSimulationTicks: this.cpuSimulationTicks,
      maximumProbeCount: this.maximumProbeCount,
      transcript: this.transcript,
    })
  }
}

export function replayVerifiedDuel(seed: number, rawTranscript: readonly VerifiedHumanFire[]): VerifiedDuelReplayResult {
  if (!Array.isArray(rawTranscript) || rawTranscript.length === 0 || rawTranscript.length > VERIFIED_DUEL_MAX_HUMAN_SALVOS) {
    throw new Error('invalid_verified_duel_transcript')
  }
  const transcript = rawTranscript.map((entry) => {
    if (!Number.isInteger(entry.angle) || entry.angle < 0 || entry.angle > 180
      || !Number.isInteger(entry.power) || entry.power < 0 || entry.power > VERIFIED_DUEL_MAX_POWER) {
      throw new Error('invalid_verified_duel_transcript')
    }
    return Object.freeze({ angle: entry.angle, power: entry.power })
  })
  const controller = VerifiedDuelController.create(seed)
  for (const [index, shot] of transcript.entries()) {
    if (controller.complete) throw new Error('trailing_verified_duel_action')
    if (!controller.applyHumanAction({ type: 'set_angle', angle: shot.angle })
      || !controller.applyHumanAction({ type: 'set_power', power: shot.power })
      || !controller.applyHumanAction({ type: 'fire' })) throw new Error('verified_duel_illegal_human_fire')
    while (!controller.complete && controller.engine.getState().phase !== 'PLAYER_TURN') controller.tick()
    if (controller.complete && index + 1 < transcript.length) throw new Error('trailing_verified_duel_action')
  }
  return controller.result()
}
