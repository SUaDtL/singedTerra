import {
  withCors,
  json,
  safeErrorMessage,
  getServiceClient,
  generateCode,
  UUID_REGEX,
  StoredOptions,
  StoredPlayer,
  DEFAULT_TANK_LOADOUT,
  parseTankLoadout,
  TankLoadout,
  ServiceClient,
  DEFAULT_GRAVITY,
  DEFAULT_MAX_WIND,
  verifySeatToken,
  resolveStoredRulesetVersion,
} from '../_shared/mod.ts'
import { resolveStoredCommandVersion } from '../_shared/commandProtocol.ts'

/** Shape returned to the client (and broadcast-derived peers re-fetch the same). */
interface RematchInfo {
  roomId: string
  code: string
  seed: number
  options: {
    maxPlayers: number
    maxWind: number
    gravity: number
    rulesetVersion: 1 | 2 | 3 | 4
    commandProtocolVersion: 1 | 2
    walls: 'open' | 'reflective' | 'wrap' | 'concrete'
    battlefieldWorld?: 'ember-dusk' | 'obsidian-caldera' | 'glassstorm-expanse'
    hazards?: 'none' | 'lava'
    teamMode?: boolean
  }
  players: Array<{
    id: string
    name: string
    color: string
    loadout: TankLoadout
  }>
}

interface ExistingRematchRecord {
  id: string
  code: string
  seed: number
  options?: StoredOptions | null
  players?: StoredPlayer[] | null
}

/** Normalize the opaque stored room JSON into the rematch wire contract. */
export function normalizeRematchOptions(
  options: unknown,
  playerCount: number,
): RematchInfo['options'] {
  const storedRuleset = resolveStoredRulesetVersion(options)
  if (!storedRuleset.ok) throw new Error('Invalid stored ruleset')
  const storedCommandProtocol = resolveStoredCommandVersion(options)
  if (!storedCommandProtocol.ok) throw new Error('Invalid stored command protocol')
  const storedOptions = options as StoredOptions
  return {
    maxPlayers: storedOptions.maxPlayers ?? playerCount,
    maxWind: typeof storedOptions.maxWind === 'number' ? storedOptions.maxWind : DEFAULT_MAX_WIND,
    gravity: typeof storedOptions.gravity === 'number' ? storedOptions.gravity : DEFAULT_GRAVITY,
    rulesetVersion: storedRuleset.version,
    commandProtocolVersion: storedCommandProtocol.version,
    walls: storedOptions.walls === 'reflective' || storedOptions.walls === 'wrap' || storedOptions.walls === 'concrete'
      ? storedOptions.walls
      : 'open',
    ...(storedOptions.battlefieldWorld === 'ember-dusk'
      || storedOptions.battlefieldWorld === 'obsidian-caldera'
      || storedOptions.battlefieldWorld === 'glassstorm-expanse'
      ? { battlefieldWorld: storedOptions.battlefieldWorld }
      : {}),
    ...(storedOptions.hazards === 'lava' ? { hazards: 'lava' } : {}),
    ...(storedOptions.teamMode === true && playerCount === 4 ? { teamMode: true } : {}),
  }
}

export interface RestartGameDependencies {
  supabase?: ServiceClient
  verifySeat?: typeof verifySeatToken
}

/** Preserve every synchronized room option while normalizing the opaque wall value. */
export function normalizeStoredRematchOptions(options: StoredOptions): StoredOptions {
  const storedCommandProtocol = resolveStoredCommandVersion(options)
  if (!storedCommandProtocol.ok) throw new Error('Invalid stored command protocol')
  return {
    ...options,
    commandProtocolVersion: storedCommandProtocol.version,
    walls: options.walls === 'reflective' || options.walls === 'wrap' || options.walls === 'concrete'
      ? options.walls
      : 'open',
  }
}

/** Project the room read by a caller that lost the atomic rematch claim. */
export function projectExistingRematchInfo(room: ExistingRematchRecord): RematchInfo {
  const players = room.players ?? []
  return {
    roomId: room.id,
    code: room.code,
    seed: Number(room.seed),
    options: normalizeRematchOptions(room.options, players.length),
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      loadout: parseTankLoadout(p.loadout) ?? { ...DEFAULT_TANK_LOADOUT },
    })),
  }
}

/** Project the newly inserted room returned by the winning rematch caller. */
export function projectCreatedRematchInfo(
  roomId: string,
  code: string,
  seed: number,
  options: StoredOptions,
  players: StoredPlayer[],
): RematchInfo {
  return {
    roomId,
    code,
    seed,
    options: normalizeRematchOptions(options, players.length),
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      loadout: parseTankLoadout(p.loadout) ?? { ...DEFAULT_TANK_LOADOUT },
    })),
  }
}

/**
 * Build the successor room's roster from the old one. Preserves id/name/color
 * AND the `ai` CPU-difficulty flag (omitting it dropped bot designation, so a
 * rematch of a room with CPU seats produced ghost-human seats no client drove —
 * the game froze on bot turns). Marks everyone ready + stamps lastSeen so the
 * room is immediately playable. Pure + exported for testing.
 */
export function buildRematchPlayers(players: StoredPlayer[], nowMs: number): StoredPlayer[] {
  return players.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    ready: true,
    lastSeen: nowMs,
    ...(p.ai ? { ai: p.ai } : {}),
    loadout: parseTankLoadout(p.loadout) ?? { ...DEFAULT_TANK_LOADOUT },
  }))
}

/** Read a room by id and project it into the RematchInfo wire shape. */
async function fetchRematchInfo(supabase: ServiceClient, id: string): Promise<RematchInfo | null> {
  const { data } = await supabase
    .from('rooms')
    .select('id, code, seed, options, players')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  try {
    return projectExistingRematchInfo({
      id: data.id as string,
      code: data.code as string,
      seed: Number(data.seed),
      options: data.options as StoredOptions | null,
      players: (data.players ?? []) as StoredPlayer[],
    })
  } catch {
    return null
  }
}

// Guard Deno.serve so importing this module in tests does not start the HTTP
// listener (mirrors submit_action). import.meta.main is true only when Deno runs
// this file as the program entry point.
export async function handleRestartGame(
  body: unknown,
  _request?: Request,
  dependencies: RestartGameDependencies = {},
): Promise<Response> {
  const { roomId, playerId, token } = body as { roomId?: unknown; playerId?: unknown; token?: unknown }

  if (typeof roomId !== 'string' || !UUID_REGEX.test(roomId)) {
    return json({ error: 'Invalid input: roomId must be a UUID' }, 400)
  }
  if (typeof playerId !== 'string' || playerId.trim().length === 0) {
    return json({ error: 'Invalid input: playerId' }, 400)
  }

  const supabase = dependencies.supabase ?? getServiceClient()
  const verifySeat = dependencies.verifySeat ?? verifySeatToken

  // Fetch the old room (any status — a rematch is normally requested from a
  // 'finished' room, but accept 'active' too so a request that races the
  // finish_game write still succeeds).
  const { data: oldRoom, error: fetchError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle()

  if (fetchError) {
    console.error('restart_game: fetch error', { roomId, playerId, error: safeErrorMessage(fetchError) })
    return json({ error: 'Failed to fetch room' }, 500)
  }
  if (!oldRoom) {
    return json({ error: 'Room not found' }, 404)
  }

  const players = (oldRoom.players ?? []) as StoredPlayer[]
  if (!players.some(p => p.id === playerId)) {
    return json({ error: 'Player not in room' }, 403)
  }
  if (!(await verifySeat(supabase, roomId, playerId as string, token))) {
    return json({ error: 'Invalid or missing seat token' }, 403)
  }

  const storedRuleset = resolveStoredRulesetVersion(oldRoom.options)
  if (!storedRuleset.ok) {
    return json({ error: 'ruleset_unavailable' }, 409)
  }
  const storedCommandProtocol = resolveStoredCommandVersion(oldRoom.options)
  if (!storedCommandProtocol.ok) {
    return json({ error: 'command_protocol_unavailable' }, 409)
  }

  // The service-only RPC serializes contenders and publishes only a complete
  // successor, preserving the immediate rooms.rematch_room_id foreign key.
  const newRoomId = crypto.randomUUID()

  const nowMs = Date.now()

  const seedBuf = new Uint32Array(1)
  crypto.getRandomValues(seedBuf)
  const seed = seedBuf[0]

  // Preserve roster order (id/name/color) so each client's positional engine
  // tank mapping (players[i] -> 'p{i+1}') stays identical to the old game; mark
  // everyone ready so the room is immediately playable.
  const oldOptions = normalizeStoredRematchOptions(
    oldRoom.options as StoredOptions,
  )
  const newPlayers: StoredPlayer[] = buildRematchPlayers(players, nowMs)

  // Unique code with collision retry (mirrors create_room).
  let code: string | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode()
    const { data: existing } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', candidate)
      .neq('status', 'finished')
      .maybeSingle()
    if (!existing) { code = candidate; break }
  }
  if (!code) {
    return json({ error: 'Could not generate unique room code' }, 500)
  }

  const { data: successorId, error: rematchError } = await supabase.rpc('create_room_rematch', {
    p_room_id: roomId,
    p_player_id: playerId,
    p_new_room_id: newRoomId,
    p_code: code,
    p_seed: seed,
    p_options: oldOptions,
    p_players: newPlayers,
  })
  if (rematchError || typeof successorId !== 'string' || !UUID_REGEX.test(successorId)) {
    console.error('restart_game: transaction failed', { roomId, playerId, code: 'rematch_failed' })
    return json({ error: 'Failed to create rematch room' }, 500)
  }
  if (successorId !== newRoomId) {
    const existing = await fetchRematchInfo(supabase, successorId)
    return existing ? json({ ok: true, ...existing }, 200)
      : json({ error: 'Rematch pointer unresolved' }, 500)
  }
  const info = projectCreatedRematchInfo(newRoomId, code, seed, oldOptions, newPlayers)

  return json({ ok: true, ...info }, 200)
}

if (import.meta.main) {
  Deno.serve(withCors(handleRestartGame, { rateLimit: 'restart_game' }))
}
