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
    .select('id, status, players')
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

  if (room.status !== 'finished') return json({ error: 'match_not_ready' }, 409)

  const { data: score, error: scoreError } = await supabase
    .from('match_scores')
    .select('room_id')
    .eq('room_id', body.roomId)
    .maybeSingle()
  if (scoreError) {
    logFailure('score lookup failed', scoreError)
    return json({ error: 'claim_failed' }, 500)
  }
  if (!score) return json({ error: 'match_not_ready' }, 409)

  const claim: ClaimRecord = {
    room_id: body.roomId,
    user_id: userId,
    player_id: body.playerId,
    tank_id: `p${playerIndex + 1}`,
  }
  const { error: insertError } = await supabase.from('match_participants').insert(claim)
  if (!insertError) return json({ ok: true, linked: true })
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
      ? json({ ok: true, linked: false })
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
