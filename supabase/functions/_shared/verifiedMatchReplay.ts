import { GameEngine } from '../../../shared/src/engine/GameEngine.ts'
import {
  replayNetworkAction,
  type NetworkAction,
} from '../../../shared/src/net/replay.ts'
import { ACCESSORIES, WEAPONS, type AccessoryType, type WeaponType } from '../../../shared/src/engine/WeaponSystem.ts'
import type { GameOptions, TeamId } from '../../../shared/src/types/GameOptions.ts'
import type { GamePhase, GameState, TankState } from '../../../shared/src/types/GameState.ts'

export const VERIFIED_REPLAY_MAX_ACTIONS = 15
export const VERIFIED_REPLAY_MAX_TURN_ACTIONS = 14
export const VERIFIED_REPLAY_MAX_TICKS = 448
export const VERIFIED_REPLAY_MAX_TICKS_PER_TURN = 198

export type VerifiedReplayErrorCode =
  | 'invalid_config'
  | 'invalid_limits'
  | 'empty_transcript'
  | 'action_limit'
  | 'turn_action_limit'
  | 'invalid_action'
  | 'illegal_action'
  | 'tick_limit'
  | 'turn_tick_limit'
  | 'trailing_action'
  | 'non_terminal'

export class VerifiedReplayError extends Error {
  readonly code: VerifiedReplayErrorCode

  constructor(code: VerifiedReplayErrorCode) {
    super(code)
    this.name = 'VerifiedReplayError'
    this.code = code
  }
}

export interface VerifiedReplayResult {
  phase: 'GAME_OVER'
  winner: string | null
  winnerTeam: TeamId | null
  turn: number
  actionCount: number
  tickCount: number
  maxTurnTickCount: number
}

export interface VerifiedReplayLimits {
  maxActions?: number
  maxTurnActions?: number
  maxTicks?: number
  maxTicksPerTurn?: number
}

interface VerifiedMatchConfig {
  engineVersion: 1
  rulesetVersion: 3
  options: GameOptions
}

const CONFIG_KEYS = ['engineVersion', 'options', 'rulesetVersion'] as const
const OPTION_KEYS = [
  'armsLevel',
  'gravity',
  'hazards',
  'interestRate',
  'maxPlayers',
  'maxWind',
  'players',
  'rounds',
  'seed',
  'starterWeaponFalloff',
  'suddenDeathTurn',
  'teamMode',
  'walls',
] as const

function fail(code: VerifiedReplayErrorCode): never {
  throw new VerifiedReplayError(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function finiteBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function safeIntegerBetween(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
}

function parsePlayer(value: unknown): NonNullable<GameOptions['players']>[number] | null {
  if (!isRecord(value)) return null
  const optional = [
    ...(Object.hasOwn(value, 'ai') ? ['ai'] : []),
    ...(Object.hasOwn(value, 'team') ? ['team'] : []),
  ]
  if (!hasExactKeys(value, ['color', 'name', ...optional])) return null
  if (typeof value.name !== 'string' || value.name !== value.name.trim() || value.name.length < 1 || value.name.length > 40) return null
  if (typeof value.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.color)) return null
  if (value.ai !== undefined && value.ai !== 'easy' && value.ai !== 'medium' && value.ai !== 'hard') return null
  if (value.team !== undefined && value.team !== 1 && value.team !== 2) return null
  return {
    name: value.name,
    color: value.color,
    ...(value.ai ? { ai: value.ai } : {}),
    ...(value.team ? { team: value.team } : {}),
  }
}

function parseConfig(value: unknown): VerifiedMatchConfig {
  if (!isRecord(value) || !hasExactKeys(value, CONFIG_KEYS)) fail('invalid_config')
  if (value.engineVersion !== 1 || value.rulesetVersion !== 3 || !isRecord(value.options)) fail('invalid_config')
  const options = value.options
  if (!hasExactKeys(options, OPTION_KEYS)) fail('invalid_config')
  if (!safeIntegerBetween(options.maxPlayers, 2, 4)) fail('invalid_config')
  if (!Array.isArray(options.players) || options.players.length !== options.maxPlayers) fail('invalid_config')
  const players = options.players.map(parsePlayer)
  if (players.some((player) => player === null)) fail('invalid_config')
  const parsedPlayers = players as NonNullable<GameOptions['players']>
  if (new Set(parsedPlayers.map((player) => player.name.toLocaleLowerCase())).size !== parsedPlayers.length) fail('invalid_config')
  if (new Set(parsedPlayers.map((player) => player.color.toLocaleLowerCase())).size !== parsedPlayers.length) fail('invalid_config')
  if (parsedPlayers.every((player) => player.ai !== undefined)) fail('invalid_config')
  if (!safeIntegerBetween(options.seed, 0, 0xffff_ffff)) fail('invalid_config')
  if (!finiteBetween(options.maxWind, 0, 10)) fail('invalid_config')
  if (!finiteBetween(options.gravity, 0.15, 0.4)) fail('invalid_config')
  if (options.walls !== 'open' && options.walls !== 'reflective' && options.walls !== 'wrap' && options.walls !== 'concrete') fail('invalid_config')
  if (options.hazards !== 'none' && options.hazards !== 'lava') fail('invalid_config')
  if (options.rounds !== 1 && options.rounds !== 3) fail('invalid_config')
  if (!finiteBetween(options.interestRate, 0, 0.5)) fail('invalid_config')
  if (!safeIntegerBetween(options.suddenDeathTurn, 0, 50)) fail('invalid_config')
  if (!safeIntegerBetween(options.armsLevel, 0, 4)) fail('invalid_config')
  if (typeof options.teamMode !== 'boolean' || (options.teamMode && options.maxPlayers !== 4)) fail('invalid_config')
  if (options.teamMode) {
    if (
      parsedPlayers.filter((player) => player.team === 1).length !== 2
      || parsedPlayers.filter((player) => player.team === 2).length !== 2
    ) fail('invalid_config')
  } else if (parsedPlayers.some((player) => player.team !== undefined)) {
    fail('invalid_config')
  }
  if (options.starterWeaponFalloff !== 'decisive') fail('invalid_config')

  return {
    engineVersion: 1,
    rulesetVersion: 3,
    options: {
      maxPlayers: options.maxPlayers,
      players: parsedPlayers,
      seed: options.seed,
      maxWind: options.maxWind,
      gravity: options.gravity,
      walls: options.walls,
      hazards: options.hazards,
      rounds: options.rounds,
      interestRate: options.interestRate,
      suddenDeathTurn: options.suddenDeathTurn,
      armsLevel: options.armsLevel,
      teamMode: options.teamMode,
      starterWeaponFalloff: 'decisive',
      rulesetVersion: 3,
    },
  }
}

function parseLimits(value: VerifiedReplayLimits | undefined): Required<VerifiedReplayLimits> {
  if (value === undefined) {
    return {
      maxActions: VERIFIED_REPLAY_MAX_ACTIONS,
      maxTurnActions: VERIFIED_REPLAY_MAX_TURN_ACTIONS,
      maxTicks: VERIFIED_REPLAY_MAX_TICKS,
      maxTicksPerTurn: VERIFIED_REPLAY_MAX_TICKS_PER_TURN,
    }
  }
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    'maxActions',
    'maxTurnActions',
    'maxTicks',
    'maxTicksPerTurn',
  ].includes(key))) fail('invalid_limits')
  const maxActions = value.maxActions ?? VERIFIED_REPLAY_MAX_ACTIONS
  const maxTurnActions = value.maxTurnActions ?? VERIFIED_REPLAY_MAX_TURN_ACTIONS
  const maxTicks = value.maxTicks ?? VERIFIED_REPLAY_MAX_TICKS
  const maxTicksPerTurn = value.maxTicksPerTurn ?? VERIFIED_REPLAY_MAX_TICKS_PER_TURN
  if (!safeIntegerBetween(maxActions, 1, VERIFIED_REPLAY_MAX_ACTIONS)) fail('invalid_limits')
  if (!safeIntegerBetween(maxTurnActions, 1, VERIFIED_REPLAY_MAX_TURN_ACTIONS)) fail('invalid_limits')
  if (!safeIntegerBetween(maxTicks, 1, VERIFIED_REPLAY_MAX_TICKS)) fail('invalid_limits')
  if (!safeIntegerBetween(maxTicksPerTurn, 1, VERIFIED_REPLAY_MAX_TICKS_PER_TURN)) fail('invalid_limits')
  return { maxActions, maxTurnActions, maxTicks, maxTicksPerTurn }
}

function parseAction(value: unknown): NetworkAction {
  if (!isRecord(value) || typeof value.type !== 'string') fail('invalid_action')
  switch (value.type) {
    case 'fire': {
      if (!hasExactKeys(value, ['angle', 'power', 'type', 'weapon'])) fail('invalid_action')
      if (!finiteBetween(value.angle, 0, 180) || typeof value.power !== 'number' || !Number.isFinite(value.power) || value.power < 0) fail('invalid_action')
      if (typeof value.weapon !== 'string' || !Object.hasOwn(WEAPONS, value.weapon) || value.weapon === 'shield' || value.weapon === 'heavy_shield') fail('invalid_action')
      return { type: 'fire', angle: value.angle, power: value.power, weapon: value.weapon }
    }
    case 'use_shield':
      if (!hasExactKeys(value, ['type', 'weapon']) || (value.weapon !== 'shield' && value.weapon !== 'heavy_shield')) fail('invalid_action')
      return { type: 'use_shield', weapon: value.weapon }
    case 'move':
      if (!hasExactKeys(value, ['delta', 'type']) || !safeIntegerBetween(value.delta, -8, 8) || value.delta === 0) fail('invalid_action')
      return { type: 'move', delta: value.delta }
    case 'next_round':
      if (!hasExactKeys(value, ['type'])) fail('invalid_action')
      return { type: 'next_round' }
    case 'buy': {
      const hasWeapon = Object.hasOwn(value, 'weapon')
      const hasAccessory = Object.hasOwn(value, 'accessory')
      const hasTankId = Object.hasOwn(value, 'tankId')
      const keys = ['type', ...(hasWeapon ? ['weapon'] : []), ...(hasAccessory ? ['accessory'] : []), ...(hasTankId ? ['tankId'] : [])]
      if (!hasExactKeys(value, keys) || hasWeapon === hasAccessory) fail('invalid_action')
      if (hasWeapon && (typeof value.weapon !== 'string' || !Object.hasOwn(WEAPONS, value.weapon))) fail('invalid_action')
      if (hasAccessory && (typeof value.accessory !== 'string' || !Object.hasOwn(ACCESSORIES, value.accessory))) fail('invalid_action')
      if (hasTankId && (typeof value.tankId !== 'string' || !/^p[1-4]$/.test(value.tankId))) fail('invalid_action')
      return {
        type: 'buy',
        ...(hasWeapon ? { weapon: value.weapon as WeaponType } : {}),
        ...(hasAccessory ? { accessory: value.accessory as AccessoryType } : {}),
        ...(hasTankId ? { tankId: value.tankId as string } : {}),
      }
    }
    default:
      return fail('invalid_action')
  }
}

function activeTank(state: GameState): TankState {
  const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)
  if (!tank) fail('illegal_action')
  return tank
}

function purchaseSnapshot(tank: TankState): string {
  return JSON.stringify({
    credits: tank.credits,
    fuel: tank.fuel,
    powerCap: tank.powerCap,
    parachutes: tank.accessories.parachute,
    inventory: Object.fromEntries(Object.entries(tank.inventory).map(([key, slot]) => [key, slot.count])),
  })
}

function applyExactAction(engine: GameEngine, action: NetworkAction): void {
  const before = engine.getState()
  if (action.type === 'next_round') {
    if (before.phase !== 'ROUND_OVER') fail('illegal_action')
    replayNetworkAction(engine, action)
    if (engine.getState().phase !== 'PLAYER_TURN') fail('illegal_action')
    return
  }

  if (action.type === 'buy') {
    if (before.phase !== 'PLAYER_TURN' && before.phase !== 'ROUND_OVER') fail('illegal_action')
    if (before.phase === 'PLAYER_TURN' && action.tankId !== undefined) fail('illegal_action')
    if (before.phase === 'ROUND_OVER' && action.tankId === undefined) fail('illegal_action')
    const target = action.tankId
      ? before.tanks.find((tank) => tank.id === action.tankId)
      : activeTank(before)
    if (!target) fail('illegal_action')
    const snapshot = purchaseSnapshot(target)
    replayNetworkAction(engine, action)
    if (purchaseSnapshot(target) === snapshot) fail('illegal_action')
    return
  }

  if (before.phase !== 'PLAYER_TURN') fail('illegal_action')
  const tank = activeTank(before)

  if (action.type === 'fire') {
    const slot = tank.inventory[action.weapon as WeaponType]
    if (!slot || (!slot.unlimited && slot.count <= 0) || action.power > tank.powerCap) fail('illegal_action')
    replayNetworkAction(engine, action)
    if (engine.getState().phase !== 'FIRING') fail('illegal_action')
    return
  }

  if (action.type === 'use_shield') {
    const slot = tank.inventory[action.weapon ?? 'shield']
    if (!slot || (!slot.unlimited && slot.count <= 0)) fail('illegal_action')
    const turn = before.turn
    replayNetworkAction(engine, action)
    const after = engine.getState()
    if (after.turn === turn && after.phase === 'PLAYER_TURN') fail('illegal_action')
    return
  }

  const x = tank.x
  const fuel = tank.fuel
  replayNetworkAction(engine, action)
  if (tank.x === x && tank.fuel === fuel) fail('illegal_action')
}

function isResolving(phase: GamePhase): boolean {
  return phase === 'FIRING' || phase === 'RESOLVING'
}

export function replayVerifiedTranscript(
  rawConfig: unknown,
  rawTranscript: unknown,
  requestedLimits?: VerifiedReplayLimits,
): VerifiedReplayResult {
  const config = parseConfig(rawConfig)
  const limits = parseLimits(requestedLimits)
  if (!Array.isArray(rawTranscript) || rawTranscript.length === 0) fail('empty_transcript')
  if (rawTranscript.length > limits.maxActions) fail('action_limit')
  const transcript = rawTranscript.map(parseAction)
  const turnActionCount = transcript.filter((action) => (
    action.type === 'fire' || action.type === 'use_shield'
  )).length
  if (turnActionCount > limits.maxTurnActions) fail('turn_action_limit')

  const engine = new GameEngine(config.options)
  let tickCount = 0
  let actionCount = 0
  let maxTurnTickCount = 0

  for (const [index, action] of transcript.entries()) {
    if (engine.getState().phase === 'GAME_OVER') fail('trailing_action')
    applyExactAction(engine, action)
    actionCount += 1
    let turnTickCount = 0

    while (isResolving(engine.getState().phase)) {
      if (tickCount >= limits.maxTicks) fail('tick_limit')
      if (turnTickCount >= limits.maxTicksPerTurn) fail('turn_tick_limit')
      engine.tick()
      tickCount += 1
      turnTickCount += 1
    }
    maxTurnTickCount = Math.max(maxTurnTickCount, turnTickCount)

    if (engine.getState().phase === 'GAME_OVER' && index + 1 < transcript.length) {
      fail('trailing_action')
    }
  }

  const state = engine.getState()
  if (state.phase !== 'GAME_OVER') fail('non_terminal')
  if (actionCount !== transcript.length) fail('illegal_action')
  return {
    phase: 'GAME_OVER',
    winner: state.winner,
    winnerTeam: state.winnerTeam ?? null,
    turn: state.turn,
    actionCount,
    tickCount,
    maxTurnTickCount,
  }
}
