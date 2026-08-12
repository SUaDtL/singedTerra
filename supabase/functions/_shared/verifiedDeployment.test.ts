import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  createVerifiedRequestHandler,
  normalizeVerifiedDisplayName,
  parseVerifiedDeploymentCompletion,
  projectVerifiedDeploymentReceipt,
  readBoundedJson,
  VERIFIED_DEPLOYMENT_OPTIONS,
  VERIFIED_DEPLOYMENT_SEEDS,
} from './verifiedDeployment.ts'

Deno.test('completion contract accepts only canonical human evidence and projects an exact private receipt', () => {
  const sessionId = '22222222-2222-4222-8222-222222222222'
  const transcript = [{ angle: 90, power: 100 }]
  assertEquals(parseVerifiedDeploymentCompletion({ sessionId, transcript }), { sessionId, transcript })
  for (const value of [
    undefined,
    { sessionId },
    { transcript },
    { sessionId, transcript, cpu: [] },
    { sessionId: 'bad', transcript },
    { sessionId, transcript: [] },
    { sessionId, transcript: [{ angle: 90, power: 100, result: 'win' }] },
    { sessionId, transcript: [{ angle: 90.5, power: 100 }] },
  ]) assertEquals(parseVerifiedDeploymentCompletion(value), null)
  assertEquals(projectVerifiedDeploymentReceipt({ sessionId, won: true, outcome: 'win', verifiedXp: 200 }, { matchesPlayed: 1, wins: 1, totalXp: 200 }), {
    result: { sessionId, won: true, outcome: 'win', verifiedXp: 200 },
    progression: {
      evidence: 'verified_replay_v1',
      prior: { matchesPlayed: 0, wins: 0, totalXp: 0 },
      current: { matchesPlayed: 1, wins: 1, totalXp: 200 },
    },
  })
  assertEquals(projectVerifiedDeploymentReceipt({ sessionId, won: true, outcome: 'draw', verifiedXp: 200 }, { matchesPlayed: 1, wins: 1, totalXp: 200 }), null)
  assertEquals(projectVerifiedDeploymentReceipt({ sessionId, won: false, outcome: 'loss', verifiedXp: 100 }, { matchesPlayed: 0, wins: 0, totalXp: 100 }), null)
})

function bytes(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close() } })
}

Deno.test('verified contract pins server-owned seeds, options, and display normalization', () => {
  assertEquals(VERIFIED_DEPLOYMENT_SEEDS, [17, 42, 73, 109])
  assertEquals(VERIFIED_DEPLOYMENT_OPTIONS, {
    maxPlayers: 2, maxWind: 6, gravity: 0.15, walls: 'open', hazards: 'none',
    rounds: 1, interestRate: 0, suddenDeathTurn: 0, armsLevel: 0,
    starterWeaponFalloff: 'decisive', teamMode: false,
  })
  assertEquals(normalizeVerifiedDisplayName('  Ash   Walker\n'), 'Ash Walker')
  assertEquals(normalizeVerifiedDisplayName('   '), 'Commander')
  assertEquals(normalizeVerifiedDisplayName('x'.repeat(30)), 'x'.repeat(24))
  assertEquals(normalizeVerifiedDisplayName('x'.repeat(23) + '🔥tail'), 'x'.repeat(23) + '🔥')
})

Deno.test('bounded JSON counts UTF-8 bytes, ignores empty chunks, and rejects overflow or fatal UTF-8', async () => {
  const unicode = '{"x":"🔥"}'
  assertEquals(await readBoundedJson(bytes(unicode), new TextEncoder().encode(unicode).length), { x: '🔥' })
  const emptyThenValue = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array()); c.enqueue(new TextEncoder().encode('{}')); c.close() } })
  assertEquals(await readBoundedJson(emptyThenValue, 2), {})
  await assertRejects(() => readBoundedJson(bytes('{} '), 2), Error, 'invalid_body')
  await assertRejects(() => readBoundedJson(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0xff])); c.close() } }), 8), Error, 'invalid_body')
  await assertRejects(() => readBoundedJson(bytes('{bad'), 16), Error, 'invalid_body')
})

Deno.test('bounded JSON rejects lying Content-Length and settles stalled reads/cancellation', async () => {
  const lying = new Request('https://x.test', { method: 'POST', headers: { 'content-length': '2' }, body: bytes('{} ') })
  await assertRejects(() => readBoundedJson(lying.body, 2), Error, 'invalid_body')
  const stalled = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined), cancel: () => new Promise(() => undefined) })
  const started = Date.now()
  await assertRejects(() => readBoundedJson(stalled, 8, { readTimeoutMs: 20, cancelTimeoutMs: 10 }), Error, 'invalid_body')
  assertEquals(Date.now() - started < 150, true)
})

Deno.test('verified wrapper orders IP, Auth, account limiter, body, handler and shares account bucket across IPs', async () => {
  const events: string[] = []
  const buckets: string[] = []
  const handler = createVerifiedRequestHandler(async (_body, _req, userId) => {
    events.push(`handler:${userId}`)
    return new Response('{}')
  }, { operation: 'abandon_verified_deployment', bodyLimit: 128 }, {
    bumpRateLimit: async (bucket) => { buckets.push(bucket); events.push(bucket.startsWith('verified_account:') ? 'account' : 'ip'); return { data: 1, error: null } },
    authenticate: async () => { events.push('auth'); return 'user-7' },
    readJson: async () => { events.push('body'); return { sessionId: 'x' } },
    now: () => 60_000,
  })
  for (const ip of ['1.1.1.1', '2.2.2.2']) {
    const response = await handler(new Request('https://x.test', { method: 'POST', headers: { authorization: 'Bearer token', 'x-real-ip': ip }, body: '{}' }))
    assertEquals(response.status, 200)
  }
  assertEquals(events, ['ip', 'auth', 'account', 'body', 'handler:user-7', 'ip', 'auth', 'account', 'body', 'handler:user-7'])
  assertEquals(buckets.filter((b) => b.startsWith('verified_account:')), ['verified_account:abandon_verified_deployment:user-7', 'verified_account:abandon_verified_deployment:user-7'])
})

Deno.test('verified wrapper handles OPTIONS/non-POST without Auth and fails closed before body on account limiter trouble', async () => {
  let auth = 0, body = 0, handlerCalls = 0
  const dependencies = {
    bumpRateLimit: async (bucket: string) => bucket.startsWith('verified_account:') ? { data: null, error: { message: 'db secret' } } : { data: 1, error: null },
    authenticate: async () => { auth += 1; return 'user-private' },
    readJson: async () => { body += 1; return {} },
    logger: (_message: string, context: Record<string, unknown>) => assertEquals(JSON.stringify(context).includes('user-private'), false),
  }
  const wrapped = createVerifiedRequestHandler(() => { handlerCalls += 1; return new Response('{}') }, { operation: 'abandon_verified_deployment', bodyLimit: 128 }, dependencies)
  assertEquals((await wrapped(new Request('https://x.test', { method: 'OPTIONS' }))).status, 200)
  assertEquals((await wrapped(new Request('https://x.test', { method: 'GET' }))).status, 405)
  assertEquals(auth, 0)
  const denied = await wrapped(new Request('https://x.test', { method: 'POST', headers: { authorization: 'Bearer token' }, body: '{}' }))
  assertEquals(denied.status, 503)
  assertEquals(await denied.json(), { error: 'verified_deployment_unavailable' })
  assertEquals([auth, body, handlerCalls], [1, 0, 0])
})

Deno.test('verified wrapper rejects missing/duplicate/rejected Bearer and over-limit account before body', async () => {
  let body = 0
  const wrapped = createVerifiedRequestHandler(() => new Response('{}'), { operation: 'abandon_verified_deployment', bodyLimit: 128 }, {
    bumpRateLimit: async (bucket) => ({ data: bucket.startsWith('verified_account:') ? 11 : 1, error: null }),
    authenticate: async (req) => req.headers.get('authorization') === 'Bearer accepted' ? 'user-1' : null,
    readJson: async () => { body += 1; return {} },
  })
  for (const authorization of ['', 'Basic x', 'Bearer one, Bearer two', 'Bearer rejected']) {
    const response = await wrapped(new Request('https://x.test', { method: 'POST', headers: authorization ? { authorization } : {}, body: '{}' }))
    assertEquals(response.status, 401)
  }
  const limited = await wrapped(new Request('https://x.test', { method: 'POST', headers: { authorization: 'Bearer accepted' }, body: '{}' }))
  assertEquals(limited.status, 429)
  assertEquals(body, 0)
})

Deno.test('verified wrapper contains thrown Auth and never reads or handles the body', async () => {
  let body = 0, handled = 0
  const wrapped = createVerifiedRequestHandler(() => { handled += 1; return new Response('{}') }, { operation: 'abandon_verified_deployment', bodyLimit: 128 }, {
    bumpRateLimit: async () => ({ data: 1, error: null }),
    authenticate: async () => { throw new Error('token-private auth failure') },
    readJson: async () => { body += 1; return {} },
  })
  const response = await wrapped(new Request('https://x.test', { method: 'POST', headers: { authorization: 'Bearer private-token' }, body: '{}' }))
  assertEquals(response.status, 401)
  assertEquals(await response.json(), { error: 'unauthorized' })
  assertEquals([body, handled], [0, 0])
})

Deno.test('verified wrapper enforces exact coarse 30/min and exact 128-byte streamed body boundary', async () => {
  let ipCount = 30
  const wrapped = createVerifiedRequestHandler((body) => new Response(JSON.stringify(body)), { operation: 'abandon_verified_deployment', bodyLimit: 128 }, {
    bumpRateLimit: async (bucket) => ({ data: bucket.startsWith('verified_account:') ? 1 : ipCount, error: null }),
    authenticate: async () => 'user-1',
  })
  const exact = '{"sessionId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}' + ' '.repeat(128 - 52)
  assertEquals(new TextEncoder().encode(exact).length, 128)
  assertEquals((await wrapped(new Request('https://x.test', { method: 'POST', headers: { authorization: 'Bearer t' }, body: exact }))).status, 200)
  const overflow = exact + ' '
  assertEquals((await wrapped(new Request('https://x.test', { method: 'POST', headers: { authorization: 'Bearer t' }, body: overflow }))).status, 400)
  ipCount = 31
  assertEquals((await wrapped(new Request('https://x.test', { method: 'POST', headers: { authorization: 'Bearer t' }, body: exact }))).status, 429)
})

Deno.test('verified wrapper bounds cancellation when a limiter rejects a stalled request body', async () => {
  let handled = 0
  const wrapped = createVerifiedRequestHandler(() => { handled += 1; return new Response('{}') }, { operation: 'abandon_verified_deployment', bodyLimit: 128 }, {
    bumpRateLimit: async () => ({ data: 31, error: null }),
  })
  const body = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined), cancel: () => new Promise(() => undefined) })
  const started = Date.now()
  const response = await wrapped(new Request('https://x.test', { method: 'POST', body }))
  assertEquals(response.status, 429)
  assertEquals(Date.now() - started < 500, true)
  assertEquals(handled, 0)
})

Deno.test('verified wrapper rejects truthful oversized Content-Length before body reading', async () => {
  let auth = 0, account = 0, body = 0
  const wrapped = createVerifiedRequestHandler(() => new Response('{}'), { operation: 'abandon_verified_deployment', bodyLimit: 128 }, {
    bumpRateLimit: async (bucket) => { if (bucket.startsWith('verified_account:')) account += 1; return { data: 1, error: null } },
    authenticate: async () => { auth += 1; return 'user-1' },
    readJson: async () => { body += 1; return {} },
  })
  const response = await wrapped(new Request('https://x.test', { method: 'POST', headers: { authorization: 'Bearer t', 'content-length': '129' }, body: '{}' }))
  assertEquals(response.status, 400)
  assertEquals([auth, account, body], [1, 1, 0])
})

Deno.test('verified wrapper pins independent IP 30/min and account 10/min inclusive thresholds', async () => {
  for (const [ipCount, accountCount, expected] of [[30, 10, 200], [31, 1, 429], [1, 11, 429]] as const) {
    let body = 0
    const wrapped = createVerifiedRequestHandler(() => new Response('{}', { status: 200 }), { operation: 'abandon_verified_deployment', bodyLimit: 128 }, {
      bumpRateLimit: async (bucket) => ({ data: bucket.startsWith('verified_account:') ? accountCount : ipCount, error: null }),
      authenticate: async () => 'user-1',
      readJson: async () => { body += 1; return {} },
    })
    const response = await wrapped(new Request('https://x.test', { method: 'POST', headers: { authorization: 'Bearer t' }, body: '{}' }))
    assertEquals(response.status, expected)
    assertEquals(body, expected === 200 ? 1 : 0)
  }
})

Deno.test('account-limit rejection cancels before body read and safe logs omit token, user, and raw storage errors', async () => {
  let cancelled = false, read = 0
  const logs: unknown[] = []
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true } })
  const wrapped = createVerifiedRequestHandler(() => new Response('{}'), { operation: 'abandon_verified_deployment', bodyLimit: 128 }, {
    bumpRateLimit: async (bucket) => bucket.startsWith('verified_account:')
      ? { data: null, error: { message: 'raw-db user-private private-token' } }
      : { data: 1, error: null },
    authenticate: async () => 'user-private',
    readJson: async () => { read += 1; return {} },
    logger: (message, context) => logs.push([message, context]),
  })
  const response = await wrapped(new Request('https://x.test', { method: 'POST', headers: { authorization: 'Bearer private-token' }, body }))
  assertEquals(response.status, 503)
  assertEquals([cancelled, read], [true, 0])
  const serialized = JSON.stringify(logs)
  for (const forbidden of ['user-private', 'private-token', 'raw-db']) assertEquals(serialized.includes(forbidden), false)
})

Deno.test('start no-body mode accepts an absent body and rejects every unknown body key only after both limits', async () => {
  const events: string[] = []
  const wrapped = createVerifiedRequestHandler(() => { events.push('handler'); return new Response('{}') }, { operation: 'start_verified_deployment', bodyLimit: 0 }, {
    bumpRateLimit: async (bucket) => { events.push(bucket.startsWith('verified_account:') ? 'account' : 'ip'); return { data: 1, error: null } },
    authenticate: async () => { events.push('auth'); return 'user-1' },
  })
  const headers = { authorization: 'Bearer t' }
  assertEquals((await wrapped(new Request('https://x.test', { method: 'POST', headers }))).status, 200)
  assertEquals(events, ['ip', 'auth', 'account', 'handler'])
  events.length = 0
  assertEquals((await wrapped(new Request('https://x.test', { method: 'POST', headers, body: '{"seed":17}' }))).status, 400)
  assertEquals(events, ['ip', 'auth', 'account'])
})
