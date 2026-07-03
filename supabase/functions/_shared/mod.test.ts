// Unit tests for nextCursor — the pure seat-decision function extracted from
// submit_action/index.ts.
//
// Run: "C:/Users/brenn/.deno/bin/deno.exe" test supabase/functions/_shared/mod.test.ts
//
// Uses Deno.test with manual assertions (no external import) so the suite is
// hermetic and does not require network access.

import {
  nextCursor,
  checkRateLimit,
  clientIp,
  rateWindow,
  rateLimitFor,
  RATE_LIMIT_DEFAULT,
  isValidColor,
  withCors,
  json,
  MissingEnvError,
  reap,
  STALE_MS,
} from './mod.ts'

// ---------------------------------------------------------------------------
// Helper: assert strict equality with a descriptive message
// ---------------------------------------------------------------------------
function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ---------------------------------------------------------------------------
// AC5 – seat-decision branch coverage
// ---------------------------------------------------------------------------

// Turn-ending, valid reported seat differing from active → returns reported, turn+1
Deno.test('turn-ending: valid reported (different from active) is honored', () => {
  const result = nextCursor({
    activeIndex: 0,
    playersLength: 3,
    reported: 1,
    isRoundOver: false,
    currentTurn: 5,
  })
  assertEqual(result.index, 1, 'index')
  assertEqual(result.turn, 6, 'turn')
})

// Reported is the ACTING seat and NOT round-over → falls back to modulo (activeIndex+1)%playersLength
Deno.test('turn-ending: reported === activeIndex (not round-over) → modulo fallback', () => {
  const result = nextCursor({
    activeIndex: 2,
    playersLength: 3,
    reported: 2,        // same as activeIndex
    isRoundOver: false,
    currentTurn: 10,
  })
  // modulo = (2 + 1) % 3 = 0
  assertEqual(result.index, 0, 'index')
  assertEqual(result.turn, 11, 'turn')
})

// Round-over AND reported === acting seat (opener re-seat) → HONORS reported
// (the round-boundary exception relaxes the "can't keep your own turn" guard)
Deno.test('round-over: reported === activeIndex → opener is honored (round-boundary exception)', () => {
  const result = nextCursor({
    activeIndex: 1,
    playersLength: 4,
    reported: 1,        // same as activeIndex — valid only because isRoundOver=true
    isRoundOver: true,
    currentTurn: 7,
  })
  assertEqual(result.index, 1, 'index')
  assertEqual(result.turn, 8, 'turn')
})

// Reported out of bounds (>= playersLength) → modulo fallback
Deno.test('out-of-bounds reported (>= playersLength) → modulo fallback', () => {
  const result = nextCursor({
    activeIndex: 0,
    playersLength: 2,
    reported: 5,        // >= playersLength
    isRoundOver: false,
    currentTurn: 3,
  })
  // modulo = (0 + 1) % 2 = 1
  assertEqual(result.index, 1, 'index')
  assertEqual(result.turn, 4, 'turn')
})

// Reported negative → modulo fallback
Deno.test('negative reported → modulo fallback', () => {
  const result = nextCursor({
    activeIndex: 1,
    playersLength: 3,
    reported: -1,
    isRoundOver: false,
    currentTurn: 0,
  })
  // modulo = (1 + 1) % 3 = 2
  assertEqual(result.index, 2, 'index')
  assertEqual(result.turn, 1, 'turn')
})

// Reported null → modulo fallback
Deno.test('null reported → modulo fallback', () => {
  const result = nextCursor({
    activeIndex: 0,
    playersLength: 4,
    reported: null,
    isRoundOver: false,
    currentTurn: 2,
  })
  // modulo = (0 + 1) % 4 = 1
  assertEqual(result.index, 1, 'index')
  assertEqual(result.turn, 3, 'turn')
})

// Turn increments to currentTurn+1 in all turn-ending cases (extra cross-check)
Deno.test('turn always increments by 1 regardless of seat decision', () => {
  // Case A: reported honored
  const a = nextCursor({ activeIndex: 0, playersLength: 2, reported: 1, isRoundOver: false, currentTurn: 99 })
  assertEqual(a.turn, 100, 'turn (honored)')

  // Case B: modulo fallback
  const b = nextCursor({ activeIndex: 0, playersLength: 2, reported: 0, isRoundOver: false, currentTurn: 99 })
  assertEqual(b.turn, 100, 'turn (modulo fallback)')

  // Case C: round-over honored
  const c = nextCursor({ activeIndex: 1, playersLength: 2, reported: 1, isRoundOver: true, currentTurn: 99 })
  assertEqual(c.turn, 100, 'turn (round-over honored)')
})

// currentTurn = 0 (null/undefined in DB — the function receives it pre-coerced to 0)
Deno.test('currentTurn=0 → turn becomes 1', () => {
  const result = nextCursor({
    activeIndex: 0,
    playersLength: 2,
    reported: 1,
    isRoundOver: false,
    currentTurn: 0,
  })
  assertEqual(result.turn, 1, 'turn')
})

// 2-player edge: wrapping from last seat (index 1) → index 0 via modulo
Deno.test('2-player wrap: activeIndex=1 reported=1 (not round-over) → modulo → index 0', () => {
  const result = nextCursor({
    activeIndex: 1,
    playersLength: 2,
    reported: 1,        // same as active, not round-over → fallback
    isRoundOver: false,
    currentTurn: 4,
  })
  // modulo = (1 + 1) % 2 = 0
  assertEqual(result.index, 0, 'index')
  assertEqual(result.turn, 5, 'turn')
})

// round-over out-of-bounds → modulo even during round transition
Deno.test('round-over + out-of-bounds reported → modulo fallback', () => {
  const result = nextCursor({
    activeIndex: 0,
    playersLength: 3,
    reported: 99,
    isRoundOver: true,
    currentTurn: 1,
  })
  // modulo = (0 + 1) % 3 = 1
  assertEqual(result.index, 1, 'index')
  assertEqual(result.turn, 2, 'turn')
})

// ---------------------------------------------------------------------------
// Rate limiting — pure helpers (migration 005)
// ---------------------------------------------------------------------------

// checkRateLimit: allowed while count <= limit; the boundary (count === limit) is allowed.
Deno.test('checkRateLimit: under the limit is allowed', () => {
  assertEqual(checkRateLimit(1, 10), true, 'count 1 / limit 10')
  assertEqual(checkRateLimit(9, 10), true, 'count 9 / limit 10')
})
Deno.test('checkRateLimit: at the limit is allowed (inclusive boundary)', () => {
  assertEqual(checkRateLimit(10, 10), true, 'count 10 / limit 10')
})
Deno.test('checkRateLimit: over the limit is denied', () => {
  assertEqual(checkRateLimit(11, 10), false, 'count 11 / limit 10')
  assertEqual(checkRateLimit(61, 60), false, 'count 61 / limit 60')
})

// clientIp: x-forwarded-for first hop, list trimming, x-real-ip fallback, missing.
function reqWith(headers: Record<string, string>): Request {
  return new Request('https://example.test', { method: 'POST', headers })
}
Deno.test('clientIp: single x-forwarded-for', () => {
  assertEqual(clientIp(reqWith({ 'x-forwarded-for': '1.2.3.4' })), '1.2.3.4', 'single')
})
Deno.test('clientIp: x-forwarded-for list takes the first hop, trimmed', () => {
  assertEqual(clientIp(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' })), '1.2.3.4', 'list')
})
Deno.test('clientIp: falls back to x-real-ip', () => {
  assertEqual(clientIp(reqWith({ 'x-real-ip': '8.8.8.8' })), '8.8.8.8', 'real-ip')
})
Deno.test('clientIp: empty when neither header is present', () => {
  assertEqual(clientIp(reqWith({})), '', 'missing')
})

// rateWindow: floor(ms / 1000 / 60); the same window for two times in the same minute,
// the next window for a time 60s later. Pure (time passed in).
const MINUTE_ALIGNED_MS = 16_666_667 * 60_000 // exactly on a 60s boundary
Deno.test('rateWindow: same 60s window collapses to one bucket', () => {
  const a = rateWindow(MINUTE_ALIGNED_MS)
  const b = rateWindow(MINUTE_ALIGNED_MS + 59_000) // +59s, still same window
  assertEqual(a, b, 'same minute')
})
Deno.test('rateWindow: crossing 60s advances the window', () => {
  const a = rateWindow(MINUTE_ALIGNED_MS)
  const c = rateWindow(MINUTE_ALIGNED_MS + 60_000) // +60s, next window
  assertEqual(c, a + 1, 'next minute')
})

// rateLimitFor: known buckets get their cap; unknown falls back to the default.
Deno.test('rateLimitFor: known buckets and default fallback', () => {
  assertEqual(rateLimitFor('create_room'), 10, 'create_room')
  assertEqual(rateLimitFor('join_room'), 20, 'join_room')
  assertEqual(rateLimitFor('restart_game'), 10, 'restart_game')
  assertEqual(rateLimitFor('heartbeat'), RATE_LIMIT_DEFAULT, 'unknown → default')
})

// ---------------------------------------------------------------------------
// isValidColor — bounded hex color guard (appsec-003)
// ---------------------------------------------------------------------------

Deno.test('isValidColor: every client palette color is accepted', () => {
  for (const c of ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d', '#a855f7']) {
    assertEqual(isValidColor(c), true, `palette ${c}`)
  }
})

Deno.test('isValidColor: #rgb / #rrggbb / #rrggbbaa shorthands accepted; surrounding space trimmed', () => {
  assertEqual(isValidColor('#fff'), true, '#rgb')
  assertEqual(isValidColor('#ffffff'), true, '#rrggbb')
  assertEqual(isValidColor('#ffffffff'), true, '#rrggbbaa')
  assertEqual(isValidColor('  #abc123  '), true, 'trimmed')
})

Deno.test('isValidColor: rejects non-hex, unbounded, and non-string input', () => {
  assertEqual(isValidColor(''), false, 'empty')
  assertEqual(isValidColor('red'), false, 'named color')
  assertEqual(isValidColor('#12'), false, 'too short')
  assertEqual(isValidColor('#1234567890'), false, 'too long')
  assertEqual(isValidColor('#gggggg'), false, 'non-hex digits')
  assertEqual(isValidColor('#fff; background:url(x)'), false, 'injection-ish payload')
  assertEqual(isValidColor('a'.repeat(5000)), false, 'unbounded string')
  assertEqual(isValidColor(123), false, 'number')
  assertEqual(isValidColor(null), false, 'null')
  assertEqual(isValidColor(undefined), false, 'undefined')
})

// ---------------------------------------------------------------------------
// withCors — request preamble shared by all 10 Edge Functions (coverage-001)
// ---------------------------------------------------------------------------
//
// enforceRateLimit()'s allow/deny (429) and RPC-error fail-open branches are
// NOT exercised here: they require a live/mocked `supabase.rpc('bump_rate_limit', ...)`
// call reached only via the module-private getServiceClient() singleton, which
// has no injection seam (no constructor param, no settable factory). Forcing a
// mock would mean monkeypatching the imported `createClient` from the pinned
// esm.sh specifier or reaching into module-internal state — both fragile and
// disallowed by the "don't force a fragile mock" instruction. What IS covered
// below is (a) the pure decision function `checkRateLimit` (already covered
// above: inclusive boundary + over-limit denial) and (b) that when `rateLimit`
// is set and the service-role env is missing, enforceRateLimit's call into
// getServiceClient() correctly surfaces MissingEnvError through to withCors's
// 500 mapping (proving the rate-limit gate is actually wired into the request
// path, not skipped).

function jsonReq(body: unknown, method = 'POST'): Request {
  return new Request('https://example.test', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

Deno.test('withCors: OPTIONS preflight returns 200 "ok" with CORS headers', async () => {
  const handler = withCors(() => json({ ok: true }))
  const res = await handler(new Request('https://example.test', { method: 'OPTIONS' }))
  assertEqual(res.status, 200, 'status')
  assertEqual(await res.text(), 'ok', 'body')
  assertEqual(res.headers.get('Access-Control-Allow-Origin'), '*', 'cors origin header')
  assertEqual(res.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS', 'cors methods header')
})

Deno.test('withCors: non-POST method returns 405', async () => {
  const handler = withCors(() => json({ ok: true }))
  const res = await handler(new Request('https://example.test', { method: 'GET' }))
  assertEqual(res.status, 405, 'status')
  const payload = await res.json()
  assertEqual(payload.error, 'Method not allowed', 'error message')
})

Deno.test('withCors: malformed JSON body returns 400', async () => {
  const handler = withCors(() => json({ ok: true }))
  const res = await handler(new Request('https://example.test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not valid json',
  }))
  assertEqual(res.status, 400, 'status')
  const payload = await res.json()
  assertEqual(payload.error, 'Invalid JSON body', 'error message')
})

Deno.test('withCors: optionalBody bypasses a parse failure, handler receives undefined body', async () => {
  let received: unknown = 'not-yet-called'
  const handler = withCors((body) => {
    received = body
    return json({ ok: true })
  }, { optionalBody: true })
  const res = await handler(new Request('https://example.test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not valid json',
  }))
  assertEqual(res.status, 200, 'status')
  assertEqual(received, undefined, 'body passed to handler')
})

Deno.test('withCors: valid JSON body is parsed and passed through to the handler', async () => {
  let received: unknown = 'not-yet-called'
  const handler = withCors((body) => {
    received = body
    return json({ ok: true })
  })
  const res = await handler(jsonReq({ roomCode: 'ABCD' }))
  assertEqual(res.status, 200, 'status')
  assertEqual(JSON.stringify(received), JSON.stringify({ roomCode: 'ABCD' }), 'body passed to handler')
})

Deno.test('withCors: handler throwing MissingEnvError maps to 500', async () => {
  const handler = withCors(() => { throw new MissingEnvError() })
  const res = await handler(jsonReq({}))
  assertEqual(res.status, 500, 'status')
  const payload = await res.json()
  assertEqual(payload.error, 'Server misconfiguration: missing env vars', 'error message')
})

Deno.test('withCors: non-MissingEnvError handler errors propagate unchanged (not swallowed as a 500)', async () => {
  const handler = withCors(() => { throw new Error('boom') })
  let threw = false
  try {
    await handler(jsonReq({}))
  } catch (e) {
    threw = true
    assertEqual((e as Error).message, 'boom', 'propagated error message')
  }
  assertEqual(threw, true, 'error propagated rather than converted to a Response')
})

Deno.test('withCors: rateLimit gate reaches enforceRateLimit, whose MissingEnvError (no service-role env in test) still maps to 500', async () => {
  // Ensure the branch is actually exercised regardless of what a prior test run
  // may have left in the process env.
  const prevUrl = Deno.env.get('SUPABASE_URL')
  const prevKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  Deno.env.delete('SUPABASE_URL')
  Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY')
  try {
    let handlerCalled = false
    const handler = withCors(() => {
      handlerCalled = true
      return json({ ok: true })
    }, { rateLimit: 'create_room' })
    const res = await handler(jsonReq({}))
    assertEqual(res.status, 500, 'status')
    assertEqual(handlerCalled, false, 'handler must not run once the rate-limit gate throws')
    const payload = await res.json()
    assertEqual(payload.error, 'Server misconfiguration: missing env vars', 'error message')
  } finally {
    if (prevUrl !== undefined) Deno.env.set('SUPABASE_URL', prevUrl)
    if (prevKey !== undefined) Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', prevKey)
  }
})

// ---------------------------------------------------------------------------
// reap — lazy-GC staleness filter (coverage-002)
// ---------------------------------------------------------------------------

Deno.test('reap: player seen within the stale window is kept', () => {
  const now = 1_000_000
  const players = [{ id: 'a', name: 'A', color: '#fff', ready: true, lastSeen: now - 1000 }]
  assertEqual(reap(players, now).length, 1, 'kept')
})

Deno.test('reap: exactly at nowMs - STALE_MS is kept (inclusive boundary)', () => {
  const now = 1_000_000
  const players = [{ id: 'a', name: 'A', color: '#fff', ready: true, lastSeen: now - STALE_MS }]
  assertEqual(reap(players, now).length, 1, 'kept at inclusive boundary')
})

Deno.test('reap: just past the stale window is dropped', () => {
  const now = 1_000_000
  const players = [{ id: 'a', name: 'A', color: '#fff', ready: true, lastSeen: now - STALE_MS - 1 }]
  assertEqual(reap(players, now).length, 0, 'dropped')
})

Deno.test('reap: missing lastSeen (legacy row) defaults to 0 and is treated as stale', () => {
  const now = 1_000_000
  const players = [{ id: 'a', name: 'A', color: '#fff', ready: true }]
  assertEqual(reap(players, now).length, 0, 'dropped legacy row')
})

Deno.test('reap: empty array returns empty array', () => {
  assertEqual(reap([], 1_000_000).length, 0, 'empty in, empty out')
})

Deno.test('reap: mixed players filters correctly and preserves order', () => {
  const now = 1_000_000
  const players = [
    { id: 'a', name: 'A', color: '#fff', ready: true, lastSeen: now - 1000 }, // kept
    { id: 'b', name: 'B', color: '#fff', ready: true, lastSeen: now - STALE_MS - 1 }, // dropped
    { id: 'c', name: 'C', color: '#fff', ready: true }, // dropped (legacy, no lastSeen)
    { id: 'd', name: 'D', color: '#fff', ready: true, lastSeen: now }, // kept
  ]
  const result = reap(players, now)
  assertEqual(result.length, 2, 'count')
  assertEqual(result[0].id, 'a', 'first kept preserves order')
  assertEqual(result[1].id, 'd', 'second kept preserves order')
})
