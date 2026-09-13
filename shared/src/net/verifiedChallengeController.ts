import { GameEngine } from '../engine/GameEngine.ts'
import { VerificationWorkBudget, VerificationWorkLimitError, type VerificationWorkSnapshot } from '../engine/VerificationWorkBudget.ts'
import { VERIFIED_CHALLENGE_WORK_LIMITS } from './verifiedChallengeWorkLimits.ts'
import type { GameOptions } from '../types/GameOptions.ts'
import type { GameState, GamePhase } from '../types/GameState.ts'
import type { PlayerAction } from '../types/PlayerAction.ts'
import { selectVerifiedChallengeCpuFire } from './verifiedCpuPolicyV3.ts'
import {
  VERIFIED_CHALLENGE_CQ1, VERIFIED_CHALLENGE_LIMITS, parseVerifiedChallengeTranscript,
  type VerifiedChallengeHumanFire, type VerifiedChallengeTerminal,
} from './verifiedChallenge.ts'

// Retain the established outer live-tick guard. The trusted category budget also
// covers construction, speculative clones, terrain and CPU work before each unit.
const LIVE_TICKS_PER_SALVO = 391
const LIVE_TICKS_TOTAL = 2346
const CONSTRUCTION = Symbol('verified-challenge-controller')
type Actor = 'human' | 'cpu'
export interface VerifiedChallengeCpuSnapshot { readonly id: string; readonly health: number }
export type VerifiedChallengeEvent = Readonly<{
  type: 'salvo_settled'; actor: Actor; salvo: number; ticks: number
  humanHealth: number; cpuHealth: number; damageToCpu: number; phase: GamePhase
}> | Readonly<{
  type: 'cpu_selected'; salvo: number; angle: number; power: number
  probeCount: number; simulationTicks: number; coarseBest: VerifiedChallengeHumanFire
}> | Readonly<{ type: 'terminal'; terminal: VerifiedChallengeTerminal }>
export interface VerifiedChallengeReplayResult {
  readonly editionId: 'cq1'
  readonly seed: 42
  readonly terminal: VerifiedChallengeTerminal
  readonly humanSalvos: number
  readonly cpuSalvos: number
  readonly humanHealth: number
  readonly cpuHealth: number
  readonly liveTicks: number
  readonly cpuSimulationTicks: number
  readonly maximumProbeCount: number
  readonly transcript: readonly VerifiedChallengeHumanFire[]
  readonly events: readonly VerifiedChallengeEvent[]
}
const settled = (state: GameState): boolean => state.phase !== 'FIRING' && state.phase !== 'RESOLVING'
const terminal = (state: GameState): boolean => state.phase === 'GAME_OVER' || state.phase === 'ROUND_OVER'

/** Pure objective transition. The prior CPU is captured before accepted HUMAN
 * fire, never inferred from the surviving post-salvo roster or damage statistics. */
export function evaluateVerifiedChallengeSalvo(
  actor: Actor, before: VerifiedChallengeCpuSnapshot | null, after: GameState, humanSalvos: number,
): VerifiedChallengeTerminal | null {
  if (!settled(after)) throw new Error('unsettled_verified_challenge_salvo')
  if (actor !== 'human' && actor !== 'cpu') throw new Error('invalid_verified_challenge_actor')
  if (!Number.isInteger(humanSalvos) || humanSalvos < 1 || humanSalvos > VERIFIED_CHALLENGE_LIMITS.humanSalvos)
    throw new Error('invalid_verified_challenge_salvo_count')
  if (actor === 'human') {
    if (!before || !before.id || !Number.isFinite(before.health) || before.health <= 0 || before.health > 100)
      throw new Error('invalid_verified_challenge_cpu_snapshot')
    const cpu = after.tanks.find((tank) => tank.id === before.id)
    if (before.health - (cpu?.health ?? 0) > 0) return 'objective_cleared'
  }
  if (terminal(after)) return 'terminal_without_clear'
  if (actor === 'human' && humanSalvos === VERIFIED_CHALLENGE_LIMITS.humanSalvos) return 'objective_not_cleared'
  return null
}

/** Fixed authored cq1 adapter. No descriptor can inject game options here. */
export function createVerifiedChallengeOptions(editionId: unknown = 'cq1'): GameOptions {
  if (editionId !== 'cq1') throw new Error('unsupported_verified_challenge_edition')
  return {
    maxPlayers: 2, players: [
      { name: 'Commander', color: '#e84d4d', loadout: { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' } },
      { name: 'CPU', color: '#4d8ce8', ai: 'hard', loadout: { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' } },
    ],
    seed: 42, maxWind: 6, gravity: 0.15, walls: 'wrap', hazards: 'none', rounds: 1,
    interestRate: 0, suddenDeathTurn: 0, armsLevel: 0, teamMode: false,
    starterWeaponFalloff: 'decisive', rulesetVersion: 4,
  }
}

export class VerifiedChallengeController {
  private engineValue: GameEngine | null
  private readonly humanId: string
  private readonly cpuId: string
  private readonly commitments: VerifiedChallengeHumanFire[] = []
  private readonly history: VerifiedChallengeEvent[] = []
  private priorCpu: VerifiedChallengeCpuSnapshot | null = null
  private activeSalvo: Actor | null = null
  private currentSalvoTicks = 0
  private humanSalvos = 0
  private cpuSalvos = 0
  private liveTicks = 0
  private cpuSimulationTicks = 0
  private maximumProbeCount = 0
  private terminalReason: VerifiedChallengeTerminal | null = null

  static create(editionId: unknown = 'cq1'): VerifiedChallengeController {
    const options = createVerifiedChallengeOptions(editionId)
    const work = new VerificationWorkBudget(VERIFIED_CHALLENGE_WORK_LIMITS)
    let engine: GameEngine
    try { engine = new GameEngine(options, work) }
    catch (error) {
      if (!(error instanceof VerificationWorkLimitError)) throw error
      return new VerifiedChallengeController(CONSTRUCTION, null, work)
    }
    return new VerifiedChallengeController(CONSTRUCTION, engine, work)
  }
  private constructor(construction: symbol, engine: GameEngine | null, private readonly workBudget: VerificationWorkBudget) {
    if (construction !== CONSTRUCTION) throw new Error('private_verified_challenge_controller_constructor')
    this.engineValue = engine
    if (!engine) {
      this.humanId = ''; this.cpuId = ''; this.finish('work_limit'); return
    }
    const [human, cpu] = engine.getState().tanks
    if (!human || !cpu || human.ai || cpu.ai !== 'hard' || engine.getState().activePlayerId !== human.id)
      throw new Error('invalid_verified_challenge_roster')
    this.humanId = human.id
    this.cpuId = cpu.id
  }
  get engine(): GameEngine {
    if (!this.engineValue) throw new Error('discarded_verified_challenge_engine')
    return this.engineValue
  }
  get work(): VerificationWorkSnapshot { return this.workBudget.snapshot() }
  get complete(): boolean { return this.terminalReason !== null }
  get awaitingHuman(): boolean {
    if (this.complete) return false
    const state = this.engine.getState()
    return !this.complete && this.activeSalvo === null && state.phase === 'PLAYER_TURN'
      && state.activePlayerId === this.humanId
  }
  get transcript(): readonly VerifiedChallengeHumanFire[] {
    return Object.freeze(this.commitments.map((shot) => Object.freeze({ ...shot })))
  }
  get events(): readonly VerifiedChallengeEvent[] { return Object.freeze([...this.history]) }

  applyHumanAction(action: PlayerAction): boolean {
    if (this.complete) return false
    try { return this.applyHumanActionChecked(action) }
    catch (error) {
      if (!(error instanceof VerificationWorkLimitError)) throw error
      this.finish('work_limit'); return false
    }
  }
  private applyHumanActionChecked(action: PlayerAction): boolean {
    const state = this.engine.getState()
    const human = state.tanks.find((tank) => tank.id === this.humanId)
    if (!this.awaitingHuman || !human?.alive || human.health <= 0) return false
    if (action.type === 'set_angle') return Number.isInteger(action.angle) && action.angle >= 0 && action.angle <= 180
      ? this.engine.applyAction(action) : false
    if (action.type === 'set_power') return Number.isInteger(action.power) && action.power >= 0 && action.power <= 100
      ? this.engine.applyAction(action) : false
    if (action.type !== 'fire' || this.humanSalvos >= VERIFIED_CHALLENGE_LIMITS.humanSalvos) return false
    const cpu = state.tanks.find((tank) => tank.id === this.cpuId)
    if (!cpu?.alive || cpu.health <= 0) return false
    const shot = parseVerifiedChallengeTranscript([{ angle: human.angle, power: human.power }])?.[0]
    if (!shot) return false
    this.engine.applyAction({ type: 'select_weapon', weapon: 'baby_missile' })
    const before = Object.freeze({ id: cpu.id, health: cpu.health })
    if (!this.engine.applyAction({ type: 'fire' })) return false
    this.priorCpu = before
    this.commitments.push(shot)
    this.humanSalvos += 1
    this.activeSalvo = 'human'
    this.currentSalvoTicks = 0
    return true
  }
  private finish(reason: VerifiedChallengeTerminal): void {
    this.terminalReason = reason
    this.activeSalvo = null
    this.history.push(Object.freeze({ type: 'terminal', terminal: reason }))
    if (reason === 'work_limit') {
      // Latch the outer live-tick guard too, so a previously retained reference
      // cannot resume computation after the controller discards its engine.
      try { this.workBudget.charge('engineTicks', VERIFIED_CHALLENGE_WORK_LIMITS.engineTicks + 1) }
      catch (error) { if (!(error instanceof VerificationWorkLimitError)) throw error }
      this.engineValue = null
      this.priorCpu = null
    }
  }
  tick(): void {
    if (this.complete || this.activeSalvo === null) return
    try { this.tickChecked() }
    catch (error) {
      if (!(error instanceof VerificationWorkLimitError)) throw error
      this.finish('work_limit')
    }
  }
  private tickChecked(): void {
    if (!settled(this.engine.getState())) {
      if (this.currentSalvoTicks >= LIVE_TICKS_PER_SALVO || this.liveTicks >= LIVE_TICKS_TOTAL) {
        this.finish('work_limit'); return
      }
      this.engine.tick()
      this.currentSalvoTicks += 1
      this.liveTicks += 1
    }
    const state = this.engine.getState()
    if (!settled(state)) return
    const actor = this.activeSalvo!
    const humanHealth = state.tanks.find((tank) => tank.id === this.humanId)?.health ?? 0
    const cpuHealth = state.tanks.find((tank) => tank.id === this.cpuId)?.health ?? 0
    const reason = evaluateVerifiedChallengeSalvo(actor, this.priorCpu, state, this.humanSalvos)
    this.history.push(Object.freeze({ type: 'salvo_settled', actor,
      salvo: actor === 'human' ? this.humanSalvos : this.cpuSalvos,
      ticks: this.currentSalvoTicks, humanHealth, cpuHealth,
      damageToCpu: actor === 'human' ? Math.max(0, (this.priorCpu?.health ?? cpuHealth) - cpuHealth) : 0,
      phase: state.phase }))
    this.priorCpu = null
    this.activeSalvo = null
    this.currentSalvoTicks = 0
    if (reason) { this.finish(reason); return }
    if (actor === 'cpu') {
      if (state.activePlayerId !== this.humanId) throw new Error('verified_challenge_turn_mismatch')
      return
    }
    if (state.activePlayerId !== this.cpuId) throw new Error('verified_challenge_turn_mismatch')
    if (this.cpuSalvos >= VERIFIED_CHALLENGE_LIMITS.cpuSalvos) { this.finish('work_limit'); return }
    const plan = selectVerifiedChallengeCpuFire(this.engine)
    this.cpuSimulationTicks += plan.simulationTicks
    this.maximumProbeCount = Math.max(this.maximumProbeCount, plan.probeCount)
    this.engine.applyAction({ type: 'select_weapon', weapon: 'baby_missile' })
    this.engine.applyAction({ type: 'set_angle', angle: plan.angle })
    this.engine.applyAction({ type: 'set_power', power: plan.power })
    if (!this.engine.applyAction({ type: 'fire' })) throw new Error('verified_challenge_illegal_cpu_fire')
    this.cpuSalvos += 1
    this.history.push(Object.freeze({ type: 'cpu_selected', salvo: this.cpuSalvos,
      angle: plan.angle, power: plan.power, probeCount: plan.probeCount,
      simulationTicks: plan.simulationTicks, coarseBest: Object.freeze({ ...plan.coarseBest }) }))
    this.activeSalvo = 'cpu'
  }
  result(): VerifiedChallengeReplayResult {
    if (!this.terminalReason) throw new Error('incomplete_verified_challenge')
    const state = this.engineValue?.getState()
    return Object.freeze({ editionId: VERIFIED_CHALLENGE_CQ1.editionId, seed: VERIFIED_CHALLENGE_CQ1.seed,
      terminal: this.terminalReason, humanSalvos: this.humanSalvos, cpuSalvos: this.cpuSalvos,
      humanHealth: state?.tanks.find((tank) => tank.id === this.humanId)?.health ?? 0,
      cpuHealth: state?.tanks.find((tank) => tank.id === this.cpuId)?.health ?? 0,
      liveTicks: this.liveTicks, cpuSimulationTicks: this.cpuSimulationTicks, maximumProbeCount: this.maximumProbeCount,
      transcript: this.transcript, events: this.events })
  }
}

export function replayVerifiedChallenge(rawTranscript: unknown, editionId: unknown = 'cq1'): VerifiedChallengeReplayResult {
  return replayVerifiedChallengeWithWork(rawTranscript, editionId).result
}

/** The diagnostic work envelope is internal to the retained artifact and checks;
 * it never expands the public descriptor or gives a caller a budget override. */
export function replayVerifiedChallengeWithWork(rawTranscript: unknown, editionId: unknown = 'cq1'):
Readonly<{ result: VerifiedChallengeReplayResult; work: VerificationWorkSnapshot }> {
  const transcript = parseVerifiedChallengeTranscript(rawTranscript)
  if (!transcript) throw new Error('invalid_verified_challenge_transcript')
  const controller = VerifiedChallengeController.create(editionId)
  for (const shot of transcript) {
    if (controller.complete) {
      if (controller.result().terminal === 'work_limit') break
      throw new Error('trailing_verified_challenge_action')
    }
    if (!controller.applyHumanAction({ type: 'set_angle', angle: shot.angle })
      || !controller.applyHumanAction({ type: 'set_power', power: shot.power })
      || !controller.applyHumanAction({ type: 'fire' })) {
      if (controller.complete && controller.result().terminal === 'work_limit') break
      throw new Error('verified_challenge_illegal_human_fire')
    }
    while (!controller.complete && !controller.awaitingHuman) controller.tick()
  }
  return Object.freeze({ result: controller.result(), work: controller.work })
}
