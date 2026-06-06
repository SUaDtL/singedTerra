import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

interface NetworkFireAction {
  type: 'fire'
  angle: number
  power: number
  weapon: string
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

  const { roomId, playerId, action } = body as {
    roomId?: unknown
    playerId?: unknown
    action?: { type?: unknown; angle?: unknown; power?: unknown; weapon?: unknown }
  }

  // Validate roomId
  if (typeof roomId !== 'string' || roomId.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: roomId' }),
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

  // Validate action
  if (!action || typeof action !== 'object') {
    return new Response(
      JSON.stringify({ error: 'Invalid input: action' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  if (action.type !== 'fire') {
    return new Response(
      JSON.stringify({ error: 'Invalid input: action.type must be "fire"' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  if (typeof action.angle !== 'number' || !isFinite(action.angle)) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: action.angle must be a finite number' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  if (
    typeof action.power !== 'number' ||
    !isFinite(action.power) ||
    action.power < 0 ||
    action.power > 100
  ) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: action.power must be a number in [0, 100]' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  if (typeof action.weapon !== 'string' || action.weapon.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: action.weapon' }),
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

  // Fetch room — must be 'active'
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .eq('status', 'active')
    .maybeSingle()

  if (fetchError) {
    console.error('submit_action: fetch error', fetchError)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch room' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  if (!room) {
    return new Response(
      JSON.stringify({ error: 'Room not found or not active' }),
      { status: 404, headers: corsHeaders() }
    )
  }

  // Validate player membership
  const players = (room.players ?? []) as StoredPlayer[]
  const isMember = players.some(p => p.id === playerId)
  if (!isMember) {
    return new Response(
      JSON.stringify({ error: 'Player not in room' }),
      { status: 403, headers: corsHeaders() }
    )
  }

  // Build the validated fire action
  const fireAction: NetworkFireAction = {
    type: 'fire',
    angle: action.angle as number,
    power: action.power as number,
    weapon: (action.weapon as string).trim(),
  }

  // Atomically compute next seq and insert action using a Postgres function call.
  // The subquery inside VALUES computes MAX(seq)+1 at insert time, and the
  // UNIQUE(room_id, seq) constraint acts as the final race guard.
  //
  // We use supabase.rpc() with a raw SQL approach via the REST API.
  // Since Deno Edge Functions can use the service role, we call the PostgREST
  // /rpc endpoint is not available for raw SQL. Instead we:
  //   1. Read current max seq
  //   2. Attempt insert with that seq
  //   3. Catch UNIQUE violation and return 409 for client retry
  //
  // The UNIQUE constraint on (room_id, seq) is the authoritative race guard.

  // Step 1: Get next seq
  const { data: seqData, error: seqError } = await supabase
    .from('room_actions')
    .select('seq')
    .eq('room_id', roomId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (seqError) {
    console.error('submit_action: seq fetch error', seqError)
    return new Response(
      JSON.stringify({ error: 'Failed to compute action sequence' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  const nextSeq = seqData === null ? 0 : (seqData.seq as number) + 1

  // Step 2: Insert the action row. UNIQUE constraint guards against concurrent seq collision.
  const { error: insertError } = await supabase
    .from('room_actions')
    .insert({
      room_id: roomId,
      seq: nextSeq,
      player_id: playerId,
      action: fireAction,
    })

  if (insertError) {
    // Postgres unique violation code: 23505
    if (insertError.code === '23505') {
      return new Response(
        JSON.stringify({ ok: false, error: 'seq_conflict', retry: true }),
        { status: 409, headers: corsHeaders() }
      )
    }
    console.error('submit_action: insert error', insertError)
    return new Response(
      JSON.stringify({ error: 'Failed to insert action' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  // Step 3: Advance advisory cursor (diagnostic only — not used for turn enforcement)
  const newActivePlayerIndex = (room.active_player_index + 1) % players.length
  const newTurn = (room.turn ?? 0) + 1

  // Fire-and-forget advisory update — failure here does not affect game correctness
  supabase
    .from('rooms')
    .update({ active_player_index: newActivePlayerIndex, turn: newTurn })
    .eq('id', roomId)
    .then(({ error }) => {
      if (error) {
        console.error('submit_action: advisory cursor update error (non-fatal)', error)
      }
    })

  return new Response(
    JSON.stringify({ seq: nextSeq, ok: true }),
    { status: 200, headers: corsHeaders() }
  )
})
