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
  // Exactly one of weapon/accessory is set: a weapon bundle, or an SE-parity accessory
  // (e.g. 'battery'). Both optional + additive so weapon-only buy rows are unchanged.
  weapon?: string
  accessory?: string
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
// Known-weapon allowlist
//
// MUST match the `WeaponType` union / `WEAPONS` keys in
// shared/src/engine/WeaponSystem.ts. Re-declared here because the Deno referee
// must not import shared/ (ADR-0005) — accepted duplication like NetworkAction.
//
// Why the referee validates this: a fire/buy weapon string is committed verbatim
// to the permanent action log. If an UNKNOWN weapon string were accepted, every
// client replaying that row would hit `getWeapon(unknown)` and crash on the
// undefined definition — a permanent, unrecoverable room brick for all clients
// (malicious member, or a version-skew where a newer weapon is replayed against
// an older client). Rejecting unknown weapons at the boundary keeps a bad string
// out of the canonical log entirely.
// ---------------------------------------------------------------------------

export const WEAPON_TYPES: ReadonlySet<string> = new Set([
  'baby_missile',
  'missile',
  'heavy_missile',
  'baby_nuke',
  'nuke',
  'dirt_bomb',
  'bouncing_betty',
  'funky_bomb',
  'napalm',
  'cluster_bomb',
  'mirv',
  'deaths_head',
  'riot_bomb',
  'hot_napalm',
  'shield',
])

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
  action?: { type?: unknown; angle?: unknown; power?: unknown; weapon?: unknown; accessory?: unknown; tankId?: unknown }
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

  // buy requires EXACTLY ONE of a non-empty weapon OR a recognized accessory (SE-parity battery).
  if (action.type === 'buy') {
    const hasWeapon = typeof action.weapon === 'string' && action.weapon.trim().length > 0
    const hasAccessory = action.accessory === 'battery'
    if (!hasWeapon && !hasAccessory) {
      return { ok: false, status: 400, error: 'Invalid input: buy action requires a weapon or accessory' }
    }
    // Reject a buy that sets BOTH — applyBuy resolves the accessory first and would silently
    // drop the paid-for weapon. Enforce the "exactly one" invariant the contract comments assert.
    if (hasWeapon && hasAccessory) {
      return { ok: false, status: 400, error: 'Invalid input: buy action must set exactly one of weapon/accessory' }
    }
    // A weapon buy must name a KNOWN weapon (see WEAPON_TYPES) so an unknown string
    // never reaches the log / applyBuy.
    if (hasWeapon && !WEAPON_TYPES.has((action.weapon as string).trim())) {
      return { ok: false, status: 400, error: 'Invalid input: buy action weapon is not a known weapon' }
    }
  }

  // fire requires a finite angle, a finite non-negative power (NO upper bound — see the note
  // in the power check below), and a non-empty weapon
  if (action.type === 'fire') {
    if (typeof action.angle !== 'number' || !isFinite(action.angle)) {
      return { ok: false, status: 400, error: 'Invalid input: action.angle must be a finite number' }
    }

    // NO fixed upper bound. A bought Battery raises a tank's powerCap above 100 (SE-parity),
    // so a legitimate fire may carry power > 100. The referee runs NO physics and has no
    // powerCap knowledge; the canonical state is the replayed log, and every client's engine
    // clamps set_power to that tank's powerCap on replay (trust-client, CONTEXT CONFIRM-01).
    // So the referee only sanity-checks a finite, non-negative number — an over-large value
    // is harmless (the engine clamps it identically on every client). A hard 100 ceiling here
    // would reject battery shots over the network while hot-seat accepts them (a context drift).
    if (
      typeof action.power !== 'number' ||
      !isFinite(action.power) ||
      action.power < 0
    ) {
      return { ok: false, status: 400, error: 'Invalid input: action.power must be a finite number >= 0' }
    }

    if (typeof action.weapon !== 'string' || action.weapon.trim().length === 0) {
      return { ok: false, status: 400, error: 'Invalid input: action.weapon' }
    }
    // Must be a KNOWN weapon (see WEAPON_TYPES) — an unknown weapon string would be
    // committed to the log and crash getWeapon() on replay for every client.
    if (!WEAPON_TYPES.has(action.weapon.trim())) {
      return { ok: false, status: 400, error: 'Invalid input: action.weapon is not a known weapon' }
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
