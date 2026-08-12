import {
  authenticateBearer,
  getServiceClient,
  json,
  type Database,
  type ServiceClient,
  withCors,
} from '../_shared/mod.ts'

type ParticipantLink = {
  room_id: string
  tank_id: string
}

type MatchScore = {
  room_id: string
  winner: string | null
}

type VerifiedProgressionSummaryRow = Database['public']['Functions']['verified_progression_summary']['Returns'][number]

const SCORE_ROOM_BATCH_SIZE = 200
const PROGRESSION_VERSION = 1
const MATCH_XP = 100
const WIN_XP = 100
const XP_PER_LEVEL = 500

export interface AccountProgression {
  progressionVersion: 1
  totalXp: number
  level: number
  levelXp: number
  nextLevelXp: number
}

export interface VerifiedAccountProgression extends AccountProgression {
  evidence: 'verified_replay_v1'
  matchesPlayed: number
  wins: number
}

export function progressionFromTotalXp(totalXp: number): AccountProgression {
  return {
    progressionVersion: PROGRESSION_VERSION,
    totalXp,
    level: Math.floor(totalXp / XP_PER_LEVEL) + 1,
    levelXp: totalXp % XP_PER_LEVEL,
    nextLevelXp: XP_PER_LEVEL,
  }
}

export function deriveProgression(matchesPlayed: number, wins: number): AccountProgression {
  return progressionFromTotalXp(matchesPlayed * MATCH_XP + wins * WIN_XP)
}

export interface AccountSummaryDependencies {
  supabase?: ServiceClient
  logger?: (message: string, context: Record<string, unknown>) => void
}

function isParticipantLink(value: unknown): value is ParticipantLink {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.room_id === 'string'
    && row.room_id.length > 0
    && typeof row.tank_id === 'string'
    && /^p[1-9]\d*$/.test(row.tank_id)
}

function isMatchScore(value: unknown): value is MatchScore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.room_id === 'string'
    && row.room_id.length > 0
    && (row.winner === null || (typeof row.winner === 'string' && /^p[1-9]\d*$/.test(row.winner)))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function verifiedProgressionFromSummary(value: unknown): VerifiedAccountProgression | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (
    !exactKeys(row, ['verified_matches', 'verified_wins', 'total_xp'])
    || !isSafeNonnegativeInteger(row.verified_matches)
    || !isSafeNonnegativeInteger(row.verified_wins)
    || !isSafeNonnegativeInteger(row.total_xp)
    || row.verified_wins > row.verified_matches
  ) return null
  const expectedTotalXp = row.verified_matches * MATCH_XP + row.verified_wins * WIN_XP
  if (!Number.isSafeInteger(expectedTotalXp) || row.total_xp !== expectedTotalXp) return null
  return {
    evidence: 'verified_replay_v1',
    matchesPlayed: row.verified_matches,
    wins: row.verified_wins,
    ...progressionFromTotalXp(row.total_xp),
  }
}

export async function handleAccountSummary(
  _body: unknown,
  req: Request,
  dependencies: AccountSummaryDependencies = {},
): Promise<Response> {
  const supabase = dependencies.supabase ?? getServiceClient()
  const userId = await authenticateBearer(req, supabase)
  if (!userId) return json({ error: 'summary_unavailable' }, 401)

  const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
  const fail = (message: string, stage: 'verified' | 'participants' | 'scores' | 'hotseat'): Response => {
    logger(`account_summary: ${message}`, { stage, error: 'query_failed' })
    return json({ error: 'summary_unavailable' }, 500)
  }

  let verifiedResult: { data: unknown; error: unknown }
  try {
    verifiedResult = await supabase.rpc('verified_progression_summary', { p_user_id: userId })
  } catch {
    return fail('verified progression summary unavailable', 'verified')
  }
  const verifiedRow = Array.isArray(verifiedResult.data) && verifiedResult.data.length === 1
    ? verifiedResult.data[0] as VerifiedProgressionSummaryRow
    : null
  const verifiedProgression = !verifiedResult.error
    ? verifiedProgressionFromSummary(verifiedRow)
    : null
  if (!verifiedProgression) return fail('verified progression summary unavailable', 'verified')

  const {
    data: participantData,
    error: participantError,
    count: participantCount,
  } = await supabase
    .from('match_participants')
    .select('room_id, tank_id', { count: 'exact' })
    .eq('user_id', userId)
  if (participantError) return fail('participant query failed', 'participants')
  if (
    !Array.isArray(participantData)
    || !participantData.every(isParticipantLink)
    || !Number.isSafeInteger(participantCount)
    || participantCount !== participantData.length
  ) {
    return fail('participant data inconsistent', 'participants')
  }

  const roomIds = participantData.map((link) => link.room_id)
  if (new Set(roomIds).size !== roomIds.length) {
    return fail('participant data inconsistent', 'participants')
  }
  const scoreData: MatchScore[] = []
  for (let scoreOffset = 0; scoreOffset < roomIds.length; scoreOffset += SCORE_ROOM_BATCH_SIZE) {
    const roomIdBatch = roomIds.slice(scoreOffset, scoreOffset + SCORE_ROOM_BATCH_SIZE)
    const { data: scoreBatch, error: scoreError } = await supabase
      .from('match_scores')
      .select('room_id, winner')
      .in('room_id', roomIdBatch)
    if (scoreError) return fail('score query failed', 'scores')
    if (!Array.isArray(scoreBatch) || !scoreBatch.every(isMatchScore)) {
      return fail('score data inconsistent', 'scores')
    }
    scoreData.push(...scoreBatch)
  }

  const linkedRooms = new Set(roomIds)
  const scoresByRoom = new Map<string, MatchScore>()
  for (const score of scoreData) {
    if (!linkedRooms.has(score.room_id) || scoresByRoom.has(score.room_id)) {
      return fail('score data inconsistent', 'scores')
    }
    scoresByRoom.set(score.room_id, score)
  }
  if (scoresByRoom.size !== participantData.length) {
    return fail('score data inconsistent', 'scores')
  }

  let networkWins = 0
  for (const link of participantData) {
    const score = scoresByRoom.get(link.room_id)
    if (!score) return fail('score data inconsistent', 'scores')
    if (score.winner === link.tank_id) networkWins += 1
  }

  const localMatchResult = await supabase
    .from('hotseat_match_results')
    .select('match_id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (localMatchResult.error) return fail('hot-seat match count failed', 'hotseat')

  const localWinResult = await supabase
    .from('hotseat_match_results')
    .select('match_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('won', true)
  if (localWinResult.error) return fail('hot-seat win count failed', 'hotseat')

  const localMatches = localMatchResult.count
  const localWins = localWinResult.count
  if (
    !Number.isSafeInteger(localMatches)
    || !Number.isSafeInteger(localWins)
    || (localMatches as number) < 0
    || (localWins as number) < 0
    || (localWins as number) > (localMatches as number)
  ) {
    return fail('hot-seat counts inconsistent', 'hotseat')
  }

  const matchesPlayed = participantData.length + (localMatches as number)
  const wins = networkWins + (localWins as number)
  if (!Number.isSafeInteger(matchesPlayed) || !Number.isSafeInteger(wins)) {
    return fail('combined counts unsafe', 'hotseat')
  }
  const matchXp = matchesPlayed * MATCH_XP
  const winXp = wins * WIN_XP
  const totalXp = matchXp + winXp
  if (
    !Number.isSafeInteger(matchXp)
    || !Number.isSafeInteger(winXp)
    || !Number.isSafeInteger(totalXp)
  ) {
    return fail('progression arithmetic unsafe', 'hotseat')
  }
  return json({
    matchesPlayed,
    wins,
    ...progressionFromTotalXp(totalXp),
    verifiedProgression,
  })
}

if (import.meta.main) {
  Deno.serve(withCors(handleAccountSummary, {
    optionalBody: true,
    rateLimit: 'account_summary',
  }))
}
