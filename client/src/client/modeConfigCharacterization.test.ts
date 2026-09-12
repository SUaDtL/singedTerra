import { describe, expect, it } from 'vitest'
import { GameEngine } from '@shared/engine/GameEngine'
import type { GameState } from '@shared/types/GameState'
import type { GameOptions } from '@shared/types/GameOptions'
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout'
import { HotSeatClient } from './HotSeatClient'
import { NetworkClient } from './NetworkClient'
import { buildClientEngineOptions } from './gameEngineOptions'
import { quickOperationOptions } from './quickOperations'
import { coerceSettings, type RawSettings } from '../ui/lobbyValidation'
import type { LobbyConfig } from '../ui/Lobby'

const players = [
  { id: 'seat-1', name: 'Player 1', color: '#e84d4d', team: 2 as const },
  { id: 'seat-2', name: 'Player 2', color: '#4d8ce8', team: 1 as const },
  { id: 'seat-3', name: 'Player 3', color: '#4de87a', team: 2 as const },
  { id: 'seat-4', name: 'Player 4', color: '#e8c84d', team: 1 as const },
]

function raw(overrides: Partial<RawSettings> = {}): RawSettings {
  return {
    maxWind: '', gravity: '', seed: '', rounds: '', interestRate: '', suddenDeathTurn: '',
    armsLevel: '', walls: '', battlefieldWorld: '', hazards: '', teamMode: '', ...overrides,
  }
}

function config(mode: LobbyConfig['mode'], settings?: LobbyConfig['settings']): LobbyConfig {
  return { mode, players, playerNames: players.map(({ name }) => name), settings }
}

const OPTIONAL_SETTING_KEYS = [
  'seed', 'maxWind', 'gravity', 'walls', 'battlefieldWorld', 'hazards', 'rounds',
  'interestRate', 'suddenDeathTurn', 'armsLevel', 'teamMode',
] as const

function expectOwnSettings(
  options: ReturnType<typeof buildClientEngineOptions>,
  expected: Partial<Record<(typeof OPTIONAL_SETTING_KEYS)[number], unknown>>,
): void {
  for (const key of OPTIONAL_SETTING_KEYS) {
    expect(Object.hasOwn(options, key), `${key} own-property presence`).toBe(Object.hasOwn(expected, key))
    if (Object.hasOwn(expected, key)) expect(options[key]).toBe(expected[key])
  }
}

function expectExactState(actual: GameState | null, expected: GameState): void {
  if (actual === null) throw new Error('Expected an initialized game state');
  const actualTerrain = Buffer.from(actual.terrain.buffer, actual.terrain.byteOffset, actual.terrain.byteLength)
  const expectedTerrain = Buffer.from(expected.terrain.buffer, expected.terrain.byteOffset, expected.terrain.byteLength)
  const terrainComparison = Buffer.compare(actualTerrain, expectedTerrain)
  let mismatch = -1
  if (terrainComparison !== 0) {
    const length = Math.min(actualTerrain.length, expectedTerrain.length)
    mismatch = length
    for (let index = 0; index < length; index += 1) {
      if (actualTerrain[index] !== expectedTerrain[index]) { mismatch = index; break }
    }
  }
  expect(terrainComparison, `terrain differs at byte ${mismatch}`).toBe(0)
  const { terrain: _actualTerrain, ...actualState } = actual
  const { terrain: _expectedTerrain, ...expectedState } = expected
  expect(actualState).toEqual(expectedState)
}

describe('mode configuration characterization', () => {
  it('distinguishes blank and malformed omission from explicit default values', () => {
    expect(coerceSettings(raw())).toBeUndefined()
    expect(coerceSettings(raw({
      maxWind: 'NaN', gravity: 'nope', seed: 'Infinity', rounds: 'many', interestRate: '?',
      suddenDeathTurn: 'later', armsLevel: 'all', walls: 'lava', battlefieldWorld: 'automatic',
      hazards: 'ice', teamMode: 'free-for-all',
    }))).toBeUndefined()
    expect(coerceSettings(raw({
      maxWind: '10', gravity: '0.15', rounds: '1', interestRate: '0',
      suddenDeathTurn: '0', armsLevel: '4', walls: 'open',
    }))).toEqual({
      maxWind: 10, gravity: 0.15, rounds: 1, interestRate: 0, suddenDeathTurn: 0, armsLevel: 4,
    })
  })

  it('pins blank, malformed, and explicit-default own properties and exact initial states in both modes', () => {
    const malformed = coerceSettings(raw({
      maxWind: 'NaN', gravity: 'nope', seed: 'Infinity', rounds: 'many', interestRate: '?',
      suddenDeathTurn: 'later', armsLevel: 'all', walls: 'lava', battlefieldWorld: 'automatic',
      hazards: 'ice', teamMode: 'free-for-all',
    }))
    const explicitDefaults = coerceSettings(raw({
      maxWind: '10', gravity: '0.15', rounds: '1', interestRate: '0',
      suddenDeathTurn: '0', armsLevel: '4', walls: 'open',
    }))
    const scenarios: ReadonlyArray<{
      readonly name: string
      readonly settings: LobbyConfig['settings']
      readonly own: Partial<Record<(typeof OPTIONAL_SETTING_KEYS)[number], unknown>>
    }> = [
      { name: 'blank', settings: undefined, own: {} },
      { name: 'malformed', settings: malformed, own: {} },
      {
        name: 'explicit defaults', settings: explicitDefaults,
        own: { maxWind: 10, gravity: 0.15, rounds: 1, interestRate: 0, suddenDeathTurn: 0, armsLevel: 4 },
      },
    ]
    // Independent explicit engine inputs pin defaults, rather than deriving the
    // expected state through the same builder under characterization.
    const canonicalEngine = new GameEngine({
      maxPlayers: 4, players: players.map(player => ({ ...player, loadout: { ...DEFAULT_TANK_LOADOUT } })),
      seed: 0x5eed1234, maxWind: 10, gravity: 0.15, walls: 'open', hazards: 'none',
      rounds: 1, interestRate: 0, suddenDeathTurn: 0, armsLevel: 4, teamMode: false,
      starterWeaponFalloff: 'decisive',
    })
    const canonical = canonicalEngine.getState()
    expect(canonicalEngine.getEffectiveGravity()).toBe(0.15)
    expect(canonical).toMatchObject({ phase: 'PLAYER_TURN', turn: 0, round: 1, totalRounds: 1, walls: 'open' })

    for (const scenario of scenarios) {
      const hotOptions = buildClientEngineOptions({
        ...config('hotseat', scenario.settings), mode: 'hotseat',
      })
      expectOwnSettings(hotOptions, scenario.own)
      expectExactState(new HotSeatClient(new GameEngine(hotOptions)).getState(), canonical)

      const networkOptions = buildClientEngineOptions({
        ...config('network', { ...scenario.settings, rulesetVersion: 4 }), mode: 'network',
      })
      expectOwnSettings(networkOptions, {
        seed: undefined, maxWind: scenario.own.maxWind, gravity: scenario.own.gravity,
        walls: undefined, battlefieldWorld: undefined, hazards: undefined,
        rounds: scenario.own.rounds, interestRate: scenario.own.interestRate,
        suddenDeathTurn: scenario.own.suddenDeathTurn, armsLevel: scenario.own.armsLevel,
        teamMode: undefined,
      })
      const networkClient = new NetworkClient(
        {} as ConstructorParameters<typeof NetworkClient>[0],
        'room-1', 'seat-1', networkOptions, 'seat-credential', 2,
      )
      expectExactState(networkClient.getState(), canonical)
    }
  })

  it('pins raw clamp, truncation, enum, and team coercion without materializing defaults', () => {
    expect(coerceSettings(raw({
      maxWind: '-4', gravity: '4', seed: '12.9', rounds: '4.9', interestRate: '2',
      suddenDeathTurn: '12.8', armsLevel: '2.7', walls: 'wrap',
      battlefieldWorld: 'glassstorm-expanse', hazards: 'lava', teamMode: '2v2',
    }))).toEqual({
      maxWind: 0,
      gravity: 0.4,
      seed: 12,
      rounds: 5,
      interestRate: 0.5,
      suddenDeathTurn: 12,
      armsLevel: 2,
      walls: 'wrap',
      battlefieldWorld: 'glassstorm-expanse',
      hazards: 'lava',
      teamMode: true,
    })
  })

  it('pins omitted defaults and explicit four-seat teams through both client engine initializations', () => {
    const omittedOptions = buildClientEngineOptions({ ...config('hotseat'), mode: 'hotseat' })
    expect(Object.hasOwn(omittedOptions, 'seed')).toBe(false)
    expect(Object.hasOwn(omittedOptions, 'maxWind')).toBe(false)
    expect(Object.hasOwn(omittedOptions, 'gravity')).toBe(false)
    expect(omittedOptions).toMatchObject({ maxPlayers: 4, starterWeaponFalloff: 'decisive' })
    expect(new GameEngine(omittedOptions).getState().tanks.map((tank) => tank.team))
      .toEqual([null, null, null, null])

    const hotOptions = buildClientEngineOptions({
      ...config('hotseat', { teamMode: true }), mode: 'hotseat',
    })
    const hotClient = new HotSeatClient(new GameEngine(hotOptions))
    expect(hotClient.getState()).toMatchObject({
      phase: 'PLAYER_TURN', totalRounds: 1, walls: 'open',
      tanks: players.map(({ color, team }) => ({ color, team })),
    })

    const networkOptions = buildClientEngineOptions({
      ...config('network', { rulesetVersion: 4, teamMode: true }), mode: 'network',
    })
    expect(networkOptions).toMatchObject({
      maxPlayers: 4, rulesetVersion: 4, teamMode: true, starterWeaponFalloff: 'decisive',
    })
    expect(Object.hasOwn(networkOptions, 'seed')).toBe(true)
    expect(networkOptions.seed).toBeUndefined()
    const networkClient = new NetworkClient(
      {} as ConstructorParameters<typeof NetworkClient>[0],
      'room-1', 'seat-1', networkOptions, 'seat-credential', 2,
    )
    expect(networkClient.getState()).toMatchObject({
      phase: 'PLAYER_TURN', totalRounds: 1, walls: 'open',
      tanks: players.map(({ color, team }) => ({ color, team })),
    })
  })

  it('pins every custom setting, exact options, and initial state in both modes', () => {
    const custom = {
      seed: 73, maxWind: 7, gravity: 0.22, walls: 'wrap' as const,
      battlefieldWorld: 'glassstorm-expanse' as const, hazards: 'lava' as const,
      rounds: 5, interestRate: 0.25, suddenDeathTurn: 12, armsLevel: 2, teamMode: true,
    }
    const settings = coerceSettings(raw({
      seed: '73', maxWind: '7', gravity: '0.22', walls: 'wrap', battlefieldWorld: 'glassstorm-expanse',
      hazards: 'lava', rounds: '5', interestRate: '0.25', suddenDeathTurn: '12', armsLevel: '2', teamMode: '2v2',
    }))
    expect(settings).toEqual(custom)
    const expected: GameOptions = {
      ...custom, maxPlayers: 4, starterWeaponFalloff: 'decisive',
      players: players.map(player => ({ ...player, loadout: { ...DEFAULT_TANK_LOADOUT } })),
    }
    const hot = buildClientEngineOptions({ ...config('hotseat', settings), mode: 'hotseat' })
    const network = buildClientEngineOptions({ ...config('network', { ...settings, rulesetVersion: 4 }), mode: 'network' })
    expect(hot).toEqual(expected)
    expect(network).toEqual({ ...expected, rulesetVersion: 4 })
    expectOwnSettings(hot, custom)
    expectOwnSettings(network, custom)
    const canonical = new GameEngine(expected)
    const hotClient = new HotSeatClient(new GameEngine(hot))
    const networkClient = new NetworkClient({} as ConstructorParameters<typeof NetworkClient>[0], 'room', 'seat-1', network, 'seat-credential', 2)
    expectExactState(hotClient.getState(), canonical.getState())
    expectExactState(networkClient.getState(), canonical.getState())
    expect(hotClient.getEffectiveGravity()).toBe(0.22)
    expect(networkClient.getEffectiveGravity()).toBe(0.22)
  })

  it.each([2, 4])('pins team activation and exact initial state with %s seats', (count) => {
    const roster = players.slice(0, count)
    const settings = coerceSettings(raw({ seed: '42', teamMode: '2v2' }))
    expect(settings).toEqual({ seed: 42, teamMode: true })
    const expected: GameOptions = {
      seed: 42, teamMode: true, maxPlayers: count, starterWeaponFalloff: 'decisive',
      players: roster.map(player => ({ ...player, loadout: { ...DEFAULT_TANK_LOADOUT } })),
    }
    const setup = { players: roster, playerNames: roster.map(player => player.name) }
    const hot = buildClientEngineOptions({ ...setup, mode: 'hotseat', settings })
    const network = buildClientEngineOptions({ ...setup, mode: 'network', settings: { ...settings, rulesetVersion: 4 } })
    const canonical = new GameEngine(expected).getState()
    expect(canonical.tanks.map(tank => tank.team)).toEqual(count === 4 ? [2, 1, 2, 1] : [null, null])
    expect(hot).toEqual(expected)
    expectExactState(new HotSeatClient(new GameEngine(hot)).getState(), canonical)
    expectExactState(new NetworkClient({} as ConstructorParameters<typeof NetworkClient>[0], 'room', 'seat-1', network, 'seat-credential', 2).getState(), canonical)
  })

  it('pins all authored Quick Operation overlays and unknown-operation copy semantics', () => {
    const base = buildClientEngineOptions({
      ...config('hotseat', { seed: 73, rounds: 7, walls: 'concrete' }), mode: 'hotseat',
    })
    const original = structuredClone(base)
    const cases = [
      ['standard', {}],
      ['crosswind-range', { walls: 'wrap', battlefieldWorld: 'glassstorm-expanse' }],
      ['caldera-run', { hazards: 'lava', battlefieldWorld: 'obsidian-caldera' }],
      ['last-light-siege', { rounds: 3, suddenDeathTurn: 12, battlefieldWorld: 'ember-dusk' }],
      ['unknown', {}],
    ] as const
    for (const [id, overlay] of cases) {
      const actual = quickOperationOptions(id, base)
      expect(actual).toEqual({ ...original, ...overlay })
      expect(actual).not.toBe(base)
      expect(actual.players).toBe(base.players)
      expect(actual.seed).toBe(73)
      expect(base).toEqual(original)
      expectExactState(new GameEngine(actual).getState(), new GameEngine({ ...original, ...overlay }).getState())
    }
  })
})
