import { withCors, json, getServiceClient, UUID_REGEX, StoredPlayer } from '../_shared/mod.ts'

Deno.serve(withCors(async (body) => {
  const { roomId, playerId, name, color } = body as {
    roomId?: unknown
    playerId?: unknown
    name?: unknown
    color?: unknown
  }

  // Validate roomId (UUID format)
  if (typeof roomId !== 'string' || !UUID_REGEX.test(roomId)) {
    return json({ error: 'Invalid input: roomId must be a UUID' }, 400)
  }

  // Validate playerId
  if (typeof playerId !== 'string' || playerId.trim().length === 0) {
    return json({ error: 'Invalid input: playerId' }, 400)
  }

  // At least one of name/color must be present
  if (name === undefined && color === undefined) {
    return json({ error: 'Invalid input: at least one of name or color is required' }, 400)
  }

  // Validate name if present
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return json({ error: 'Invalid input: name' }, 400)
    }
    if (name.trim().length > 20) {
      return json({ error: 'Invalid input: name too long (max 20)' }, 400)
    }
  }

  // Validate color if present
  if (color !== undefined) {
    if (typeof color !== 'string' || color.trim().length === 0) {
      return json({ error: 'Invalid input: color' }, 400)
    }
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
    console.error('update_player: fetch error', fetchError)
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

  // Conflict checks against OTHER players
  if (name !== undefined) {
    const nameTaken = existingPlayers.some(
      p => p.id !== playerId && p.name.trim().toLowerCase() === (name as string).trim().toLowerCase()
    )
    if (nameTaken) {
      return json({ error: 'That name is already taken. Choose a different name.' }, 409)
    }
  }

  if (color !== undefined) {
    const colorTaken = existingPlayers.some(
      p => p.id !== playerId && p.color === (color as string)
    )
    if (colorTaken) {
      return json({ error: 'That color is already taken. Choose a different color.' }, 409)
    }
  }

  // Apply the provided field(s), leave ready as-is, bump lastSeen
  const nowMs = Date.now()
  const updatedPlayers: StoredPlayer[] = existingPlayers.map(p => {
    if (p.id !== playerId) return p
    const next = { ...p }
    if (name !== undefined) next.name = (name as string).trim()
    if (color !== undefined) next.color = color as string
    next.lastSeen = nowMs
    return next
  })

  const { error: updateError } = await supabase
    .from('rooms')
    .update({ players: updatedPlayers })
    .eq('id', roomId)

  if (updateError) {
    console.error('update_player: update error', updateError)
    return json({ error: 'Failed to update player' }, 500)
  }

  return json({ players: updatedPlayers }, 200)
}))
