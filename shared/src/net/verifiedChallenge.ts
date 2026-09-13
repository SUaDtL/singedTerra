import { parseVerifiedCareer, type VerifiedCareer } from './verifiedCareer.ts'

/** Exact public cq1 contract. Parsing establishes shape, never server authority. */
export const VERIFIED_CHALLENGE_RULES = Object.freeze({
  maxPlayers: 2, humanSeat: 0, rounds: 1, walls: 'wrap', hazards: 'none', gravity: 0.15,
  maxWind: 6, interestRate: 0, suddenDeathTurn: 0, teamMode: false, armsLevel: 0,
  starterWeaponFalloff: 'decisive', weapon: 'baby_missile',
} as const)
// Gameplay/admission limits only. Full internal work caps must be derived by T07
// before artifact freezing/admission; no provisional meter map is a wire contract.
export const VERIFIED_CHALLENGE_LIMITS = Object.freeze({
  humanSalvos: 3, cpuSalvos: 3,
  angle: Object.freeze({ min: 0, max: 180 }), power: Object.freeze({ min: 0, max: 100 }),
  sessionSeconds: 1800, computeAttempts: 3,
} as const)
export const VERIFIED_CHALLENGE_CQ1 = Object.freeze({
  descriptorVersion: 1, trialId: 'crosswind-qualification', editionId: 'cq1',
  entitlementId: 'crosswind-qualification', objectiveVersion: 1, verifierArtifactId: 'cq1',
  cpuPolicyId: 'cq1-hard-v3', rewardVersion: 1,
  reward: Object.freeze({ medalId: 'crosswind-qualification', xp: 200 }),
  seed: 42, rules: VERIFIED_CHALLENGE_RULES, limits: VERIFIED_CHALLENGE_LIMITS,
} as const)
export type VerifiedChallengeCatalog = typeof VERIFIED_CHALLENGE_CQ1
export interface VerifiedChallengeDescriptor extends VerifiedChallengeCatalog {
  readonly sessionId: string
  readonly accountId: string
  readonly admittedAt: string
  readonly expiresAt: string
}
export interface VerifiedChallengeHumanFire { readonly angle: number; readonly power: number }
export interface VerifiedChallengeStartRequest {
  readonly trialId: 'crosswind-qualification'
  readonly supportedDescriptorVersions: readonly [1]
}
export interface VerifiedChallengeCompletionRequest {
  readonly sessionId: string
  readonly transcript: readonly VerifiedChallengeHumanFire[]
}
export type VerifiedChallengeTerminal = 'objective_cleared' | 'terminal_without_clear'
  | 'objective_not_cleared' | 'work_limit' | 'verification_unavailable'
export type VerifiedChallengeAwardDisposition = 'awarded' | 'already_owned' | 'not_awarded'
export const VERIFIED_CHALLENGE_RESPONSE_VERSION = 1 as const
export const VERIFIED_CHALLENGE_EVIDENCE = 'verified_challenge_cq1' as const
export interface VerifiedChallengeReceipt {
  readonly evidence: typeof VERIFIED_CHALLENGE_EVIDENCE
  readonly sessionId: string
  readonly accountId: string
  readonly editionId: 'cq1'
  readonly transcript: readonly VerifiedChallengeHumanFire[]
  readonly outcome: Exclude<VerifiedChallengeTerminal, 'verification_unavailable'>
  readonly disposition: VerifiedChallengeAwardDisposition
  readonly xpGranted: 0 | 200
  readonly completedAt: string
  readonly careerBefore: VerifiedCareer
  readonly careerAfter: VerifiedCareer
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}
function matches(value: unknown, fixed: unknown): boolean {
  if (!record(fixed)) return value === fixed
  return record(value) && exactKeys(value, Object.keys(fixed))
    && Object.keys(fixed).every((key) => matches(value[key], fixed[key]))
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value) }

/** Parse UTC input, including Postgres microseconds; no current-time reads. */
function utcMicroseconds(value: unknown): bigint | null {
  if (typeof value !== 'string') return null
  const match = /^([1-9]\d{3})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value)
  if (!match) return null
  const canonicalSecond = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`
  const milliseconds = Date.parse(canonicalSecond)
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== canonicalSecond) return null
  return BigInt(milliseconds) * 1000n + BigInt((match[7] ?? '').padEnd(6, '0'))
}
export function parseVerifiedChallengeCatalog(value: unknown): VerifiedChallengeCatalog | null {
  return matches(value, VERIFIED_CHALLENGE_CQ1) ? VERIFIED_CHALLENGE_CQ1 : null
}
export function parseVerifiedChallengeDescriptor(value: unknown): VerifiedChallengeDescriptor | null {
  if (!record(value) || !exactKeys(value, [...Object.keys(VERIFIED_CHALLENGE_CQ1),
    'sessionId', 'accountId', 'admittedAt', 'expiresAt'])) return null
  const catalog: Record<string, unknown> = {}
  for (const key of Object.keys(VERIFIED_CHALLENGE_CQ1)) catalog[key] = value[key]
  if (!parseVerifiedChallengeCatalog(catalog) || !uuid(value.sessionId) || !uuid(value.accountId)) return null
  const admitted = utcMicroseconds(value.admittedAt)
  const expires = utcMicroseconds(value.expiresAt)
  if (admitted === null || expires === null || expires <= admitted
    || expires - admitted > BigInt(VERIFIED_CHALLENGE_LIMITS.sessionSeconds) * 1_000_000n) return null
  return Object.freeze({ ...VERIFIED_CHALLENGE_CQ1, sessionId: value.sessionId, accountId: value.accountId,
    admittedAt: value.admittedAt as string, expiresAt: value.expiresAt as string })
}
export function parseVerifiedChallengeStart(value: unknown): VerifiedChallengeStartRequest | null {
  if (!record(value) || !exactKeys(value, ['trialId', 'supportedDescriptorVersions'])
    || value.trialId !== VERIFIED_CHALLENGE_CQ1.trialId
    || !Array.isArray(value.supportedDescriptorVersions) || value.supportedDescriptorVersions.length !== 1
    || value.supportedDescriptorVersions[0] !== 1) return null
  return Object.freeze({ trialId: VERIFIED_CHALLENGE_CQ1.trialId,
    supportedDescriptorVersions: Object.freeze([1] as const) })
}
export function parseVerifiedChallengeTranscript(value: unknown): readonly VerifiedChallengeHumanFire[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > VERIFIED_CHALLENGE_LIMITS.humanSalvos) return null
  const result: VerifiedChallengeHumanFire[] = []
  for (const entry of value) {
    if (!record(entry) || !exactKeys(entry, ['angle', 'power'])
      || typeof entry.angle !== 'number' || !Number.isInteger(entry.angle) || entry.angle < 0 || entry.angle > 180
      || typeof entry.power !== 'number' || !Number.isInteger(entry.power) || entry.power < 0 || entry.power > 100) return null
    result.push(Object.freeze({ angle: entry.angle === 0 ? 0 : entry.angle, power: entry.power === 0 ? 0 : entry.power }))
  }
  return Object.freeze(result)
}
export function parseVerifiedChallengeCompletion(value: unknown): VerifiedChallengeCompletionRequest | null {
  if (!record(value) || !exactKeys(value, ['sessionId', 'transcript']) || !uuid(value.sessionId)) return null
  const transcript = parseVerifiedChallengeTranscript(value.transcript)
  return transcript ? Object.freeze({ sessionId: value.sessionId, transcript }) : null
}

/** Validate a complete public receipt's internal consistency. The authenticated
 * transport establishes provenance; a correctly shaped object is not an award.
 * responseVersion belongs to the outer HTTP envelope, never this evidence row. */
export function parseVerifiedChallengeReceipt(value: unknown): VerifiedChallengeReceipt | null {
  if (!record(value) || !exactKeys(value, ['evidence', 'sessionId', 'accountId', 'editionId', 'transcript',
    'outcome', 'disposition', 'xpGranted', 'completedAt', 'careerBefore', 'careerAfter'])
    || value.evidence !== VERIFIED_CHALLENGE_EVIDENCE || value.editionId !== 'cq1'
    || !uuid(value.sessionId) || !uuid(value.accountId)
    || (value.outcome !== 'objective_cleared' && value.outcome !== 'terminal_without_clear'
      && value.outcome !== 'objective_not_cleared' && value.outcome !== 'work_limit')
    || (value.disposition !== 'awarded' && value.disposition !== 'already_owned' && value.disposition !== 'not_awarded')
    || (value.xpGranted !== 0 && value.xpGranted !== 200)) return null
  const completedAt = utcMicroseconds(value.completedAt)
  const transcript = parseVerifiedChallengeTranscript(value.transcript)
  const careerBefore = parseVerifiedCareer(value.careerBefore)
  const careerAfter = parseVerifiedCareer(value.careerAfter)
  if (completedAt === null || !transcript || !careerBefore || !careerAfter) return null
  if (value.outcome === 'objective_not_cleared' && transcript.length !== VERIFIED_CHALLENGE_LIMITS.humanSalvos) return null
  if (JSON.stringify(careerBefore.replay) !== JSON.stringify(careerAfter.replay)) return null
  // Existing awards precede this session's receipt. Its own session cannot be
  // both an earlier winning session and a repeat/failure session.
  for (const medal of careerBefore.challenge.medals) {
    const awardedAt = utcMicroseconds(medal.awardedAt)
    if (awardedAt === null || awardedAt > completedAt || medal.sessionId === value.sessionId) return null
  }
  if (value.disposition === 'awarded') {
    const medal = careerAfter.challenge.medals[0]
    if (value.outcome !== 'objective_cleared' || value.xpGranted !== 200
      || careerBefore.challenge.medals.length !== 0 || careerAfter.challenge.medals.length !== 1
      || !medal || medal.sessionId !== value.sessionId || utcMicroseconds(medal.awardedAt) !== completedAt
      || careerAfter.totalXp !== careerBefore.totalXp + 200) return null
  } else {
    if (value.xpGranted !== 0 || JSON.stringify(careerBefore) !== JSON.stringify(careerAfter)) return null
    if (value.disposition === 'already_owned') {
      if (value.outcome !== 'objective_cleared' || careerBefore.challenge.medals.length !== 1) return null
    } else if (value.outcome === 'objective_cleared') return null
  }
  return Object.freeze({ evidence: VERIFIED_CHALLENGE_EVIDENCE, sessionId: value.sessionId, accountId: value.accountId,
    editionId: 'cq1', transcript, outcome: value.outcome, disposition: value.disposition, xpGranted: value.xpGranted,
    completedAt: value.completedAt as string, careerBefore, careerAfter })
}

/** JSON.parse supplies grammar validation; this token pass refuses duplicate keys
 * and ill-formed decoded strings that JSON.parse otherwise permits. */
function uniqueWellFormedStrings(source: string): boolean {
  const stack: Array<Set<string> | null> = []
  let keyExpected = false
  for (const token of source.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]/g)) {
    const text = token[0]
    if (text.startsWith('"')) {
      const decoded = JSON.parse(text) as string
      if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(decoded)) return false
      const keys = stack.at(-1)
      if (keyExpected && keys) {
        if (keys.has(decoded)) return false
        keys.add(decoded)
      }
    } else if (text === '{' || text === '[') {
      stack.push(text === '{' ? new Set() : null)
      if (stack.length > 32) return false
      keyExpected = text === '{'
    } else if (text === '}' || text === ']') { stack.pop(); keyExpected = false }
    else keyExpected = text === ',' && stack.at(-1) !== null
  }
  return true
}
/** Supplied by the Edge/client transport boundary. It must throw on malformed
 * UTF-8 (for example a platform TextDecoder configured with fatal: true).
 * Keeping this dependency explicit preserves shared's non-DOM runtime contract. */
export type VerifiedChallengeStrictUtf8Decoder = (value: Uint8Array) => string

export function decodeVerifiedChallengeJson(
  value: Uint8Array, maximumBytes: 256 | 2048, decodeUtf8: VerifiedChallengeStrictUtf8Decoder,
): unknown | null {
  if (!(value instanceof Uint8Array) || (maximumBytes !== 256 && maximumBytes !== 2048)
    || value.byteLength > maximumBytes) return null
  try {
    const source = decodeUtf8(value)
    const result: unknown = JSON.parse(source)
    return uniqueWellFormedStrings(source) ? result : null
  } catch { return null }
}
