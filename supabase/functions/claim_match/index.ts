import {
  authenticateBearer,
  getServiceClient,
  json,
  safeErrorMessage,
  type ServiceClient,
  type StoredPlayer,
  UUID_REGEX,
  verifySeatTokenResult,
  withCors,
} from '../_shared/mod.ts'

type ClaimRecord = {
  room_id: string
  user_id: string
  player_id: string
  tank_id: string
}

type CasualScoreReceipt = {
  room_id: string
  winner: string | null
  rounds: number
  scoreboard: unknown
  evidence_tier: 'casual_participant_reported'
  completion_version: number | null
  completion_status: 'complete' | 'score_absent' | 'legacy_unvalidated'
}

function strictScoreWinner(
  scoreboard: unknown,
  players: StoredPlayer[],
  rounds: number,
  teamMode: boolean,
): { winner: string | null } | null {
  const seatCount = players.length
  if (!Array.isArray(scoreboard) || scoreboard.length !== seatCount
    || seatCount < 2 || seatCount > 4
    || new Set(players.map((player) => player.id)).size !== seatCount
    || !Number.isInteger(rounds) || rounds < 1 || rounds > 9) return null
  const ids = new Set<string>()
  const wins = new Map<string, number>()
  for (const value of scoreboard) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const row = value as Record<string, unknown>
    if (typeof row.tankId !== 'string' || !/^p[1-4]$/.test(row.tankId)
      || Number(row.tankId.slice(1)) > seatCount || ids.has(row.tankId)
      || typeof row.playerName !== 'string'
      || typeof row.roundWins !== 'number' || !Number.isInteger(row.roundWins)
      || row.roundWins < 0 || row.roundWins > rounds
      || typeof row.kills !== 'number' || !Number.isInteger(row.kills) || row.kills < 0 || row.kills > 36
      || typeof row.totalDamage !== 'number' || !Number.isFinite(row.totalDamage)
      || row.totalDamage < 0 || row.totalDamage > 3600) return null
    ids.add(row.tankId)
    wins.set(row.tankId, row.roundWins)
  }
  if (ids.size !== seatCount) return null
  if (teamMode && seatCount === 4) {
    if (wins.get('p1') !== wins.get('p3') || wins.get('p2') !== wins.get('p4')) return null
    const teamOneWins = wins.get('p1') ?? 0
    const teamTwoWins = wins.get('p2') ?? 0
    return { winner: teamOneWins === teamTwoWins ? null : teamOneWins > teamTwoWins ? 'p1' : 'p2' }
  }
  const maxWins = Math.max(...wins.values())
  const leaders = [...wins].filter(([, value]) => value === maxWins)
  return { winner: leaders.length === 1 ? leaders[0][0] : null }
}

export interface ClaimMatchDependencies {
  supabase?: ServiceClient
  verifySeat?: typeof verifySeatTokenResult
  logger?: (message: string, context: Record<string, unknown>) => void
}

function isClaimRequest(body: unknown): body is { roomId: string; playerId: string; token: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const { roomId, playerId, token } = body as Record<string, unknown>
  return typeof roomId === 'string'
    && UUID_REGEX.test(roomId)
    && typeof playerId === 'string'
    && UUID_REGEX.test(playerId)
    && typeof token === 'string'
    && token.length > 0
}

function isExactClaim(record: ClaimRecord, expected: ClaimRecord): boolean {
  return record.room_id === expected.room_id
    && record.user_id === expected.user_id
    && record.player_id === expected.player_id
    && record.tank_id === expected.tank_id
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === '23505'
}

function parseCasualScoreReceipt(value: unknown): CasualScoreReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.room_id !== 'string'
    || (row.winner !== null && (typeof row.winner !== 'string' || !/^p[1-9]\d*$/.test(row.winner)))
    || typeof row.rounds !== 'number'
    || row.evidence_tier !== 'casual_participant_reported'
    || !['complete', 'score_absent', 'legacy_unvalidated'].includes(String(row.completion_status))) return null
  const completionStatus = row.completion_status as CasualScoreReceipt['completion_status']
  if (completionStatus === 'legacy_unvalidated') {
    if (row.completion_version !== null) return null
    return row as CasualScoreReceipt
  }
  if (row.completion_version !== 1 || !Array.isArray(row.scoreboard)) return null
  if (completionStatus === 'complete' && row.scoreboard.length === 0) return null
  if (completionStatus === 'score_absent' && row.scoreboard.length !== 0) return null
  return row as CasualScoreReceipt
}

/**
 * Link one authenticated account to its already-finished, seat-authenticated
 * match entry. All persisted identity derives from Auth and the room roster.
 */
export async function handleClaimMatch(
  body: unknown,
  req: Request,
  dependencies: ClaimMatchDependencies = {},
): Promise<Response> {
  if (!isClaimRequest(body)) return json({ error: 'invalid_claim_request' }, 400)

  const supabase = dependencies.supabase ?? getServiceClient()
  const userId = await authenticateBearer(req, supabase)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const verifySeat = dependencies.verifySeat ?? verifySeatTokenResult
  const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
  const logFailure = (stage: string, error: unknown) => {
    logger(`claim_match: ${stage}`, {
      roomId: body.roomId,
      playerId: body.playerId,
      error: safeErrorMessage(error),
    })
  }

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, status, players, winner, options')
    .eq('id', body.roomId)
    .maybeSingle()
  if (roomError) {
    logFailure('room lookup failed', roomError)
    return json({ error: 'claim_failed' }, 500)
  }
  if (!room) return json({ error: 'room_not_found' }, 404)

  const players = (room.players ?? []) as StoredPlayer[]
  const playerIndex = players.findIndex((player) => player.id === body.playerId)
  if (playerIndex < 0) return json({ error: 'seat_not_authorized' }, 403)
  const seatVerification = await verifySeat(supabase, body.roomId, body.playerId, body.token)
  if (seatVerification.kind === 'error') {
    logFailure('seat lookup failed', seatVerification.error)
    return json({ error: 'claim_failed' }, 500)
  }
  if (seatVerification.kind !== 'valid') {
    return json({ error: 'seat_not_authorized' }, 403)
  }

  if (room.status !== 'finished') return json({ error: 'match_not_ready', retryable: true }, 409)

  const { data: score, error: scoreError } = await supabase
    .from('match_scores')
    .select('room_id, winner, rounds, scoreboard, evidence_tier, completion_version, completion_status')
    .eq('room_id', body.roomId)
    .maybeSingle()
  if (scoreError) {
    logFailure('score lookup failed', scoreError)
    return json({ error: 'claim_failed' }, 500)
  }
  if (!score) return json({ error: 'match_not_ready', retryable: true }, 409)
  const receipt = parseCasualScoreReceipt(score)
  if (!receipt) return json({ error: 'match_receipt_malformed', retryable: false }, 409)
  if (receipt.winner !== (room as { winner?: unknown }).winner) {
    return json({ error: 'completion_dispute', retryable: false }, 409)
  }
  if (receipt.completion_status !== 'score_absent') {
    const scoreResult = strictScoreWinner(
      receipt.scoreboard,
      players,
      receipt.rounds,
      room.options?.teamMode === true,
    )
    if (!scoreResult || scoreResult.winner !== receipt.winner) return json({
      error: receipt.completion_status === 'legacy_unvalidated'
        ? 'legacy_score_malformed'
        : 'match_receipt_malformed',
      retryable: receipt.completion_status === 'legacy_unvalidated',
    }, 409)
  }

  const claim: ClaimRecord = {
    room_id: body.roomId,
    user_id: userId,
    player_id: body.playerId,
    tank_id: `p${playerIndex + 1}`,
  }
  const { error: insertError } = await supabase.from('match_participants').insert(claim)
  const success = (linked: boolean) => json({
    ok: true,
    linked,
    evidence: 'casual_participant_reported',
    receiptStatus: receipt.completion_status,
  })
  if (!insertError) return success(true)
  if (!isUniqueViolation(insertError)) {
    logFailure('link insert failed', insertError)
    return json({ error: 'claim_failed' }, 500)
  }

  const { data: existingForUser, error: userLookupError } = await supabase
    .from('match_participants')
    .select('room_id, user_id, player_id, tank_id')
    .eq('room_id', body.roomId)
    .eq('user_id', userId)
    .maybeSingle()
  if (userLookupError) {
    logFailure('existing-user lookup failed', userLookupError)
    return json({ error: 'claim_failed' }, 500)
  }
  if (existingForUser) {
    return isExactClaim(existingForUser, claim)
      ? success(false)
      : json({ error: 'claim_conflict' }, 409)
  }

  const { data: existingForPlayer, error: playerLookupError } = await supabase
    .from('match_participants')
    .select('room_id, user_id, player_id, tank_id')
    .eq('room_id', body.roomId)
    .eq('player_id', body.playerId)
    .maybeSingle()
  if (playerLookupError) {
    logFailure('existing-player lookup failed', playerLookupError)
    return json({ error: 'claim_failed' }, 500)
  }
  if (existingForPlayer) return json({ error: 'claim_conflict' }, 409)

  // A concurrent deletion can make the duplicate source disappear before the
  // diagnostic reads. Preserve the uniqueness boundary rather than retrying.
  return json({ error: 'claim_conflict' }, 409)
}

if (import.meta.main) {
  Deno.serve(withCors(handleClaimMatch, { rateLimit: 'claim_match' }))
}
