import { withCors, json, getServiceClient, StoredPlayer, nextCursor, ACCESSORY_TYPES, verifySeatToken } from '../_shared/mod.ts'
import { endsTurn, validateActionShape, authorizeAction } from './validate.ts'

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
      // Info-level signal (obs-003): seq-conflicts are expected + self-healing (the
      // client retries), but with ZERO log a conflict flood (a misbehaving/looping
      // client) is invisible until it surfaces as user-reported stuck turns.
      console.log('submit_action: seq_conflict (client will retry)')
      return json({ ok: false, error: 'seq_conflict', retry: true }, 409)
    }
    // Log the message, not the full Supabase error object (which carries Postgres
    // internals) — secrets-001.
    console.error('submit_action: rpc error', error?.message ?? error)
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
  // Exactly one of weapon/accessory is set: a weapon bundle, or an SE-parity accessory
  // (e.g. 'battery'). Both optional + additive so weapon-only buy rows are unchanged.
  weapon?: string
  accessory?: string
  tankId?: string
}

interface NetworkNextRoundAction {
  type: 'next_round'
}

type NetworkAction = NetworkFireAction | NetworkShieldAction | NetworkBuyAction | NetworkNextRoundAction

// Guard Deno.serve so importing this module in tests does not start the HTTP
// listener.  When Deno executes the file as the program entry point,
// import.meta.main is true; when it is imported by a test file it is false.
if (import.meta.main) {
Deno.serve(withCors(async (body) => {
  const { roomId, playerId, token, actingPlayerId, nextActiveIndex, roundOver, action } = body as {
    roomId?: unknown
    playerId?: unknown
    token?: unknown
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
    action?: { type?: unknown; angle?: unknown; power?: unknown; weapon?: unknown; accessory?: unknown; tankId?: unknown }
  }

  // Pure shape validation — all 400 paths (no DB required)
  const shapeResult = validateActionShape({ roomId, playerId, action })
  if (!shapeResult.ok) {
    return json({ error: shapeResult.error }, shapeResult.status)
  }

  const supabase = getServiceClient()

  // Fetch room — must be 'active'
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('players, active_player_index, turn, status')
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

  if (!(await verifySeatToken(supabase, roomId as string, playerId as string, token))) {
    return json({ error: 'Invalid or missing seat token' }, 403)
  }

  // The seat this action is FOR (defaults to the submitter — a human acting for
  // themselves). When it differs, the submitter is proxying a CPU seat.
  const actingId = typeof actingPlayerId === 'string' && actingPlayerId.trim().length > 0
    ? actingPlayerId
    : playerId

  const isRoundOver = roundOver === true
  const activeIndex = ((room.active_player_index ?? 0) % players.length + players.length) % players.length

  // REFEREE GATING. Three regimes (see validate.ts authorizeAction for regime docs):
  //   1. next_round  — membership only (no turn gate)
  //   2. ROUND_OVER buy — per-seat shop, no turn gate
  //   3. fire / use_shield / normal-turn buy — turn-enforcement gate
  const authResult = authorizeAction({
    action: action as { type: 'fire' | 'use_shield' | 'buy' | 'next_round'; tankId?: unknown },
    players,
    playerId: playerId as string,
    actingId: actingId as string,
    isRoundOver,
    activeIndex,
  })
  if (!authResult.ok) {
    // Desync signal (ADR-0008): a 'Not your turn' rejection is the canonical
    // signature that the stored cursor (set from a prior submitter's reported
    // nextActiveIndex) disagrees with this caller's engine. The referee is
    // intentionally thin and cannot itself tell a benign race from a real desync,
    // but logging it with room context makes a mis-gated/stalled room diagnosable
    // from the server side (pairs with the client-side warn in NetworkClient).
    if (authResult.error === 'Not your turn') {
      console.warn('submit_action: turn-gate rejection (possible desync)', {
        roomId,
        storedActiveIndex: activeIndex,
        storedActiveSeat: players[activeIndex]?.id,
        actingId,
      })
    }
    return json({ error: authResult.error }, authResult.status)
  }

  // Build the validated action committed to the log. A ROUND_OVER buy carries its
  // tankId so replay routes it to the named tank (the engine falls back to the active
  // opener if it is missing — which would silently desync per-tank shopping).
  // action is guaranteed non-undefined here: validateActionShape already rejected
  // the request if action was absent or the wrong type.
  const a = action!
  const validatedAction: NetworkAction =
    a.type === 'use_shield'
      ? { type: 'use_shield' }
      : a.type === 'next_round'
        ? { type: 'next_round' }
        : a.type === 'buy'
          ? {
              type: 'buy',
              // Carry whichever of weapon/accessory the validated buy supplied (exactly one).
              ...(typeof a.weapon === 'string' && a.weapon.trim().length > 0 ? { weapon: a.weapon.trim() } : {}),
              ...(typeof a.accessory === 'string' && ACCESSORY_TYPES.has(a.accessory) ? { accessory: a.accessory } : {}),
              ...(isRoundOver && typeof a.tankId === 'string' ? { tankId: a.tankId } : {}),
            }
          : {
              type: 'fire',
              angle: a.angle as number,
              power: a.power as number,
              weapon: (a.weapon as string).trim(),
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
}, { rateLimit: 'submit_action' }))
} // end if (import.meta.main)
