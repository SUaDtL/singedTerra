import { withCors, json, getServiceClient, UUID_REGEX, StoredPlayer, verifySeatToken } from '../_shared/mod.ts'

/** Pure heartbeat: bump lastSeen for `playerId` only. Returns the new roster, or
 *  null when the player is not in the room. Extracted for testing (#61). */
export function applyHeartbeat(
  players: StoredPlayer[],
  playerId: string,
  nowMs: number,
): StoredPlayer[] | null {
  if (!players.some((p) => p.id === playerId)) return null
  return players.map((p) => (p.id === playerId ? { ...p, lastSeen: nowMs } : p))
}

if (import.meta.main) {
Deno.serve(withCors(async (body) => {
  const { roomId, playerId, token } = body as {
    roomId?: unknown
    playerId?: unknown
    token?: unknown
  }

  // Validate roomId (UUID format)
  if (typeof roomId !== 'string' || !UUID_REGEX.test(roomId)) {
    return json({ error: 'Invalid input: roomId must be a UUID' }, 400)
  }

  // Validate playerId
  if (typeof playerId !== 'string' || playerId.trim().length === 0) {
    return json({ error: 'Invalid input: playerId' }, 400)
  }

  const supabase = getServiceClient()

  // Fetch room — must be in 'waiting' status
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .eq('status', 'waiting')
    .maybeSingle()

  if (fetchError) {
    console.error('heartbeat: fetch error', fetchError, { roomId, playerId })
    return json({ error: 'Failed to fetch room' }, 500)
  }

  if (!room) {
    return json({ error: 'Room not found or already started' }, 404)
  }

  if (!(await verifySeatToken(supabase, roomId as string, playerId as string, token))) {
    return json({ error: 'Invalid or missing seat token' }, 403)
  }

  const existingPlayers = (room.players ?? []) as StoredPlayer[]

  const updatedPlayers = applyHeartbeat(existingPlayers, playerId, Date.now())
  if (!updatedPlayers) {
    return json({ error: 'Player not in room' }, 400)
  }

  const { error: updateError } = await supabase
    .from('rooms')
    .update({ players: updatedPlayers })
    .eq('id', roomId)

  if (updateError) {
    console.error('heartbeat: update error', updateError, { roomId, playerId })
    return json({ error: 'Failed to update heartbeat' }, 500)
  }

  return json({ ok: true }, 200)
}, { rateLimit: 'heartbeat' }))
} // end if (import.meta.main)
