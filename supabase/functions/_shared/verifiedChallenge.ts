import { authenticateBearer, clientIp, corsHeaders, getServiceClient, json, rateWindow, UUID_REGEX } from './mod.ts'
import { readBoundedJson } from './verifiedDeployment.ts'
export type ChallengeOperation = 'start_verified_challenge' | 'complete_verified_challenge' | 'get_verified_challenge' | 'abandon_verified_challenge' | 'verified_career_summary'
export interface ChallengeRequestDependencies {
  authenticate?: (req: Request) => Promise<string | null>
  bumpRateLimit?: (bucket: string, window: number) => PromiseLike<{ data: unknown; error: unknown }>
}
export function challengeJson(value: Record<string, unknown>, status = 200): Response {
  return json({ ...value, responseVersion: 1 }, status)
}
export function challengeRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}
function discardBody(req: Request): void {
  // Cancellation is best effort and cannot hold an auth/rate rejection open.
  try { void req.body?.cancel().catch(() => undefined) } catch { /* already locked */ }
}
export function createChallengeRequestHandler(
  handler: (body: unknown, req: Request, accountId: string) => Promise<Response>,
  _operation: ChallengeOperation, limit: 128 | 256 | 2048,
  dependencies: ChallengeRequestDependencies = {},
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    const fail = (error: string, status: number) => { discardBody(req); return challengeJson({ error }, status) }
    if (req.method !== 'POST') return fail('method_not_allowed', 405)
    const bump = dependencies.bumpRateLimit ?? ((bucket, window) => getServiceClient().rpc('bump_rate_limit', { p_bucket: bucket, p_window: window }))
    const window = rateWindow(Date.now())
    const rate = async (bucket: string, ceiling: number): Promise<Response | null> => {
      try {
        const result = await bump(bucket, window)
        if (result.error || !Number.isSafeInteger(result.data) || (result.data as number) < 1)
          return fail('verification_unavailable', 503)
        return (result.data as number) > ceiling ? fail('rate_limited', 429) : null
      } catch { return fail('verification_unavailable', 503) }
    }
    const ipFailure = await rate(`verified_challenge_ip:${clientIp(req) || 'unknown'}`, 30)
    if (ipFailure) return ipFailure
    if (!/^Bearer [^\s]+$/.test(req.headers.get('authorization') ?? '')) return fail('unauthorized', 401)
    let accountId: string | null
    try { accountId = await (dependencies.authenticate ?? ((request) => authenticateBearer(request, getServiceClient())))(req) }
    catch { accountId = null }
    if (!accountId || !UUID_REGEX.test(accountId)) return fail('unauthorized', 401)
    accountId = accountId.toLowerCase()
    const accountFailure = await rate(`verified_challenge_account:${accountId}`, 10)
    if (accountFailure) return accountFailure
    if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers.get('content-type') ?? '')) return fail('invalid_request', 400)
    const length = req.headers.get('content-length')
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) return fail('invalid_request', 400)
    let body: unknown
    try { body = await readBoundedJson(req.body, limit) }
    catch { return fail('invalid_request', 400) }
    try { return await handler(body, req, accountId) }
    catch { return challengeJson({ error: 'verification_unavailable' }, 503) }
  }
}
