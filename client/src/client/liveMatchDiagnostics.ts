import type { ConnectionState } from './GameClient'
import type { GamePhase } from '@shared/types/GameState'

export type LiveMatchInputState = 'ready' | 'locked' | 'frozen'

export interface LiveMatchDiagnosticsSource {
  readonly mode: 'hotseat' | 'network'
  readonly execution: 'casual' | 'verified'
  readonly phase: GamePhase
  readonly round: number
  readonly totalRounds: number
  readonly turn: number
  readonly activeSeatOrdinal: number
  readonly activeSeatAlive: boolean
  readonly activeSeatHealth: number
  readonly input: LiveMatchInputState
  readonly transport: 'not-applicable' | ConnectionState
}

export interface LiveMatchSnapshot {
  readonly schemaVersion: 1
  readonly mode: 'hotseat' | 'network'
  readonly execution: 'casual' | 'verified'
  readonly phase: GamePhase
  readonly round: number
  readonly totalRounds: number
  readonly turn: number
  readonly activeSeat: {
    readonly ordinal: number
    readonly alive: boolean
    readonly health: number
  }
  readonly input: LiveMatchInputState
  readonly transport: 'not-applicable' | ConnectionState
}

const PHASES = new Set<GamePhase>([
  'LOBBY', 'PLAYER_TURN', 'FIRING', 'RESOLVING', 'ROUND_OVER', 'GAME_OVER',
])

const INPUT_STATES = new Set<LiveMatchInputState>(['ready', 'locked', 'frozen'])
const TRANSPORT_STATES = new Set<LiveMatchSnapshot['transport']>([
  'not-applicable', 'connecting', 'connected', 'reconnecting',
])

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1
}

function boundedHealth(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100
}

/**
 * Projects the explicitly allowed live-game facts for the maintainer-only
 * diagnostics overlay. This function deliberately accepts no room, player,
 * account, action-log, seed, terrain, or credential fields.
 */
export function projectLiveMatchSnapshot(
  source: LiveMatchDiagnosticsSource,
): LiveMatchSnapshot | undefined {
  if (
    (source.mode !== 'hotseat' && source.mode !== 'network')
    || (source.execution !== 'casual' && source.execution !== 'verified')
    || !PHASES.has(source.phase)
    || !positiveInteger(source.round)
    || !positiveInteger(source.totalRounds)
    || source.round > source.totalRounds
    || !Number.isSafeInteger(source.turn) || source.turn < 0
    || !positiveInteger(source.activeSeatOrdinal)
    || typeof source.activeSeatAlive !== 'boolean'
    || !boundedHealth(source.activeSeatHealth)
    || !INPUT_STATES.has(source.input)
    || !TRANSPORT_STATES.has(source.transport)
    || (source.mode === 'hotseat') !== (source.transport === 'not-applicable')
  ) return undefined

  return Object.freeze({
    schemaVersion: 1 as const,
    mode: source.mode,
    execution: source.execution,
    phase: source.phase,
    round: source.round,
    totalRounds: source.totalRounds,
    turn: source.turn,
    activeSeat: Object.freeze({
      ordinal: source.activeSeatOrdinal,
      alive: source.activeSeatAlive,
      health: source.activeSeatHealth,
    }),
    input: source.input,
    transport: source.transport,
  })
}
