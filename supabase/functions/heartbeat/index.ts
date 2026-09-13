import { withCors, json, UUID_REGEX, StoredPlayer } from '../_shared/mod.ts'
import { roomLifecycleResponse } from '../_shared/roomLifecycle.ts'

/** Pure heartbeat: bump lastSeen for `playerId` only. Returns the new roster, or
 *  null when the player is not in the room. Extracted for testing (#61). */
export function applyHeartbeat(
  players: StoredPlayer[],
  playerId: string,
  nowMs: number,
): StoredPlayer[] | null {
  if (!players.some((p) => p.id === playerId)) return null
  return players.map((p) => (p.id === playerId ? { ...p, lastSeen: nowMs } : p))
}

export async function handleHeartbeat(body: unknown): Promise<Response> {
  const { roomId, playerId, token } = body as {
    roomId?: unknown
    playerId?: unknown
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

  return roomLifecycleResponse(roomId, playerId, token, 'heartbeat')
}

if (import.meta.main) {
  Deno.serve(withCors(handleHeartbeat, { rateLimit: 'heartbeat' }))
}
