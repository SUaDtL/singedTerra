import {
  withCors,
  json,
  getServiceClient,
  UUID_REGEX,
  isValidColor,
  parseTankLoadout,
} from '../_shared/mod.ts'

export async function handleUpdatePlayer(body: unknown): Promise<Response> {
  const { roomId, playerId, name, color, loadout, token } = body as {
    roomId?: unknown
    playerId?: unknown
    name?: unknown
    color?: unknown
    loadout?: unknown
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

  // At least one editable player field must be present.
  if (name === undefined && color === undefined && loadout === undefined) {
    return json({ error: 'Invalid input: at least one player field is required' }, 400)
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
  const parsedLoadout = loadout === undefined ? undefined : parseTankLoadout(loadout)
  if (parsedLoadout === null) {
    return json({ error: 'Invalid input: loadout' }, 400)
  }

  if (typeof token !== 'string' || token.length === 0) {
    return json({ error: 'Invalid or missing seat token' }, 403)
  }
  // The database reads the current roster and credential under the same lock
  // used by start, ready, join and leave. Never send a stale replacement roster.
  const { data, error } = await getServiceClient().rpc('update_room_player', {
    p_room_id: roomId, p_player_id: playerId, p_token: token,
    p_changes: {
      ...(typeof name === 'string' ? { name: name.trim() } : {}),
      ...(typeof color === 'string' ? { color } : {}),
      ...(parsedLoadout !== undefined ? { loadout: parsedLoadout } : {}),
    },
  })
  if (error || !data || typeof data.ok !== 'boolean' || (data.ok && !Array.isArray(data.players))) {
    console.error('update_player: transaction failed', { operation: 'update', roomId, playerId })
    return json({ error: 'Failed to update player' }, 500)
  }
  if (data.ok) return json({ players: data.players }, 200)
  switch (data.error) {
    case 'room_not_waiting': return json({ error: 'Room not found or already started' }, 404)
    case 'invalid_seat_token': return json({ error: 'Invalid or missing seat token' }, 403)
    case 'player_not_in_room': return json({ error: 'Player not in room' }, 400)
    case 'name_conflict': return json({ error: 'That name is already taken. Choose a different name.' }, 409)
    case 'color_conflict': return json({ error: 'That color is already taken. Choose a different color.' }, 409)
    default: return json({ error: 'Failed to update player' }, 500)
  }
}

if (import.meta.main) {
  Deno.serve(withCors(handleUpdatePlayer, { rateLimit: 'update_player' }))
}
