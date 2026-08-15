import { describe, expect, it } from 'vitest'
import { GameEngine } from '@shared/engine/GameEngine'
import type { GameOptions } from '@shared/types/GameOptions'
import {
  QUICK_OPERATIONS,
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
        id: 'crosswind-range',
        title: 'Crosswind Range',
        briefing: 'Wraparound walls turn shifting wind into a ranging test.',
        settings: { walls: 'wrap', battlefieldWorld: 'glassstorm-expanse' },
      },
      {
        id: 'caldera-run',
        title: 'Caldera Run',
        briefing: 'Lava terrain turns every crater into a positional risk.',
        settings: { hazards: 'lava', battlefieldWorld: 'obsidian-caldera' },
      },
      {
        id: 'last-light-siege',
        title: 'Last Light Siege',
        briefing: 'A best-of-three duel that tightens into sudden death.',
        settings: { rounds: 3, suddenDeathTurn: 12, battlefieldWorld: 'ember-dusk' },
      },
    ] satisfies QuickOperation[])
    expect(Object.isFrozen(QUICK_OPERATIONS)).toBe(true)
    for (const operation of QUICK_OPERATIONS) {
      expect(Object.isFrozen(operation)).toBe(true)
      expect(Object.isFrozen(operation.settings)).toBe(true)
    }
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

  it.each([
    'crosswind-range',
    'caldera-run',
    'last-light-siege',
  ] as const)('%s composes the selected profile once and keeps clone/replay deterministic', (id) => {
    const options = operationOptions(id)
    expect(options).toMatchObject(quickOperationById(id).settings)
    expect(options).toMatchObject({
      maxPlayers: 2,
      seed: 0x0bada55,
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
