import { withCors, json, UUID_REGEX, StoredPlayer } from '../_shared/mod.ts'
import { roomLifecycleResponse } from '../_shared/roomLifecycle.ts'

export interface LeaveResult {
  remaining: StoredPlayer[]
  /** True when the room is now empty and should be deleted. */
  roomDeleted: boolean
}

/** Pure leave transition: drop `playerId` from the roster (idempotent — absent is
 *  fine) and report whether the room is now empty. Extracted for testing (#61). */
export function applyLeave(players: StoredPlayer[], playerId: string): LeaveResult {
  const remaining = players.filter((p) => p.id !== playerId)
  return { remaining, roomDeleted: remaining.length === 0 }
}

export async function handleLeaveRoom(body: unknown): Promise<Response> {
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

  return roomLifecycleResponse(roomId, playerId, token, 'leave')
}

if (import.meta.main) {
  Deno.serve(withCors(handleLeaveRoom, { rateLimit: 'leave_room' }))
}
