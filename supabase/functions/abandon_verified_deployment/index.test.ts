import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createAbandonVerifiedDeploymentHandler, handleAbandonVerifiedDeployment } from './index.ts'

const userId = '11111111-1111-4111-8111-111111111111'
const sessionUpper = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'

Deno.test('abandon accepts only exact sessionId, lowercases it, derives owner, and returns exact projection', async () => {
  const calls: unknown[] = []
  const supabase = { rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: [{ id: sessionUpper.toLowerCase(), user_id: userId, status: 'abandoned' }], error: null } } }
  const response = await handleAbandonVerifiedDeployment({ sessionId: sessionUpper }, new Request('https://x.test'), userId, { supabase: supabase as never })
  assertEquals(calls, [['abandon_verified_deployment', { p_user_id: userId, p_session_id: sessionUpper.toLowerCase() }]])
  assertEquals(await response.json(), { ok: true, sessionId: sessionUpper.toLowerCase(), status: 'abandoned' })
})

Deno.test('abandon rejects missing, extra, malformed, foreign/completed, and storage failures generically', async () => {
  const invalid = [null, {}, { sessionId: sessionUpper, userId }, { sessionId: 'bad' }]
  for (const body of invalid) {
    const response = await handleAbandonVerifiedDeployment(body, new Request('https://x.test'), userId, { supabase: { rpc: () => { throw new Error('must not call') } } as never })
    assertEquals(response.status, 400)
  }
  for (const result of [
    { data: null, error: { message: 'verified_deployment_not_found' } },
    { data: [{ id: sessionUpper.toLowerCase(), status: 'completed' }], error: null },
    { data: null, error: { message: 'private raw db failure' } },
  ]) {
    const response = await handleAbandonVerifiedDeployment({ sessionId: sessionUpper }, new Request('https://x.test'), userId, { supabase: { rpc: async () => result } as never })
    assertEquals(response.status >= 400, true)
    assertEquals(JSON.stringify(await response.json()).includes('private'), false)
  }
})

Deno.test('abandon rejects missing, malformed, or foreign RPC ownership without returning or logging identifiers', async () => {
  for (const returnedOwner of [undefined, 7, '33333333-3333-4333-8333-333333333333']) {
    const logs: unknown[] = []
    const result = { data: [{ id: sessionUpper.toLowerCase(), user_id: returnedOwner, status: 'abandoned' }], error: null }
    const response = await handleAbandonVerifiedDeployment({ sessionId: sessionUpper }, new Request('https://x.test'), userId, {
      supabase: { rpc: async () => result } as never,
      logger: (message, context) => logs.push([message, context]),
    })
    assertEquals(response.status, 409)
    const serializedResponse = JSON.stringify(await response.json())
    const serializedLogs = JSON.stringify(logs)
    for (const forbidden of [userId, sessionUpper.toLowerCase(), String(returnedOwner)]) {
      assertEquals(serializedResponse.includes(forbidden), false)
      assertEquals(serializedLogs.includes(forbidden), false)
    }
  }
})

Deno.test('abandon wrapper pins the exact 128-byte bounded body contract', () => {
  const calls: unknown[][] = []
  const sentinel = async () => new Response('sentinel')
  const created = createAbandonVerifiedDeploymentHandler(((...args: unknown[]) => { calls.push(args); return sentinel }) as never)
  assertEquals(created, sentinel)
  assertEquals(calls[0]?.[1], { operation: 'abandon_verified_deployment', bodyLimit: 128 })
})
