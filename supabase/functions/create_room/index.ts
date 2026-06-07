import { withCors, json, getServiceClient, generateCode } from '../_shared/mod.ts'

Deno.serve(withCors(async (body) => {
  const { playerName, color, options, bots } = body as {
    playerName?: unknown
    color?: unknown
    options?: { maxPlayers?: unknown; maxWind?: unknown; gravity?: unknown; visibility?: unknown }
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

  // Validate color
  if (typeof color !== 'string' || color.trim().length === 0) {
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
    const bColor = typeof b.color === 'string' ? b.color.trim() : ''
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

  // Build stored options
  const storedOptions = {
    maxPlayers,
    maxWind: typeof options.maxWind === 'number' ? options.maxWind : 10,
    gravity: typeof options.gravity === 'number' ? options.gravity : 0.15,
    visibility,
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

  // Return the full players array so the client has the generated CPU seat ids
  // (and renders them in the waiting room) without waiting for a Realtime update.
  return json({ roomId: room.id, code, playerId, players }, 200)
}))
