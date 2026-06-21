import { withCors, json, getServiceClient, reap, StoredOptions, StoredPlayer } from '../_shared/mod.ts'

Deno.serve(withCors(async (body) => {
  const { code, playerName, color } = body as {
    code?: unknown
    playerName?: unknown
    color?: unknown
  }

  // Validate code
  if (typeof code !== 'string' || code.trim().length === 0) {
    return json({ error: 'Invalid input: code' }, 400)
  }

  // Validate playerName
  if (typeof playerName !== 'string' || playerName.trim().length === 0) {
    return json({ error: 'Invalid input: playerName' }, 400)
  }
  if (playerName.trim().length > 20) {
    return json({ error: 'Invalid input: playerName too long (max 20)' }, 400)
  }

  // Validate color
  if (typeof color !== 'string' || color.trim().length === 0) {
    return json({ error: 'Invalid input: color' }, 400)
  }

  const normalizedCode = code.trim().toUpperCase()

  const supabase = getServiceClient()

  // Fetch room by code, must be in 'waiting' status
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', normalizedCode)
    .eq('status', 'waiting')
    .maybeSingle()

  if (fetchError) {
    console.error('join_room: fetch error', fetchError)
    return json({ error: 'Failed to look up room' }, 500)
  }

  if (!room) {
    return json({ error: 'Room not found or already started' }, 404)
  }

  const roomOptions = room.options as StoredOptions
  const storedPlayers = (room.players ?? []) as StoredPlayer[]

  const nowMs = Date.now()

  // Lazy-GC: reap stale players before any capacity/color/name checks
  const fresh = reap(storedPlayers, nowMs)

  if (fresh.length === 0) {
    // Dead room — delete and report as not found
    await supabase.from('rooms').delete().eq('id', room.id)
    return json({ error: 'Room not found or already started' }, 404)
  }

  if (fresh.length !== storedPlayers.length) {
    // Some ghosts reaped — persist so they no longer block capacity/color/name
    const { error: reapError } = await supabase
      .from('rooms')
      .update({ players: fresh })
      .eq('id', room.id)
    if (reapError) {
      console.error('join_room: reap update error', reapError)
      return json({ error: 'Failed to join room' }, 500)
    }
  }

  const existingPlayers = fresh

  // Check capacity
  if (existingPlayers.length >= roomOptions.maxPlayers) {
    return json({ error: 'Room is full' }, 409)
  }

  // Check for color conflict
  const colorTaken = existingPlayers.some((p: StoredPlayer) => p.color === color.trim())
  if (colorTaken) {
    return json({ error: 'That color is already taken. Choose a different color.' }, 409)
  }

  // Check for name conflict (trimmed + case-insensitive)
  const nameTaken = existingPlayers.some(
    (p: StoredPlayer) => p.name.trim().toLowerCase() === playerName.trim().toLowerCase()
  )
  if (nameTaken) {
    return json({ error: 'That name is already taken. Choose a different name.' }, 409)
  }

  // Generate playerId
  const playerId = crypto.randomUUID()

  const newPlayer: StoredPlayer = {
    id: playerId,
    name: playerName.trim(),
    color: color.trim(),
    ready: false,
    lastSeen: nowMs,
  }

  const updatedPlayers = [...existingPlayers, newPlayer]

  // Update room with new player
  const { error: updateError } = await supabase
    .from('rooms')
    .update({ players: updatedPlayers })
    .eq('id', room.id)

  if (updateError) {
    console.error('join_room: update error', updateError)
    return json({ error: 'Failed to join room' }, 500)
  }

  return json({
    roomId: room.id,
    playerId,
    seed: room.seed,
    options: roomOptions,
    players: updatedPlayers,
  }, 200)
}, { rateLimit: 'join_room' }))
