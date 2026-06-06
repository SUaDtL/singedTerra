import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const { roomId, playerId } = body as {
    roomId?: unknown
    playerId?: unknown
  }

  // Validate roomId (UUID format)
  if (typeof roomId !== 'string' || !UUID_REGEX.test(roomId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: roomId must be a UUID' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  // Validate playerId
  if (typeof playerId !== 'string' || playerId.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: playerId' }),
      { status: 400, headers: corsHeaders() }
    )
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

  // Fetch room — must be in 'waiting' status
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .eq('status', 'waiting')
    .maybeSingle()

  if (fetchError) {
    console.error('ready_up: fetch error', fetchError)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch room' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  if (!room) {
    return new Response(
      JSON.stringify({ error: 'Room not found or already started' }),
      { status: 404, headers: corsHeaders() }
    )
  }

  const existingPlayers = (room.players ?? []) as StoredPlayer[]

  // Locate the player in the room
  const playerIndex = existingPlayers.findIndex(p => p.id === playerId)
  if (playerIndex === -1) {
    return new Response(
      JSON.stringify({ error: 'Player not in room' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  // Mark player ready
  const updatedPlayers: StoredPlayer[] = existingPlayers.map(p =>
    p.id === playerId ? { ...p, ready: true } : p
  )

  // Determine if game should start
  const allReady = updatedPlayers.every(p => p.ready)
  const enoughPlayers = updatedPlayers.length >= 2
  const shouldStart = allReady && enoughPlayers

  // Build update payload
  const updatePayload: Record<string, unknown> = { players: updatedPlayers }
  if (shouldStart) {
    updatePayload.status = 'active'
  }

  const { error: updateError } = await supabase
    .from('rooms')
    .update(updatePayload)
    .eq('id', roomId)

  if (updateError) {
    console.error('ready_up: update error', updateError)
    return new Response(
      JSON.stringify({ error: 'Failed to update room' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  return new Response(
    JSON.stringify({ started: shouldStart, players: updatedPlayers }),
    { status: 200, headers: corsHeaders() }
  )
})
