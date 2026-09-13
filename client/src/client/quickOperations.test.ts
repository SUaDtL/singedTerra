import { describe, expect, it } from 'vitest'
import { GameEngine } from '@shared/engine/GameEngine'
import type { GameOptions } from '@shared/types/GameOptions'
import {
  QUICK_OPERATIONS,
  QUICK_OPERATION_CONTENT_VERSION,
  P04_TACTICAL_CHALLENGE_CONTENT_VERSION,
  quickOperationById,
  quickOperationOptions,
  type QuickOperation,
} from './quickOperations'

const QUICK_DUEL_BASE_OPTIONS: GameOptions = {
  maxPlayers: 2,
  seed: 0x0bada55,
  players: [
    { name: 'Player 1', color: '#ef5350' },
    { name: 'CPU 1', color: '#42a5f5', ai: 'easy' },
  ],
  walls: 'concrete',
  battlefieldWorld: 'ember-dusk',
  hazards: 'none',
  rounds: 1,
  suddenDeathTurn: 0,
}

function operationOptions(value: unknown): Readonly<GameOptions> {
  return quickOperationOptions(value, QUICK_DUEL_BASE_OPTIONS)
}

function finish(engine: GameEngine): void {
  let ticks = 0
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    engine.tick()
    ticks += 1
    expect(ticks).toBeLessThan(2_000)
  }
}

function applyShotLog(engine: GameEngine): void {
  expect(engine.applyAction({ type: 'set_angle', angle: 90 })).toBe(true)
  expect(engine.applyAction({ type: 'set_power', power: 1 })).toBe(true)
  expect(engine.applyAction({ type: 'fire' })).toBe(true)
  finish(engine)
}

describe('Quick Operations catalog', () => {
  it('ships the exact curated deterministic profiles', () => {
    expect(QUICK_OPERATIONS).toEqual([
      { id: 'standard', title: 'Standard Duel', briefing: 'A balanced three-round duel.', settings: {} },
      {
        id: 'first-salvo',
        title: 'First Salvo',
        briefing: 'A one-round duel that starts with the essentials.',
        settings: { rounds: 1 },
      },
      {
        id: 'crosswind-range',
        title: 'Crosswind Range',
        briefing: 'Wraparound walls turn shifting wind into a ranging test.',
        settings: { walls: 'wrap', battlefieldWorld: 'glassstorm-expanse', seed: 42 },
        practiceObjective: { contentVersion: 2, fieldOrderId: 'first-strike', seed: 42 },
      },
      {
        id: 'caldera-run',
        title: 'Caldera Run',
        briefing: 'Lava terrain turns every crater into a positional risk.',
        settings: { hazards: 'lava', battlefieldWorld: 'obsidian-caldera', seed: 42 },
        practiceObjective: { contentVersion: 2, fieldOrderId: 'set-the-position', seed: 42 },
      },
      {
        id: 'last-light-siege',
        title: 'Last Light Siege',
        briefing: 'A best-of-three duel that tightens into sudden death.',
        settings: { rounds: 3, suddenDeathTurn: 12, battlefieldWorld: 'ember-dusk' },
        practiceObjective: { contentVersion: 1, fieldOrderId: 'hold-the-field' },
      },
      {
        id: 'lean-arsenal',
        title: 'Lean Arsenal',
        briefing: 'Level 0 restocks only. Preserve your opening kit.',
        settings: { armsLevel: 0, seed: 42 },
        practiceObjective: { contentVersion: 2, fieldOrderId: 'make-it-count', seed: 42 },
      },
    ] satisfies QuickOperation[])
    expect(Object.isFrozen(QUICK_OPERATIONS)).toBe(true)
    for (const operation of QUICK_OPERATIONS) {
      expect(Object.isFrozen(operation)).toBe(true)
      expect(Object.isFrozen(operation.settings)).toBe(true)
      if (operation.practiceObjective) expect(Object.isFrozen(operation.practiceObjective)).toBe(true)
    }
    expect(QUICK_OPERATION_CONTENT_VERSION).toBe(1)
    expect(P04_TACTICAL_CHALLENGE_CONTENT_VERSION).toBe(2)
  })

  it('preserves P03 Last Light and gives only P04 descriptors a finite curated seed', () => {
    expect(quickOperationById('last-light-siege')).toMatchObject({
      id: 'last-light-siege',
      practiceObjective: {
        contentVersion: QUICK_OPERATION_CONTENT_VERSION,
        fieldOrderId: 'hold-the-field',
      },
    })
    for (const id of ['standard'] as const) {
      expect(quickOperationById(id)).not.toHaveProperty('practiceObjective')
    }
    for (const id of ['crosswind-range', 'caldera-run', 'lean-arsenal'] as const) {
      expect(quickOperationById(id).practiceObjective).toMatchObject({
        contentVersion: P04_TACTICAL_CHALLENGE_CONTENT_VERSION,
        seed: 42,
      })
      expect(operationOptions(id).seed).toBe(42)
    }
    expect(operationOptions('last-light-siege').seed).toBe(QUICK_DUEL_BASE_OPTIONS.seed)
  })

  it('fails closed to Standard through catalog lookup and launch composition', () => {
    const fallback = quickOperationById('untrusted-operation')
    expect(fallback.id).toBe('standard')

    const standardOptions = operationOptions('standard')
    const unknownOptions = operationOptions('untrusted-operation')
    expect(standardOptions).toEqual(QUICK_DUEL_BASE_OPTIONS)
    expect(unknownOptions).toEqual(standardOptions)
    expect(standardOptions).not.toBe(QUICK_DUEL_BASE_OPTIONS)
    expect(unknownOptions).not.toBe(QUICK_DUEL_BASE_OPTIONS)
  })

  it('makes Crosswind mechanically distinct from the unchanged Standard duel', () => {
    expect(operationOptions('standard').walls).toBe('concrete')
    expect(operationOptions('crosswind-range').walls).toBe('wrap')
  })

  it('keeps the explicit First Salvo projection separate from Standard Duel', () => {
    const threeRoundBase = { ...QUICK_DUEL_BASE_OPTIONS, rounds: 3 }
    const firstSalvo = quickOperationOptions('first-salvo', threeRoundBase)
    const standard = quickOperationOptions('standard', threeRoundBase)

    expect(firstSalvo).toEqual({ ...threeRoundBase, rounds: 1 })
    expect(standard).toEqual(threeRoundBase)
    expect(firstSalvo).not.toBe(threeRoundBase)
  })

  it.each([
    'first-salvo',
    'crosswind-range',
    'caldera-run',
    'last-light-siege',
    'lean-arsenal',
  ] as const)('%s composes the selected profile once and keeps clone/replay deterministic', (id) => {
    const options = operationOptions(id)
    expect(options).toMatchObject(quickOperationById(id).settings)
    expect(options).toMatchObject({
      maxPlayers: 2,
      seed: quickOperationById(id).practiceObjective?.contentVersion === P04_TACTICAL_CHALLENGE_CONTENT_VERSION
        ? 42
        : 0x0bada55,
      players: QUICK_DUEL_BASE_OPTIONS.players,
    })
    expect(options).not.toBe(QUICK_DUEL_BASE_OPTIONS)

    const original = new GameEngine(options)
    expect(original.applyAction({ type: 'set_angle', angle: 90 })).toBe(true)
    expect(original.applyAction({ type: 'set_power', power: 1 })).toBe(true)

    const clone = original.clone()
    expect(clone.getState()).toEqual(original.getState())

    expect(original.applyAction({ type: 'fire' })).toBe(true)
    expect(clone.applyAction({ type: 'fire' })).toBe(true)
    finish(original)
    finish(clone)

    const replay = new GameEngine(options)
    applyShotLog(replay)

    expect(clone.getState()).toEqual(original.getState())
    expect(replay.getState()).toEqual(original.getState())
  }, 15_000)
})
