import {
  VERIFIED_CHALLENGE_CQ1,
  VERIFIED_CHALLENGE_RESPONSE_VERSION,
  parseVerifiedChallengeDescriptor,
  parseVerifiedChallengeReceipt,
  parseVerifiedChallengeTranscript,
  type VerifiedChallengeDescriptor,
  type VerifiedChallengeHumanFire,
  type VerifiedChallengeReceipt,
} from '@shared/net/verifiedChallenge'

export type VerifiedChallengeOperation = 'start_verified_challenge' | 'get_verified_challenge'
  | 'abandon_verified_challenge' | 'complete_verified_challenge'

export interface VerifiedChallengeRawResponse {
  readonly status: number
  readonly data: unknown
  readonly headers?: { get(name: string): string | null }
}

export type VerifiedChallengeInvoker = (
  operation: VerifiedChallengeOperation,
  body: Readonly<Record<string, unknown>>,
) => PromiseLike<VerifiedChallengeRawResponse>

export interface VerifiedChallengeStartResponse {
  readonly descriptor: VerifiedChallengeDescriptor
  readonly resumed: boolean
}

export type VerifiedChallengeStatusName = 'active' | 'completed' | 'expired' | 'abandoned'
  | 'invalid' | 'verification_unavailable'

export interface VerifiedChallengeStatusResponse {
  readonly descriptor: VerifiedChallengeDescriptor
  readonly status: VerifiedChallengeStatusName
  readonly computeAttempts: number
  readonly boundTranscript: readonly VerifiedChallengeHumanFire[] | null
  readonly receipt: VerifiedChallengeReceipt | null
}

export class VerifiedChallengeTransportError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 404 | 409 | 429 | 503,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super('Verified challenge is unavailable.')
    this.name = 'VerifiedChallengeTransportError'
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const FAILURE_STATUSES = new Set([400, 401, 404, 409, 429, 503])

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function parseVerifiedChallengeStartResponse(value: unknown): VerifiedChallengeStartResponse | null {
  if (!record(value) || !exactKeys(value, ['responseVersion', 'descriptor', 'resumed'])
    || value.responseVersion !== VERIFIED_CHALLENGE_RESPONSE_VERSION || typeof value.resumed !== 'boolean') return null
  const descriptor = parseVerifiedChallengeDescriptor(value.descriptor)
  return descriptor ? Object.freeze({ descriptor, resumed: value.resumed }) : null
}

export function parseVerifiedChallengeStatusResponse(value: unknown): VerifiedChallengeStatusResponse | null {
  if (!record(value) || !exactKeys(value, [
    'responseVersion', 'descriptor', 'status', 'computeAttempts', 'boundTranscript', 'receipt',
  ]) || value.responseVersion !== VERIFIED_CHALLENGE_RESPONSE_VERSION
    || typeof value.status !== 'string'
    || !['active', 'completed', 'expired', 'abandoned', 'invalid', 'verification_unavailable'].includes(value.status)
    || !Number.isSafeInteger(value.computeAttempts) || (value.computeAttempts as number) < 0
    || (value.computeAttempts as number) > VERIFIED_CHALLENGE_CQ1.limits.computeAttempts) return null
  const descriptor = parseVerifiedChallengeDescriptor(value.descriptor)
  const boundTranscript = value.boundTranscript === null ? null : parseVerifiedChallengeTranscript(value.boundTranscript)
  const receipt = value.receipt === null ? null : parseVerifiedChallengeReceipt(value.receipt)
  if (!descriptor || (value.boundTranscript !== null && !boundTranscript) || (value.receipt !== null && !receipt)
    || ((value.computeAttempts === 0) !== (boundTranscript === null))
    || (value.status === 'completed') !== (receipt !== null)
    || (value.status === 'invalid' && value.computeAttempts === 0)
    || (value.status === 'verification_unavailable'
      && value.computeAttempts !== VERIFIED_CHALLENGE_CQ1.limits.computeAttempts)
    || (receipt && (receipt.accountId !== descriptor.accountId || receipt.sessionId !== descriptor.sessionId
      || !same(receipt.transcript, boundTranscript)))) return null
  return Object.freeze({
    descriptor,
    status: value.status as VerifiedChallengeStatusName,
    computeAttempts: value.computeAttempts as number,
    boundTranscript,
    receipt,
  })
}

export function parseVerifiedChallengeCompletionResponse(value: unknown): VerifiedChallengeReceipt | null {
  if (!record(value) || !exactKeys(value, ['responseVersion', 'receipt'])
    || value.responseVersion !== VERIFIED_CHALLENGE_RESPONSE_VERSION) return null
  return parseVerifiedChallengeReceipt(value.receipt)
}

function retryAfter(response: VerifiedChallengeRawResponse): number | null {
  const raw = response.headers?.get('Retry-After') ?? response.headers?.get('retry-after') ?? null
  if (raw === null || !/^(?:0|[1-9]\d{0,2})$/.test(raw)) return null
  const seconds = Number(raw)
  return seconds <= 410 ? seconds : null
}

function transportFailure(response: VerifiedChallengeRawResponse): VerifiedChallengeTransportError {
  if (!FAILURE_STATUSES.has(response.status) || !record(response.data)
    || response.data.responseVersion !== VERIFIED_CHALLENGE_RESPONSE_VERSION
    || typeof response.data.error !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(response.data.error)) {
    return new VerifiedChallengeTransportError('verification_unavailable', 503)
  }
  const busy = response.data.error === 'verification_busy'
  if (!exactKeys(response.data, busy
    ? ['responseVersion', 'error', 'retryAfter']
    : ['responseVersion', 'error'])) {
    return new VerifiedChallengeTransportError('verification_unavailable', 503)
  }
  const status = response.status as 400 | 401 | 404 | 409 | 429 | 503
  const delay = busy ? retryAfter(response) : null
  if (busy && (status !== 503 || !Number.isSafeInteger(response.data.retryAfter)
    || (response.data.retryAfter as number) < 1 || (response.data.retryAfter as number) > 410
    || delay !== response.data.retryAfter)) {
    return new VerifiedChallengeTransportError('verification_unavailable', 503)
  }
  return new VerifiedChallengeTransportError(response.data.error, status, delay)
}

/** Exact version-one challenge transport. Authentication remains owned by the injected invoker. */
export class VerifiedChallengeTransport {
  constructor(private readonly invoke: VerifiedChallengeInvoker) {}

  start(): Promise<VerifiedChallengeStartResponse> {
    return this.request('start_verified_challenge', Object.freeze({
      trialId: VERIFIED_CHALLENGE_CQ1.trialId,
      supportedDescriptorVersions: Object.freeze([VERIFIED_CHALLENGE_CQ1.descriptorVersion]),
    }), parseVerifiedChallengeStartResponse)
  }

  get(sessionId: string): Promise<VerifiedChallengeStatusResponse> {
    return this.sessionRequest('get_verified_challenge', sessionId, parseVerifiedChallengeStatusResponse)
  }

  abandon(sessionId: string): Promise<VerifiedChallengeStatusResponse> {
    return this.sessionRequest('abandon_verified_challenge', sessionId, parseVerifiedChallengeStatusResponse)
  }

  complete(sessionId: string, transcript: readonly VerifiedChallengeHumanFire[]): Promise<VerifiedChallengeReceipt> {
    if (!UUID.test(sessionId)) return Promise.reject(new VerifiedChallengeTransportError('invalid_request', 400))
    const accepted = parseVerifiedChallengeTranscript(transcript)
    if (!accepted) return Promise.reject(new VerifiedChallengeTransportError('invalid_request', 400))
    return this.request('complete_verified_challenge', Object.freeze({ sessionId, transcript: accepted }),
      parseVerifiedChallengeCompletionResponse)
  }

  private sessionRequest<T>(
    operation: 'get_verified_challenge' | 'abandon_verified_challenge',
    sessionId: string,
    parse: (value: unknown) => T | null,
  ): Promise<T> {
    if (!UUID.test(sessionId)) return Promise.reject(new VerifiedChallengeTransportError('invalid_request', 400))
    return this.request(operation, Object.freeze({ sessionId }), parse)
  }

  private async request<T>(
    operation: VerifiedChallengeOperation,
    body: Readonly<Record<string, unknown>>,
    parse: (value: unknown) => T | null,
  ): Promise<T> {
    let response: VerifiedChallengeRawResponse
    try {
      response = await this.invoke(operation, body)
    } catch (error) {
      if (error instanceof VerifiedChallengeTransportError) throw error
      throw new VerifiedChallengeTransportError('verification_unavailable', 503)
    }
    if (response.status !== 200) throw transportFailure(response)
    const parsed = parse(response.data)
    if (!parsed) throw new VerifiedChallengeTransportError('verification_unavailable', 503)
    return parsed
  }
}
