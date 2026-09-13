import {
  withCors,
  json,
  safeErrorMessage,
  getServiceClient,
  reap,
  isValidColor,
  mintSeatToken,
  DEFAULT_TANK_LOADOUT,
  parseTankLoadout,
  resolveRequestedRulesetVersion,
  resolveStoredRulesetVersion,
  rulesetCompatibility,
  type StoredOptions,
  type StoredPlayer,
} from '../_shared/mod.ts'
import {
  commandVersionCompatibility,
  resolveRequestedCommandVersion,
  resolveStoredCommandVersion,
} from '../_shared/commandProtocol.ts'

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

interface JoinRoomDependencies {
  serviceClient?: ReturnType<typeof getServiceClient>
}

async function handleJoinRoomWithDependencies(
  body: unknown,
  dependencies: JoinRoomDependencies,
): Promise<Response> {
  const { code, playerName, color, loadout, rulesetVersion, commandProtocolVersion, roomLifecycleVersion } = body as {
    code?: unknown
    playerName?: unknown
    color?: unknown
    loadout?: unknown
    rulesetVersion?: unknown
    commandProtocolVersion?: unknown
    roomLifecycleVersion?: unknown
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
  const playerLoadout = loadout === undefined
    ? { ...DEFAULT_TANK_LOADOUT }
    : parseTankLoadout(loadout)
  if (playerLoadout === null) {
    return json({ error: 'Invalid input: loadout' }, 400)
  }

  const requestedRuleset = resolveRequestedRulesetVersion(rulesetVersion)
  if (!requestedRuleset.ok) {
    return json({ error: 'Invalid input: rulesetVersion' }, 400)
  }
  const requestedCommandProtocol = resolveRequestedCommandVersion(commandProtocolVersion)
  if (!requestedCommandProtocol.ok) {
    return json({ error: 'Invalid input: commandProtocolVersion' }, 400)
  }

  const normalizedCode = code.trim().toUpperCase()

  const supabase = dependencies.serviceClient ?? getServiceClient()

  // Fetch room by code, must be in 'waiting' status
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', normalizedCode)
    .eq('status', 'waiting')
    .maybeSingle()

  if (fetchError) {
    console.error('join_room: fetch error', { code: normalizedCode, error: safeErrorMessage(fetchError) })
    return json({ error: 'Failed to look up room' }, 500)
  }

  if (!room) {
    return json({ error: 'Room not found or already started' }, 404)
  }

  const roomOptions = room.options as StoredOptions
  const storedPlayers = (room.players ?? []) as StoredPlayer[]

  if (roomOptions?.roomLifecycleVersion === 1 && roomLifecycleVersion !== 1) {
    return json({ error: 'room_lifecycle_mismatch', requiredRoomLifecycleVersion: 1 }, 409)
  }

  // Reject compatibility before lazy-GC or any roster/seat mutation.
  const storedRuleset = resolveStoredRulesetVersion(roomOptions)
  if (!storedRuleset.ok) {
    return json({ error: 'ruleset_unavailable' }, 409)
  }
  const compatibility = rulesetCompatibility(requestedRuleset.version, storedRuleset.version)
  if (!compatibility.ok) {
    return json({
      error: compatibility.error,
      requiredRulesetVersion: compatibility.requiredRulesetVersion,
    }, 409)
  }
  const storedCommandProtocol = resolveStoredCommandVersion(roomOptions)
  if (!storedCommandProtocol.ok) {
    return json({ error: 'command_protocol_unavailable' }, 409)
  }
  const commandCompatibility = commandVersionCompatibility(
    requestedCommandProtocol.version,
    storedCommandProtocol.version,
  )
  if (!commandCompatibility.ok) {
    return json({
      error: 'command_protocol_mismatch',
      requiredCommandProtocolVersion: commandCompatibility.requiredCommandProtocolVersion,
    }, 409)
  }

  const nowMs = Date.now()

  // Lazy-GC: reap stale players before any capacity/color/name checks
  const fresh = reap(storedPlayers, nowMs)

  if (fresh.length === 0) {
    // Dead room — delete and report as not found
    await supabase.rpc('apply_room_reap', { p_dead: [room.id], p_trims: [] })
    return json({ error: 'Room not found or already started' }, 404)
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
    loadout: playerLoadout,
  }

  const updatedPlayers = [...existingPlayers, newPlayer]

  // Compare the observed roster under the database room lock, then publish the
  // roster and private credential together. A concurrent start/join wins cleanly.
  const token = mintSeatToken()
  const { data: admitted, error: admissionError } = await supabase.rpc('admit_room_seat', {
    p_room_id: room.id, p_expected_players: storedPlayers, p_players: updatedPlayers,
    p_player_id: playerId, p_token: token,
  })
  if (admissionError || !admitted) {
    console.error('join_room: admission transaction failed')
    return json({ error: 'Failed to join room' }, 500)
  }
  if (!admitted.ok) return json({ error: 'Room changed; please try joining again' }, 409)

  return json({
    roomId: room.id,
    playerId,
    token,
    seed: room.seed,
    options: { ...roomOptions, commandProtocolVersion: storedCommandProtocol.version },
    players: updatedPlayers,
  }, 200)
}

export function joinRoomHandler(
  dependencies: JoinRoomDependencies,
): (body: unknown) => Promise<Response> {
  return (body) => handleJoinRoomWithDependencies(body, dependencies)
}

export async function handleJoinRoom(body: unknown): Promise<Response> {
  return handleJoinRoomWithDependencies(body, {})
}

if (import.meta.main) {
  Deno.serve(withCors(handleJoinRoom, { rateLimit: 'join_room' }))
}
