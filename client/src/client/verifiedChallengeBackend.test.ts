import { afterEach, expect, it, vi } from 'vitest'
import { createVerifiedChallengeInvoker } from './verifiedChallengeBackend'
import { VerifiedChallengeTransport } from './verifiedChallenge'
const accountId = '11111111-1111-4111-8111-111111111111'
function fixture() {
  const invoke = vi.fn(async (_name: string, _options: unknown) => ({ data: null as unknown, error: null as unknown, response: undefined as Response | undefined }))
  const getSession = vi.fn(async () => ({ data: { session: { access_token: 'test-token', user: { id: accountId } } }, error: null }))
  return { client: { auth: { getSession }, functions: { invoke } }, invoke, getSession }
}
afterEach(() => vi.useRealTimers())
it('preserves the actual busy response and pins the authenticated account token', async () => {
  const f = fixture()
  f.invoke.mockResolvedValue({ data: null, error: new Error('http'), response: new Response(JSON.stringify({
    responseVersion: 1, error: 'verification_busy', retryAfter: 410,
  }), { status: 503, headers: { 'Retry-After': '410' } }) })
  const transport = new VerifiedChallengeTransport(createVerifiedChallengeInvoker(f.client, () => accountId))
  await expect(transport.complete('22222222-2222-4222-8222-222222222222', [{ angle: 32, power: 100 }]))
    .rejects.toMatchObject({ code: 'verification_busy', retryAfterSeconds: 410 })
  expect(f.invoke.mock.calls[0]?.[1]).toMatchObject({ headers: { Authorization: 'Bearer test-token' },
    body: { sessionId: '22222222-2222-4222-8222-222222222222', transcript: [{ angle: 32, power: 100 }] } })
})
it('refuses mismatched or changed accounts without applying a response', async () => {
  const f = fixture()
  await expect(createVerifiedChallengeInvoker(f.client, () => 'other')('get_verified_challenge', {}))
    .rejects.toMatchObject({ code: 'unauthorized' })
  expect(f.invoke).not.toHaveBeenCalled()
  let owner: string | null = accountId
  f.invoke.mockImplementation(async () => { owner = null; return { data: {}, error: null, response: undefined } })
  await expect(createVerifiedChallengeInvoker(f.client, () => owner)('get_verified_challenge', {}))
    .rejects.toMatchObject({ code: 'unauthorized' })
})
it('times out pending authentication without later dispatching a request', async () => {
  vi.useFakeTimers()
  const f = fixture()
  let release!: (value: Awaited<ReturnType<typeof f.getSession>>) => void
  f.getSession.mockImplementation(() => new Promise((resolve) => { release = resolve }))
  const pending = createVerifiedChallengeInvoker(f.client, () => accountId)('start_verified_challenge', {})
  const rejected = expect(pending).rejects.toMatchObject({ code: 'request_timeout' })
  await vi.advanceTimersByTimeAsync(5000); await rejected
  release({ data: { session: { access_token: 'test-token', user: { id: accountId } } }, error: null })
  await Promise.resolve(); expect(f.invoke).not.toHaveBeenCalled()
})
