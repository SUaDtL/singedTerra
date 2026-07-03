import { withCors, json, getServiceClient, generateCode, isValidColor, mintSeatToken, DEFAULT_GRAVITY, DEFAULT_MAX_WIND } from '../_shared/mod.ts'
import { coerceEconomyOptions, coerceGravity, coerceMaxWind } from './validate.ts'

Deno.serve(withCors(async (body) => {
  const { playerName, color, options, bots } = body as {
    playerName?: unknown
    color?: unknown
    options?: {
      maxPlayers?: unknown; maxWind?: unknown; gravity?: unknown; visibility?: unknown; rounds?: unknown
      // SE-parity economy (optional, additive). Coerced by coerceEconomyOptions.
      interestRate?: unknown; suddenDeathTurn?: unknown; armsLevel?: unknown
    }
    // Optional CPU seats to seed into the room (single-player / fill-a-room).
    bots?: unknown
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

  // Validate options.maxPlayers
  if (!options || typeof options !== 'object') {
    return json({ error: 'Invalid input: options' }, 400)
  }
  const maxPlayers = options.maxPlayers
  if (
    typeof maxPlayers !== 'number' ||
    !Number.isInteger(maxPlayers) ||
    maxPlayers < 2 ||
    maxPlayers > 4
  ) {
    return json({ error: 'Invalid input: options.maxPlayers must be integer 2-4' }, 400)
  }

  // Validate options.visibility (optional; default 'private')
  let visibility: 'public' | 'private' = 'private'
  if (options.visibility !== undefined) {
    if (options.visibility !== 'public' && options.visibility !== 'private') {
      return json({ error: 'Invalid input: options.visibility' }, 400)
    }
    visibility = options.visibility
  }

  const supabase = getServiceClient()

  // Generate playerId
  const playerId = crypto.randomUUID()

  // Generate seed (32-bit unsigned integer, safe as JS number)
  const seedBuf = new Uint32Array(1)
  crypto.getRandomValues(seedBuf)
  const seed = seedBuf[0]

  // Generate room code with collision retry
  let code: string | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode()
    const { data: existing } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', candidate)
      .neq('status', 'finished')
      .maybeSingle()
    if (!existing) {
      code = candidate
      break
    }
  }

  if (!code) {
    return json({ error: 'Could not generate unique room code' }, 500)
  }

  // Validate + build any CPU seats. Bots are ready immediately and occupy seats,
  // so humans fill the remainder. At most maxPlayers-1 (≥1 human: the creator).
  const AI_LEVELS = new Set(['easy', 'medium', 'hard'])
  interface BotIn { name?: unknown; color?: unknown; ai?: unknown }
  const botsIn: BotIn[] = Array.isArray(bots) ? (bots as BotIn[]) : []
  if (botsIn.length > maxPlayers - 1) {
    return json({ error: `Too many CPU opponents (max ${maxPlayers - 1} for ${maxPlayers}-player room)` }, 400)
  }
  const usedColors = new Set<string>([color.trim()])
  const nowMs = Date.now()
  const botSeats: Array<{ id: string; name: string; color: string; ready: boolean; lastSeen: number; ai: 'easy' | 'medium' | 'hard' }> = []
  for (let i = 0; i < botsIn.length; i++) {
    const b = botsIn[i]
    const bColor = isValidColor(b.color) ? b.color.trim() : ''
    const bAi = typeof b.ai === 'string' ? b.ai : ''
    if (!bColor || !AI_LEVELS.has(bAi)) {
      return json({ error: 'Invalid CPU opponent (needs color + difficulty)' }, 400)
    }
    if (usedColors.has(bColor)) {
      return json({ error: 'CPU opponents must use distinct colors' }, 400)
    }
    usedColors.add(bColor)
    botSeats.push({
      id: crypto.randomUUID(),
      name: (typeof b.name === 'string' && b.name.trim()) ? b.name.trim().slice(0, 20) : `CPU ${i + 1}`,
      color: bColor,
      ready: true,            // bots are always ready — they never block the start
      lastSeen: nowMs,
      ai: bAi as 'easy' | 'medium' | 'hard',
    })
  }

  // Build players array: the human creator first (so creator => 'p1'), then bots.
  const players = [
    {
      id: playerId,
      name: playerName.trim(),
      color: color.trim(),
      ready: false,
      lastSeen: nowMs,
    },
    ...botSeats,
  ]

  // Best-of-N (optional). Stored on the row so every client builds the same engine
  // (deterministic lockstep across rounds). Coerced to an odd integer in 1..9; an
  // absent/invalid value is omitted so the engine falls back to a single round.
  let rounds: number | undefined
  if (typeof options.rounds === 'number' && Number.isFinite(options.rounds)) {
    const clamped = Math.min(9, Math.max(1, Math.trunc(options.rounds)))
    rounds = clamped % 2 === 0 ? clamped + 1 : clamped
  }

  // Build stored options
  const storedOptions = {
    maxPlayers,
    maxWind: coerceMaxWind(options.maxWind, DEFAULT_MAX_WIND),
    gravity: coerceGravity(options.gravity, DEFAULT_GRAVITY),
    visibility,
    ...(rounds !== undefined ? { rounds } : {}),
    // SE-parity economy — coerced + omitted-when-absent so every client builds an identical engine.
    ...coerceEconomyOptions(options),
  }

  // Insert room
  const { data: room, error: insertError } = await supabase
    .from('rooms')
    .insert({
      code,
      seed,
      status: 'waiting',
      options: storedOptions,
      players,
      active_player_index: 0,
      turn: 0,
    })
    .select('id')
    .single()

  if (insertError || !room) {
    console.error('create_room: insert error', insertError)
    return json({ error: 'Failed to create room' }, 500)
  }

  // Mint the creator's seat token (human seat only — bots get no room_seats row)
  // and persist it. If this fails, roll back the just-created room so we never
  // leave an unclaimable room behind.
  const token = mintSeatToken()
  const { error: seatError } = await supabase
    .from('room_seats')
    .insert({ room_id: room.id, seat_id: playerId, token })

  if (seatError) {
    console.error('create_room: seat insert error', seatError)
    await supabase.from('rooms').delete().eq('id', room.id)
    return json({ error: 'Failed to create room' }, 500)
  }

  // Return the full players array so the client has the generated CPU seat ids
  // (and renders them in the waiting room) without waiting for a Realtime update.
  return json({ roomId: room.id, code, playerId, token, players }, 200)
}, { rateLimit: 'create_room' }))
