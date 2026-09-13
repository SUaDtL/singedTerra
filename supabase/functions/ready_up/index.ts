import { withCors, json, UUID_REGEX, StoredPlayer } from '../_shared/mod.ts'
import { roomLifecycleResponse } from '../_shared/roomLifecycle.ts'

export interface ReadyUpResult {
  updatedPlayers: StoredPlayer[]
  /** True when the game should transition waiting -> active: every seat is ready
   *  AND there are at least 2 players. */
  shouldStart: boolean
}

/**
 * Pure ready-up transition: mark `playerId` ready (bumping lastSeen) and decide
 * whether the game should start. Returns null when the player is not in the room.
 * Extracted for testing (the all-ready start transition is branchy state-machine
 * logic that previously had no coverage — #61 / testcov-004).
 */
export function applyReadyUp(
  existingPlayers: StoredPlayer[],
  playerId: string,
  nowMs: number,
): ReadyUpResult | null {
  if (!existingPlayers.some((p) => p.id === playerId)) return null
  const updatedPlayers: StoredPlayer[] = existingPlayers.map((p) =>
    p.id === playerId ? { ...p, ready: true, lastSeen: nowMs } : p,
  )
  const shouldStart = updatedPlayers.length >= 2 && updatedPlayers.every((p) => p.ready)
  return { updatedPlayers, shouldStart }
}

export async function handleReadyUp(body: unknown): Promise<Response> {
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

  return roomLifecycleResponse(roomId, playerId, token, 'ready')
}

if (import.meta.main) {
  Deno.serve(withCors(handleReadyUp, { rateLimit: 'ready_up' }))
}
