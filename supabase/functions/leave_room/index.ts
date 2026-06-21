import { withCors, json, getServiceClient, UUID_REGEX, StoredPlayer } from '../_shared/mod.ts'

Deno.serve(withCors(async (body) => {
  const { roomId, playerId } = body as {
    roomId?: unknown
    playerId?: unknown
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
    console.error('leave_room: fetch error', fetchError)
    return json({ error: 'Failed to fetch room' }, 500)
  }

  if (!room) {
    return json({ error: 'Room not found or already started' }, 404)
  }

  const existingPlayers = (room.players ?? []) as StoredPlayer[]

  // Remove the player (idempotent — absent is fine)
  const remaining = existingPlayers.filter(p => p.id !== playerId)

  // If no players left, delete the room
  if (remaining.length === 0) {
    const { error: deleteError } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId)

    if (deleteError) {
      console.error('leave_room: delete error', deleteError)
      return json({ error: 'Failed to delete room' }, 500)
    }

    return json({ ok: true, roomDeleted: true, players: [] }, 200)
  }

  const { error: updateError } = await supabase
    .from('rooms')
    .update({ players: remaining })
    .eq('id', roomId)

  if (updateError) {
    console.error('leave_room: update error', updateError)
    return json({ error: 'Failed to update room' }, 500)
  }

  return json({ ok: true, roomDeleted: false, players: remaining }, 200)
}, { rateLimit: 'leave_room' }))
