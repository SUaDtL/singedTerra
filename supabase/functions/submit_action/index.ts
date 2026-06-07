import { withCors, json, getServiceClient, StoredPlayer } from '../_shared/mod.ts'

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
  tankId?: string
}

interface NetworkNextRoundAction {
  type: 'next_round'
}

type NetworkAction = NetworkFireAction | NetworkShieldAction | NetworkBuyAction | NetworkNextRoundAction

/** Only turn-ENDING actions advance the active-player cursor. A buy is neutral (a
 *  player may buy several times, then fire/shield to end the turn); next_round is
 *  neutral too (it leaves the between-rounds shop — the next round's opener is set
 *  by the round-ending blow, not by next_round). */
function endsTurn(type: string): boolean {
  return type === 'fire' || type === 'use_shield'
}

Deno.serve(withCors(async (body) => {
  const { roomId, playerId, actingPlayerId, nextActiveIndex, roundOver, action } = body as {
    roomId?: unknown
    playerId?: unknown
    // The seat index active AFTER this turn-ending action, computed by the
    // submitting client's authoritative engine (which skips eliminated tanks AND
    // re-seats the opener at a round boundary). Used to advance the referee cursor;
    // falls back to modulo if absent/invalid so old clients still work (P0-3).
    nextActiveIndex?: unknown
    // roundOver: this action ENDS a round (a fire/shield whose resolution pauses in the
    // ROUND_OVER shop) OR operates within that shop (buy / next_round). It (a) relaxes
    // the turn gate for shop actions — every player may shop their own tank, and any
    // may leave the shop — and (b) lets a round-ending blow re-seat the OPENER even when
    // the opener is the very seat that just fired (the modulo "can't keep your own turn"
    // guard would otherwise reject it). Advisory: the canonical state is the replayed
    // log, so a wrong flag only changes which row the referee accepts, never the game.
    roundOver?: unknown
    // actingPlayerId: the seat this action is FOR. Defaults to playerId (a human
    // acting for themselves). When it differs, the submitter is driving a CPU seat
    // on its behalf (any room member may; idempotency is the seq-unique + cursor
    // gate). Validated below.
    actingPlayerId?: unknown
    action?: { type?: unknown; angle?: unknown; power?: unknown; weapon?: unknown; tankId?: unknown }
  }

  // Validate roomId
  if (typeof roomId !== 'string' || roomId.trim().length === 0) {
    return json({ error: 'Invalid input: roomId' }, 400)
  }

  // Validate playerId
  if (typeof playerId !== 'string' || playerId.trim().length === 0) {
    return json({ error: 'Invalid input: playerId' }, 400)
  }

  // Validate action
  if (!action || typeof action !== 'object') {
    return json({ error: 'Invalid input: action' }, 400)
  }

  // Actions committed to the log: 'fire' (carries aim) / 'use_shield' (turn-ending),
  // 'buy' (turn-neutral store purchase), 'next_round' (leave the between-rounds shop).
  // Any other type is rejected.
  if (
    action.type !== 'fire' &&
    action.type !== 'use_shield' &&
    action.type !== 'buy' &&
    action.type !== 'next_round'
  ) {
    return json({ error: 'Invalid input: action.type must be "fire", "use_shield", "buy", or "next_round"' }, 400)
  }

  if (action.type === 'buy' && (typeof action.weapon !== 'string' || action.weapon.trim().length === 0)) {
    return json({ error: 'Invalid input: buy action requires a weapon' }, 400)
  }

  if (action.type === 'fire') {
    if (typeof action.angle !== 'number' || !isFinite(action.angle)) {
      return json({ error: 'Invalid input: action.angle must be a finite number' }, 400)
    }

    if (
      typeof action.power !== 'number' ||
      !isFinite(action.power) ||
      action.power < 0 ||
      action.power > 100
    ) {
      return json({ error: 'Invalid input: action.power must be a number in [0, 100]' }, 400)
    }

    if (typeof action.weapon !== 'string' || action.weapon.trim().length === 0) {
      return json({ error: 'Invalid input: action.weapon' }, 400)
    }
  }

  const supabase = getServiceClient()

  // Fetch room — must be 'active'
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .eq('status', 'active')
    .maybeSingle()

  if (fetchError) {
    console.error('submit_action: fetch error', fetchError)
    return json({ error: 'Failed to fetch room' }, 500)
  }

  if (!room) {
    return json({ error: 'Room not found or not active' }, 404)
  }

  // Validate player membership (the SUBMITTER must be in the room).
  const players = (room.players ?? []) as StoredPlayer[]
  const isMember = players.some(p => p.id === playerId)
  if (!isMember) {
    return json({ error: 'Player not in room' }, 403)
  }

  // The seat this action is FOR (defaults to the submitter — a human acting for
  // themselves). When it differs, the submitter is proxying a CPU seat.
  const actingId = typeof actingPlayerId === 'string' && actingPlayerId.trim().length > 0
    ? actingPlayerId
    : playerId

  const isRoundOver = roundOver === true
  const activeIndex = ((room.active_player_index ?? 0) % players.length + players.length) % players.length
  const activePlayer = players[activeIndex]

  // REFEREE GATING. Three regimes:
  //
  //  1. next_round — leaving the between-rounds shop. Turn-neutral, cursor-neutral,
  //     accepted from ANY room member (membership already checked). Idempotent: a
  //     duplicate replays as an engine no-op once combat has started.
  //
  //  2. ROUND_OVER buy — the between-rounds shop. Every player may buy, but ONLY for
  //     their OWN seat (no spending another player's carried credits). No turn gate.
  //
  //  3. Everything else (fire / use_shield / normal-turn buy) — TURN-ENFORCEMENT
  //     (Sprint 4 Slice 3.3, NON-OPTIONAL): the ACTING seat must be the active player.
  //     Self (actingId === playerId) is a human acting for their own seat; a proxy
  //     (actingId !== playerId) is a client DRIVING A CPU SEAT — allowed for any member
  //     but ONLY when the active seat is a bot, never to impersonate another human.
  //     Exactly-once is the seq-unique constraint + this cursor gate.
  if (action.type === 'next_round') {
    // no gate beyond membership
  } else if (action.type === 'buy' && isRoundOver) {
    const actingSeatIndex = players.findIndex((p) => p.id === actingId)
    if (actingSeatIndex < 0) {
      return json({ error: 'Acting seat not in room' }, 403)
    }
    if (actingId !== playerId && !players[actingSeatIndex].ai) {
      return json({ error: 'Cannot act for another human player' }, 403)
    }
    // Must name your OWN seat ('p{index+1}', matching the engine's positional ids).
    if (action.tankId !== `p${actingSeatIndex + 1}`) {
      return json({ error: 'Can only buy for your own tank in the between-rounds shop' }, 403)
    }
  } else {
    if (!activePlayer || activePlayer.id !== actingId) {
      return json({ error: 'Not your turn' }, 403)
    }
    if (actingId !== playerId && !activePlayer.ai) {
      return json({ error: 'Cannot act for another human player' }, 403)
    }
  }

  // Build the validated action committed to the log. A ROUND_OVER buy carries its
  // tankId so replay routes it to the named tank (the engine falls back to the active
  // opener if it is missing — which would silently desync per-tank shopping).
  const validatedAction: NetworkAction =
    action.type === 'use_shield'
      ? { type: 'use_shield' }
      : action.type === 'next_round'
        ? { type: 'next_round' }
        : action.type === 'buy'
          ? {
              type: 'buy',
              weapon: (action.weapon as string).trim(),
              ...(isRoundOver && typeof action.tankId === 'string' ? { tankId: action.tankId } : {}),
            }
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
    return json({ error: 'Failed to compute action sequence' }, 500)
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
      return json({ ok: false, error: 'seq_conflict', retry: true }, 409)
    }
    console.error('submit_action: insert error', insertError)
    return json({ error: 'Failed to insert action' }, 500)
  }

  // Step 3: Advance the active-player cursor — ONLY for turn-ending actions. A buy
  // is turn-neutral, so the same player keeps the turn (and the referee keeps
  // accepting their further buys / their eventual fire). The cursor now BACKS the
  // referee check above, so this is no longer "diagnostic only".
  if (endsTurn(validatedAction.type)) {
    // Prefer the client's death-aware next seat; fall back to raw modulo (correct
    // for 2P, and the only option for a client that didn't report one). The
    // reported index must be a valid seat and NOT the acting seat (you can't keep
    // your own turn) — otherwise the modulo fallback applies.
    const modulo = (room.active_player_index + 1) % players.length
    const reported = typeof nextActiveIndex === 'number' && Number.isInteger(nextActiveIndex)
      ? nextActiveIndex
      : -1
    // Normally the next seat must differ from the acting seat ("you can't keep your own
    // turn"). At a ROUND boundary the next round re-seats the OPENER, which may BE the
    // seat that just fired the round-ending blow — so when roundOver is set we honor the
    // reported opener unconditionally (still bounds-checked). Otherwise the cursor would
    // fall back to modulo and reject the opener's first shot of the new round forever.
    const reportedValid = isRoundOver
      ? reported >= 0 && reported < players.length
      : reported >= 0 && reported < players.length && reported !== activeIndex
    const newActivePlayerIndex = reportedValid ? reported : modulo
    const newTurn = (room.turn ?? 0) + 1

    // The cursor is the AUTHORITATIVE referee gate (it backs the "Not your turn"
    // check above), so it must be durably advanced before we ack the action — NOT
    // fire-and-forget. A dropped write, or an Edge Function instance torn down after
    // the response is flushed but before an un-awaited write lands, would freeze the
    // cursor and reject the next player's fire forever (the client does not retry a
    // "Not your turn" rejection). So we AWAIT the write, retry transient errors a
    // bounded number of times, and fail the request if it cannot be persisted.
    //
    // Failing here is safe and cannot double-insert the already-committed action:
    // the client only re-submits on a seq-conflict (see NetworkClient.submitAction),
    // and the action is applied from the Realtime echo of the log, not this response.
    let cursorError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase
        .from('rooms')
        .update({ active_player_index: newActivePlayerIndex, turn: newTurn })
        .eq('id', roomId)
      if (!error) {
        cursorError = null
        break
      }
      cursorError = error
    }
    if (cursorError) {
      console.error('submit_action: cursor update failed after retries', cursorError)
      return json({ ok: false, error: 'cursor_update_failed' }, 500)
    }
  }

  return json({ seq: nextSeq, ok: true }, 200)
}))
