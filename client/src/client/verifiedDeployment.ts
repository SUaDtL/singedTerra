import type { PlayerAction } from '@shared/types/PlayerAction'
import type { GameState } from '@shared/types/GameState'
import type { VerifiedHumanFire } from '@shared/net/verifiedDuel'
import {
  VERIFIED_DUEL_ALLOWED_SEEDS,
  VERIFIED_DUEL_MAX_HUMAN_SALVOS,
} from '@shared/net/verifiedDuel'

export const VERIFIED_DEPLOYMENT_CONTRACT_VERSION = 1 as const
export const VERIFIED_DEPLOYMENT_ENGINE_VERSION = 1 as const
export const VERIFIED_DEPLOYMENT_RULESET_VERSION = 3 as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function normalizeVerifiedDeploymentSessionId(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null
}

export interface VerifiedDeploymentLimits {
  readonly humanSalvos: 6
  readonly cpuSalvos: 6
  readonly angle: { readonly min: 0; readonly max: 180 }
  readonly power: { readonly min: 0; readonly max: 100 }
}

export interface VerifiedDeploymentConfig {
  readonly seed: 17 | 42 | 73 | 109
  readonly options: {
    readonly maxPlayers: 2
    readonly maxWind: 6
    readonly gravity: 0.15
    readonly walls: 'open'
    readonly hazards: 'none'
    readonly rounds: 1
    readonly interestRate: 0
    readonly suddenDeathTurn: 0
    readonly armsLevel: 0
    readonly starterWeaponFalloff: 'decisive'
    readonly teamMode: false
    readonly players: readonly [
      { readonly name: string; readonly color: '#e8554d' },
      { readonly name: 'CPU 1'; readonly color: '#3f78b8'; readonly ai: 'hard' },
    ]
  }
}

export interface VerifiedDeploymentDescriptor {
  readonly sessionId: string
  readonly expiresAt: string
  readonly contractVersion: 1
  readonly engineVersion: 1
  readonly rulesetVersion: 3
  readonly limits: VerifiedDeploymentLimits
  readonly config: VerifiedDeploymentConfig
}

export interface VerifiedDeploymentStart {
  readonly resumed: boolean
  readonly descriptor: VerifiedDeploymentDescriptor
}

export interface VerifiedDeploymentAbandonReceipt {
  readonly ok: true
  readonly sessionId: string
  readonly status: 'abandoned'
}

export interface VerifiedDeploymentResultReceipt {
  readonly sessionId: string
  readonly won: boolean
  readonly outcome: 'win' | 'loss' | 'draw'
  readonly verifiedXp: 100 | 200
}

export interface VerifiedDeploymentProgressionCounts {
  readonly matchesPlayed: number
  readonly wins: number
  readonly totalXp: number
}

export interface VerifiedDeploymentServerReceipt {
  readonly result: VerifiedDeploymentResultReceipt
  readonly progression: {
    readonly evidence: 'verified_replay_v1'
    readonly prior: VerifiedDeploymentProgressionCounts
    readonly current: VerifiedDeploymentProgressionCounts
  }
}

export interface VerifiedDeploymentProgressionSnapshot extends VerifiedDeploymentProgressionCounts {
  readonly evidence: 'verified_replay_v1'
  readonly progressionVersion: 1
  readonly level: number
  readonly levelXp: number
  readonly nextLevelXp: 500
}

export interface VerifiedDeploymentReceipt {
  readonly result: VerifiedDeploymentResultReceipt
  readonly progression: {
    readonly evidence: 'verified_replay_v1'
    readonly prior: VerifiedDeploymentProgressionSnapshot
    readonly current: VerifiedDeploymentProgressionSnapshot
  }
}

export interface VerifiedDeploymentDeadline {
  readonly remainingMs: number
  readonly warning: 'none' | 'five-minutes' | 'one-minute' | 'expired'
  readonly acceptsInput: boolean
  readonly canComplete: boolean
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index])
}

function canonicalIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^([1-9]\d{3})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value)
  if (!match) return null
  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond, fraction = '', zone, sign, rawOffsetHour, rawOffsetMinute] = match
  const year = Number(rawYear)
  const month = Number(rawMonth)
  const day = Number(rawDay)
  const hour = Number(rawHour)
  const minute = Number(rawMinute)
  const second = Number(rawSecond)
  const offsetHour = Number(rawOffsetHour ?? 0)
  const offsetMinute = Number(rawOffsetMinute ?? 0)
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59
    || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null
  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3))
  const offset = zone === 'Z' ? 0 : (offsetHour * 60 + offsetMinute) * (sign === '+' ? 1 : -1)
  const parsed = Date.UTC(year, month - 1, day, hour, minute - offset, second, milliseconds)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function normalizedDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = Array.from(value.trim().replace(/\s+/g, ' ')).slice(0, 24).join('').trim()
  const accepted = normalized || 'Commander'
  return value === accepted ? value : null
}

function parseLimits(value: unknown): VerifiedDeploymentLimits | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const limits = value as Record<string, unknown>
  if (!exactKeys(limits, ['humanSalvos', 'cpuSalvos', 'angle', 'power'])
    || limits.humanSalvos !== 6 || limits.cpuSalvos !== 6
    || !limits.angle || typeof limits.angle !== 'object' || Array.isArray(limits.angle)
    || !limits.power || typeof limits.power !== 'object' || Array.isArray(limits.power)) return null
  const angle = limits.angle as Record<string, unknown>
  const power = limits.power as Record<string, unknown>
  if (!exactKeys(angle, ['min', 'max']) || angle.min !== 0 || angle.max !== 180
    || !exactKeys(power, ['min', 'max']) || power.min !== 0 || power.max !== 100) return null
  return Object.freeze({
    humanSalvos: 6,
    cpuSalvos: 6,
    angle: Object.freeze({ min: 0, max: 180 }),
    power: Object.freeze({ min: 0, max: 100 }),
  })
}

function parseConfig(value: unknown): VerifiedDeploymentConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const config = value as Record<string, unknown>
  if (!exactKeys(config, ['seed', 'options'])
    || !(VERIFIED_DUEL_ALLOWED_SEEDS as readonly unknown[]).includes(config.seed)
    || !config.options || typeof config.options !== 'object' || Array.isArray(config.options)) return null
  const options = config.options as Record<string, unknown>
  if (!exactKeys(options, [
    'maxPlayers', 'maxWind', 'gravity', 'walls', 'hazards', 'rounds', 'interestRate',
    'suddenDeathTurn', 'armsLevel', 'starterWeaponFalloff', 'teamMode', 'players',
  ])
    || options.maxPlayers !== 2 || options.maxWind !== 6 || options.gravity !== 0.15
    || options.walls !== 'open' || options.hazards !== 'none' || options.rounds !== 1
    || options.interestRate !== 0 || options.suddenDeathTurn !== 0 || options.armsLevel !== 0
    || options.starterWeaponFalloff !== 'decisive' || options.teamMode !== false
    || !Array.isArray(options.players) || options.players.length !== 2) return null
  const [human, cpu] = options.players
  if (!human || typeof human !== 'object' || Array.isArray(human)
    || !cpu || typeof cpu !== 'object' || Array.isArray(cpu)) return null
  const humanPlayer = human as Record<string, unknown>
  const cpuPlayer = cpu as Record<string, unknown>
  const humanName = normalizedDisplayName(humanPlayer.name)
  if (!humanName || !exactKeys(humanPlayer, ['name', 'color']) || humanPlayer.color !== '#e8554d'
    || !exactKeys(cpuPlayer, ['name', 'color', 'ai']) || cpuPlayer.name !== 'CPU 1'
    || cpuPlayer.color !== '#3f78b8' || cpuPlayer.ai !== 'hard') return null
  const players = Object.freeze([
    Object.freeze({ name: humanName, color: '#e8554d' as const }),
    Object.freeze({ name: 'CPU 1' as const, color: '#3f78b8' as const, ai: 'hard' as const }),
  ]) as unknown as VerifiedDeploymentConfig['options']['players']
  return Object.freeze({
    seed: config.seed as VerifiedDeploymentConfig['seed'],
    options: Object.freeze({
      maxPlayers: 2,
      maxWind: 6,
      gravity: 0.15,
      walls: 'open' as const,
      hazards: 'none' as const,
      rounds: 1,
      interestRate: 0,
      suddenDeathTurn: 0,
      armsLevel: 0,
      starterWeaponFalloff: 'decisive' as const,
      teamMode: false,
      players,
    }),
  })
}

export function parseVerifiedDeploymentDescriptor(value: unknown): VerifiedDeploymentDescriptor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const descriptor = value as Record<string, unknown>
  const expiresAt = canonicalIsoTimestamp(descriptor.expiresAt)
  if (!exactKeys(descriptor, [
    'sessionId', 'expiresAt', 'contractVersion', 'engineVersion', 'rulesetVersion', 'limits', 'config',
  ])
    || !normalizeVerifiedDeploymentSessionId(descriptor.sessionId)
    || !expiresAt
    || descriptor.contractVersion !== VERIFIED_DEPLOYMENT_CONTRACT_VERSION
    || descriptor.engineVersion !== VERIFIED_DEPLOYMENT_ENGINE_VERSION
    || descriptor.rulesetVersion !== VERIFIED_DEPLOYMENT_RULESET_VERSION) return null
  const limits = parseLimits(descriptor.limits)
  const config = parseConfig(descriptor.config)
  if (!limits || !config) return null
  return Object.freeze({
    sessionId: normalizeVerifiedDeploymentSessionId(descriptor.sessionId)!,
    expiresAt,
    contractVersion: VERIFIED_DEPLOYMENT_CONTRACT_VERSION,
    engineVersion: VERIFIED_DEPLOYMENT_ENGINE_VERSION,
    rulesetVersion: VERIFIED_DEPLOYMENT_RULESET_VERSION,
    limits,
    config,
  })
}

export function parseVerifiedDeploymentStartResponse(value: unknown): VerifiedDeploymentStart | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const response = value as Record<string, unknown>
  if (!exactKeys(response, [
    'sessionId', 'resumed', 'expiresAt', 'contractVersion', 'engineVersion', 'rulesetVersion', 'limits', 'config',
  ]) || typeof response.resumed !== 'boolean') return null
  const { resumed, ...rawDescriptor } = response
  const descriptor = parseVerifiedDeploymentDescriptor(rawDescriptor)
  return descriptor ? Object.freeze({ resumed, descriptor }) : null
}

export function parseVerifiedDeploymentAbandonResponse(value: unknown): VerifiedDeploymentAbandonReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const response = value as Record<string, unknown>
  if (!exactKeys(response, ['ok', 'sessionId', 'status']) || response.ok !== true
    || !normalizeVerifiedDeploymentSessionId(response.sessionId)
    || response.status !== 'abandoned') return null
  return Object.freeze({ ok: true, sessionId: normalizeVerifiedDeploymentSessionId(response.sessionId)!, status: 'abandoned' })
}

export function parseVerifiedHumanFire(value: unknown): VerifiedHumanFire | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const fire = value as Record<string, unknown>
  if (!exactKeys(fire, ['angle', 'power'])
    || !Number.isInteger(fire.angle) || (fire.angle as number) < 0 || (fire.angle as number) > 180
    || !Number.isInteger(fire.power) || (fire.power as number) < 0 || (fire.power as number) > 100) return null
  return Object.freeze({ angle: fire.angle as number, power: fire.power as number })
}

export function parseVerifiedTranscript(value: unknown, allowEmpty = true): readonly VerifiedHumanFire[] | null {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
    || value.length > VERIFIED_DUEL_MAX_HUMAN_SALVOS) return null
  const transcript: VerifiedHumanFire[] = []
  for (const raw of value) {
    const fire = parseVerifiedHumanFire(raw)
    if (!fire) return null
    transcript.push(fire)
  }
  return Object.freeze(transcript)
}

function progressionCounts(value: unknown, allowZeroMatches: boolean): VerifiedDeploymentProgressionCounts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const counts = value as Record<string, unknown>
  if (!exactKeys(counts, ['matchesPlayed', 'wins', 'totalXp'])
    || !Number.isSafeInteger(counts.matchesPlayed) || (counts.matchesPlayed as number) < (allowZeroMatches ? 0 : 1)
    || !Number.isSafeInteger(counts.wins) || (counts.wins as number) < 0
    || (counts.wins as number) > (counts.matchesPlayed as number)
    || !Number.isSafeInteger(counts.totalXp) || (counts.totalXp as number) < 0) return null
  const expectedXp = (counts.matchesPlayed as number) * 100 + (counts.wins as number) * 100
  if (!Number.isSafeInteger(expectedXp) || counts.totalXp !== expectedXp) return null
  return Object.freeze({
    matchesPlayed: counts.matchesPlayed as number,
    wins: counts.wins as number,
    totalXp: counts.totalXp as number,
  })
}

export function parseVerifiedDeploymentCompletionResponse(value: unknown): VerifiedDeploymentServerReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const response = value as Record<string, unknown>
  if (!exactKeys(response, ['result', 'progression'])
    || !response.result || typeof response.result !== 'object' || Array.isArray(response.result)
    || !response.progression || typeof response.progression !== 'object' || Array.isArray(response.progression)) return null
  const rawResult = response.result as Record<string, unknown>
  const rawProgression = response.progression as Record<string, unknown>
  if (!exactKeys(rawResult, ['sessionId', 'won', 'outcome', 'verifiedXp'])
    || !normalizeVerifiedDeploymentSessionId(rawResult.sessionId)
    || typeof rawResult.won !== 'boolean'
    || (rawResult.outcome !== 'win' && rawResult.outcome !== 'loss' && rawResult.outcome !== 'draw')
    || (rawResult.verifiedXp !== 100 && rawResult.verifiedXp !== 200)
    || !exactKeys(rawProgression, ['evidence', 'prior', 'current'])
    || rawProgression.evidence !== 'verified_replay_v1') return null
  const correctResult = (rawResult.won && rawResult.outcome === 'win' && rawResult.verifiedXp === 200)
    || (!rawResult.won && (rawResult.outcome === 'loss' || rawResult.outcome === 'draw') && rawResult.verifiedXp === 100)
  if (!correctResult) return null
  const prior = progressionCounts(rawProgression.prior, true)
  const current = progressionCounts(rawProgression.current, false)
  if (!prior || !current
    || current.matchesPlayed !== prior.matchesPlayed + 1
    || current.wins !== prior.wins + (rawResult.won ? 1 : 0)
    || current.totalXp !== prior.totalXp + rawResult.verifiedXp) return null
  const result = Object.freeze({
    sessionId: normalizeVerifiedDeploymentSessionId(rawResult.sessionId)!,
    won: rawResult.won,
    outcome: rawResult.outcome,
    verifiedXp: rawResult.verifiedXp,
  }) as VerifiedDeploymentResultReceipt
  return Object.freeze({
    result,
    progression: Object.freeze({ evidence: 'verified_replay_v1' as const, prior, current }),
  })
}

export function sameVerifiedDeploymentDescriptor(
  left: unknown,
  right: unknown,
): left is VerifiedDeploymentDescriptor {
  const parsedLeft = parseVerifiedDeploymentDescriptor(left)
  const parsedRight = parseVerifiedDeploymentDescriptor(right)
  return Boolean(parsedLeft && parsedRight && JSON.stringify(parsedLeft) === JSON.stringify(parsedRight))
}

export function verifiedDeploymentDeadline(expiresAt: string, now = Date.now()): VerifiedDeploymentDeadline {
  const expires = Date.parse(expiresAt)
  const remainingMs = Number.isFinite(expires) ? Math.max(0, expires - now) : 0
  if (remainingMs === 0) {
    return Object.freeze({ remainingMs: 0, warning: 'expired', acceptsInput: false, canComplete: false })
  }
  const warning = remainingMs <= 60_000
    ? 'one-minute'
    : remainingMs <= 300_000
      ? 'five-minutes'
      : 'none'
  return Object.freeze({ remainingMs, warning, acceptsInput: true, canComplete: true })
}

export class VerifiedDeploymentRecorder {
  private commitments: VerifiedHumanFire[] = []

  observe(action: PlayerAction, before: GameState, accepted: boolean): boolean {
    if (!accepted || action.type !== 'fire' || this.commitments.length >= VERIFIED_DUEL_MAX_HUMAN_SALVOS) return false
    const tank = before.tanks.find((candidate) => candidate.id === before.activePlayerId)
    if (!tank || tank.ai || tank.selectedWeapon !== 'baby_missile') return false
    if (!Number.isInteger(tank.angle) || tank.angle < 0 || tank.angle > 180) return false
    if (!Number.isInteger(tank.power) || tank.power < 0 || tank.power > 100) return false
    this.commitments.push(Object.freeze({ angle: tank.angle, power: tank.power }))
    return true
  }

  get transcript(): readonly VerifiedHumanFire[] {
    return Object.freeze(this.commitments.map((entry) => Object.freeze({ ...entry })))
  }
}
