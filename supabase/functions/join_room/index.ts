import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

interface StoredOptions {
  maxPlayers: number
  maxWind: number
  gravity: number
}

interface StoredPlayer {
  id: string
  name: string
  color: string
  ready: boolean
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

  const { code, playerName, color } = body as {
    code?: unknown
    playerName?: unknown
    color?: unknown
  }

  // Validate code
  if (typeof code !== 'string' || code.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: code' }),
      { status: 400, headers: corsHeaders() }
    )
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

  const normalizedCode = code.trim().toUpperCase()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration: missing env vars' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Fetch room by code, must be in 'waiting' status
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', normalizedCode)
    .eq('status', 'waiting')
    .maybeSingle()

  if (fetchError) {
    console.error('join_room: fetch error', fetchError)
    return new Response(
      JSON.stringify({ error: 'Failed to look up room' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  if (!room) {
    return new Response(
      JSON.stringify({ error: 'Room not found or already started' }),
      { status: 404, headers: corsHeaders() }
    )
  }

  const roomOptions = room.options as StoredOptions
  const existingPlayers = (room.players ?? []) as StoredPlayer[]

  // Check capacity
  if (existingPlayers.length >= roomOptions.maxPlayers) {
    return new Response(
      JSON.stringify({ error: 'Room is full' }),
      { status: 409, headers: corsHeaders() }
    )
  }

  // Check for color conflict
  const colorTaken = existingPlayers.some((p: StoredPlayer) => p.color === color.trim())
  if (colorTaken) {
    return new Response(
      JSON.stringify({ error: 'That color is already taken. Choose a different color.' }),
      { status: 409, headers: corsHeaders() }
    )
  }

  // Check for name conflict (trimmed + case-insensitive)
  const nameTaken = existingPlayers.some(
    (p: StoredPlayer) => p.name.trim().toLowerCase() === playerName.trim().toLowerCase()
  )
  if (nameTaken) {
    return new Response(
      JSON.stringify({ error: 'That name is already taken. Choose a different name.' }),
      { status: 409, headers: corsHeaders() }
    )
  }

  // Generate playerId
  const playerId = crypto.randomUUID()

  const newPlayer: StoredPlayer = {
    id: playerId,
    name: playerName.trim(),
    color: color.trim(),
    ready: false,
  }

  const updatedPlayers = [...existingPlayers, newPlayer]

  // Update room with new player
  const { error: updateError } = await supabase
    .from('rooms')
    .update({ players: updatedPlayers })
    .eq('id', room.id)

  if (updateError) {
    console.error('join_room: update error', updateError)
    return new Response(
      JSON.stringify({ error: 'Failed to join room' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  return new Response(
    JSON.stringify({
      roomId: room.id,
      playerId,
      seed: room.seed,
      options: roomOptions,
      players: updatedPlayers,
    }),
    { status: 200, headers: corsHeaders() }
  )
})
