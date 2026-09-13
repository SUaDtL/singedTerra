import { getServiceClient, json } from './mod.ts'

/** Seat authorization and the transition share the room's database row lock. */
export async function roomLifecycleResponse(
  roomId: string,
  playerId: string,
  token: unknown,
  operation: 'heartbeat' | 'leave' | 'ready',
): Promise<Response> {
  if (typeof token !== 'string' || token.length === 0) {
    return json({ error: 'Invalid or missing seat token' }, 403)
  }
  const { data, error } = await getServiceClient().rpc('room_lifecycle', {
    p_room_id: roomId, p_player_id: playerId, p_token: token, p_operation: operation,
  })
  if (error || !data || typeof data.ok !== 'boolean') {
    // Never log an RPC error that could include its credential-bearing arguments.
    console.error('room lifecycle transaction failed')
    return json({ error: 'Failed to update room' }, 500)
  }
  if (data.ok) return json(data, 200)
  switch (data.error) {
    case 'invalid_seat_token': return json({ error: 'Invalid or missing seat token' }, 403)
    case 'room_not_found': return json({ error: 'Room not found' }, 404)
    case 'room_not_active': return json({ error: 'room_not_active' }, 409)
    case 'room_abandoned': return json({ error: 'room_abandoned' }, 409)
    case 'seat_left': return json({ error: 'seat_left' }, 409)
    default: return json({ error: 'Failed to update room' }, 500)
  }
}
