import { withCors, json, getServiceClient, safeErrorMessage, type ServiceClient, UUID_REGEX } from '../_shared/mod.ts'

export interface ScoreEntry {
  tankId: string
  playerName: string
  roundWins: number
  kills: number
  totalDamage: number
}

const MAX_ROUNDS = 9
const MAX_KILLS = 36
const MAX_TOTAL_DAMAGE = 3600

/**
 * Strictly validate the participant-reported final scoreboard before sending it
 * to the atomic completion receipt. Every seat and bounded numeric field must be
 * present. Local GAME_OVER animation remains independent of persistence outcome.
 */
export function sanitizeScoreboard(raw: unknown, seatCount: number): ScoreEntry[] | null {
  if (!Array.isArray(raw) || raw.length !== seatCount || seatCount < 1 || seatCount > 4) return null
  const out: ScoreEntry[] = []
  const seen = new Set<string>()
  for (const e of raw) {
    if (!e || typeof e !== 'object') return null
    const r = e as Record<string, unknown>
    const tankId = r.tankId
    if (typeof tankId !== 'string' || !/^p[1-9]\d*$/.test(tankId)) return null
    const seat = Number(tankId.slice(1))
    if (!(seat >= 1 && seat <= seatCount) || seen.has(tankId)) return null
    if (typeof r.playerName !== 'string'
      || typeof r.roundWins !== 'number' || !Number.isInteger(r.roundWins) || r.roundWins < 0 || r.roundWins > MAX_ROUNDS
      || typeof r.kills !== 'number' || !Number.isInteger(r.kills) || r.kills < 0 || r.kills > MAX_KILLS
      || typeof r.totalDamage !== 'number' || !Number.isFinite(r.totalDamage)
      || r.totalDamage < 0 || r.totalDamage > MAX_TOTAL_DAMAGE) return null
    seen.add(tankId)
    out.push({
      tankId,
      playerName: r.playerName.slice(0, 40),
      roundWins: r.roundWins,
      kills: r.kills,
      totalDamage: r.totalDamage,
    })
  }
  return out.sort((a, b) => Number(a.tankId.slice(1)) - Number(b.tankId.slice(1)))
}

export interface FinishGameDependencies {
  supabase?: ServiceClient
  logger?: (message: string, context: Record<string, unknown>) => void
}

function completionRpcResponse(
  data: unknown,
  error: unknown,
  logger: FinishGameDependencies['logger'],
  context: { roomId: string; playerId: string },
): Response {
  if (error) {
    logger?.('finish_game: completion rpc failed', { ...context, error: safeErrorMessage(error) })
    return json({ error: 'completion_failed', retryable: true }, 500)
  }
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return json({ error: 'completion_failed', retryable: true }, 500)
  }
  const result = value as Record<string, unknown>
  if (result.ok === true) return json(result)
  const code = typeof result.error === 'string' ? result.error : 'completion_failed'
  if (code === 'room_not_found') return json(result, 404)
  if (code === 'not_room_member' || code === 'invalid_seat_token') return json(result, 403)
  if (code === 'invalid_completion' || code === 'invalid_roster' || code === 'invalid_scoreboard'
    || code === 'winner_mismatch' || code === 'rounds_mismatch') return json({ ...result, retryable: true }, 400)
  if (code === 'completion_conflict' || code === 'completion_dispute'
    || code === 'legacy_score_malformed' || code === 'room_not_active') {
    return json(result, 409)
  }
  return json({ error: 'completion_failed', retryable: true }, 500)
}

// Guard Deno.serve so importing this module in tests does not start the HTTP
// listener (mirrors submit_action / restart_game).
export async function handleFinishGame(
  body: unknown,
  _req?: Request,
  dependencies: FinishGameDependencies = {},
): Promise<Response> {
  const { roomId, winnerId, playerId, rounds, scoreboard, token } = body as {
    roomId?: unknown
    winnerId?: unknown
    // The caller's Supabase id — required so only a ROOM MEMBER can finish the
    // room (previously any client could POST an arbitrary winner). P2-9.
    playerId?: unknown
    // Optional final-standings payload (Sprint 6). Absent for pre-Sprint-6 clients;
    // when present and well-formed it is persisted to match_scores (one row per match).
    rounds?: unknown
    scoreboard?: unknown
    token?: unknown
  }

  if (typeof roomId !== 'string' || !UUID_REGEX.test(roomId)) {
    return json({ error: 'Invalid input: roomId' }, 400)
  }
  if (typeof playerId !== 'string' || playerId.trim().length === 0) {
    return json({ error: 'Invalid input: playerId' }, 400)
  }
  // winnerId is the engine tank id of the victor ('p1'..'pN'), or null for no
  // winner. Anything else is rejected — never store a client-supplied free string.
  if (winnerId !== null && (typeof winnerId !== 'string' || !/^p[1-9]\d*$/.test(winnerId))) {
    return json({ error: 'Invalid input: winnerId' }, 400)
  }

  const scoreAbsent = scoreboard === undefined || scoreboard === null
  let cleanBoard: ScoreEntry[] | null = null
  if (!scoreAbsent) {
    if (!Array.isArray(scoreboard) || scoreboard.length < 2 || scoreboard.length > 4) {
      return json({ error: 'invalid_scoreboard', retryable: true }, 400)
    }
    cleanBoard = sanitizeScoreboard(scoreboard, scoreboard.length)
    if (!cleanBoard) return json({ error: 'invalid_scoreboard', retryable: true }, 400)
  }
  const cleanRounds = rounds === undefined || rounds === null
    ? null
    : typeof rounds === 'number' && Number.isInteger(rounds) && rounds >= 1 && rounds <= MAX_ROUNDS
      ? rounds
      : undefined
  if (cleanRounds === undefined) return json({ error: 'invalid_rounds', retryable: true }, 400)

  const supabase = dependencies.supabase ?? getServiceClient()
  const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
  const result = await supabase.rpc('finish_casual_match_v1', {
    p_room_id: roomId,
    p_player_id: playerId.trim(),
    p_token: typeof token === 'string' ? token : '',
    p_winner: winnerId,
    p_rounds: cleanRounds,
    p_scoreboard: cleanBoard,
  })
  return completionRpcResponse(result.data, result.error, logger, { roomId, playerId: playerId.trim() })
}

if (import.meta.main) {
  Deno.serve(withCors(handleFinishGame, { rateLimit: 'finish_game' }))
}
