import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  handleRecordHotSeatMatch,
  type RecordHotSeatMatchDependencies,
} from './index.ts'

const MATCH_ID = '00000000-0000-4000-8000-000000000061'
const CANONICAL_LETTERED_MATCH_ID = 'abcdefab-cdef-4abc-8abc-abcdefabcdef'
const UPPERCASE_MATCH_ID = CANONICAL_LETTERED_MATCH_ID.toUpperCase()
const USER_ID = '00000000-0000-4000-8000-000000000062'
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000063'
const JWT = 'account-bearer-secret'
const DUPLICATE = { code: '23505', message: 'duplicate key' }

type FakeError = { message: string; code?: string }
type QueryResult = { data: unknown; error: FakeError | null }
type QueryExpectation = {
  operation: 'maybeSingle' | 'insert'
  filters?: Array<[string, unknown]>
  inserted?: Record<string, unknown>
  result: QueryResult
}

function existing(
  data: unknown = null,
  error: FakeError | null = null,
  matchId = MATCH_ID,
): QueryExpectation {
  return {
    operation: 'maybeSingle',
    filters: [['user_id', USER_ID], ['match_id', matchId]],
    result: { data, error },
  }
}

function insert(error: FakeError | null = null, matchId = MATCH_ID): QueryExpectation {
  return {
    operation: 'insert',
    inserted: { user_id: USER_ID, match_id: matchId, won: true },
    result: { data: null, error },
  }
}

function fixture(
  queries: QueryExpectation[] = [],
  auth: { userId?: string | null; error?: FakeError | null } = {},
) {
  const authTokens: string[] = []
  const inserts: Record<string, unknown>[] = []
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []
  let queryIndex = 0
  const supabase = {
    auth: {
      getUser: async (token: string) => {
        authTokens.push(token)
        return {
          data: { user: auth.userId === null ? null : { id: auth.userId ?? USER_ID } },
          error: auth.error ?? null,
        }
      },
    },
    from: (table: string) => {
      assertEquals(table, 'hotseat_match_results')
      const expected = queries[queryIndex]
      if (!expected) throw new Error('unexpected hot-seat result query')
      let filterIndex = 0
      const query = {
        eq(field: string, value: unknown) {
          assertEquals([field, value], expected.filters?.[filterIndex])
          filterIndex += 1
          return query
        },
        async maybeSingle() {
          assertEquals(expected.operation, 'maybeSingle')
          assertEquals(filterIndex, expected.filters?.length ?? 0)
          queryIndex += 1
          return expected.result
        },
      }
      return {
        select(columns: string) {
          assertEquals(columns, 'user_id, match_id, won')
          return query
        },
        async insertRow(row: Record<string, unknown>) {
          assertEquals(expected.operation, 'insert')
          assertEquals(row, expected.inserted)
          inserts.push(row)
          queryIndex += 1
          return expected.result
        },
        async insert(row: Record<string, unknown>) {
          return this.insertRow(row)
        },
      }
    },
  }
  const dependencies: RecordHotSeatMatchDependencies = {
    supabase: supabase as never,
    logger: (message: string, context: Record<string, unknown>) => logs.push({ message, context }),
  }
  return {
    dependencies,
    authTokens,
    inserts,
    logs,
    assertConsumed: () => assertEquals(queryIndex, queries.length),
  }
}

function request(authorization = `Bearer ${JWT}`): Request {
  return new Request('https://example.test/record_hotseat_match', {
    headers: authorization ? { authorization } : {},
  })
}

async function invoke(
  body: unknown,
  queries: QueryExpectation[] = [],
  auth: { userId?: string | null; error?: FakeError | null } = {},
  authorization?: string,
) {
  const test = fixture(queries, auth)
  const response = await handleRecordHotSeatMatch(
    body,
    request(authorization),
    test.dependencies,
  )
  test.assertConsumed()
  return { test, response, payload: await response.json() }
}

Deno.test('recordHotSeatMatch requires the exact bounded body before authentication', async () => {
  const invalid = [
    null,
    {},
    { matchId: 'bad', won: true },
    { matchId: MATCH_ID, won: 'yes' },
    { matchId: MATCH_ID, won: true, userId: OTHER_USER_ID },
    { matchId: MATCH_ID, won: true, xp: 999999 },
  ]
  for (const body of invalid) {
    const { test, response, payload } = await invoke(body)
    assertEquals(response.status, 400)
    assertEquals(payload, { error: 'invalid_hotseat_match' })
    assertEquals(test.authTokens, [])
  }
})

Deno.test('recordHotSeatMatch requires a Supabase-validated bearer', async () => {
  for (const authorization of ['', 'Basic token', 'Bearer two tokens']) {
    const { test, response, payload } = await invoke({ matchId: MATCH_ID, won: true }, [], {}, authorization)
    assertEquals(response.status, 401)
    assertEquals(payload, { error: 'unauthorized' })
    assertEquals(test.authTokens, [])
  }
  const rejected = await invoke(
    { matchId: MATCH_ID, won: true },
    [],
    { userId: null, error: { message: 'rejected bearer secret' } },
  )
  assertEquals(rejected.response.status, 401)
  assertEquals(rejected.payload, { error: 'unauthorized' })
  assertEquals(rejected.test.authTokens, [JWT])
})

Deno.test('recordHotSeatMatch derives the user and inserts only match id plus boolean outcome', async () => {
  const { test, response, payload } = await invoke(
    { matchId: MATCH_ID, won: true },
    [existing(), insert()],
  )
  assertEquals(response.status, 200)
  assertEquals(payload, { ok: true, recorded: true })
  assertEquals(test.inserts, [{ user_id: USER_ID, match_id: MATCH_ID, won: true }])
})

Deno.test('recordHotSeatMatch treats exact replay as idempotent and changed outcome as conflict', async () => {
  const exact = await invoke(
    { matchId: MATCH_ID, won: true },
    [existing({ user_id: USER_ID, match_id: MATCH_ID, won: true })],
  )
  assertEquals(exact.response.status, 200)
  assertEquals(exact.payload, { ok: true, recorded: false })
  assertEquals(exact.test.inserts, [])

  const changed = await invoke(
    { matchId: MATCH_ID, won: true },
    [existing({ user_id: USER_ID, match_id: MATCH_ID, won: false })],
  )
  assertEquals(changed.response.status, 409)
  assertEquals(changed.payload, { error: 'hotseat_match_conflict' })
})

Deno.test('recordHotSeatMatch re-reads a uniqueness race and preserves idempotency', async () => {
  const { response, payload } = await invoke(
    { matchId: MATCH_ID, won: true },
    [existing(), insert(DUPLICATE), existing({ user_id: USER_ID, match_id: MATCH_ID, won: true })],
  )
  assertEquals(response.status, 200)
  assertEquals(payload, { ok: true, recorded: false })
})

Deno.test('recordHotSeatMatch fails closed when a uniqueness-race reread is conflicting, missing, or unavailable', async () => {
  const cases = [
    {
      reread: existing({ user_id: USER_ID, match_id: MATCH_ID, won: false }),
      status: 409,
      payload: { error: 'hotseat_match_conflict' },
    },
    {
      reread: existing(),
      status: 409,
      payload: { error: 'hotseat_match_conflict' },
    },
    {
      reread: existing(null, { message: 'race lookup unavailable' }),
      status: 500,
      payload: { error: 'hotseat_match_failed' },
    },
  ]
  for (const testCase of cases) {
    const { response, payload } = await invoke(
      { matchId: MATCH_ID, won: true },
      [existing(), insert(DUPLICATE), testCase.reread],
    )
    assertEquals(response.status, testCase.status)
    assertEquals(payload, testCase.payload)
  }
})

Deno.test('recordHotSeatMatch canonicalizes uppercase UUIDs for exact replay and uniqueness races', async () => {
  const exact = await invoke(
    { matchId: UPPERCASE_MATCH_ID, won: true },
    [existing({
      user_id: USER_ID,
      match_id: CANONICAL_LETTERED_MATCH_ID,
      won: true,
    }, null, CANONICAL_LETTERED_MATCH_ID)],
  )
  assertEquals(exact.response.status, 200)
  assertEquals(exact.payload, { ok: true, recorded: false })

  const raced = await invoke(
    { matchId: UPPERCASE_MATCH_ID, won: true },
    [
      existing(null, null, CANONICAL_LETTERED_MATCH_ID),
      insert(DUPLICATE, CANONICAL_LETTERED_MATCH_ID),
      existing({
        user_id: USER_ID,
        match_id: CANONICAL_LETTERED_MATCH_ID,
        won: true,
      }, null, CANONICAL_LETTERED_MATCH_ID),
    ],
  )
  assertEquals(raced.response.status, 200)
  assertEquals(raced.payload, { ok: true, recorded: false })
})

Deno.test('recordHotSeatMatch fails generically and never logs credentials', async () => {
  for (const queries of [
    [existing(null, { message: 'lookup failed with bearer secret' })],
    [existing(), insert({ message: 'insert failed with bearer secret' })],
  ]) {
    const { test, response, payload } = await invoke({ matchId: MATCH_ID, won: true }, queries)
    assertEquals(response.status, 500)
    assertEquals(payload, { error: 'hotseat_match_failed' })
    const rendered = JSON.stringify(test.logs)
    assertStringIncludes(rendered, MATCH_ID)
    assertEquals(rendered.includes(JWT), false)
  }
})
