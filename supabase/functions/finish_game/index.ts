import { withCors, json, getServiceClient } from '../_shared/mod.ts'

Deno.serve(withCors(async (body) => {
  const { roomId, winnerId, playerId } = body as {
    roomId?: unknown
    winnerId?: unknown
    // The caller's Supabase id — required so only a ROOM MEMBER can finish the
    // room (previously any client could POST an arbitrary winner). P2-9.
    playerId?: unknown
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
    console.error('finish_game: fetch error', fetchError)
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
    console.error('finish_game: update error', error)
    return json({ error: 'Failed to finish game' }, 500)
  }

  return json({ ok: true }, 200)
}))
