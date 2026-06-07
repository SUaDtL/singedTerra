import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders() })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders() })
  }

  const { roomId, winnerId, playerId } = body as {
    roomId?: unknown
    winnerId?: unknown
    // The caller's Supabase id — required so only a ROOM MEMBER can finish the
    // room (previously any client could POST an arbitrary winner). P2-9.
    playerId?: unknown
  }

  if (typeof roomId !== 'string' || roomId.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Invalid input: roomId' }), { status: 400, headers: corsHeaders() })
  }
  if (typeof playerId !== 'string' || playerId.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Invalid input: playerId' }), { status: 400, headers: corsHeaders() })
  }
  // winnerId is the engine tank id of the victor ('p1'..'pN'), or null for no
  // winner. Anything else is rejected — never store a client-supplied free string.
  if (winnerId !== null && (typeof winnerId !== 'string' || !/^p[1-9]\d*$/.test(winnerId))) {
    return new Response(JSON.stringify({ error: 'Invalid input: winnerId' }), { status: 400, headers: corsHeaders() })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500, headers: corsHeaders() })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Fetch the active room to authorize the caller and bound-check the winner.
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('players')
    .eq('id', roomId.trim())
    .eq('status', 'active')
    .maybeSingle()

  if (fetchError) {
    console.error('finish_game: fetch error', fetchError)
    return new Response(JSON.stringify({ error: 'Failed to fetch room' }), { status: 500, headers: corsHeaders() })
  }
  if (!room) {
    return new Response(JSON.stringify({ error: 'Room not found or not active' }), { status: 404, headers: corsHeaders() })
  }

  const players = (room.players ?? []) as Array<{ id: string }>
  // Authorization: the caller must be a member of the room.
  if (!players.some((p) => p.id === playerId)) {
    return new Response(JSON.stringify({ error: 'Player not in room' }), { status: 403, headers: corsHeaders() })
  }
  // Roster bound-check: winner 'pN' must map to a real seat (1..players.length).
  if (winnerId !== null) {
    const seat = Number(winnerId.slice(1))
    if (!(seat >= 1 && seat <= players.length)) {
      return new Response(JSON.stringify({ error: 'winnerId is not a seat in this room' }), { status: 400, headers: corsHeaders() })
    }
  }

  const { error } = await supabase
    .from('rooms')
    .update({ status: 'finished', winner: winnerId })
    .eq('id', roomId.trim())
    .eq('status', 'active')

  if (error) {
    console.error('finish_game: update error', error)
    return new Response(JSON.stringify({ error: 'Failed to finish game' }), { status: 500, headers: corsHeaders() })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders() })
})
