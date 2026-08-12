import {
  authenticateBearer,
  clientIp,
  corsHeaders,
  getServiceClient,
  json,
  rateWindow,
  UUID_REGEX,
  type ServiceClient,
} from './mod.ts'

export const VERIFIED_DEPLOYMENT_SEEDS = [17, 42, 73, 109] as const
export const VERIFIED_DEPLOYMENT_OPTIONS = Object.freeze({
  maxPlayers: 2,
  maxWind: 6,
  gravity: 0.15,
  walls: 'open' as const,
  hazards: 'none' as const,
  rounds: 1,
  interestRate: 0,
  suddenDeathTurn: 0,
  armsLevel: 0,
  starterWeaponFalloff: 'decisive' as const,
  teamMode: false,
})

export const VERIFIED_CONTRACT_VERSION = 1 as const
export const VERIFIED_ENGINE_VERSION = 1 as const
export const VERIFIED_RULESET_VERSION = 3 as const
export const VERIFIED_ACCOUNT_LIMIT = 10
export const VERIFIED_IP_LIMIT = 30
export const VERIFIED_RATE_WINDOW_SECONDS = 60
export const VERIFIED_BODY_READ_TIMEOUT_MS = 2_000
export const VERIFIED_BODY_CANCEL_TIMEOUT_MS = 250

export type VerifiedOperation =
  | 'start_verified_deployment'
  | 'abandon_verified_deployment'
  | 'complete_verified_deployment'

export interface VerifiedRequestDependencies {
  bumpRateLimit?: (bucket: string, window: number) => Promise<{ data: unknown; error: unknown }>
  authenticate?: (req: Request) => Promise<string | null>
  readJson?: (body: ReadableStream<Uint8Array> | null, limit: number) => Promise<unknown>
  now?: () => number
  logger?: (message: string, context: Record<string, unknown>) => void
}

export interface VerifiedRequestOptions {
  operation: VerifiedOperation
  bodyLimit: 0 | 128 | 1024
}

export type VerifiedRequestHandler = (
  body: unknown,
  req: Request,
  userId: string,
) => Response | Promise<Response>

export class InvalidVerifiedBodyError extends Error {
  constructor() { super('invalid_body') }
}

async function settleWithin(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      promise.then(() => undefined, () => undefined),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  await settleWithin(reader.cancel(), VERIFIED_BODY_CANCEL_TIMEOUT_MS)
}

async function readBytes(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  options: { readTimeoutMs?: number; cancelTimeoutMs?: number } = {},
): Promise<Uint8Array> {
  if (body === null) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const deadline = Date.now() + (options.readTimeoutMs ?? VERIFIED_BODY_READ_TIMEOUT_MS)
  try {
    while (true) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new InvalidVerifiedBodyError()
      let timer: ReturnType<typeof setTimeout> | undefined
      const result = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new InvalidVerifiedBodyError()), remaining) }),
      ]).finally(() => { if (timer !== undefined) clearTimeout(timer) })
      if (result.done) break
      if (result.value.byteLength === 0) continue
      total += result.value.byteLength
      if (total > limit) throw new InvalidVerifiedBodyError()
      chunks.push(result.value)
    }
  } catch {
    await settleWithin(reader.cancel(), options.cancelTimeoutMs ?? VERIFIED_BODY_CANCEL_TIMEOUT_MS)
    throw new InvalidVerifiedBodyError()
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
  return joined
}

export async function readBoundedJson(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  options: { readTimeoutMs?: number; cancelTimeoutMs?: number } = {},
): Promise<unknown> {
  const raw = await readBytes(body, limit, options)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
  } catch {
    throw new InvalidVerifiedBodyError()
  }
}

async function defaultBump(bucket: string, window: number): Promise<{ data: unknown; error: unknown }> {
  return await getServiceClient().rpc('bump_rate_limit', { p_bucket: bucket, p_window: window })
}

function countAllowed(result: { data: unknown; error: unknown }, limit: number): boolean | null {
  if (result.error || !Number.isSafeInteger(result.data) || (result.data as number) < 1) return null
  return (result.data as number) <= limit
}

export function createVerifiedRequestHandler(
  handler: VerifiedRequestHandler,
  options: VerifiedRequestOptions,
  dependencies: VerifiedRequestDependencies = {},
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
    const bump = dependencies.bumpRateLimit ?? defaultBump
    const window = rateWindow((dependencies.now ?? Date.now)())
    const ipBucket = `${options.operation}:${clientIp(req) || 'unknown'}`
    try {
      const ipDecision = countAllowed(await bump(ipBucket, window), VERIFIED_IP_LIMIT)
      if (ipDecision === false) {
        if (req.body) await settleWithin(req.body.cancel(), VERIFIED_BODY_CANCEL_TIMEOUT_MS)
        return json({ error: 'Too many requests. Please slow down.' }, 429)
      }
      if (ipDecision === null) logger('verified_deployment: ip limiter fail-open', { operation: options.operation, code: 'limiter_unavailable' })
    } catch {
      logger('verified_deployment: ip limiter fail-open', { operation: options.operation, code: 'limiter_unavailable' })
    }

    if (!/^Bearer ([^\s]+)$/.test(req.headers.get('authorization') ?? '')) {
      if (req.body) await settleWithin(req.body.cancel(), VERIFIED_BODY_CANCEL_TIMEOUT_MS)
      return json({ error: 'unauthorized' }, 401)
    }
    const authenticate = dependencies.authenticate ?? (async (request) => authenticateBearer(request, getServiceClient()))
    let userId: string | null = null
    try {
      userId = await authenticate(req)
    } catch {
      userId = null
    }
    if (!userId) {
      if (req.body) await settleWithin(req.body.cancel(), VERIFIED_BODY_CANCEL_TIMEOUT_MS)
      return json({ error: 'unauthorized' }, 401)
    }

    try {
      const accountBucket = `verified_account:${options.operation}:${userId}`
      const accountDecision = countAllowed(await bump(accountBucket, window), VERIFIED_ACCOUNT_LIMIT)
      if (accountDecision === null) {
        logger('verified_deployment: account limiter unavailable', { operation: options.operation, code: 'limiter_unavailable' })
        if (req.body) await settleWithin(req.body.cancel(), VERIFIED_BODY_CANCEL_TIMEOUT_MS)
        return json({ error: 'verified_deployment_unavailable' }, 503)
      }
      if (!accountDecision) {
        if (req.body) await settleWithin(req.body.cancel(), VERIFIED_BODY_CANCEL_TIMEOUT_MS)
        return json({ error: 'Too many requests. Please slow down.' }, 429)
      }
    } catch {
      logger('verified_deployment: account limiter unavailable', { operation: options.operation, code: 'limiter_unavailable' })
      if (req.body) await settleWithin(req.body.cancel(), VERIFIED_BODY_CANCEL_TIMEOUT_MS)
      return json({ error: 'verified_deployment_unavailable' }, 503)
    }

    const contentLength = req.headers.get('content-length')
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > options.bodyLimit)) {
      if (req.body) await settleWithin(req.body.cancel(), VERIFIED_BODY_CANCEL_TIMEOUT_MS)
      return json({ error: 'invalid_request' }, 400)
    }
    let body: unknown = undefined
    try {
      if (options.bodyLimit === 0) {
        const raw = await readBytes(req.body, 0)
        if (raw.byteLength !== 0) return json({ error: 'invalid_request' }, 400)
      } else {
        body = await (dependencies.readJson ?? readBoundedJson)(req.body, options.bodyLimit)
      }
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    return await handler(body, req, userId)
  }
}

export function normalizeVerifiedDisplayName(value: unknown): string {
  if (typeof value !== 'string') return 'Commander'
  const normalized = Array.from(value.trim().replace(/\s+/g, ' ')).slice(0, 24).join('').trim()
  return normalized || 'Commander'
}

export function chooseVerifiedSeed(): typeof VERIFIED_DEPLOYMENT_SEEDS[number] {
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return VERIFIED_DEPLOYMENT_SEEDS[random[0]! % VERIFIED_DEPLOYMENT_SEEDS.length]!
}

export type VerifiedServiceClient = ServiceClient

export interface VerifiedHumanFire {
  readonly angle: number
  readonly power: number
}

export interface VerifiedDeploymentCompletionRequest {
  readonly sessionId: string
  readonly transcript: readonly VerifiedHumanFire[]
}

export interface VerifiedDeploymentResultReceipt {
  readonly sessionId: string
  readonly won: boolean
  readonly outcome: 'win' | 'loss' | 'draw'
  readonly verifiedXp: 100 | 200
}

export interface VerifiedProgressionCounts {
  readonly matchesPlayed: number
  readonly wins: number
  readonly totalXp: number
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function validHumanFire(value: unknown): value is VerifiedHumanFire {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const fire = value as Record<string, unknown>
  return hasExactKeys(fire, ['angle', 'power'])
    && typeof fire.angle === 'number' && Number.isInteger(fire.angle) && fire.angle >= 0 && fire.angle <= 180
    && typeof fire.power === 'number' && Number.isInteger(fire.power) && fire.power >= 0 && fire.power <= 100
}

/** Parses the only client-owned completion evidence: canonical human fire commitments. */
export function parseVerifiedDeploymentCompletion(value: unknown): VerifiedDeploymentCompletionRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const request = value as Record<string, unknown>
  if (!hasExactKeys(request, ['sessionId', 'transcript'])
    || typeof request.sessionId !== 'string' || !UUID_REGEX.test(request.sessionId)
    || !Array.isArray(request.transcript) || request.transcript.length < 1 || request.transcript.length > 6
    || !request.transcript.every(validHumanFire)) return null
  return Object.freeze({
    sessionId: request.sessionId.toLowerCase(),
    transcript: Object.freeze(request.transcript.map((fire) => Object.freeze({ angle: fire.angle, power: fire.power }))),
  })
}

function validProgressionCounts(value: VerifiedProgressionCounts): boolean {
  return Number.isSafeInteger(value.matchesPlayed) && value.matchesPlayed >= 1
    && Number.isSafeInteger(value.wins) && value.wins >= 0 && value.wins <= value.matchesPlayed
    && Number.isSafeInteger(value.totalXp) && value.totalXp >= 100
}

/** Projects only immutable result facts and before/after verified aggregates. */
export function projectVerifiedDeploymentReceipt(
  result: VerifiedDeploymentResultReceipt,
  current: VerifiedProgressionCounts,
): {
  result: VerifiedDeploymentResultReceipt
  progression: { evidence: 'verified_replay_v1'; prior: VerifiedProgressionCounts; current: VerifiedProgressionCounts }
} | null {
  const correctAward = (result.won && result.outcome === 'win' && result.verifiedXp === 200)
    || (!result.won && (result.outcome === 'loss' || result.outcome === 'draw') && result.verifiedXp === 100)
  if (!UUID_REGEX.test(result.sessionId) || !correctAward || !validProgressionCounts(current)) return null
  const prior = {
    matchesPlayed: current.matchesPlayed - 1,
    wins: current.wins - (result.won ? 1 : 0),
    totalXp: current.totalXp - result.verifiedXp,
  }
  if (prior.wins < 0 || prior.totalXp < 0) return null
  return Object.freeze({
    result: Object.freeze({ ...result, sessionId: result.sessionId.toLowerCase() }),
    progression: Object.freeze({
      evidence: 'verified_replay_v1' as const,
      prior: Object.freeze(prior),
      current: Object.freeze({ ...current }),
    }),
  })
}
