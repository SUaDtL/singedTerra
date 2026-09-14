import type { BorrowedGameState } from '@shared/types/GameState'
import type { PlayerAction } from '@shared/types/PlayerAction'
import {
  parseVerifiedChallengeDescriptor,
  parseVerifiedChallengeTranscript,
  type VerifiedChallengeDescriptor,
  type VerifiedChallengeHumanFire,
} from '@shared/net/verifiedChallenge'
import { getVerifiedChallengeArtifact } from '@shared/verified/challengeArtifacts'
import type { GameClient, GameInputCapabilities } from './GameClient'
import { fastForwardTicks } from './fastForward'
import { FrameClock } from './frameClock'

type VerifiedChallengeArtifact = ReturnType<typeof getVerifiedChallengeArtifact>
type VerifiedChallengeController = ReturnType<VerifiedChallengeArtifact['createController']>

export type VerifiedChallengeClientResult = ReturnType<VerifiedChallengeController['result']>
export type VerifiedChallengeClientUnavailableReason = 'invalid_descriptor' | 'invalid_restore'
  | 'fire_persistence_failed'

export interface VerifiedChallengeClientOptions {
  readonly descriptor: VerifiedChallengeDescriptor
  readonly transcript?: readonly VerifiedChallengeHumanFire[]
  readonly recordAcceptedFire: (fire: VerifiedChallengeHumanFire) => boolean
  readonly onTerminal: (result: VerifiedChallengeClientResult) => void
  readonly onUnavailable?: (reason: VerifiedChallengeClientUnavailableReason) => void
}

/**
 * Browser presentation adapter for one retained Verified Challenge artifact.
 * Simulation, CPU selection, objective ordering, and transcript replay remain
 * wholly owned by the generated artifact; this class only supplies fixed-step
 * presentation pacing and the ordinary GameClient surface.
 */
export class VerifiedChallengeClient implements GameClient {
  readonly inputCapabilities: GameInputCapabilities
  private readonly descriptor: VerifiedChallengeDescriptor
  private readonly controller: VerifiedChallengeController
  private readonly initialTerrain: Uint8Array
  private readonly listeners = new Set<(state: BorrowedGameState) => void>()
  private readonly frameClock = new FrameClock()
  private cachedState: BorrowedGameState | null
  private resultValue: VerifiedChallengeClientResult | null = null
  private terminalReported = false
  private unavailable = false
  private rafId: number | null = null
  private running = false
  private frameGeneration = 0
  private fastForward = false

  constructor(private readonly options: VerifiedChallengeClientOptions) {
    const descriptor = parseVerifiedChallengeDescriptor(options.descriptor)
    if (!descriptor || descriptor.editionId !== 'cq1' || descriptor.verifierArtifactId !== 'cq1') {
      this.notifyUnavailable('invalid_descriptor')
      throw new Error('verified_challenge_descriptor_mismatch')
    }
    this.descriptor = descriptor
    this.inputCapabilities = Object.freeze({
      angle: Object.freeze({ ...descriptor.limits.angle }),
      power: Object.freeze({ ...descriptor.limits.power }),
      primaryAction: 'fire',
      movement: false,
      weaponCycling: false,
      weaponSelection: false,
      buying: false,
    })
    const artifact = getVerifiedChallengeArtifact('cq1')
    if (artifact.editionId !== descriptor.editionId
      || JSON.stringify(artifact.catalog) !== JSON.stringify(this.catalogFromDescriptor(descriptor))) {
      this.notifyUnavailable('invalid_descriptor')
      throw new Error('verified_challenge_descriptor_mismatch')
    }
    this.controller = artifact.createController()
    const initial = this.controller.getState()
    if (!initial) {
      this.notifyUnavailable('invalid_restore')
      throw new Error('verified_challenge_restore_failed')
    }
    this.initialTerrain = initial.terrain.slice()
    this.cachedState = initial
    try {
      this.restore(options.transcript ?? [])
    } catch {
      this.notifyUnavailable('invalid_restore')
      throw new Error('verified_challenge_restore_failed')
    }
    this.captureState()
    this.latchResult()
  }

  get terminalResult(): VerifiedChallengeClientResult | null { return this.resultValue }

  setFastForward(on: boolean): void { this.fastForward = on }

  start(): void {
    if (this.running || this.unavailable) return
    if (this.resultValue) {
      this.emitCurrent()
      this.reportTerminal()
      return
    }
    this.running = true
    const generation = ++this.frameGeneration
    this.frameClock.reset(performance.now())
    const isCurrent = (): boolean => this.running && this.frameGeneration === generation
    const schedule = (loop: FrameRequestCallback): void => {
      if (isCurrent()) this.rafId = requestAnimationFrame(loop)
    }
    const loop: FrameRequestCallback = (timestamp): void => {
      if (!isCurrent()) return
      this.rafId = null
      const logicalBeats = this.frameClock.advance(timestamp)
      for (let beat = 0; beat < logicalBeats; beat++) {
        if (!isCurrent()) return
        const ticks = fastForwardTicks(this.fastForward, this.cachedState?.phase ?? '')
        for (let tick = 0; tick < ticks; tick++) {
          this.controller.tick()
          if (this.controller.complete || this.controller.awaitingHuman) break
        }
        this.captureState()
        const terminal = this.latchResult()
        this.emitCurrent()
        if (terminal) {
          this.stopLoop()
          this.reportTerminal()
          return
        }
      }
      schedule(loop)
    }
    this.emitCurrent()
    schedule(loop)
  }

  stop(): void { this.stopLoop() }

  sendAction(action: PlayerAction): void {
    if (this.unavailable || this.resultValue) return
    if (action.type !== 'set_angle' && action.type !== 'set_power' && action.type !== 'fire') return

    const stateBefore = this.cachedState
    const activeBefore = stateBefore?.tanks.find((tank) => tank.id === stateBefore.activePlayerId)
    const fire = action.type === 'fire' && activeBefore
      ? Object.freeze({ angle: activeBefore.angle, power: activeBefore.power })
      : null
    const accepted = this.controller.applyHumanAction(action)
    if (accepted && fire && !this.persistAcceptedFire(fire)) {
      this.unavailable = true
      this.stopLoop()
      this.notifyUnavailable('fire_persistence_failed')
      throw new Error('verified_challenge_fire_persistence_failed')
    }
    if (!accepted && !this.controller.complete) return

    this.captureState()
    const terminal = this.latchResult()
    this.emitCurrent()
    if (terminal) {
      this.stopLoop()
      this.reportTerminal()
    }
  }

  getState(): BorrowedGameState | null { return this.cachedState }

  getInitialTerrain(): Uint8Array { return this.initialTerrain }

  getEffectiveGravity(): number { return this.descriptor.rules.gravity }

  onStateChange(listener: (state: BorrowedGameState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private restore(rawTranscript: readonly VerifiedChallengeHumanFire[]): void {
    if (!Array.isArray(rawTranscript)) throw new Error('invalid_verified_challenge_transcript')
    const transcript = rawTranscript.length === 0 ? [] : parseVerifiedChallengeTranscript(rawTranscript)
    if (!transcript) throw new Error('invalid_verified_challenge_transcript')
    for (const fire of transcript) {
      if (this.controller.complete
        || !this.controller.applyHumanAction({ type: 'set_angle', angle: fire.angle })
        || !this.controller.applyHumanAction({ type: 'set_power', power: fire.power })
        || !this.controller.applyHumanAction({ type: 'fire' })) {
        throw new Error('invalid_verified_challenge_restore')
      }
      while (!this.controller.complete && !this.controller.awaitingHuman) this.controller.tick()
    }
  }

  private captureState(): void {
    const state = this.controller.getState()
    if (state) this.cachedState = state
  }

  private emitCurrent(): void {
    if (!this.cachedState) return
    for (const listener of this.listeners) listener(this.cachedState)
  }

  private latchResult(): boolean {
    if (!this.controller.complete) return false
    if (!this.resultValue) this.resultValue = this.controller.result()
    return true
  }

  private reportTerminal(): void {
    if (!this.resultValue || this.terminalReported) return
    this.terminalReported = true
    this.options.onTerminal(this.resultValue)
  }

  private persistAcceptedFire(fire: VerifiedChallengeHumanFire): boolean {
    try { return this.options.recordAcceptedFire(fire) === true }
    catch { return false }
  }

  private stopLoop(): void {
    if (!this.running && this.rafId === null) return
    this.running = false
    this.frameGeneration += 1
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private notifyUnavailable(reason: VerifiedChallengeClientUnavailableReason): void {
    try { this.options.onUnavailable?.(reason) } catch { /* product callback cannot change refusal */ }
  }

  private catalogFromDescriptor(descriptor: VerifiedChallengeDescriptor): VerifiedChallengeArtifact['catalog'] {
    const { sessionId: _sessionId, accountId: _accountId, admittedAt: _admittedAt,
      expiresAt: _expiresAt, ...catalog } = descriptor
    return catalog
  }
}
