import { withCors, json, getServiceClient, StoredPlayer, nextCursor } from '../_shared/mod.ts'

// ---------------------------------------------------------------------------
// rpcResultToResponse — pure mapper (exported for testing, T-08 AC4)
//
// Converts the raw { data, error } pair returned by supabase.rpc(
//   'submit_room_action', ...) into the canonical HTTP Response for this
// endpoint.  This is the testable seam: tests inject synthetic rpc results
// without touching the database or the full request-handling stack.
//
// Success:  data is the INT returned by the plpgsql function (the seq).
//           PostgREST may deliver it as a bare number or as an array whose
//           first element is the number — handle both defensively.
// 23505:    Postgres unique violation → 409 seq_conflict (same contract as
//           the old separate INSERT path).
// Any other error → 500 with a safe message (no internal detail exposed).
// ---------------------------------------------------------------------------
export interface RpcResult {
  // deno-lint-ignore no-explicit-any
  data: any
  // deno-lint-ignore no-explicit-any
  error: any
}

export function rpcResultToResponse(result: RpcResult): Response {
  const { data, error } = result

  if (error) {
    if (error.code === '23505') {
      return json({ ok: false, error: 'seq_conflict', retry: true }, 409)
    }
    console.error('submit_action: rpc error', error)
    return json({ ok: false, error: 'Failed to submit action' }, 500)
  }

  // PostgREST delivers a RETURNS INT scalar as either a bare number or a
  // single-element array.  Extract defensively.
  const seq: number = Array.isArray(data) ? data[0] : data
  return json({ seq, ok: true }, 200)
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

// Guard Deno.serve so importing this module in tests does not start the HTTP
// listener.  When Deno executes the file as the program entry point,
// import.meta.main is true; when it is imported by a test file it is false.
if (import.meta.main) {
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

  // Atomically allocate seq, insert the action, and (when turn-ending) advance
  // the active-player cursor — all inside a single Postgres transaction via the
  // submit_room_action plpgsql function (migration 004).
  //
  // The function uses FOR UPDATE on the rooms row to serialise concurrent submits
  // per room, so no two callers can compute the same seq.  The UNIQUE(room_id,seq)
  // constraint is retained as a final safety net.
  //
  // Compute next-cursor inputs.  For non-turn-ending actions p_ends_turn is false
  // and the index/turn arguments are ignored by the plpgsql function; passing the
  // current values is harmless but 0 would be equally correct.
  const isTurnEnding = endsTurn(validatedAction.type)
  const { index: p_next_index, turn: p_next_turn } = isTurnEnding
    ? nextCursor({
        activeIndex,
        playersLength: players.length,
        reported: typeof nextActiveIndex === 'number' ? nextActiveIndex : null,
        isRoundOver,
        currentTurn: room.turn ?? 0,
      })
    : { index: room.active_player_index ?? 0, turn: room.turn ?? 0 }

  const rpcResult = await supabase.rpc('submit_room_action', {
    p_room_id: roomId,
    p_player_id: actingId,
    p_action: validatedAction,
    p_ends_turn: isTurnEnding,
    p_next_index,
    p_next_turn,
  })

  return rpcResultToResponse(rpcResult)
}))
} // end if (import.meta.main)
