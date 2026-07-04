import { withCors, json, getServiceClient, verifySeatToken } from '../_shared/mod.ts'

export interface ScoreEntry {
  tankId: string
  playerName: string
  roundWins: number
  kills: number
  totalDamage: number
}

/**
 * Sanitize the client-reported final scoreboard before persisting it. The scoreboard
 * is replay-derived (every client agrees), but it still arrives over the wire, so we
 * bound-check each entry against the roster and coerce the numeric fields. Returns the
 * clean array, or null if the payload is absent or malformed (the match still finishes
 * — persistence is best-effort, never a reason to block GAME_OVER).
 */
export function sanitizeScoreboard(raw: unknown, seatCount: number): ScoreEntry[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: ScoreEntry[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') return null
    const r = e as Record<string, unknown>
    const tankId = r.tankId
    if (typeof tankId !== 'string' || !/^p[1-9]\d*$/.test(tankId)) return null
    const seat = Number(tankId.slice(1))
    if (!(seat >= 1 && seat <= seatCount)) return null
    const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0)
    out.push({
      tankId,
      playerName: typeof r.playerName === 'string' ? r.playerName.slice(0, 40) : '',
      roundWins: Math.trunc(num(r.roundWins)),
      kills: Math.trunc(num(r.kills)),
      totalDamage: num(r.totalDamage),
    })
  }
  return out
}

// Guard Deno.serve so importing this module in tests does not start the HTTP
// listener (mirrors submit_action / restart_game).
export async function handleFinishGame(body: unknown): Promise<Response> {
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

  if (typeof roomId !== 'string' || roomId.trim().length === 0) {
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

  const supabase = getServiceClient()

  // Fetch the active room to authorize the caller and bound-check the winner.
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('players')
    .eq('id', roomId.trim())
    .eq('status', 'active')
    .maybeSingle()

  if (fetchError) {
    console.error('finish_game: fetch error', fetchError, { roomId, playerId })
    return json({ error: 'Failed to fetch room' }, 500)
  }
  if (!room) {
    return json({ error: 'Room not found or not active' }, 404)
  }

  const players = (room.players ?? []) as Array<{ id: string }>
  // Authorization: the caller must be a member of the room.
  if (!players.some((p) => p.id === playerId)) {
    return json({ error: 'Player not in room' }, 403)
  }
  if (!(await verifySeatToken(supabase, roomId.trim(), playerId, token))) {
    return json({ error: 'Invalid or missing seat token' }, 403)
  }
  // Roster bound-check: winner 'pN' must map to a real seat (1..players.length).
  if (winnerId !== null) {
    const seat = Number(winnerId.slice(1))
    if (!(seat >= 1 && seat <= players.length)) {
      return json({ error: 'winnerId is not a seat in this room' }, 400)
    }
  }

  const { error } = await supabase
    .from('rooms')
    .update({ status: 'finished', winner: winnerId })
    .eq('id', roomId.trim())
    .eq('status', 'active')

  if (error) {
    console.error('finish_game: update error', error, { roomId, playerId })
    return json({ error: 'Failed to finish game' }, 500)
  }

  // Persist the final standings (best-effort, idempotent). The UNIQUE(room_id)
  // constraint + ignoreDuplicates make this exactly-once across the finish race; a
  // malformed/absent scoreboard is simply skipped — the match has already finished.
  const cleanBoard = sanitizeScoreboard(scoreboard, players.length)
  const cleanRounds = typeof rounds === 'number' && Number.isInteger(rounds) && rounds >= 1
    ? rounds
    : 1
  if (cleanBoard) {
    const { error: scoreError } = await supabase
      .from('match_scores')
      .upsert(
        { room_id: roomId.trim(), winner: winnerId, rounds: cleanRounds, scoreboard: cleanBoard },
        { onConflict: 'room_id', ignoreDuplicates: true },
      )
    if (scoreError) {
      // Non-fatal: the game is finished; the scoreboard is a record, not game state.
      console.error('finish_game: score persist error', scoreError, { roomId, playerId })
    }
  }

  return json({ ok: true }, 200)
}

if (import.meta.main) {
  Deno.serve(withCors(handleFinishGame, { rateLimit: 'finish_game' }))
}
