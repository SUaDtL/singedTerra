import { withCors, json, getServiceClient, reap, isValidColor, mintSeatToken, StoredOptions, StoredPlayer } from '../_shared/mod.ts'

/**
 * Pure post-reap join eligibility: capacity, then color, then name conflict (name
 * is trimmed + case-insensitive). Returns the first failing check (with the exact
 * status/error the handler returns) or { ok: true }. Extracted for testing — this
 * branchy gate previously had no coverage (#61 / testcov-004).
 */
export function checkJoinEligibility(
  existingPlayers: StoredPlayer[],
  maxPlayers: number,
  playerName: string,
  color: string,
): { ok: true } | { ok: false; status: number; error: string } {
  if (existingPlayers.length >= maxPlayers) {
    return { ok: false, status: 409, error: 'Room is full' }
  }
  if (existingPlayers.some((p) => p.color === color.trim())) {
    return { ok: false, status: 409, error: 'That color is already taken. Choose a different color.' }
  }
  if (existingPlayers.some((p) => p.name.trim().toLowerCase() === playerName.trim().toLowerCase())) {
    return { ok: false, status: 409, error: 'That name is already taken. Choose a different name.' }
  }
  return { ok: true }
}

export async function handleJoinRoom(body: unknown): Promise<Response> {
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

  // Validate color (bounded hex; see isValidColor / appsec-003)
  if (!isValidColor(color)) {
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
    console.error('join_room: fetch error', fetchError, { code: normalizedCode })
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
      console.error('join_room: reap update error', reapError, { roomId: room.id })
      return json({ error: 'Failed to join room' }, 500)
    }
  }

  const existingPlayers = fresh

  // Capacity + color + name conflict gate (pure; see checkJoinEligibility).
  const eligibility = checkJoinEligibility(existingPlayers, roomOptions.maxPlayers, playerName, color)
  if (!eligibility.ok) {
    return json({ error: eligibility.error }, eligibility.status)
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
    console.error('join_room: update error', updateError, { roomId: room.id, playerId })
    return json({ error: 'Failed to join room' }, 500)
  }

  // Mint the joining player's seat token and persist it.
  const token = mintSeatToken()
  const { error: seatError } = await supabase
    .from('room_seats')
    .insert({ room_id: room.id, seat_id: playerId, token })

  if (seatError) {
    console.error('join_room: seat insert error', seatError, { roomId: room.id, playerId })
    return json({ error: 'Failed to join room' }, 500)
  }

  return json({
    roomId: room.id,
    playerId,
    token,
    seed: room.seed,
    options: roomOptions,
    players: updatedPlayers,
  }, 200)
}

if (import.meta.main) {
  Deno.serve(withCors(handleJoinRoom, { rateLimit: 'join_room' }))
}
