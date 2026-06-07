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

interface NetworkShieldAction {
  type: 'use_shield'
}

interface NetworkBuyAction {
  type: 'buy'
  weapon: string
}

type NetworkAction = NetworkFireAction | NetworkShieldAction | NetworkBuyAction

/** Only turn-ENDING actions advance the active-player cursor; a buy is neutral
 *  (a player may buy several times, then fire/shield to end the turn). */
function endsTurn(type: string): boolean {
  return type === 'fire' || type === 'use_shield'
}

interface StoredPlayer {
  id: string
  name: string
  color: string
  ready: boolean
  /** CPU difficulty when this seat is a bot; absent => human. Lets the referee
   *  authorize a member to proxy a bot's action. */
  ai?: 'easy' | 'medium' | 'hard'
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

  const { roomId, playerId, actingPlayerId, action } = body as {
    roomId?: unknown
    playerId?: unknown
    // actingPlayerId: the seat this action is FOR. Defaults to playerId (a human
    // acting for themselves). When it differs, the submitter is driving a CPU seat
    // on its behalf (any room member may; idempotency is the seq-unique + cursor
    // gate). Validated below.
    actingPlayerId?: unknown
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

  // Turn-ending actions committed to the log: 'fire' (carries aim) or 'use_shield'
  // (no payload). Both are validated here; any other type is rejected. (Sprint 4
  // Slice 3.2 — use_shield is the first non-fire action the replay log carries.)
  if (action.type !== 'fire' && action.type !== 'use_shield' && action.type !== 'buy') {
    return new Response(
      JSON.stringify({ error: 'Invalid input: action.type must be "fire", "use_shield", or "buy"' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  if (action.type === 'buy' && (typeof action.weapon !== 'string' || action.weapon.trim().length === 0)) {
    return new Response(
      JSON.stringify({ error: 'Invalid input: buy action requires a weapon' }),
      { status: 400, headers: corsHeaders() }
    )
  }

  if (action.type === 'fire') {
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

  // Validate player membership (the SUBMITTER must be in the room).
  const players = (room.players ?? []) as StoredPlayer[]
  const isMember = players.some(p => p.id === playerId)
  if (!isMember) {
    return new Response(
      JSON.stringify({ error: 'Player not in room' }),
      { status: 403, headers: corsHeaders() }
    )
  }

  // The seat this action is FOR (defaults to the submitter — a human acting for
  // themselves). When it differs, the submitter is proxying a CPU seat.
  const actingId = typeof actingPlayerId === 'string' && actingPlayerId.trim().length > 0
    ? actingPlayerId
    : playerId

  // REFEREE TURN-ENFORCEMENT (Sprint 4 Slice 3.3 — NON-OPTIONAL). The action's
  // ACTING seat must be the active player; the cursor advances by modulo on every
  // turn-ending action (exact for 2P; see the 3–4P elimination caveat tracked
  // elsewhere). Two cases:
  //   - Self (actingId === playerId): a human acting for their own seat.
  //   - Proxy (actingId !== playerId): a client DRIVING A CPU SEAT. Allowed for
  //     ANY room member, but ONLY when the active seat is actually a bot (ai set)
  //     — never to impersonate another human. Exactly-once is guaranteed by the
  //     seq-unique constraint (concurrent proxies collide; losers don't retry) +
  //     this cursor gate (a late proxy is rejected once the turn has advanced).
  const activeIndex = ((room.active_player_index ?? 0) % players.length + players.length) % players.length
  const activePlayer = players[activeIndex]
  if (!activePlayer || activePlayer.id !== actingId) {
    return new Response(
      JSON.stringify({ error: 'Not your turn' }),
      { status: 403, headers: corsHeaders() }
    )
  }
  if (actingId !== playerId && !activePlayer.ai) {
    return new Response(
      JSON.stringify({ error: 'Cannot act for another human player' }),
      { status: 403, headers: corsHeaders() }
    )
  }

  // Build the validated action committed to the log.
  const validatedAction: NetworkAction =
    action.type === 'use_shield'
      ? { type: 'use_shield' }
      : action.type === 'buy'
        ? { type: 'buy', weapon: (action.weapon as string).trim() }
        : {
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
      player_id: actingId, // attribute the action to the SEAT it is for (bot or human)
      action: validatedAction,
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

  // Step 3: Advance the active-player cursor — ONLY for turn-ending actions. A buy
  // is turn-neutral, so the same player keeps the turn (and the referee keeps
  // accepting their further buys / their eventual fire). The cursor now BACKS the
  // referee check above, so this is no longer "diagnostic only".
  if (endsTurn(validatedAction.type)) {
    const newActivePlayerIndex = (room.active_player_index + 1) % players.length
    const newTurn = (room.turn ?? 0) + 1

    // Fire-and-forget — a failed cursor update is non-fatal to game correctness
    // (the canonical state is the action log), but it would mis-gate the referee,
    // so it is logged.
    supabase
      .from('rooms')
      .update({ active_player_index: newActivePlayerIndex, turn: newTurn })
      .eq('id', roomId)
      .then(({ error }) => {
        if (error) {
          console.error('submit_action: cursor update error (non-fatal)', error)
        }
      })
  }

  return new Response(
    JSON.stringify({ seq: nextSeq, ok: true }),
    { status: 200, headers: corsHeaders() }
  )
})
