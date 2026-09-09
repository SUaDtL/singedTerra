import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildVerifiedDeploymentConfig, createStartVerifiedDeploymentHandler, handleStartVerifiedDeployment, parseVerifiedStartCapabilities } from './index.ts'

const userId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'

function dependencies(rowOverrides: Record<string, unknown> = {}) {
  const calls: Array<{ name: string; args: unknown }> = []
  const supabase = {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { display_name: '  Ash   Walker ' }, error: null }) }) }) }),
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args })
      return { data: [{ id: sessionId, user_id: userId, config: buildVerifiedDeploymentConfig('Ash Walker', 17), contract_version: 2, engine_version: 2, ruleset_version: 4, status: 'active', expires_at: '2026-08-11T12:30:00.000Z', created_at: '2026-08-11T12:00:00.000Z', resumed: false, ...rowOverrides }], error: null }
    },
  }
  return { supabase, calls }
}

Deno.test('start constructs only the frozen server-owned config and exact RPC arguments', async () => {
  const test = dependencies()
  const response = await handleStartVerifiedDeployment(undefined, new Request('https://x.test'), userId, { supabase: test.supabase as never, chooseSeed: () => 17, now: () => new Date('2026-08-11T12:00:00.000Z') })
  assertEquals(response.status, 200)
  assertEquals(test.calls, [{ name: 'start_verified_deployment_for_contracts', args: { p_user_id: userId, p_config: buildVerifiedDeploymentConfig('Ash Walker', 17), p_expires_at: '2026-08-11T12:30:00.000Z', p_supported_contract_versions: [2] } }])
  assertEquals(await response.json(), {
    sessionId, resumed: false, expiresAt: '2026-08-11T12:30:00.000Z', contractVersion: 2, engineVersion: 2, rulesetVersion: 4,
    limits: { humanSalvos: 6, cpuSalvos: 6, angle: { min: 0, max: 180 }, power: { min: 0, max: 100 } },
    config: buildVerifiedDeploymentConfig('Ash Walker', 17),
  })
})

Deno.test('start consumes only authoritative resumed true even when config and expiry equal the same-millisecond request', async () => {
  const existing = buildVerifiedDeploymentConfig('Ash Walker', 109)
  const test = dependencies({ config: existing, resumed: true })
  const response = await handleStartVerifiedDeployment(undefined, new Request('https://x.test'), userId, { supabase: test.supabase as never, chooseSeed: () => 109, now: () => new Date('2026-08-11T12:00:00.000Z') })
  assertEquals((await response.json()).resumed, true)
  assertEquals((test.calls[0]!.args as { p_config: unknown }).p_config, buildVerifiedDeploymentConfig('Ash Walker', 109))
})

Deno.test('start refuses an RPC row that omits authoritative resumed', async () => {
  const test = dependencies({ resumed: undefined })
  const response = await handleStartVerifiedDeployment(undefined, new Request('https://x.test'), userId, { supabase: test.supabase as never, logger: () => undefined })
  assertEquals(response.status, 500)
})

Deno.test('start rejects missing, malformed, or foreign RPC ownership without returning or logging identifiers', async () => {
  for (const returnedOwner of [undefined, 7, '33333333-3333-4333-8333-333333333333']) {
    const logs: unknown[] = []
    const test = dependencies({ user_id: returnedOwner })
    const response = await handleStartVerifiedDeployment(undefined, new Request('https://x.test'), userId, {
      supabase: test.supabase as never,
      logger: (message, context) => logs.push([message, context]),
    })
    assertEquals(response.status, 500)
    const serializedResponse = JSON.stringify(await response.json())
    const serializedLogs = JSON.stringify(logs)
    for (const forbidden of [userId, sessionId, String(returnedOwner)]) {
      assertEquals(serializedResponse.includes(forbidden), false)
      assertEquals(serializedLogs.includes(forbidden), false)
    }
  }
})

Deno.test('start fails generically on profile, disabled-start, malformed row, or RPC failure without leaking identity', async () => {
  const logs: unknown[] = []
  for (const supabase of [
    { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: userId } }) }) }) }) },
    { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { display_name: 'Ash' }, error: null }) }) }) }), rpc: async () => ({ data: null, error: { message: 'verified_deployment_starts_disabled' } }) },
    { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { display_name: 'Ash' }, error: null }) }) }) }), rpc: async () => ({ data: [{ id: 'bad' }], error: null }) },
  ]) {
    const response = await handleStartVerifiedDeployment(undefined, new Request('https://x.test'), userId, { supabase: supabase as never, logger: (m, c) => logs.push([m, c]) })
    assertEquals(response.status >= 400, true)
    assertEquals(JSON.stringify(await response.json()).includes(userId), false)
  }
  assertEquals(JSON.stringify(logs).includes(userId), false)
})

Deno.test('start refuses a widened or request-influenced stored config instead of reflecting it', async () => {
  const widened = buildVerifiedDeploymentConfig('Ash Walker', 17) as Record<string, unknown>
  widened.userId = userId
  const test = dependencies({ config: widened })
  const response = await handleStartVerifiedDeployment(undefined, new Request('https://x.test'), userId, { supabase: test.supabase as never, chooseSeed: () => 17, now: () => new Date('2026-08-11T12:00:00.000Z'), logger: () => undefined })
  assertEquals(response.status, 500)
  assertEquals(JSON.stringify(await response.json()).includes(userId), false)
})

Deno.test('start wrapper accepts only bounded optional capability JSON after both limiters', async () => {
  const calls: unknown[][] = []
  const sentinel = async () => new Response('sentinel')
  const created = createStartVerifiedDeploymentHandler(((...args: unknown[]) => { calls.push(args); return sentinel }) as never)
  assertEquals(created, sentinel)
  assertEquals(calls[0]?.[1], { operation: 'start_verified_deployment', bodyLimit: 256, bodyMode: 'optional-json' })
})

Deno.test('start capabilities accept exact canonical tuples and reject malformed or ambiguous claims before storage', async () => {
  const v2 = { contractVersion: 2, engineVersion: 2, rulesetVersion: 4 } as const
  const v3 = { contractVersion: 3, engineVersion: 3, rulesetVersion: 4 } as const
  assertEquals(parseVerifiedStartCapabilities(undefined), [v2])
  assertEquals(parseVerifiedStartCapabilities({ capabilities: [v2, v3] }), [v2, v3])
  for (const body of [null, {}, [], { capabilities: [] }, { capabilities: [v2, v2] },
    { capabilities: [{ ...v3, contractVersion: 3.5 }] },
    { capabilities: [{ ...v3, engineVersion: 2 }] },
    { capabilities: [{ ...v3, rulesetVersion: 5 }] },
    { capabilities: [v2], seed: 17 }]) {
    assertEquals(parseVerifiedStartCapabilities(body), null)
    const test = dependencies()
    const response = await handleStartVerifiedDeployment(body, new Request('https://x.test'), userId, { supabase: test.supabase as never })
    assertEquals(response.status, 400)
    assertEquals(test.calls, [])
  }
})

Deno.test('start passes capable contracts and projects the exact persisted V3 tuple', async () => {
  const test = dependencies({ contract_version: 3, engine_version: 3, ruleset_version: 4 })
  const capabilities = [
    { contractVersion: 2, engineVersion: 2, rulesetVersion: 4 },
    { contractVersion: 3, engineVersion: 3, rulesetVersion: 4 },
  ]
  const response = await handleStartVerifiedDeployment({ capabilities }, new Request('https://x.test'), userId, {
    supabase: test.supabase as never, chooseSeed: () => 17, now: () => new Date('2026-08-11T12:00:00.000Z'),
  })
  assertEquals((test.calls[0]!.args as { p_supported_contract_versions: number[] }).p_supported_contract_versions, [2, 3])
  const body = await response.json()
  assertEquals([body.contractVersion, body.engineVersion, body.rulesetVersion], [3, 3, 4])
})

Deno.test('legacy empty start refuses a canonical V3 row outside its advertised capability', async () => {
  const test = dependencies({ contract_version: 3, engine_version: 3, ruleset_version: 4 })
  const response = await handleStartVerifiedDeployment(undefined, new Request('https://x.test'), userId, {
    supabase: test.supabase as never, logger: () => undefined,
  })
  assertEquals(response.status, 500)
})

Deno.test('start rejects request-owned seed or config values at the domain seam', async () => {
  const test = dependencies()
  const response = await handleStartVerifiedDeployment({ seed: 109, maxWind: 99 }, new Request('https://x.test'), userId, { supabase: test.supabase as never })
  assertEquals(response.status, 400)
  assertEquals(test.calls, [])
})
