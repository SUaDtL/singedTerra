import { describe, expect, it, vi } from 'vitest'
import { GameEngine } from '@shared/engine/GameEngine'
import {
  normalizeVerifiedDeploymentSessionId,
  parseVerifiedDeploymentAbandonResponse,
  parseVerifiedDeploymentCompletionResponse,
  parseVerifiedDeploymentStartResponse,
  verifiedDeploymentDeadline,
  VerifiedDeploymentRecorder,
} from './verifiedDeployment'
import { HotSeatClient } from './HotSeatClient'
import { VerifiedDuelController, replayVerifiedDuel } from '@shared/net/verifiedDuel'

function engine(): GameEngine {
  return new GameEngine({
    maxPlayers: 2,
    players: [
      { name: 'Human', color: '#e84d4d' },
      { name: 'CPU', color: '#4d8ce8', ai: 'hard' },
    ],
    seed: 17,
    maxWind: 6,
    gravity: 0.15,
    walls: 'open',
    hazards: 'none',
    rounds: 1,
    interestRate: 0,
    suddenDeathTurn: 0,
    armsLevel: 0,
    starterWeaponFalloff: 'decisive',
  })
}

function animationFrames() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  return {
    request: (callback: FrameRequestCallback): number => {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    cancel: (id: number): void => { callbacks.delete(id) },
    runNext(): void {
      const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined
      if (!entry) throw new Error('missing_verified_duel_animation_frame')
      callbacks.delete(entry[0])
      entry[1](0)
    },
  }
}

describe('VerifiedDeploymentRecorder', () => {
  it('uses the shared controller through HotSeatClient and matches verifier bytes at terminal and cap outcomes', () => {
    for (const { length, angle, power } of [
      { length: 6, angle: 0, power: 5 },
      { length: 3, angle: 45, power: 0 },
    ]) {
      const raf = animationFrames()
      vi.stubGlobal('requestAnimationFrame', raf.request)
      vi.stubGlobal('cancelAnimationFrame', raf.cancel)
      const controller = VerifiedDuelController.create(17)
      const client = new HotSeatClient(controller)
      client.setFastForward(true)
      client.start()
      const transcript = Array.from({ length }, () => ({ angle, power }))
      for (const shot of transcript) {
        client.sendAction({ type: 'set_angle', angle: shot.angle })
        client.sendAction({ type: 'set_power', power: shot.power })
        client.sendAction({ type: 'fire' })
        let frames = 0
        while (!controller.complete && client.getState()?.phase !== 'PLAYER_TURN' && frames < 1_000) {
          raf.runNext()
          frames += 1
        }
        expect(frames).toBeLessThan(1_000)
        if (controller.complete) break
      }
      expect(JSON.stringify(controller.result())).toBe(JSON.stringify(replayVerifiedDuel(17, transcript)))
      client.stop()
      vi.unstubAllGlobals()
    }
  })

  it('keeps ordinary HotSeatClient behavior independent of verified CPU driving', () => {
    const game = engine()
    const client = new HotSeatClient(game)
    client.sendAction({ type: 'set_angle', angle: 31 })
    client.sendAction({ type: 'set_power', power: 27 })
    client.sendAction({ type: 'fire' })
    for (let ticks = 0; ticks < 391 && game.getState().phase !== 'PLAYER_TURN'; ticks += 1) game.tick()
    expect(game.getState().activePlayerId).toBe(game.getState().tanks[1]?.id)
    expect(game.getState().phase).toBe('PLAYER_TURN')
  })

  it('rejects a verified controller paired with a different render engine', () => {
    const controller = VerifiedDuelController.create(17)
    const differentEngine = engine()
    expect(() => new HotSeatClient(differentEngine, controller)).toThrow('verified_duel_engine_mismatch')
  })

  it('captures the real HotSeatClient accepted pre-fire state and leaves unobserved clients unchanged', () => {
    const recorder = new VerifiedDeploymentRecorder()
    const game = engine()
    const client = new HotSeatClient(game, recorder)
    client.sendAction({ type: 'set_angle', angle: 73 })
    client.sendAction({ type: 'set_power', power: 41 })
    client.sendAction({ type: 'select_weapon', weapon: 'baby_missile' })
    client.sendAction({ type: 'fire' })
    expect(recorder.transcript).toEqual([{ angle: 73, power: 41 }])

    const ordinary = engine()
    const ordinaryClient = new HotSeatClient(ordinary)
    ordinaryClient.sendAction({ type: 'set_angle', angle: 29 })
    expect(ordinary.getState().tanks[0]?.angle).toBe(29)
  })

  it('records only an accepted human Baby Missile fire as an immutable canonical commitment', () => {
    const game = engine()
    const recorder = new VerifiedDeploymentRecorder()
    expect(game.applyAction({ type: 'set_angle', angle: 37 })).toBe(true)
    expect(game.applyAction({ type: 'set_power', power: 64 })).toBe(true)
    expect(game.applyAction({ type: 'select_weapon', weapon: 'baby_missile' })).toBe(true)
    const before = structuredClone(game.getState())
    const accepted = game.applyAction({ type: 'fire' })
    expect(accepted).toBe(true)
    expect(recorder.observe({ type: 'fire' }, before, accepted)).toBe(true)
    const transcript = recorder.transcript
    expect(transcript).toEqual([{ angle: 37, power: 64 }])
    expect(Object.isFrozen(transcript)).toBe(true)
    expect(Object.isFrozen(transcript[0])).toBe(true)
  })

  it('refuses rejected, CPU, non-fire, non-Baby-Missile, fractional, and seventh commitments', () => {
    const recorder = new VerifiedDeploymentRecorder()
    const game = engine()
    const human = game.getState()
    expect(recorder.observe({ type: 'set_angle', angle: 20 }, human, true)).toBe(false)
    expect(recorder.observe({ type: 'fire' }, human, false)).toBe(false)
    human.tanks[0]!.selectedWeapon = 'missile'
    expect(recorder.observe({ type: 'fire' }, human, true)).toBe(false)
    human.tanks[0]!.selectedWeapon = 'baby_missile'
    human.tanks[0]!.angle = 20.5
    expect(recorder.observe({ type: 'fire' }, human, true)).toBe(false)
    human.tanks[0]!.angle = 20
    for (let i = 0; i < 6; i += 1) expect(recorder.observe({ type: 'fire' }, human, true)).toBe(true)
    expect(recorder.observe({ type: 'fire' }, human, true)).toBe(false)

    const cpuState = engine().getState()
    cpuState.activePlayerId = cpuState.tanks[1]!.id
    expect(new VerifiedDeploymentRecorder().observe({ type: 'fire' }, cpuState, true)).toBe(false)
  })
})

const sessionId = '00000000-0000-4000-8000-000000000061'

const startResponse = {
  sessionId,
  resumed: false,
  expiresAt: '2026-08-12T13:30:00.000Z',
  contractVersion: 1,
  engineVersion: 1,
  rulesetVersion: 3,
  limits: {
    humanSalvos: 6,
    cpuSalvos: 6,
    angle: { min: 0, max: 180 },
    power: { min: 0, max: 100 },
  },
  config: {
    seed: 17,
    options: {
      maxPlayers: 2,
      maxWind: 6,
      gravity: 0.15,
      walls: 'open',
      hazards: 'none',
      rounds: 1,
      interestRate: 0,
      suddenDeathTurn: 0,
      armsLevel: 0,
      starterWeaponFalloff: 'decisive',
      teamMode: false,
      players: [
        { name: 'Ranger', color: '#e8554d' },
        { name: 'CPU 1', color: '#3f78b8', ai: 'hard' },
      ],
    },
  },
}

const completionResponse = {
  result: { sessionId, won: true, outcome: 'win', verifiedXp: 200 },
  progression: {
    evidence: 'verified_replay_v1',
    prior: { matchesPlayed: 0, wins: 0, totalXp: 0 },
    current: { matchesPlayed: 1, wins: 1, totalXp: 200 },
  },
}

describe('verified deployment client contracts', () => {
  it('accepts only the exact supported start response and deeply freezes its immutable descriptor', () => {
    const parsed = parseVerifiedDeploymentStartResponse(startResponse)

    expect(parsed).toEqual({
      resumed: false,
      descriptor: {
        sessionId,
        expiresAt: '2026-08-12T13:30:00.000Z',
        contractVersion: 1,
        engineVersion: 1,
        rulesetVersion: 3,
        limits: startResponse.limits,
        config: startResponse.config,
      },
    })
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed?.descriptor)).toBe(true)
    expect(Object.isFrozen(parsed?.descriptor.config.options.players)).toBe(true)
    expect(JSON.stringify(parsed)).not.toContain('userId')
  })

  it('accepts only the canonical lowercase UUIDv4 form emitted by the backend', () => {
    for (const accepted of [
      '22222222-2222-4222-8222-222222222222',
      '123e4567-e89b-42d3-9456-426614174000',
      '123e4567-e89b-42d3-a456-426614174000',
      '123e4567-e89b-42d3-b456-426614174000',
    ]) {
      expect(normalizeVerifiedDeploymentSessionId(accepted)).toBe(accepted)
    }

    for (const refused of [
      '123E4567-E89B-42D3-A456-426614174000',
      '123e4567-e89b-12d3-8456-426614174000',
      '123e4567-e89b-52d3-8456-426614174000',
      '123e4567-e89b-42d3-7456-426614174000',
      '123e4567-e89b-42d3-c456-426614174000',
    ]) {
      expect(normalizeVerifiedDeploymentSessionId(refused)).toBeNull()
      expect(parseVerifiedDeploymentStartResponse({ ...startResponse, sessionId: refused })).toBeNull()
    }
  })

  it.each([
    ['widened response', { ...startResponse, userId: 'account-private-id' }],
    ['unsupported contract', { ...startResponse, contractVersion: 2 }],
    ['unsupported engine', { ...startResponse, engineVersion: 2 }],
    ['unsupported ruleset', { ...startResponse, rulesetVersion: 4 }],
    ['widened config', { ...startResponse, config: { ...startResponse.config, userId: 'account-private-id' } }],
    ['request-owned seed', { ...startResponse, config: { ...startResponse.config, seed: 18 } }],
    ['widened limits', { ...startResponse, limits: { ...startResponse.limits, humanSalvos: 7 } }],
    ['invalid expiry', { ...startResponse, expiresAt: 'later' }],
  ])('rejects a %s without a compatibility fallback', (_label, response) => {
    expect(parseVerifiedDeploymentStartResponse(response)).toBeNull()
  })

  it('parses exact abandon and completion responses with verified arithmetic only', () => {
    expect(parseVerifiedDeploymentAbandonResponse({ ok: true, sessionId, status: 'abandoned' }))
      .toEqual({ ok: true, sessionId, status: 'abandoned' })
    const parsed = parseVerifiedDeploymentCompletionResponse(completionResponse)
    expect(parsed).toEqual(completionResponse)
    expect(Object.isFrozen(parsed?.progression.prior)).toBe(true)
    expect(Object.isFrozen(parsed?.progression.current)).toBe(true)
  })

  it.each([
    ['casual evidence', { ...completionResponse, progression: { ...completionResponse.progression, evidence: 'casual' } }],
    ['casual total substitution', { ...completionResponse, progression: { ...completionResponse.progression, current: { matchesPlayed: 7, wins: 3, totalXp: 1_000 } } }],
    ['wrong award', { ...completionResponse, result: { ...completionResponse.result, verifiedXp: 100 } }],
    ['wrong win delta', { ...completionResponse, progression: { ...completionResponse.progression, current: { matchesPlayed: 1, wins: 0, totalXp: 200 } } }],
    ['widened result', { ...completionResponse, result: { ...completionResponse.result, rank: 'R-02' } }],
    ['widened receipt', { ...completionResponse, profile: { id: 'account-private-id' } }],
  ])('rejects %s', (_label, response) => {
    expect(parseVerifiedDeploymentCompletionResponse(response)).toBeNull()
  })

  it('derives five-minute, one-minute, and expiry state only from the server deadline', () => {
    const expiresAt = '2026-08-12T13:30:00.000Z'
    expect(verifiedDeploymentDeadline(expiresAt, Date.parse('2026-08-12T13:24:59.999Z'))).toEqual({
      remainingMs: 300_001,
      warning: 'none',
      acceptsInput: true,
      canComplete: true,
    })
    expect(verifiedDeploymentDeadline(expiresAt, Date.parse('2026-08-12T13:25:00.000Z')).warning)
      .toBe('five-minutes')
    expect(verifiedDeploymentDeadline(expiresAt, Date.parse('2026-08-12T13:29:00.000Z')).warning)
      .toBe('one-minute')
    expect(verifiedDeploymentDeadline(expiresAt, Date.parse(expiresAt))).toEqual({
      remainingMs: 0,
      warning: 'expired',
      acceptsInput: false,
      canComplete: false,
    })
  })
})
