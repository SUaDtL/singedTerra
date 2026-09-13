/** Version-one career is a pure projection of two verified, owner-scoped ledgers.
 * Parsing establishes consistency, never proves that data came from the server. */
export interface VerifiedCareerMedal {
  readonly entitlementId: 'crosswind-qualification'
  readonly medalId: 'crosswind-qualification'
  readonly xp: 200
  readonly rewardVersion: 1
  readonly awardedAt: string
  readonly sessionId: string
}
export interface VerifiedCareerRank {
  readonly code: string
  readonly title: string
  readonly level: number
  readonly insignia: { readonly mark: string; readonly label: string }
}
export interface VerifiedCareer {
  readonly careerProjectionVersion: 1
  readonly evidence: 'verified_career_v1'
  readonly replay: { readonly verifiedMatches: number; readonly verifiedWins: number; readonly xp: number }
  readonly challenge: { readonly xp: number; readonly medals: readonly VerifiedCareerMedal[] }
  readonly totalXp: number
  readonly level: number
  readonly levelXp: number
  readonly nextLevelXp: 500
  readonly rank: { readonly current: VerifiedCareerRank; readonly next: VerifiedCareerRank | null }
}

// Frozen v1 identity. Tests compare every boundary with the existing published
// client table; future client rank changes cannot silently reinterpret receipts.
const RANKS: readonly VerifiedCareerRank[] = Object.freeze(([
  ['R-01', 'Cadet', 1, '◇', 'single hollow diamond'],
  ['R-02', 'Gunner', 2, '◆', 'single diamond'],
  ['R-03', 'Bombardier', 3, '◆◆', 'double diamond'],
  ['R-04', 'Artillerist', 5, '▲', 'single chevron'],
  ['R-05', 'Battery Captain', 7, '▲◆', 'chevron and diamond'],
  ['R-06', 'Siege Major', 10, '▲▲', 'double chevron'],
  ['R-07', 'Field Colonel', 14, '★', 'single star'],
  ['R-08', 'War Commander', 20, '★◆', 'star and diamond'],
  ['R-09', 'Terra Marshal', 30, '★▲', 'star and chevron'],
  ['R-10', 'Scorched Legend', 50, '★★', 'double star'],
] as const).map(([code, title, level, mark, label]) => Object.freeze({
  code, title, level,
  insignia: Object.freeze({ mark, label }),
})))

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key))
}
function natural(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^([1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?(?:Z|\+00:00)$/.exec(value)
  if (!match) return false
  const canonical = `${match[1]}.000Z`
  const milliseconds = Date.parse(canonical)
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === canonical
}
function medal(value: unknown): VerifiedCareerMedal | null {
  if (!record(value) || !keys(value, ['entitlementId', 'medalId', 'xp', 'rewardVersion', 'awardedAt', 'sessionId'])
    || value.entitlementId !== 'crosswind-qualification' || value.medalId !== 'crosswind-qualification'
    || value.xp !== 200 || value.rewardVersion !== 1 || !timestamp(value.awardedAt)
    || typeof value.sessionId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.sessionId)) return null
  return Object.freeze({ entitlementId: value.entitlementId, medalId: value.medalId,
    xp: value.xp, rewardVersion: value.rewardVersion, awardedAt: value.awardedAt, sessionId: value.sessionId })
}

/** Input is the immutable SQL career_before_ledger/career_after_ledger shape,
 * also used for current summary. Casual XP and guessed totals are refused. */
export function projectVerifiedCareer(value: unknown): VerifiedCareer | null {
  if (!record(value) || !keys(value, ['verifiedMatches', 'verifiedWins', 'replayXp', 'challengeXp', 'totalXp', 'medals'])
    || !natural(value.verifiedMatches) || !natural(value.verifiedWins) || value.verifiedWins > value.verifiedMatches
    || !natural(value.replayXp) || !natural(value.challengeXp) || !natural(value.totalXp)
    || !Array.isArray(value.medals) || value.medals.length > 1) return null
  const medals: VerifiedCareerMedal[] = []
  for (const candidate of value.medals) {
    const parsed = medal(candidate)
    if (!parsed) return null
    medals.push(parsed)
  }
  const replayXp = 100 * (value.verifiedMatches + value.verifiedWins)
  const challengeXp = medals.length * 200
  const totalXp = replayXp + challengeXp
  if (!Number.isSafeInteger(replayXp) || !Number.isSafeInteger(totalXp)
    || value.replayXp !== replayXp || value.challengeXp !== challengeXp || value.totalXp !== totalXp) return null
  const level = Math.floor(totalXp / 500) + 1
  let rankIndex = 0
  for (let index = 1; index < RANKS.length; index++) {
    if (RANKS[index]!.level > level) break
    rankIndex = index
  }
  return Object.freeze({ careerProjectionVersion: 1, evidence: 'verified_career_v1',
    replay: Object.freeze({ verifiedMatches: value.verifiedMatches, verifiedWins: value.verifiedWins, xp: replayXp }),
    challenge: Object.freeze({ xp: challengeXp, medals: Object.freeze(medals) }), totalXp,
    level, levelXp: totalXp % 500, nextLevelXp: 500,
    rank: Object.freeze({ current: RANKS[rankIndex]!, next: RANKS[rankIndex + 1] ?? null }),
  })
}

function matches(value: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(value) && value.length === expected.length
    && expected.every((entry, index) => matches(value[index], entry))
  if (!record(expected)) return value === expected
  return record(value) && keys(value, Object.keys(expected))
    && Object.keys(expected).every((key) => matches(value[key], expected[key]))
}

/** Reject unknown versions, extra properties and inconsistent derived fields. */
export function parseVerifiedCareer(value: unknown): VerifiedCareer | null {
  if (!record(value) || !record(value.replay) || !record(value.challenge)) return null
  const projected = projectVerifiedCareer({
    verifiedMatches: value.replay.verifiedMatches, verifiedWins: value.replay.verifiedWins,
    replayXp: value.replay.xp, challengeXp: value.challenge.xp, totalXp: value.totalXp,
    medals: value.challenge.medals,
  })
  return projected && matches(value, projected) ? projected : null
}
