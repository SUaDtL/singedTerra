// submit_action/validate.ts
//
// Pure, DB-free validation and authorization seam for submit_action.
// No IO, no Supabase client — all decisions are over already-fetched data.
// Exported so T2 tests can drive every 400/403 path without a live handler.
//
// Three exports:
//   endsTurn(type)           — true for 'fire' | 'use_shield'
//   validateActionShape(body) — pure 400-or-ok decision over the raw request body
//   authorizeAction(args)     — pure 403-or-ok decision over already-fetched room data

import type { StoredPlayer } from '../_shared/mod.ts'

// ---------------------------------------------------------------------------
// Re-declare NetworkAction locally (supabase/functions/ must NOT import from
// shared/ or client/ — this duplication is intentional per coding-standards.md).
// ---------------------------------------------------------------------------

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

export type NetworkAction =
  | NetworkFireAction
  | NetworkShieldAction
  | NetworkBuyAction
  | NetworkNextRoundAction

// ---------------------------------------------------------------------------
// endsTurn
// ---------------------------------------------------------------------------

/** Only turn-ENDING actions advance the active-player cursor. A buy is neutral
 *  (a player may buy several times, then fire/shield to end the turn);
 *  next_round is neutral too (it leaves the between-rounds shop — the next
 *  round's opener is set by the round-ending blow, not by next_round). */
export function endsTurn(type: string): boolean {
  return type === 'fire' || type === 'use_shield'
}

// ---------------------------------------------------------------------------
// validateActionShape — pure 400 gate
// ---------------------------------------------------------------------------

/** Discriminated return type for validate / authorize results. */
export type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

/**
 * Validate the raw parsed-JSON request body for shape correctness.
 * Returns `{ ok: true }` when everything is valid, or
 * `{ ok: false, status, error }` with the EXACT error string the live
 * handler would return (preserving byte-identical 400 responses).
 *
 * This function is PURE — no IO, no DB, no side-effects.
 */
export function validateActionShape(body: {
  roomId?: unknown
  playerId?: unknown
  action?: { type?: unknown; angle?: unknown; power?: unknown; weapon?: unknown; tankId?: unknown }
}): ValidationResult {
  const { roomId, playerId, action } = body

  // Validate roomId
  if (typeof roomId !== 'string' || roomId.trim().length === 0) {
    return { ok: false, status: 400, error: 'Invalid input: roomId' }
  }

  // Validate playerId
  if (typeof playerId !== 'string' || playerId.trim().length === 0) {
    return { ok: false, status: 400, error: 'Invalid input: playerId' }
  }

  // Validate action is present and is an object
  if (!action || typeof action !== 'object') {
    return { ok: false, status: 400, error: 'Invalid input: action' }
  }

  // Validate action.type
  if (
    action.type !== 'fire' &&
    action.type !== 'use_shield' &&
    action.type !== 'buy' &&
    action.type !== 'next_round'
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid input: action.type must be "fire", "use_shield", "buy", or "next_round"',
    }
  }

  // buy requires a non-empty weapon
  if (action.type === 'buy' && (typeof action.weapon !== 'string' || action.weapon.trim().length === 0)) {
    return { ok: false, status: 400, error: 'Invalid input: buy action requires a weapon' }
  }

  // fire requires finite angle, power in [0,100], non-empty weapon
  if (action.type === 'fire') {
    if (typeof action.angle !== 'number' || !isFinite(action.angle)) {
      return { ok: false, status: 400, error: 'Invalid input: action.angle must be a finite number' }
    }

    if (
      typeof action.power !== 'number' ||
      !isFinite(action.power) ||
      action.power < 0 ||
      action.power > 100
    ) {
      return { ok: false, status: 400, error: 'Invalid input: action.power must be a number in [0, 100]' }
    }

    if (typeof action.weapon !== 'string' || action.weapon.trim().length === 0) {
      return { ok: false, status: 400, error: 'Invalid input: action.weapon' }
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// authorizeAction — pure 403 gate
// ---------------------------------------------------------------------------

export interface AuthorizeActionArgs {
  /** The action that has already passed validateActionShape. */
  action: {
    type: 'fire' | 'use_shield' | 'buy' | 'next_round'
    tankId?: unknown
  }
  /** All players in the room (already fetched). */
  players: StoredPlayer[]
  /** The player whose `id` was submitted in the request (the submitter). */
  playerId: string
  /** The seat this action is FOR. Equals `playerId` unless the submitter is
   *  proxying a CPU seat (actingPlayerId in the request body). */
  actingId: string
  /** True when the request carried `roundOver: true`. */
  isRoundOver: boolean
  /** The already-resolved active-player index (modulo-normalised by the caller). */
  activeIndex: number
}

/**
 * Decide whether the action is authorized given the already-fetched room state.
 * Returns `{ ok: true }` when authorized, or
 * `{ ok: false, status: 403, error }` with the EXACT error string the live
 * handler would return.
 *
 * This function is PURE — no IO, no DB, no side-effects.
 * Membership check (isMember) is the caller's responsibility — it is separate
 * from the three gating regimes enforced here.
 */
export function authorizeAction(args: AuthorizeActionArgs): ValidationResult {
  const { action, players, playerId, actingId, isRoundOver, activeIndex } = args
  const activePlayer = players[activeIndex]

  // Regime 1: next_round — no gate beyond membership (already checked by caller)
  if (action.type === 'next_round') {
    return { ok: true }
  }

  // Regime 2: ROUND_OVER buy — per-seat shop; no turn gate
  if (action.type === 'buy' && isRoundOver) {
    const actingSeatIndex = players.findIndex((p) => p.id === actingId)
    if (actingSeatIndex < 0) {
      return { ok: false, status: 403, error: 'Acting seat not in room' }
    }
    if (actingId !== playerId && !players[actingSeatIndex].ai) {
      return { ok: false, status: 403, error: 'Cannot act for another human player' }
    }
    // Must name your OWN seat ('p{index+1}', matching the engine's positional ids).
    if (action.tankId !== `p${actingSeatIndex + 1}`) {
      return { ok: false, status: 403, error: 'Can only buy for your own tank in the between-rounds shop' }
    }
    return { ok: true }
  }

  // Regime 3: fire / use_shield / normal-turn buy — turn-enforcement gate
  if (!activePlayer || activePlayer.id !== actingId) {
    return { ok: false, status: 403, error: 'Not your turn' }
  }
  if (actingId !== playerId && !activePlayer.ai) {
    return { ok: false, status: 403, error: 'Cannot act for another human player' }
  }

  return { ok: true }
}
