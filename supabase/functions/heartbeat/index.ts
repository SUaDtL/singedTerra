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
    console.error('heartbeat: fetch error', fetchError)
    return json({ error: 'Failed to fetch room' }, 500)
  }

  if (!room) {
    return json({ error: 'Room not found or already started' }, 404)
  }

  const existingPlayers = (room.players ?? []) as StoredPlayer[]

  // Locate the player in the room
  const playerIndex = existingPlayers.findIndex(p => p.id === playerId)
  if (playerIndex === -1) {
    return json({ error: 'Player not in room' }, 400)
  }

  const nowMs = Date.now()

  // Bump lastSeen for the heartbeating player
  const updatedPlayers: StoredPlayer[] = existingPlayers.map(p =>
    p.id === playerId ? { ...p, lastSeen: nowMs } : p
  )

  const { error: updateError } = await supabase
    .from('rooms')
    .update({ players: updatedPlayers })
    .eq('id', roomId)

  if (updateError) {
    console.error('heartbeat: update error', updateError)
    return json({ error: 'Failed to update heartbeat' }, 500)
  }

  return json({ ok: true }, 200)
}, { rateLimit: 'heartbeat' }))
