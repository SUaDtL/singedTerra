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
    console.error('ready_up: fetch error', fetchError)
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

  // Mark player ready (and bump lastSeen)
  const nowMs = Date.now()
  const updatedPlayers: StoredPlayer[] = existingPlayers.map(p =>
    p.id === playerId ? { ...p, ready: true, lastSeen: nowMs } : p
  )

  // Determine if game should start
  const allReady = updatedPlayers.every(p => p.ready)
  const enoughPlayers = updatedPlayers.length >= 2
  const shouldStart = allReady && enoughPlayers

  // Build update payload
  const updatePayload: Record<string, unknown> = { players: updatedPlayers }
  if (shouldStart) {
    updatePayload.status = 'active'
  }

  const { error: updateError } = await supabase
    .from('rooms')
    .update(updatePayload)
    .eq('id', roomId)

  if (updateError) {
    console.error('ready_up: update error', updateError)
    return json({ error: 'Failed to update room' }, 500)
  }

  return json({ started: shouldStart, players: updatedPlayers }, 200)
}, { rateLimit: 'ready_up' }))
