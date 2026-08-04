import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import * as accountSummary from './index.ts'
import { handleAccountSummary, type AccountSummaryDependencies } from './index.ts'

const USER_ID = '00000000-0000-4000-8000-000000000004'
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000005'
const JWT = 'account-summary-jwt-must-not-appear'
const BODY_MARKER = 'body-marker-must-not-appear'

type FakeError = { message: string }
type QueryResult = { data: unknown; error: FakeError | null; count?: number | null }
type QueryExpectation = {
  table: 'match_participants' | 'match_scores'
  select: string
  selectOptions?: { count: 'exact' }
  filter: ['eq' | 'in', string, unknown]
  result: QueryResult
}

interface FakeOptions {
  queries?: QueryExpectation[]
  authUserId?: string | null
  authError?: FakeError | null
}

function participantQuery(
  data: unknown,
  error: FakeError | null = null,
  count: number | null = Array.isArray(data) ? data.length : null,
  requireExactCount = false,
  expectedUserId = USER_ID,
): QueryExpectation {
  return {
    table: 'match_participants',
    select: 'room_id, tank_id',
    selectOptions: requireExactCount ? { count: 'exact' } : undefined,
    filter: ['eq', 'user_id', expectedUserId],
    result: { data, error, count },
  }
}

function scoreQuery(roomIds: string[], data: unknown, error: FakeError | null = null): QueryExpectation {
  return {
    table: 'match_scores',
    select: 'room_id, winner',
    filter: ['in', 'room_id', roomIds],
    result: { data, error },
  }
}

function makeFixture(options: FakeOptions = {}) {
  const queries = options.queries ?? []
  const authTokens: string[] = []
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []
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
      return {
        select: (columns: string, options?: { count: 'exact' }) => {
          assertEquals(columns, expected.select, `query ${queryIndex + 1} columns`)
          if (expected.selectOptions) {
            assertEquals(options, expected.selectOptions, `query ${queryIndex + 1} select options`)
          }
          return {
            eq: async (field: string, value: unknown) => {
              assertEquals(['eq', field, value], expected.filter, `query ${queryIndex + 1} filter`)
              queryIndex += 1
              return expected.result
            },
            in: async (field: string, value: unknown) => {
              assertEquals(['in', field, value], expected.filter, `query ${queryIndex + 1} filter`)
              queryIndex += 1
              return expected.result
            },
          }
        },
      }
    },
  }

  const dependencies: AccountSummaryDependencies = {
    supabase: supabase as never,
    logger: (message: string, context: Record<string, unknown>) => logs.push({ message, context }),
  }
  return {
    dependencies,
    authTokens,
    logs,
    queryCount: () => queryIndex,
    assertQueriesConsumed: () => assertEquals(queryIndex, queries.length, 'all expected queries consumed'),
  }
}

function request(authorization?: string): Request {
  const headers = new Headers()
  if (authorization !== undefined) headers.set('authorization', authorization)
  return new Request('https://example.test/account_summary', { method: 'POST', headers })
}

async function expectResponse(
  options: FakeOptions,
  expectedStatus: number,
  authorization = `Bearer ${JWT}`,
  body: unknown = undefined,
) {
  const fixture = makeFixture(options)
  const response = await handleAccountSummary(body, request(authorization), fixture.dependencies)
  assertEquals(response.status, expectedStatus)
  fixture.assertQueriesConsumed()
  return { fixture, payload: await response.json() }
}

Deno.test('handleAccountSummary rejects missing, malformed, and duplicated Bearer credentials before progression queries (catches permissive auth parsing)', async () => {
  for (const authorization of ['', 'Basic token', 'Bearer two tokens', 'Bearer first, Bearer second']) {
    const { fixture, payload } = await expectResponse({}, 401, authorization)
    assertEquals(payload, { error: 'summary_unavailable' })
    assertEquals(fixture.authTokens, [])
    assertEquals(fixture.queryCount(), 0)
  }
})

Deno.test('handleAccountSummary rejects a bearer Supabase Auth rejected before progression queries (catches trusting local JWT claims)', async () => {
  const { fixture, payload } = await expectResponse(
    { authUserId: null, authError: { message: 'rejected credential' } },
    401,
  )
  assertEquals(payload, { error: 'summary_unavailable' })
  assertEquals(fixture.authTokens, [JWT])
  assertEquals(fixture.queryCount(), 0)
})

Deno.test('handleAccountSummary scopes links to the Auth-derived user and ignores body identity and totals (catches client-owned progression)', async () => {
  const rooms = ['room-win', 'room-loss']
  const { payload } = await expectResponse(
    {
      queries: [
        participantQuery(
          [
            { room_id: rooms[0], tank_id: 'p2' },
            { room_id: rooms[1], tank_id: 'p1' },
          ],
          null,
          2,
          false,
          OTHER_USER_ID,
        ),
        scoreQuery(rooms, [
          { room_id: rooms[0], winner: 'p2' },
          { room_id: rooms[1], winner: 'p2' },
        ]),
      ],
      authUserId: OTHER_USER_ID,
    },
    200,
    `Bearer ${JWT}`,
    {
      userId: USER_ID,
      matchesPlayed: 999,
      wins: 999,
      progressionVersion: 999,
      totalXp: 999,
      level: 999,
      levelXp: 999,
      nextLevelXp: 999,
      token: BODY_MARKER,
    },
  )
  assertEquals(payload, {
    matchesPlayed: 2,
    wins: 1,
    progressionVersion: 1,
    totalXp: 300,
    level: 1,
    levelXp: 300,
    nextLevelXp: 500,
  })
})

Deno.test('handleAccountSummary returns exact zero counts without querying scores when no links exist (catches unnecessary broad score reads)', async () => {
  const { fixture, payload } = await expectResponse({ queries: [participantQuery([])] }, 200)
  assertEquals(payload, {
    matchesPlayed: 0,
    wins: 0,
    progressionVersion: 1,
    totalXp: 0,
    level: 1,
    levelXp: 0,
    nextLevelXp: 500,
  })
  assertEquals(fixture.queryCount(), 1)
})

Deno.test('handleAccountSummary derives exact wins, losses, and draws from persisted winners (catches wrong winner comparison)', async () => {
  const rooms = ['room-win', 'room-loss', 'room-draw', 'room-second-win']
  const { payload } = await expectResponse(
    {
      queries: [
        participantQuery([
          { room_id: rooms[0], tank_id: 'p1' },
          { room_id: rooms[1], tank_id: 'p2' },
          { room_id: rooms[2], tank_id: 'p3' },
          { room_id: rooms[3], tank_id: 'p4' },
        ]),
        scoreQuery(rooms, [
          { room_id: rooms[2], winner: null },
          { room_id: rooms[0], winner: 'p1' },
          { room_id: rooms[3], winner: 'p1' },
          { room_id: rooms[1], winner: 'p1' },
        ]),
      ],
    },
    200,
  )
  assertEquals(payload, {
    matchesPlayed: 4,
    wins: 1,
    progressionVersion: 1,
    totalXp: 500,
    level: 2,
    levelXp: 0,
    nextLevelXp: 500,
  })
})

Deno.test('progressionFromTotalXp keeps 499 total XP in level one (catches an early level divisor)', () => {
  const progressionFromTotalXp = (accountSummary as {
    progressionFromTotalXp?: (totalXp: number) => unknown
  }).progressionFromTotalXp
  assertEquals(typeof progressionFromTotalXp, 'function')
  assertEquals(progressionFromTotalXp!(499), {
    progressionVersion: 1,
    totalXp: 499,
    level: 1,
    levelXp: 499,
    nextLevelXp: 500,
  })
})

Deno.test('handleAccountSummary derives version-one progression from eight matches and two recorded wins (catches a wrong win bonus)', async () => {
  const rooms = Array.from({ length: 8 }, (_, index) => `room-${index + 1}`)
  const { payload } = await expectResponse(
    {
      queries: [
        participantQuery(rooms.map((room_id, index) => ({ room_id, tank_id: `p${index + 1}` }))),
        scoreQuery(rooms, rooms.map((room_id, index) => ({
          room_id,
          winner: index < 2 ? `p${index + 1}` : null,
        }))),
      ],
    },
    200,
  )
  assertEquals(payload, {
    matchesPlayed: 8,
    wins: 2,
    progressionVersion: 1,
    totalXp: 1000,
    level: 3,
    levelXp: 0,
    nextLevelXp: 500,
  })
})

Deno.test('handleAccountSummary fails generically on participant query errors without leaking credentials or account ids (catches partial totals and unsafe logs)', async () => {
  const { fixture, payload } = await expectResponse(
    { queries: [participantQuery(null, { message: `participant storage down ${JWT} ${USER_ID}` })] },
    500,
    `Bearer ${JWT}`,
    { token: BODY_MARKER },
  )
  assertEquals(payload, { error: 'summary_unavailable' })
  assertEquals(fixture.logs.length, 1)
  assertEquals(fixture.logs[0].message, 'account_summary: participant query failed')
  assertEquals(Object.keys(fixture.logs[0].context), ['stage', 'error'])
  assertEquals(fixture.logs[0].context.stage, 'participants')
  const serialized = JSON.stringify({ payload, logs: fixture.logs })
  assertEquals(serialized.includes(JWT), false)
  assertEquals(serialized.includes(USER_ID), false)
  assertEquals(serialized.includes(BODY_MARKER), false)
})

Deno.test('handleAccountSummary fails generically on score query errors rather than returning linked-match totals (catches partial success)', async () => {
  const rooms = ['room-one']
  const { payload } = await expectResponse(
    {
      queries: [
        participantQuery([{ room_id: rooms[0], tank_id: 'p1' }]),
        scoreQuery(rooms, null, { message: 'score storage down' }),
      ],
    },
    500,
  )
  assertEquals(payload, { error: 'summary_unavailable' })
})

Deno.test('handleAccountSummary fails closed when a linked match score is missing (catches understated totals)', async () => {
  const rooms = ['room-one', 'room-two']
  const { payload } = await expectResponse(
    {
      queries: [
        participantQuery(rooms.map((room_id) => ({ room_id, tank_id: 'p1' }))),
        scoreQuery(rooms, [{ room_id: rooms[0], winner: 'p1' }]),
      ],
    },
    500,
  )
  assertEquals(payload, { error: 'summary_unavailable' })
})

Deno.test('handleAccountSummary fails closed on duplicate score rows (catches overstated or ambiguous totals)', async () => {
  const rooms = ['room-one']
  const duplicate = { room_id: rooms[0], winner: 'p1' }
  const { payload } = await expectResponse(
    {
      queries: [
        participantQuery([{ room_id: rooms[0], tank_id: 'p1' }]),
        scoreQuery(rooms, [duplicate, duplicate]),
      ],
    },
    500,
  )
  assertEquals(payload, { error: 'summary_unavailable' })
})

Deno.test('handleAccountSummary fails closed on unrequested or malformed score data (catches broad-query contamination)', async () => {
  for (const scores of [
    [{ room_id: 'room-other', winner: 'p1' }],
    [{ room_id: 'room-one', winner: 1 }],
    [{ room_id: 'room-one', winner: 'p0' }],
    [{ room_id: 'room-one', winner: '' }],
    [{ room_id: 'room-one', winner: 'not-a-tank' }],
    null,
  ]) {
    const rooms = ['room-one']
    const { payload } = await expectResponse(
      {
        queries: [
          participantQuery([{ room_id: rooms[0], tank_id: 'p1' }]),
          scoreQuery(rooms, scores),
        ],
      },
      500,
    )
    assertEquals(payload, { error: 'summary_unavailable' })
  }
})

Deno.test('handleAccountSummary fails closed on malformed or duplicate participant links (catches invalid aggregate inputs)', async () => {
  for (const participants of [
    null,
    [{ room_id: '', tank_id: 'p1' }],
    [{ room_id: 'room-one', tank_id: 'not-a-tank' }],
    [{ room_id: 'room-one', tank_id: 'p1' }, { room_id: 'room-one', tank_id: 'p2' }],
  ]) {
    const { payload } = await expectResponse({ queries: [participantQuery(participants)] }, 500)
    assertEquals(payload, { error: 'summary_unavailable' })
  }
})

Deno.test('handleAccountSummary fails closed when exact participant count exceeds returned rows (catches any PostgREST truncation limit)', async () => {
  const rooms = ['room-one']
  const { fixture, payload } = await expectResponse(
    {
      queries: [
        participantQuery(
          [{ room_id: rooms[0], tank_id: 'p1' }],
          null,
          2,
          true,
        ),
      ],
    },
    500,
  )
  assertEquals(payload, { error: 'summary_unavailable' })
  assertEquals(fixture.queryCount(), 1)
})

Deno.test('handleAccountSummary batches realistic room UUID score filters and aggregates exactly across batches (catches hosted URL overflow)', async () => {
  const roomIds = Array.from({ length: 405 }, (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
  )
  const participants = roomIds.map((room_id) => ({ room_id, tank_id: 'p1' }))
  const roomIdBatches = [roomIds.slice(0, 200), roomIds.slice(200, 400), roomIds.slice(400)]
  const scoreBatches = roomIdBatches.map((batch) => batch.map((room_id, index) => ({
    room_id,
    winner: index === 0 ? 'p1' : index === 1 ? null : 'p2',
  })))
  const { payload } = await expectResponse(
    {
      queries: [
        participantQuery(participants),
        scoreQuery(roomIdBatches[0], scoreBatches[0]),
        scoreQuery(roomIdBatches[1], scoreBatches[1]),
        scoreQuery(roomIdBatches[2], scoreBatches[2]),
      ],
    },
    200,
  )
  assertEquals(payload, {
    matchesPlayed: 405,
    wins: 3,
    progressionVersion: 1,
    totalXp: 40800,
    level: 82,
    levelXp: 300,
    nextLevelXp: 500,
  })
})

Deno.test('handleAccountSummary fails generically when a later bounded score batch errors (catches partial aggregate success)', async () => {
  const roomIds = Array.from({ length: 201 }, (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
  )
  const participants = roomIds.map((room_id) => ({ room_id, tank_id: 'p1' }))
  const firstBatch = roomIds.slice(0, 200)
  const secondBatch = roomIds.slice(200)
  const { fixture, payload } = await expectResponse(
    {
      queries: [
        participantQuery(participants),
        scoreQuery(firstBatch, firstBatch.map((room_id) => ({ room_id, winner: 'p1' }))),
        scoreQuery(secondBatch, null, { message: 'later score batch down' }),
      ],
    },
    500,
  )
  assertEquals(payload, { error: 'summary_unavailable' })
  assertEquals(fixture.logs, [{
    message: 'account_summary: score query failed',
    context: { stage: 'scores', error: 'query_failed' },
  }])
})
