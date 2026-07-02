import { withCors, json, getServiceClient, UUID_REGEX, StoredPlayer } from '../_shared/mod.ts'

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

if (import.meta.main) {
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

  const ready = applyReadyUp(existingPlayers, playerId, Date.now())
  if (!ready) {
    return json({ error: 'Player not in room' }, 400)
  }
  const { updatedPlayers, shouldStart } = ready

  // Build update payload
  const updatePayload: Record<string, unknown> = { players: updatedPlayers }
  if (shouldStart) {
    updatePayload.status = 'active'
  }

  const { error: updateError } = await supabase
    .from('rooms')
    .update(updatePayload)
    .eq('id', roomId)
    .eq('status', 'waiting')

  if (updateError) {
    console.error('ready_up: update error', updateError)
    return json({ error: 'Failed to update room' }, 500)
  }

  return json({ started: shouldStart, players: updatedPlayers }, 200)
}, { rateLimit: 'ready_up' }))
} // end if (import.meta.main)
