import {
  authenticateBearer,
  getServiceClient,
  json,
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

export async function handleAccountSummary(
  _body: unknown,
  req: Request,
  dependencies: AccountSummaryDependencies = {},
): Promise<Response> {
  const supabase = dependencies.supabase ?? getServiceClient()
  const userId = await authenticateBearer(req, supabase)
  if (!userId) return json({ error: 'summary_unavailable' }, 401)

  const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
  const fail = (message: string, stage: 'participants' | 'scores'): Response => {
    logger(`account_summary: ${message}`, { stage, error: 'query_failed' })
    return json({ error: 'summary_unavailable' }, 500)
  }

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
  if (participantData.length === 0) {
    return json({ matchesPlayed: 0, wins: 0, ...deriveProgression(0, 0) })
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

  let wins = 0
  for (const link of participantData) {
    const score = scoresByRoom.get(link.room_id)
    if (!score) return fail('score data inconsistent', 'scores')
    if (score.winner === link.tank_id) wins += 1
  }
  return json({
    matchesPlayed: participantData.length,
    wins,
    ...deriveProgression(participantData.length, wins),
  })
}

if (import.meta.main) {
  Deno.serve(withCors(handleAccountSummary, {
    optionalBody: true,
    rateLimit: 'account_summary',
  }))
}
