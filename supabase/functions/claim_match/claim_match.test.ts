import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleClaimMatch, type ClaimMatchDependencies } from './index.ts'

const ROOM_ID = '00000000-0000-4000-8000-000000000001'
const PLAYER_A = '00000000-0000-4000-8000-000000000002'
const PLAYER_B = '00000000-0000-4000-8000-000000000003'
const USER_ID = '00000000-0000-4000-8000-000000000004'
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000005'
const SEAT_TOKEN = 'seat-secret-must-not-appear-in-output'
const JWT = 'jwt-secret-must-not-appear-in-output'

type FakeError = { message: string; code?: string }
type QueryResult = { data: unknown; error: FakeError | null }
type QueryExpectation = {
  table: string
  select?: string
  filters?: Array<[string, unknown]>
  operation: 'maybeSingle' | 'insert'
  result: QueryResult
  insert?: Record<string, unknown>
}

interface FakeOptions {
  queries?: QueryExpectation[]
  authUserId?: string | null
  authError?: FakeError | null
}

const FINISHED_ROOM = { id: ROOM_ID, status: 'finished', players: [{ id: PLAYER_A }, { id: PLAYER_B }] }
const DUPLICATE: FakeError = { code: '23505', message: 'duplicate key' }

function result(data: unknown, error: FakeError | null = null): QueryResult {
  return { data, error }
}

function roomQuery(room: unknown = FINISHED_ROOM, error: FakeError | null = null): QueryExpectation {
  return {
    table: 'rooms',
    select: 'id, status, players',
    filters: [['id', ROOM_ID]],
    operation: 'maybeSingle',
    result: result(room, error),
  }
}

function seatQuery(
  playerId = PLAYER_A,
  row: unknown = { token: SEAT_TOKEN },
  error: FakeError | null = null,
): QueryExpectation {
  return {
    table: 'room_seats',
    select: 'token',
    filters: [['room_id', ROOM_ID], ['seat_id', playerId]],
    operation: 'maybeSingle',
    result: result(row, error),
  }
}

function scoreQuery(row: unknown = { room_id: ROOM_ID }, error: FakeError | null = null): QueryExpectation {
  return {
    table: 'match_scores',
    select: 'room_id',
    filters: [['room_id', ROOM_ID]],
    operation: 'maybeSingle',
    result: result(row, error),
  }
}

function insertQuery(
  playerId = PLAYER_A,
  tankId = 'p1',
  error: FakeError | null = null,
): QueryExpectation {
  return {
    table: 'match_participants',
    operation: 'insert',
    insert: { room_id: ROOM_ID, user_id: USER_ID, player_id: playerId, tank_id: tankId },
    result: result(null, error),
  }
}

function existingUserQuery(row: unknown, error: FakeError | null = null): QueryExpectation {
  return {
    table: 'match_participants',
    select: 'room_id, user_id, player_id, tank_id',
    filters: [['room_id', ROOM_ID], ['user_id', USER_ID]],
    operation: 'maybeSingle',
    result: result(row, error),
  }
}

function existingPlayerQuery(row: unknown, error: FakeError | null = null): QueryExpectation {
  return {
    table: 'match_participants',
    select: 'room_id, user_id, player_id, tank_id',
    filters: [['room_id', ROOM_ID], ['player_id', PLAYER_A]],
    operation: 'maybeSingle',
    result: result(row, error),
  }
}

function readyForInsert(playerId = PLAYER_A, tankId = 'p1', error: FakeError | null = null): QueryExpectation[] {
  return [roomQuery(), seatQuery(playerId), scoreQuery(), insertQuery(playerId, tankId, error)]
}

function makeFixture(options: FakeOptions = {}) {
  const queries = options.queries ?? []
  const inserts: Array<Record<string, unknown>> = []
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []
  const authTokens: string[] = []
  let queryIndex = 0

  const supabase = {
    auth: {
      getUser: async (token: string) => {
        authTokens.push(token)
        return {
          data: { user: options.authUserId === null ? null : { id: options.authUserId ?? USER_ID } },
          error: options.authError ?? null,
        }
      },
    },
    from: (table: string) => {
      const expected = queries[queryIndex]
      if (!expected) throw new Error(`unexpected query for table ${table}`)
      assertEquals(table, expected.table, `query ${queryIndex + 1} table`)
      let selectCalled = false
      let filterIndex = 0
      let finished = false
      const filters = expected.filters ?? []
      const query = {
        eq: (field: string, value: unknown) => {
          if (finished) throw new Error(`query ${queryIndex + 1} used after terminal operation`)
          const wanted = filters[filterIndex]
          if (!wanted) throw new Error(`unexpected filter ${field} on query ${queryIndex + 1}`)
          assertEquals([field, value], wanted, `query ${queryIndex + 1} filter ${filterIndex + 1}`)
          filterIndex += 1
          return query
        },
        maybeSingle: async () => {
          assertEquals(expected.operation, 'maybeSingle', `query ${queryIndex + 1} terminal operation`)
          assertEquals(selectCalled, true, `query ${queryIndex + 1} selects before terminal operation`)
          assertEquals(filterIndex, filters.length, `query ${queryIndex + 1} consumed every filter`)
          finished = true
          queryIndex += 1
          return expected.result
        },
      }
      return {
        select: (columns: string) => {
          assertEquals(expected.operation, 'maybeSingle', `query ${queryIndex + 1} operation`)
          assertEquals(columns, expected.select, `query ${queryIndex + 1} selected columns`)
          selectCalled = true
          return query
        },
        insert: async (row: Record<string, unknown>) => {
          assertEquals(expected.operation, 'insert', `query ${queryIndex + 1} terminal operation`)
          assertEquals(row, expected.insert, `query ${queryIndex + 1} inserted row`)
          inserts.push(row)
          finished = true
          queryIndex += 1
          return expected.result
        },
      }
    },
  }

  const deps: ClaimMatchDependencies = {
    supabase: supabase as never,
    logger: (message: string, context: Record<string, unknown>) => logs.push({ message, context }),
  }
  return {
    deps,
    inserts,
    logs,
    authTokens,
    assertQueriesConsumed: () => assertEquals(queryIndex, queries.length, 'all expected queries were consumed'),
  }
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { roomId: ROOM_ID, playerId: PLAYER_A, token: SEAT_TOKEN, ...overrides }
}

function request(authorization = `Bearer ${JWT}`): Request {
  return new Request('https://example.test/claim_match', { headers: { authorization } })
}

async function expectResponse(
  options: FakeOptions,
  body: unknown,
  expectedStatus: number,
  authorization?: string,
) {
  const fixture = makeFixture(options)
  const response = await handleClaimMatch(body, request(authorization), fixture.deps)
  assertEquals(response.status, expectedStatus)
  fixture.assertQueriesConsumed()
  return { fixture, payload: await response.json() }
}

Deno.test('handleClaimMatch rejects malformed room, player, or missing seat token before auth (catches removed request validation)', async () => {
  for (const body of [validBody({ roomId: 'not-a-uuid' }), validBody({ playerId: 'not-a-uuid' }), validBody({ token: '' }), null]) {
    const { fixture, payload } = await expectResponse({}, body, 400)
    assertEquals(payload, { error: 'invalid_claim_request' })
    assertEquals(fixture.authTokens, [])
  }
})

Deno.test('handleClaimMatch rejects missing or malformed Bearer credentials (catches permissive Authorization parsing)', async () => {
  for (const authorization of ['', 'Basic abc', 'Bearer two tokens']) {
    const { fixture, payload } = await expectResponse({}, validBody(), 401, authorization)
    assertEquals(payload, { error: 'unauthorized' })
    assertEquals(fixture.authTokens, [])
  }
})

Deno.test('handleClaimMatch rejects a JWT Supabase Auth did not accept (catches trusting an undecoded client token)', async () => {
  const { fixture, payload } = await expectResponse({ authUserId: null, authError: { message: 'invalid jwt' } }, validBody(), 401)
  assertEquals(payload, { error: 'unauthorized' })
  assertEquals(fixture.authTokens, [JWT])
})

Deno.test('handleClaimMatch returns 500 for a scoped room query failure (catches query errors treated as missing rooms)', async () => {
  const { payload } = await expectResponse({ queries: [roomQuery(null, { message: 'room query down' })] }, validBody(), 500)
  assertEquals(payload, { error: 'claim_failed' })
})

Deno.test('handleClaimMatch returns 404 for an absent room after authenticated identity lookup (catches linking a nonexistent match)', async () => {
  const { payload } = await expectResponse({ queries: [roomQuery(null)] }, validBody(), 404)
  assertEquals(payload, { error: 'room_not_found' })
})

Deno.test('handleClaimMatch rejects a player outside the ordered room roster (catches skipped membership authorization)', async () => {
  const { payload } = await expectResponse({ queries: [roomQuery({ id: ROOM_ID, status: 'finished', players: [{ id: PLAYER_A }] })] }, validBody({ playerId: OTHER_USER_ID }), 403)
  assertEquals(payload, { error: 'seat_not_authorized' })
})

Deno.test('handleClaimMatch rejects an invalid seat token for a member (catches skipped seat-token referee boundary)', async () => {
  const { payload } = await expectResponse({ queries: [roomQuery(), seatQuery(PLAYER_A, { token: 'different-seat-token' })] }, validBody(), 403)
  assertEquals(payload, { error: 'seat_not_authorized' })
})

Deno.test('handleClaimMatch returns logged generic failure for a seat-table query error (catches collapsing a database failure into invalid credentials)', async () => {
  const { fixture, payload } = await expectResponse({ queries: [roomQuery(), seatQuery(PLAYER_A, null, { message: 'seat query down' })] }, validBody(), 500)
  assertEquals(payload, { error: 'claim_failed' })
  assertEquals(fixture.logs[0].context.error, 'seat query down')
})

Deno.test('handleClaimMatch rejects a room that has not finished (catches claims before match completion)', async () => {
  const { payload } = await expectResponse({ queries: [roomQuery({ id: ROOM_ID, status: 'active', players: [{ id: PLAYER_A }] }), seatQuery()] }, validBody(), 409)
  assertEquals(payload, { error: 'match_not_ready' })
})

Deno.test('handleClaimMatch returns 500 for a scoped match-score query failure (catches score errors treated as absent scores)', async () => {
  const { payload } = await expectResponse({ queries: [roomQuery(), seatQuery(), scoreQuery(null, { message: 'score query down' })] }, validBody(), 500)
  assertEquals(payload, { error: 'claim_failed' })
})

Deno.test('handleClaimMatch requires a persisted match score (catches links to unrecorded finished matches)', async () => {
  const { payload } = await expectResponse({ queries: [roomQuery(), seatQuery(), scoreQuery(null)] }, validBody(), 409)
  assertEquals(payload, { error: 'match_not_ready' })
})

Deno.test('handleClaimMatch derives pN and ignores body identity, outcome, XP, and total fields (catches client-controlled linkage identity)', async () => {
  const { fixture, payload } = await expectResponse({ queries: readyForInsert(PLAYER_B, 'p2') }, validBody({
    playerId: PLAYER_B,
    userId: OTHER_USER_ID,
    tankId: 'p999',
    outcome: 'winner',
    score: 99999,
    xp: 99999,
    total: 99999,
  }), 200)
  assertEquals(payload, { ok: true, linked: true })
  assertEquals(fixture.inserts, [{ room_id: ROOM_ID, user_id: USER_ID, player_id: PLAYER_B, tank_id: 'p2' }])
})

Deno.test('handleClaimMatch reports a successful newly inserted account-seat link (catches ignored insert success)', async () => {
  const { payload } = await expectResponse({ queries: readyForInsert() }, validBody(), 200)
  assertEquals(payload, { ok: true, linked: true })
})

Deno.test('handleClaimMatch treats the exact existing link as an idempotent replay (catches duplicate retry conflict)', async () => {
  const existing = { room_id: ROOM_ID, user_id: USER_ID, player_id: PLAYER_A, tank_id: 'p1' }
  const { payload } = await expectResponse({ queries: [...readyForInsert(PLAYER_A, 'p1', DUPLICATE), existingUserQuery(existing)] }, validBody(), 200)
  assertEquals(payload, { ok: true, linked: false })
})

Deno.test('handleClaimMatch returns 500 when the room-user duplicate diagnostic query fails (catches error being mistaken for no existing user link)', async () => {
  const { payload } = await expectResponse({ queries: [...readyForInsert(PLAYER_A, 'p1', DUPLICATE), existingUserQuery(null, { message: 'user diagnostic down' })] }, validBody(), 500)
  assertEquals(payload, { error: 'claim_failed' })
})

Deno.test('handleClaimMatch rejects a room-user uniqueness collision with a different seat (catches false idempotency)', async () => {
  const { payload } = await expectResponse({ queries: [...readyForInsert(PLAYER_A, 'p1', DUPLICATE), existingUserQuery({ room_id: ROOM_ID, user_id: USER_ID, player_id: PLAYER_B, tank_id: 'p2' })] }, validBody(), 409)
  assertEquals(payload, { error: 'claim_conflict' })
})

Deno.test('handleClaimMatch returns 500 when the room-player duplicate diagnostic query fails (catches error being mistaken for no existing player link)', async () => {
  const { payload } = await expectResponse({ queries: [...readyForInsert(PLAYER_A, 'p1', DUPLICATE), existingUserQuery(null), existingPlayerQuery(null, { message: 'player diagnostic down' })] }, validBody(), 500)
  assertEquals(payload, { error: 'claim_failed' })
})

Deno.test('handleClaimMatch rejects a room-player uniqueness collision with another account (catches account takeover through replay)', async () => {
  const { payload } = await expectResponse({ queries: [...readyForInsert(PLAYER_A, 'p1', DUPLICATE), existingUserQuery(null), existingPlayerQuery({ room_id: ROOM_ID, user_id: OTHER_USER_ID, player_id: PLAYER_A, tank_id: 'p1' })] }, validBody(), 409)
  assertEquals(payload, { error: 'claim_conflict' })
})

Deno.test('handleClaimMatch returns a credential-free generic persistence failure and logs only safe operational context (catches raw backend error or credential reflection)', async () => {
  const { fixture, payload } = await expectResponse({ queries: readyForInsert(PLAYER_A, 'p1', { message: 'database unavailable' }) }, validBody(), 500)
  assertEquals(payload, { error: 'claim_failed' })
  assertEquals(fixture.logs.length, 1)
  const serialized = JSON.stringify({ payload, logs: fixture.logs })
  assertEquals(serialized.includes(JWT), false)
  assertEquals(serialized.includes(SEAT_TOKEN), false)
  assertEquals(fixture.logs[0].context.roomId, ROOM_ID)
  assertEquals(fixture.logs[0].context.playerId, PLAYER_A)
  assertEquals(fixture.logs[0].context.error, 'database unavailable')
})
