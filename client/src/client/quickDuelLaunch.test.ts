import { describe, expect, it } from 'vitest'
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout'
import { composeQuickDuelLaunch } from './quickDuelLaunch'
import { QUICK_OPERATIONS } from './quickOperations'

const human = { name: 'Local Commander', color: '#e84d4d', loadout: DEFAULT_TANK_LOADOUT }
const cpu = { name: 'CPU 1', color: '#4d8ce8', ai: 'medium' as const, loadout: DEFAULT_TANK_LOADOUT }

describe('Quick Duel launch composition', () => {
  it.each([
    ['last-light-siege', 123456, 'imported-public-challenge', {
      seed: 123456, rounds: 3, suddenDeathTurn: 12, battlefieldWorld: 'ember-dusk',
    }],
    ['crosswind-range', 42, 'local-selection', {
      seed: 42, rounds: 3, walls: 'wrap', battlefieldWorld: 'glassstorm-expanse',
    }],
    ['caldera-run', 42, 'local-selection', {
      seed: 42, rounds: 3, hazards: 'lava', battlefieldWorld: 'obsidian-caldera',
    }],
    ['lean-arsenal', 42, 'local-selection', {
      seed: 42, rounds: 3, armsLevel: 0,
    }],
  ] as const)('composes %s through the same two-seat Medium CPU seam', (operationId, seed, origin, settings) => {
    const operation = QUICK_OPERATIONS.find((candidate) => candidate.id === operationId)!
    const launch = composeQuickDuelLaunch({ operation, seed, origin, human, cpu })
    expect(launch).toMatchObject({
      mode: 'hotseat',
      players: [human, cpu],
      playerNames: ['Local Commander', 'CPU 1'],
      settings,
      quickOperation: { id: operationId },
      publicSeedChallenge: { operationId, seed, origin },
    })
    expect(launch.players[1]?.ai).toBe('medium')
    expect(launch.settings).toEqual(settings)
  })

  it('keeps unsupported operations playable locally but ineligible for sharing', () => {
    const operation = QUICK_OPERATIONS.find((candidate) => candidate.id === 'standard')!
    const launch = composeQuickDuelLaunch({ operation, seed: 9, origin: 'local-selection', human, cpu })
    expect(launch.publicSeedChallenge).toBeUndefined()
  })
})
