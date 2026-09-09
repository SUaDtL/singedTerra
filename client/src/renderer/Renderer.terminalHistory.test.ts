import { describe, expect, it, vi } from 'vitest'
import type { ExplosionEvent, GameState } from '@shared/types/GameState'
import {
  VERIFIED_DUEL_LIVE_TICKS_TOTAL,
  VerifiedDuelController,
} from '@shared/net/verifiedDuel'
import { Renderer, type RenderEventSink } from './Renderer'

interface RendererHistorySeam {
  bursts: Array<{ age: number }>
  scorches: unknown[]
  lastSeenExplosionId: number
  lastImpact: { x: number; y: number } | null
  shake: number
  kickX: number
  kickY: number
  impactHoldFrames: number
  effectsBusy: number
  reduceMotion: boolean
  events: RenderEventSink | null
  explosionArt: { state: 'ready' }
  effects: { spawnExplosion: ReturnType<typeof vi.fn> }
  mobilityEffects: { isActive: boolean }
  tankRecoil: null
  windGust: null
  consumeExplosion(state: Pick<GameState, 'explosions' | 'lastExplosion'>): void
  primeHistoricalImpactEvents(state: Pick<GameState, 'explosions' | 'lastExplosion'>): void
  isTerminalImpactAnimating(state: GameState): boolean
}

function explosion(id: number): ExplosionEvent {
  return {
    id, weaponType: 'baby_missile', cx: 700, cy: 300, radius: 34,
    impactType: 'tank', style: 'blast', color: '#ffb347', durationFrames: 85,
  }
}

let verifiedTerminalFixture: GameState | null = null

function recoverableVerifiedTerminalState(): GameState {
  if (verifiedTerminalFixture !== null) return structuredClone(verifiedTerminalFixture)
  const controller = VerifiedDuelController.createForPolicy(17, 3)
  let ticks = 0
  for (let shot = 0; shot < 6 && !controller.complete; shot += 1) {
    if (!controller.applyHumanAction({ type: 'set_angle', angle: 45 })
      || !controller.applyHumanAction({ type: 'set_power', power: 50 })
      || !controller.applyHumanAction({ type: 'fire' })) {
      throw new Error(`verified terminal fixture rejected shot ${shot + 1}`)
    }
    while (!controller.complete && controller.engine.getState().phase !== 'PLAYER_TURN') {
      controller.tick()
      ticks += 1
      if (ticks >= VERIFIED_DUEL_LIVE_TICKS_TOTAL) {
        throw new Error('verified terminal fixture exceeded the replay tick budget')
      }
    }
  }
  if (controller.transcript.length !== 6) {
    throw new Error(`verified terminal fixture retained ${controller.transcript.length} shots`)
  }
  const state = structuredClone(controller.engine.getState())
  if (state.explosions.length === 0 || state.lastExplosion === null) {
    throw new Error('verified terminal fixture has no retained impact history')
  }
  state.phase = 'GAME_OVER'
  verifiedTerminalFixture = state
  return structuredClone(verifiedTerminalFixture)
}

function expectStateBitExact(actual: GameState, expected: GameState): void {
  const { terrain: actualTerrain, ...actualRest } = actual
  const { terrain: expectedTerrain, ...expectedRest } = expected
  expect(actualRest).toEqual(expectedRest)
  expect(Buffer.from(
    actualTerrain.buffer,
    actualTerrain.byteOffset,
    actualTerrain.byteLength,
  ).equals(Buffer.from(
    expectedTerrain.buffer,
    expectedTerrain.byteOffset,
    expectedTerrain.byteLength,
  ))).toBe(true)
}

function rendererSeam(onExplosion = vi.fn()): { renderer: RendererHistorySeam; onExplosion: ReturnType<typeof vi.fn> } {
  const renderer = Object.create(Renderer.prototype) as RendererHistorySeam
  Object.assign(renderer, {
    bursts: [], scorches: [], lastSeenExplosionId: 0, lastImpact: null,
    shake: 0, kickX: 0, kickY: 0, impactHoldFrames: 0, effectsBusy: 0,
    reduceMotion: false,
    events: { onExplosion } as unknown as RenderEventSink,
    explosionArt: { state: 'ready' },
    effects: { spawnExplosion: vi.fn() },
    mobilityEffects: { isActive: false }, tankRecoil: null, windGust: null,
  })
  return { renderer, onExplosion }
}

describe('Renderer recovered terminal impact history', () => {
  it('replays unprimed terminal history as a live impact and becomes busy', () => {
    const state = recoverableVerifiedTerminalState()
    const { renderer, onExplosion } = rendererSeam()

    renderer.consumeExplosion(state)

    expect(onExplosion).toHaveBeenCalledOnce()
    expect(renderer.bursts).toHaveLength(1)
    expect(renderer.isTerminalImpactAnimating(state)).toBe(true)
  })

  it('primes terminal history without effects or state mutation', () => {
    const state = recoverableVerifiedTerminalState()
    const before = structuredClone(state)
    const { renderer, onExplosion } = rendererSeam()

    renderer.primeHistoricalImpactEvents(state)
    renderer.consumeExplosion(state)

    expect(onExplosion).not.toHaveBeenCalled()
    expect(renderer.effects.spawnExplosion).not.toHaveBeenCalled()
    expect(renderer.bursts).toHaveLength(0)
    expect(renderer.isTerminalImpactAnimating(state)).toBe(false)
    expectStateBitExact(state, before)
  })

  it('plays a new live impact after priming retained history', () => {
    const state = recoverableVerifiedTerminalState()
    const retained = state.lastExplosion!
    const live = explosion(retained.id + 1)
    const { renderer, onExplosion } = rendererSeam()

    renderer.primeHistoricalImpactEvents(state)
    state.explosions = [...state.explosions, live]
    state.lastExplosion = live
    renderer.consumeExplosion(state)

    expect(onExplosion).toHaveBeenCalledOnce()
    expect(renderer.effects.spawnExplosion).toHaveBeenCalledOnce()
    expect(renderer.bursts).toHaveLength(1)
    expect(renderer.lastSeenExplosionId).toBe(live.id)
    expect(renderer.isTerminalImpactAnimating(state)).toBe(true)
  })

  it('primes the lastExplosion fallback when the history array is empty', () => {
    const state = recoverableVerifiedTerminalState()
    state.explosions = []
    const retained = state.lastExplosion!
    const { renderer, onExplosion } = rendererSeam()

    renderer.primeHistoricalImpactEvents(state)
    renderer.consumeExplosion(state)

    expect(renderer.lastSeenExplosionId).toBe(retained.id)
    expect(onExplosion).not.toHaveBeenCalled()
    expect(renderer.effects.spawnExplosion).not.toHaveBeenCalled()
    expect(renderer.isTerminalImpactAnimating(state)).toBe(false)
  })
})
