import { withCors, json, getServiceClient, UUID_REGEX, isValidColor, StoredPlayer } from '../_shared/mod.ts'

export type UpdatePlayerResult =
  | { ok: false; status: number; error: string }
  | { ok: true; updatedPlayers: StoredPlayer[] }

/**
 * Pure name/color update. Conflict checks run against OTHER seats only (self is
 * excluded, so renaming to your own current value is allowed); name compare is
 * trimmed + case-insensitive. `name`/`color` are the already-shape-validated inputs
 * (undefined = leave that field unchanged). Bumps lastSeen on the target seat.
 * Returns { ok:false, 400 } when the player is not in the room. Extracted for testing (#61).
 */
export function applyPlayerUpdate(
  existingPlayers: StoredPlayer[],
  playerId: string,
  name: string | undefined,
  color: string | undefined,
  nowMs: number,
): UpdatePlayerResult {
  if (!existingPlayers.some((p) => p.id === playerId)) {
    return { ok: false, status: 400, error: 'Player not in room' }
  }
  if (
    name !== undefined &&
    existingPlayers.some((p) => p.id !== playerId && p.name.trim().toLowerCase() === name.trim().toLowerCase())
  ) {
    return { ok: false, status: 409, error: 'That name is already taken. Choose a different name.' }
  }
  if (color !== undefined && existingPlayers.some((p) => p.id !== playerId && p.color === color)) {
    return { ok: false, status: 409, error: 'That color is already taken. Choose a different color.' }
  }
  const updatedPlayers = existingPlayers.map((p) => {
    if (p.id !== playerId) return p
    const next = { ...p }
    if (name !== undefined) next.name = name.trim()
    if (color !== undefined) next.color = color
    next.lastSeen = nowMs
    return next
  })
  return { ok: true, updatedPlayers }
}

if (import.meta.main) {
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

  // Validate color if present (bounded hex; see isValidColor / appsec-003)
  if (color !== undefined && !isValidColor(color)) {
    return json({ error: 'Invalid input: color' }, 400)
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

  const result = applyPlayerUpdate(
    existingPlayers,
    playerId,
    name as string | undefined,
    color as string | undefined,
    Date.now(),
  )
  if (!result.ok) {
    return json({ error: result.error }, result.status)
  }
  const updatedPlayers = result.updatedPlayers

  const { error: updateError } = await supabase
    .from('rooms')
    .update({ players: updatedPlayers })
    .eq('id', roomId)

  if (updateError) {
    console.error('update_player: update error', updateError)
    return json({ error: 'Failed to update player' }, 500)
  }

  return json({ players: updatedPlayers }, 200)
}, { rateLimit: 'update_player' }))
} // end if (import.meta.main)
