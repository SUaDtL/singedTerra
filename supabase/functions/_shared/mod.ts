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

// Pinned to an exact version: a floating `@2` re-resolves on any `deno cache
// --reload` and would silently advance all 10 functions to a new minor/patch.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0'

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

// ---------------------------------------------------------------------------
// Rate limiting (per-IP fixed window) — see migration 005_rate_limits.sql
// ---------------------------------------------------------------------------

/** Fixed rate-limit window, in seconds. */
export const RATE_WINDOW_SEC = 60

/** Per-function request cap (per IP, per window). Tunable named constants — the
 *  limit lives here in the app, so changing it needs no migration. The expensive
 *  writers are capped tighter than the default. */
export const RATE_LIMITS: Record<string, number> = {
  create_room: 10,
  join_room: 20,
  restart_game: 10,
}
/** Applied to any function bucket without a specific entry above. */
export const RATE_LIMIT_DEFAULT = 60

/** Resolve the cap for a function bucket. */
export function rateLimitFor(bucket: string): number {
  return RATE_LIMITS[bucket] ?? RATE_LIMIT_DEFAULT
}

/** The fixed-window index for a wall-clock ms value. Pure (caller passes the
 *  time) so it is unit-testable without a clock. */
export function rateWindow(nowMs: number): number {
  return Math.floor(nowMs / 1000 / RATE_WINDOW_SEC)
}

/** Extract the client IP from the standard proxy headers; '' if unknown. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff && xff.trim()) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() ?? ''
}

/** Pure allow/deny decision: a request is allowed while the post-increment count
 *  is at or below the limit. */
export function checkRateLimit(count: number, limit: number): boolean {
  return count <= limit
}

/**
 * Enforce the per-IP limit for one request against the `bump_rate_limit` RPC.
 * Returns true (allowed) / false (over limit). FAILS OPEN: a limiter/DB hiccup
 * must never take the game down, so an RPC error is logged and allowed through.
 * A MissingEnvError propagates so withCors() maps it to the canonical 500.
 */
async function enforceRateLimit(req: Request, bucket: string): Promise<boolean> {
  const supabase = getServiceClient() // throws MissingEnvError → caught by withCors
  const ip = clientIp(req) || 'unknown'
  const { data, error } = await supabase.rpc('bump_rate_limit', {
    p_bucket: `${bucket}:${ip}`,
    p_window: rateWindow(Date.now()),
  })
  if (error) {
    // Distinguishable fail-open signal (obs-002): a chronically-erroring limiter
    // silently disables ALL per-IP limiting, so log with bucket/ip context so a
    // degraded limiter is detectable in the aggregated log stream rather than
    // indistinguishable from any other DB error.
    console.error('rate_limit: fail-open (limiter degraded)', { bucket, ip, error: error.message })
    return true // fail open
  }
  return checkRateLimit(typeof data === 'number' ? data : 0, rateLimitFor(bucket))
}

type Handler = (body: unknown, req: Request) => Response | Promise<Response>

interface WithCorsOpts {
  /** When true, a missing/invalid JSON body yields `undefined` instead of a 400
   *  (list_rooms takes no body). Default false: parse failure => 400. */
  optionalBody?: boolean
  /** Function bucket name to rate-limit by (per IP). The cap is resolved from
   *  RATE_LIMITS / RATE_LIMIT_DEFAULT. Omit to disable limiting for this function. */
  rateLimit?: string
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
      if (opts.rateLimit) {
        const allowed = await enforceRateLimit(req, opts.rateLimit)
        if (!allowed) return json({ error: 'Too many requests. Please slow down.' }, 429)
      }
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

/** Cached per-isolate service client (perf-010). Lazily created on first use —
 *  NOT at module load — so importing this module in a test without env set does
 *  not construct a client or throw. */
let _serviceClient: ServiceClient | null = null

/** Get the service-role Supabase client, reusing one instance per Deno isolate so
 *  repeated calls (incl. enforceRateLimit + the handler within one request) share
 *  HTTP keep-alive instead of each constructing a fresh client. Throws
 *  MissingEnvError (caught by withCors) when either env var is absent; the cache is
 *  only populated on success, so a transient missing-env still retries. */
export function getServiceClient(): ServiceClient {
  if (_serviceClient) return _serviceClient
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new MissingEnvError()
  }
  _serviceClient = createClient(supabaseUrl, supabaseServiceKey)
  return _serviceClient
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
  /** SE-parity economy options, persisted by `coerceEconomyOptions` at create time.
   *  Already written to the `options` JSONB; declared here so the read path (list_rooms)
   *  can surface them without a type error. Absent => the GameOptions engine default
   *  holds (armsLevel 4 = full arsenal, interestRate 0, suddenDeathTurn off). */
  armsLevel?: number
  interestRate?: number
  suddenDeathTurn?: number
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

/** A player/bot color: a short hex string (#rgb .. #rrggbbaa). The client picks from
 *  a fixed #rrggbb palette, so this accepts every legitimate value while bounding
 *  format + length — an unbounded color string was previously accepted and persisted
 *  to the shared room row + broadcast to every peer each render (appsec-003). Type
 *  guard so callers keep narrowing to `string` for the downstream `.trim()`. */
export function isValidColor(c: unknown): c is string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c.trim())
}

// ---------------------------------------------------------------------------
// Determinism-duplication constants (see DECISION-0009)
//
// The Deno referee cannot import shared/ (ADR-0005), so any physics default or
// engine enum it needs is MIRRORED here as accepted duplication. Each mirror is
// a silent-desync hazard: a value that drifts from its shared/ source seeds a
// client's engine differently or rejects a valid action over the network while
// hot-seat accepts it. Keep these pinned to their shared/ source; the mirror is
// small and guarded by MUST-match comments + tests.
// ---------------------------------------------------------------------------

/** Fallback physics options for legacy/malformed room-option rows. MUST match
 *  GRAVITY / MAX_WIND in shared/src/engine/Physics.ts. */
export const DEFAULT_GRAVITY = 0.15
export const DEFAULT_MAX_WIND = 10

/** Known non-weapon accessory buys. MUST match the `AccessoryType` union in
 *  shared/src/engine/WeaponSystem.ts. Adding an accessory to the engine without
 *  adding it here would 400/strip it over the network while hot-seat accepts it. */
export const ACCESSORY_TYPES: ReadonlySet<string> = new Set(['battery'])

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

// ---------------------------------------------------------------------------
// Seat tokens (ADR-0009 / GH #83) — authenticated actions
//
// The PUBLIC seat id (rooms.players[].id) is world-readable by design. The SECRET
// per-seat token lives in room_seats (RLS: service-role only) and is what actually
// proves seat ownership. Every mutating referee verifies the requester's token for
// their OWN seat before acting; the action log still records only the public id, so
// determinism/replay are untouched.
// ---------------------------------------------------------------------------

/** Mint a fresh secret seat token (128-bit CSPRNG UUID). Not the seat id — the seat
 *  id stays public; this is the private credential that never leaves room_seats. */
export function mintSeatToken(): string {
  return crypto.randomUUID()
}

/**
 * Verify that `token` authenticates ownership of seat `seatId` in `roomId`.
 * True only when a room_seats row exists for that seat and its stored token matches.
 * A missing/blank token, an absent row, or a mismatch all return false (caller -> 403).
 *
 * Note: a plain `===` compare is used. The token is a 122-bit random UUID, so a timing
 * side-channel gives no practical guessing advantage; equality timing is not a concern
 * at this threat level (no accounts, no money — ADR-0006/0009).
 */
export async function verifySeatToken(
  supabase: ServiceClient,
  roomId: string,
  seatId: string,
  token: unknown,
): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0) return false
  const { data, error } = await supabase
    .from('room_seats')
    .select('token')
    .eq('room_id', roomId)
    .eq('seat_id', seatId)
    .maybeSingle()
  if (error || !data) return false
  return data.token === token
}
