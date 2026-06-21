import {
  withCors,
  json,
  getServiceClient,
  generateCode,
  UUID_REGEX,
  StoredOptions,
  StoredPlayer,
  ServiceClient,
} from '../_shared/mod.ts'

/** Shape returned to the client (and broadcast-derived peers re-fetch the same). */
interface RematchInfo {
  roomId: string
  code: string
  seed: number
  options: { maxPlayers: number; maxWind: number; gravity: number }
  players: Array<{ id: string; name: string; color: string }>
}

/** Read a room by id and project it into the RematchInfo wire shape. */
async function fetchRematchInfo(supabase: ServiceClient, id: string): Promise<RematchInfo | null> {
  const { data } = await supabase
    .from('rooms')
    .select('id, code, seed, options, players')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const opts = (data.options ?? {}) as StoredOptions
  const players = (data.players ?? []) as StoredPlayer[]
  return {
    roomId: data.id as string,
    code: data.code as string,
    seed: Number(data.seed),
    options: {
      maxPlayers: opts.maxPlayers ?? players.length,
      maxWind: typeof opts.maxWind === 'number' ? opts.maxWind : 10,
      gravity: typeof opts.gravity === 'number' ? opts.gravity : 0.15,
    },
    players: players.map(p => ({ id: p.id, name: p.name, color: p.color })),
  }
}

Deno.serve(withCors(async (body) => {
  const { roomId, playerId } = body as { roomId?: unknown; playerId?: unknown }

  if (typeof roomId !== 'string' || !UUID_REGEX.test(roomId)) {
    return json({ error: 'Invalid input: roomId must be a UUID' }, 400)
  }
  if (typeof playerId !== 'string' || playerId.trim().length === 0) {
    return json({ error: 'Invalid input: playerId' }, 400)
  }

  const supabase = getServiceClient()

  // Fetch the old room (any status — a rematch is normally requested from a
  // 'finished' room, but accept 'active' too so a request that races the
  // finish_game write still succeeds).
  const { data: oldRoom, error: fetchError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle()

  if (fetchError) {
    console.error('restart_game: fetch error', fetchError)
    return json({ error: 'Failed to fetch room' }, 500)
  }
  if (!oldRoom) {
    return json({ error: 'Room not found' }, 404)
  }

  const players = (oldRoom.players ?? []) as StoredPlayer[]
  if (!players.some(p => p.id === playerId)) {
    return json({ error: 'Player not in room' }, 403)
  }

  // --- Atomic claim ---------------------------------------------------------
  // Generate the successor id up front, then claim the old room's pointer with a
  // conditional UPDATE (only when still NULL). The UPDATE's returned rows are the
  // lock: exactly one concurrent caller flips NULL -> newRoomId and "wins" the
  // right to create the room; everyone else (the loser, or a double-click /
  // retry) reads the already-set pointer and returns that same successor. This
  // guarantees both players converge on ONE room with no orphan creation.
  const newRoomId = crypto.randomUUID()

  const { data: claimed, error: claimError } = await supabase
    .from('rooms')
    .update({ rematch_room_id: newRoomId })
    .eq('id', roomId)
    .is('rematch_room_id', null)
    .select('id')

  if (claimError) {
    console.error('restart_game: claim error', claimError)
    return json({ error: 'Failed to claim rematch' }, 500)
  }

  if (!claimed || claimed.length === 0) {
    // Lost the race (or pointer was already set on a prior call): return the
    // winner's successor room so this client migrates to the same place.
    const { data: refetched } = await supabase
      .from('rooms')
      .select('rematch_room_id')
      .eq('id', roomId)
      .maybeSingle()
    const existingId = refetched?.rematch_room_id as string | null | undefined
    if (existingId) {
      const info = await fetchRematchInfo(supabase, existingId)
      if (info) {
        return json({ ok: true, ...info }, 200)
      }
    }
    return json({ error: 'Rematch pointer unresolved' }, 500)
  }

  // --- We own the claim: build the successor room ---------------------------
  const nowMs = Date.now()

  const seedBuf = new Uint32Array(1)
  crypto.getRandomValues(seedBuf)
  const seed = seedBuf[0]

  // Preserve roster order (id/name/color) so each client's positional engine
  // tank mapping (players[i] -> 'p{i+1}') stays identical to the old game; mark
  // everyone ready so the room is immediately playable.
  const oldOptions = (oldRoom.options ?? {}) as StoredOptions
  const newPlayers: StoredPlayer[] = players.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    ready: true,
    lastSeen: nowMs,
  }))

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
    // Could not allocate a code — release the claim so a retry can succeed.
    await supabase.from('rooms').update({ rematch_room_id: null }).eq('id', roomId).eq('rematch_room_id', newRoomId)
    return json({ error: 'Could not generate unique room code' }, 500)
  }

  const { error: insertError } = await supabase
    .from('rooms')
    .insert({
      id: newRoomId,
      code,
      seed,
      status: 'active',
      options: oldOptions,
      players: newPlayers,
      active_player_index: 0,
      turn: 0,
      winner: null,
    })

  if (insertError) {
    console.error('restart_game: insert error', insertError)
    // Roll back the claim so the pointer never dangles at a room that does not exist.
    await supabase.from('rooms').update({ rematch_room_id: null }).eq('id', roomId).eq('rematch_room_id', newRoomId)
    return json({ error: 'Failed to create rematch room' }, 500)
  }

  const info: RematchInfo = {
    roomId: newRoomId,
    code,
    seed,
    options: {
      maxPlayers: oldOptions.maxPlayers ?? newPlayers.length,
      maxWind: typeof oldOptions.maxWind === 'number' ? oldOptions.maxWind : 10,
      gravity: typeof oldOptions.gravity === 'number' ? oldOptions.gravity : 0.15,
    },
    players: newPlayers.map(p => ({ id: p.id, name: p.name, color: p.color })),
  }

  return json({ ok: true, ...info }, 200)
}, { rateLimit: 'restart_game' }))
