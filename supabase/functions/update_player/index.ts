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

  const { roomId, playerId, name, color } = body as {
    roomId?: unknown
    playerId?: unknown
    name?: unknown
    color?: unknown
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

  // At least one of name/color must be present
  if (name === undefined && color === undefined) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: at least one of name or color is required' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  // Validate name if present
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: name' }),
        { status: 400, headers: corsHeaders() }
      )
    }
    if (name.trim().length > 20) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: name too long (max 20)' }),
        { status: 400, headers: corsHeaders() }
      )
    }
  }

  // Validate color if present
  if (color !== undefined) {
    if (typeof color !== 'string' || color.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: color' }),
        { status: 400, headers: corsHeaders() }
      )
    }
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
    console.error('update_player: fetch error', fetchError)
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

  // Conflict checks against OTHER players
  if (name !== undefined) {
    const nameTaken = existingPlayers.some(
      p => p.id !== playerId && p.name.trim().toLowerCase() === (name as string).trim().toLowerCase()
    )
    if (nameTaken) {
      return new Response(
        JSON.stringify({ error: 'That name is already taken. Choose a different name.' }),
        { status: 409, headers: corsHeaders() }
      )
    }
  }

  if (color !== undefined) {
    const colorTaken = existingPlayers.some(
      p => p.id !== playerId && p.color === (color as string)
    )
    if (colorTaken) {
      return new Response(
        JSON.stringify({ error: 'That color is already taken. Choose a different color.' }),
        { status: 409, headers: corsHeaders() }
      )
    }
  }

  // Apply the provided field(s), leave ready as-is
  const updatedPlayers: StoredPlayer[] = existingPlayers.map(p => {
    if (p.id !== playerId) return p
    const next = { ...p }
    if (name !== undefined) next.name = (name as string).trim()
    if (color !== undefined) next.color = color as string
    return next
  })

  const { error: updateError } = await supabase
    .from('rooms')
    .update({ players: updatedPlayers })
    .eq('id', roomId)

  if (updateError) {
    console.error('update_player: update error', updateError)
    return new Response(
      JSON.stringify({ error: 'Failed to update player' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  return new Response(
    JSON.stringify({ players: updatedPlayers }),
    { status: 200, headers: corsHeaders() }
  )
})
