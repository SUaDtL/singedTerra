import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => chars[b % 36]).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders() }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  const { playerName, color, options } = body as {
    playerName?: unknown
    color?: unknown
    options?: { maxPlayers?: unknown; maxWind?: unknown; gravity?: unknown; visibility?: unknown }
  }

  // Validate playerName
  if (typeof playerName !== 'string' || playerName.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: playerName' }),
      { status: 400, headers: corsHeaders() }
    )
  }
  if (playerName.trim().length > 20) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: playerName too long (max 20)' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  // Validate color
  if (typeof color !== 'string' || color.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: color' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  // Validate options.maxPlayers
  if (!options || typeof options !== 'object') {
    return new Response(
      JSON.stringify({ error: 'Invalid input: options' }),
      { status: 400, headers: corsHeaders() }
    )
  }
  const maxPlayers = options.maxPlayers
  if (
    typeof maxPlayers !== 'number' ||
    !Number.isInteger(maxPlayers) ||
    maxPlayers < 2 ||
    maxPlayers > 4
  ) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: options.maxPlayers must be integer 2-4' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  // Validate options.visibility (optional; default 'private')
  let visibility: 'public' | 'private' = 'private'
  if (options.visibility !== undefined) {
    if (options.visibility !== 'public' && options.visibility !== 'private') {
      return new Response(
        JSON.stringify({ error: 'Invalid input: options.visibility' }),
        { status: 400, headers: corsHeaders() }
      )
    }
    visibility = options.visibility
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration: missing env vars' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
    return new Response(
      JSON.stringify({ error: 'Could not generate unique room code' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  // Build players array
  const nowMs = Date.now()
  const players = [
    {
      id: playerId,
      name: playerName.trim(),
      color: color.trim(),
      ready: false,
      lastSeen: nowMs,
    },
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
    return new Response(
      JSON.stringify({ error: 'Failed to create room' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  return new Response(
    JSON.stringify({ roomId: room.id, code, playerId }),
    { status: 200, headers: corsHeaders() }
  )
})
