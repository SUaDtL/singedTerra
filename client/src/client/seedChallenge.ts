import {
  QUICK_OPERATIONS,
  type QuickOperation,
  type QuickOperationId,
} from './quickOperations'

export const PUBLIC_SEED_CHALLENGE_VERSION = 'ST1' as const
const MAX_RAW_FRAGMENT_LENGTH = 25
const UINT32_MAX = 0xffff_ffff
const CHALLENGE_FRAGMENT = /^#challenge=ST1-(LL|CW|CR|LA)-([0-9A-Z]{1,7})$/

export type PublicSeedChallengeOrigin = 'local-selection' | 'imported-public-challenge'
export type PublicSeedChallengeTag = 'LL' | 'CW' | 'CR' | 'LA'

export interface PublicSeedChallenge {
  readonly version: typeof PUBLIC_SEED_CHALLENGE_VERSION
  readonly tag: PublicSeedChallengeTag
  readonly operationId: Extract<QuickOperationId,
    'last-light-siege' | 'crosswind-range' | 'caldera-run' | 'lean-arsenal'>
  readonly seed: number
  readonly origin: PublicSeedChallengeOrigin
}

export type SeedChallengeReadResult =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid' }
  | { readonly status: 'valid'; readonly challenge: PublicSeedChallenge }

interface FrozenProfile {
  readonly tag: PublicSeedChallengeTag
  readonly operationId: PublicSeedChallenge['operationId']
  readonly contentVersion: 1 | 2
  readonly fieldOrderId: 'hold-the-field' | 'first-strike' | 'set-the-position' | 'make-it-count'
  readonly seed: 'uint32' | 42
  readonly settings: Readonly<Record<string, string | number>>
}

const ST1_PROFILES: readonly FrozenProfile[] = Object.freeze([
  Object.freeze({
    tag: 'LL', operationId: 'last-light-siege', contentVersion: 1,
    fieldOrderId: 'hold-the-field', seed: 'uint32',
    settings: Object.freeze({ rounds: 3, suddenDeathTurn: 12, battlefieldWorld: 'ember-dusk' }),
  }),
  Object.freeze({
    tag: 'CW', operationId: 'crosswind-range', contentVersion: 2,
    fieldOrderId: 'first-strike', seed: 42,
    settings: Object.freeze({ walls: 'wrap', battlefieldWorld: 'glassstorm-expanse', seed: 42 }),
  }),
  Object.freeze({
    tag: 'CR', operationId: 'caldera-run', contentVersion: 2,
    fieldOrderId: 'set-the-position', seed: 42,
    settings: Object.freeze({ hazards: 'lava', battlefieldWorld: 'obsidian-caldera', seed: 42 }),
  }),
  Object.freeze({
    tag: 'LA', operationId: 'lean-arsenal', contentVersion: 2,
    fieldOrderId: 'make-it-count', seed: 42,
    settings: Object.freeze({ armsLevel: 0, seed: 42 }),
  }),
])

function exactRecord(actual: object, expected: object): boolean {
  const actualRecord = actual as Record<string, unknown>
  const expectedRecord = expected as Record<string, unknown>
  const actualKeys = Object.keys(actualRecord).sort()
  const expectedKeys = Object.keys(expectedRecord).sort()
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actualRecord[key] === expectedRecord[key])
}

function profileForOperation(operationId: unknown): FrozenProfile | null {
  return ST1_PROFILES.find((profile) => profile.operationId === operationId) ?? null
}

function profileForTag(tag: PublicSeedChallengeTag): FrozenProfile {
  return ST1_PROFILES.find((profile) => profile.tag === tag)!
}

function operationMatchesProfile(operation: QuickOperation, profile: FrozenProfile): boolean {
  const objective = operation.practiceObjective
  const expectedObjective = profile.seed === 42
    ? { contentVersion: profile.contentVersion, fieldOrderId: profile.fieldOrderId, seed: 42 }
    : { contentVersion: profile.contentVersion, fieldOrderId: profile.fieldOrderId }
  return operation.id === profile.operationId
    && objective !== undefined
    && exactRecord(objective, expectedObjective)
    && exactRecord(operation.settings, profile.settings)
}

function validSeed(profile: FrozenProfile, seed: number): boolean {
  return Number.isSafeInteger(seed)
    && seed >= 0
    && seed <= UINT32_MAX
    && (profile.seed === 'uint32' || seed === profile.seed)
}

/** Resolve a typed local challenge only when the current registry exactly matches ST1. */
export function resolvePublicSeedChallenge(
  operationId: unknown,
  seed: number,
  origin: PublicSeedChallengeOrigin,
  candidate?: QuickOperation,
): PublicSeedChallenge | null {
  const profile = profileForOperation(operationId)
  if (!profile || !validSeed(profile, seed)) return null
  const operation = candidate ?? QUICK_OPERATIONS.find((entry) => entry.id === profile.operationId)
  if (!operation || !operationMatchesProfile(operation, profile)) return null
  return Object.freeze({
    version: PUBLIC_SEED_CHALLENGE_VERSION,
    tag: profile.tag,
    operationId: profile.operationId,
    seed,
    origin,
  })
}

/** Parse one exact raw fragment. Rejected input is never echoed or defaulted. */
export function parseSeedChallengeFragment(rawFragment: string): SeedChallengeReadResult {
  if (!rawFragment.startsWith('#challenge')) return { status: 'absent' }
  if (rawFragment.length > MAX_RAW_FRAGMENT_LENGTH || !/^[\x00-\x7F]*$/.test(rawFragment)) {
    return { status: 'invalid' }
  }
  const match = CHALLENGE_FRAGMENT.exec(rawFragment)
  if (!match) return { status: 'invalid' }
  const tag = match[1] as PublicSeedChallengeTag
  const token = match[2]!
  const seed = Number.parseInt(token, 36)
  if (!Number.isSafeInteger(seed)
    || seed < 0
    || seed > UINT32_MAX
    || seed.toString(36).toUpperCase() !== token) return { status: 'invalid' }
  const profile = profileForTag(tag)
  const challenge = resolvePublicSeedChallenge(
    profile.operationId,
    seed,
    'imported-public-challenge',
  )
  return challenge ? { status: 'valid', challenge } : { status: 'invalid' }
}

/** Read only a query-free web URL; live-room and diagnostic queries keep ownership. */
export function readSeedChallengeUrl(currentUrl: string): SeedChallengeReadResult {
  try {
    const url = new URL(currentUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return url.hash.startsWith('#challenge') ? { status: 'invalid' } : { status: 'absent' }
    }
    const parsed = parseSeedChallengeFragment(url.hash)
    if (parsed.status === 'valid' && url.search !== '') return { status: 'invalid' }
    return parsed
  } catch {
    return { status: 'invalid' }
  }
}

export function serializeSeedChallenge(challenge: PublicSeedChallenge): string | null {
  const resolved = resolvePublicSeedChallenge(
    challenge.operationId,
    challenge.seed,
    challenge.origin,
  )
  if (!resolved || resolved.version !== challenge.version || resolved.tag !== challenge.tag) return null
  return `${PUBLIC_SEED_CHALLENGE_VERSION}-${resolved.tag}-${resolved.seed.toString(36).toUpperCase()}`
}

/** Build a path-preserving URL containing only the public ST1 fragment. */
export function buildSeedChallengeUrl(
  currentUrl: string,
  challenge: PublicSeedChallenge,
): string | null {
  const code = serializeSeedChallenge(challenge)
  if (!code) return null
  try {
    const url = new URL(currentUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = `challenge=${code}`
    return url.toString()
  } catch {
    return null
  }
}

/** Exact trusted operation lookup for an already admitted descriptor. */
export function operationForSeedChallenge(challenge: PublicSeedChallenge): QuickOperation | null {
  const resolved = resolvePublicSeedChallenge(
    challenge.operationId,
    challenge.seed,
    challenge.origin,
  )
  if (!resolved || resolved.tag !== challenge.tag || resolved.version !== challenge.version) return null
  return QUICK_OPERATIONS.find((operation) => operation.id === challenge.operationId) ?? null
}
