// Shared building blocks for every singedTerra Edge Function (P3-14).
//
// Directories under supabase/functions/ that start with "_" are NOT deployed as
// their own function; they are bundled into any function that imports them via a
// relative path (../_shared/mod.ts). This is the only sanctioned place for
// CORS policy, the request preamble, the service client, the room row-shapes,
// and the lazy-GC reaper — change one here and all 10 functions pick it up.
//
// NOTE: this is Deno code. It MUST NOT import from client/ or shared/ (those are
// browser/Node TypeScript with their own toolchains). The Edge Functions are thin
// referees, not the physics engine — see CLAUDE.md "Layering / dependency direction".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// CORS + request preamble
// ---------------------------------------------------------------------------

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

/** JSON response with the standard CORS headers attached. */
export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders() })
}

type Handler = (body: unknown, req: Request) => Response | Promise<Response>

interface WithCorsOpts {
  /** When true, a missing/invalid JSON body yields `undefined` instead of a 400
   *  (list_rooms takes no body). Default false: parse failure => 400. */
  optionalBody?: boolean
}

/**
 * Wrap a POST handler with the boilerplate every function shares:
 *   - OPTIONS preflight => 200 "ok"
 *   - non-POST          => 405 "Method not allowed"
 *   - JSON body parse   => 400 "Invalid JSON body" (unless optionalBody)
 *   - MissingEnvError   => 500 "Server misconfiguration: missing env vars"
 *
 * The handler receives the already-parsed body and the raw Request. Any error
 * other than MissingEnvError propagates unchanged (same as before this refactor).
 */
export function withCors(handler: Handler, opts: WithCorsOpts = {}): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders() })
    }
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    let body: unknown = undefined
    try {
      body = await req.json()
    } catch {
      if (!opts.optionalBody) return json({ error: 'Invalid JSON body' }, 400)
    }

    try {
      return await handler(body, req)
    } catch (e) {
      if (e instanceof MissingEnvError) {
        return json({ error: 'Server misconfiguration: missing env vars' }, 500)
      }
      throw e
    }
  }
}

// ---------------------------------------------------------------------------
// Service client
// ---------------------------------------------------------------------------

/** Thrown by getServiceClient() when the runtime env is missing the service role
 *  credentials. withCors() converts it into the canonical 500 response so every
 *  function reports the misconfiguration identically. */
export class MissingEnvError extends Error {
  constructor() {
    super('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
    this.name = 'MissingEnvError'
  }
}

// deno-lint-ignore no-explicit-any
export type ServiceClient = any

/** Create a service-role Supabase client from the runtime env. Throws
 *  MissingEnvError (caught by withCors) when either var is absent. */
export function getServiceClient(): ServiceClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new MissingEnvError()
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

// ---------------------------------------------------------------------------
// Canonical row shapes
// ---------------------------------------------------------------------------

export interface StoredPlayer {
  id: string
  name: string
  color: string
  ready: boolean
  /** Wall-clock ms of the player's last heartbeat; absent on legacy rows. */
  lastSeen?: number
  /** CPU difficulty when this seat is a bot; absent => human. Lets the referee
   *  authorize a member to proxy a bot's action. */
  ai?: 'easy' | 'medium' | 'hard'
}

export interface StoredOptions {
  maxPlayers: number
  maxWind: number
  gravity: number
  visibility?: 'public' | 'private'
  /** Best-of-N match length (odd, 1..9). Absent on pre-feature rooms => single
   *  round. Stored on the room row so EVERY client builds its engine with the same
   *  value — required for deterministic lockstep across round boundaries. */
  rounds?: number
}

export interface RoomRow {
  id: string
  code: string
  options: StoredOptions
  players: StoredPlayer[]
  created_at: string
}

// ---------------------------------------------------------------------------
// Shared validation + generation primitives
// ---------------------------------------------------------------------------

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 4-char A–Z0–9 room code from CSPRNG bytes (mod 36). */
export function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => chars[b % 36]).join('')
}

// ---------------------------------------------------------------------------
// nextCursor — pure seat-decision for submit_action (extracted for testability)
// ---------------------------------------------------------------------------

export interface NextCursorOpts {
  /** Index of the seat that just acted. */
  activeIndex: number
  /** Total number of seats in the room. */
  playersLength: number
  /**
   * Client-reported next-seat index (may be null/undefined if the client did
   * not send one, or -1 if it was pre-normalised to the sentinel).  A value
   * outside [0, playersLength) is treated as absent.
   */
  reported: number | null | undefined
  /**
   * True when this action ends a round (relaxes the "can't keep your own turn"
   * guard so the new-round opener may be the seat that just fired the blow).
   */
  isRoundOver: boolean
  /** Current value of `room.turn` (treated as 0 when null/undefined). */
  currentTurn: number
}

export interface NextCursorResult {
  /** The seat index that should become active next. */
  index: number
  /** The new turn counter (currentTurn + 1). */
  turn: number
}

/**
 * Decide the next active-seat index and advance the turn counter by one.
 *
 * This is the pure-function extraction of the inline block that previously
 * lived in submit_action/index.ts (lines ~261-274).  Behaviour is identical:
 *
 *  - The client-reported seat is honoured when it is a valid seat index AND
 *    either differs from the acting seat (normal case) or `isRoundOver` is true
 *    (round-boundary exception: the new-round opener may re-seat the same seat
 *    that fired the round-ending blow).
 *  - Any other situation falls back to the raw modulo successor
 *    `(activeIndex + 1) % playersLength`.
 *  - The turn counter always increments by 1.
 */
export function nextCursor(opts: NextCursorOpts): NextCursorResult {
  const { activeIndex, playersLength, reported: rawReported, isRoundOver, currentTurn } = opts

  const modulo = (activeIndex + 1) % playersLength

  // Normalise: a non-integer or absent value becomes the out-of-range sentinel -1.
  const reported =
    typeof rawReported === 'number' && Number.isInteger(rawReported)
      ? rawReported
      : -1

  // A reported index is valid when it is in-bounds AND (different from the
  // acting seat OR we are at a round boundary where re-seating the same seat
  // is intentional).
  const reportedValid = isRoundOver
    ? reported >= 0 && reported < playersLength
    : reported >= 0 && reported < playersLength && reported !== activeIndex

  return {
    index: reportedValid ? reported : modulo,
    turn: currentTurn + 1,
  }
}

// ---------------------------------------------------------------------------
// Lazy-GC reaper
// ---------------------------------------------------------------------------

export const STALE_MS = 30000

/** Lazy-GC: keep only players seen within the stale window. */
export function reap(players: StoredPlayer[], nowMs: number): StoredPlayer[] {
  return players.filter(p => (p.lastSeen ?? 0) >= nowMs - STALE_MS)
}
