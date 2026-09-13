import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { challengeJson, createChallengeRequestHandler, type ChallengeOperation } from './verifiedChallenge.ts'
const accountId = '11111111-1111-4111-8111-111111111111'
const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' }
const body = JSON.stringify({ trialId: 'crosswind-qualification', supportedDescriptorVersions: [1] })
const operations: ChallengeOperation[] = ['start_verified_challenge', 'complete_verified_challenge',
  'get_verified_challenge', 'abandon_verified_challenge', 'verified_career_summary']
function request(payload: string | Uint8Array<ArrayBuffer> = body, customHeaders: Record<string, string> = headers) {
  return new Request('https://example.test', { method: 'POST', headers: customHeaders, body: payload })
}
Deno.test('challenge transport authenticates and checks both limits before bounded parsing', async () => {
  const calls: string[] = []
  const handler = createChallengeRequestHandler(async (data, _, owner) => {
    calls.push('handler'); assertEquals(owner, accountId); assertEquals(data, JSON.parse(body)); return challengeJson({ ok: true })
  }, 'start_verified_challenge', 256, {
    authenticate: () => { calls.push('auth'); return Promise.resolve(accountId) },
    bumpRateLimit: (bucket) => { calls.push(bucket.includes(accountId) ? 'account' : 'ip'); return Promise.resolve({ data: 1, error: null }) },
  })
  const response = await handler(request())
  assertEquals(await response.json(), { responseVersion: 1, ok: true })
  assertEquals(calls, ['ip', 'auth', 'account', 'handler'])
})
Deno.test('challenge transport refuses auth, rate, content type, forged length and malformed UTF8 without handler calls', async () => {
  const cases = [
    { req: request(body, { 'content-type': 'application/json' }), status: 401 },
    { req: request(body, { ...headers, 'content-type': 'text/plain' }), status: 400 },
    { req: request(body, { ...headers, 'content-length': '257' }), status: 400 },
    { req: request(body, { ...headers, 'content-length': 'abc' }), status: 400 },
    { req: request(' '.repeat(257)), status: 400 },
    { req: request(new Uint8Array([0x22, 0xc3, 0x28, 0x22])), status: 400 },
    { req: request(), status: 401, owner: null },
    { req: request(), status: 503, rateError: true },
    { req: request(), status: 429, rate: 31 },
    { req: request(), status: 429, rate: 11 },
  ]
  let called = 0
  for (const entry of cases) {
    const handler = createChallengeRequestHandler(async () => { called++; return challengeJson({ ok: true }) }, 'start_verified_challenge', 256, {
      authenticate: () => Promise.resolve('owner' in entry ? entry.owner! : accountId),
      bumpRateLimit: () => Promise.resolve({ data: entry.rate ?? 1, error: entry.rateError ? { message: 'private' } : null }),
    })
    const response = await handler(entry.req)
    assertEquals(response.status, entry.status)
    const output = await response.json(); assertEquals(output.responseVersion, 1); assertEquals(JSON.stringify(output).includes('private'), false)
  }
  assertEquals(called, 0)
})
Deno.test('challenge transport enforces actual bytes at256 and2048, independent of content-length', async () => {
  for (const limit of [256, 2048] as const) {
    let called = 0
    const handler = createChallengeRequestHandler(async () => { called++; return challengeJson({ ok: true }) }, 'complete_verified_challenge', limit, {
      authenticate: () => Promise.resolve(accountId), bumpRateLimit: () => Promise.resolve({ data: 1, error: null }),
    })
    assertEquals((await handler(request(' '.repeat(limit - 2) + '{}'))).status, 200)
    assertEquals((await handler(request(' '.repeat(limit - 1) + '{}', { ...headers, 'content-length': '1' }))).status, 400)
    assertEquals(called, 1)
  }
})

Deno.test('challenge-wide IP and account ceilings cannot be multiplied by rotating operations', async () => {
  for (const authenticated of [true, false]) {
    const counts = new Map<string, number>()
    const handlers = operations.map((operation) => createChallengeRequestHandler(
      async () => challengeJson({ ok: true }), operation, 256, {
        authenticate: () => Promise.resolve(accountId),
        bumpRateLimit: (bucket) => {
          const count = (counts.get(bucket) ?? 0) + 1
          counts.set(bucket, count)
          return Promise.resolve({ data: count, error: null })
        },
      },
    ))
    const ceiling = authenticated ? 10 : 30
    for (let attempt = 0; attempt <= ceiling; attempt++) {
      const response = await handlers[attempt % handlers.length](request(body,
        authenticated ? headers : { 'content-type': 'application/json' }))
      assertEquals(response.status, attempt === ceiling ? 429 : authenticated ? 200 : 401)
    }
  }
})
