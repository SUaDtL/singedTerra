import { projectVerifiedChallengeReceipt } from './verifiedCareer.ts'
import type { VerifiedChallengeReceipt } from '../../../shared/src/net/verifiedChallenge.ts'

export interface VerificationLeaseRequest {
  readonly accountId: string
  readonly endpoint: 'complete_verified_challenge' | 'complete_verified_deployment' | 'verified_replay_probe'
  readonly sessionId: string | null
  readonly descriptorBinding: 'cq1' | 'deployment-v2' | 'deployment-v3' | 'probe-v1'
  readonly transcript: unknown
}
export type VerificationLeaseRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
export interface VerificationComputeLease extends VerificationLeaseRequest {
  readonly workerId: string
  readonly fence: number
  readonly expiresAt: string
  readonly uncertainUntil: string
}
const DOMAIN_REFUSALS = ['invalid_verification_request', 'challenge_not_found', 'challenge_completion_conflict',
  'challenge_not_completable', 'challenge_transcript_conflict', 'verified_deployment_not_completable'] as const
export type VerificationLeaseRefusal = typeof DOMAIN_REFUSALS[number]
export type VerificationLeaseAdmission =
  | Readonly<{ kind: 'lease'; lease: VerificationComputeLease }>
  | Readonly<{ kind: 'receipt'; receipt: VerifiedChallengeReceipt }>
  | Readonly<{ kind: 'busy'; retryAfter: number }>
  | Readonly<{ kind: 'rejected'; code: VerificationLeaseRefusal }>
  | Readonly<{ kind: 'unavailable'; reason: 'lease_unavailable' }>

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key))
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
}
function utcMicros(value: unknown): bigint | null {
  if (typeof value !== 'string') return null
  const match = /^([1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value)
  if (!match) return null
  const canonical = `${match[1]}.000Z`; const millis = Date.parse(canonical)
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== canonical) return null
  return BigInt(millis) * 1000n + BigInt((match[2] ?? '').padEnd(6, '0'))
}
function normalizeRequest(value: VerificationLeaseRequest): VerificationLeaseRequest | null {
  if (!record(value) || !keys(value, ['accountId', 'endpoint', 'sessionId', 'descriptorBinding', 'transcript']) || !uuid(value.accountId)) return null
  if (value.endpoint === 'verified_replay_probe') return value.sessionId === null && value.transcript === null && value.descriptorBinding === 'probe-v1'
    ? Object.freeze({ ...value }) : null
  const maximum = value.endpoint === 'complete_verified_challenge' && value.descriptorBinding === 'cq1' ? 3
    : value.endpoint === 'complete_verified_deployment' && ['deployment-v2', 'deployment-v3'].includes(value.descriptorBinding) ? 6 : 0
  if (!maximum || !uuid(value.sessionId) || !Array.isArray(value.transcript) || value.transcript.length < 1 || value.transcript.length > maximum) return null
  const transcript: Readonly<{ angle: number; power: number }>[] = []
  for (const shot of value.transcript) {
    if (!record(shot) || !keys(shot, ['angle', 'power']) || typeof shot.angle !== 'number' || typeof shot.power !== 'number'
      || !Number.isInteger(shot.angle) || shot.angle < 0 || shot.angle > 180 || !Number.isInteger(shot.power) || shot.power < 0 || shot.power > 100) return null
    transcript.push(Object.freeze({ angle: shot.angle === 0 ? 0 : shot.angle, power: shot.power === 0 ? 0 : shot.power }))
  }
  return Object.freeze({ ...value, transcript: Object.freeze(transcript) })
}

/** Auth and rate admission happen upstream. No storage uncertainty can permit
 * replay. The UUID/fence/cooldown remain internal, never browser authority. */
export async function acquireVerificationComputeLease(request: VerificationLeaseRequest, rpc: VerificationLeaseRpc,
  wallNow: () => number = Date.now): Promise<VerificationLeaseAdmission> {
  const unavailable = Object.freeze({ kind: 'unavailable', reason: 'lease_unavailable' } as const)
  try {
    const bound = normalizeRequest(request)
    if (!bound) return Object.freeze({ kind: 'rejected', code: 'invalid_verification_request' })
    const response = await rpc('acquire_verification_compute_lease', { p_account_id: bound.accountId, p_endpoint: bound.endpoint,
      p_session_id: bound.sessionId, p_descriptor_binding: bound.descriptorBinding, p_transcript: bound.transcript })
    if (response.error || !record(response.data)) return unavailable
    const row = response.data
    if (row.ok === false) {
      if (keys(row, ['ok', 'error', 'retryAfter']) && row.error === 'verification_busy'
        && Number.isSafeInteger(row.retryAfter) && (row.retryAfter as number) >= 1 && (row.retryAfter as number) <= 410)
        return Object.freeze({ kind: 'busy', retryAfter: row.retryAfter as number })
      if (keys(row, ['ok', 'error']) && DOMAIN_REFUSALS.includes(row.error as VerificationLeaseRefusal))
        return Object.freeze({ kind: 'rejected', code: row.error as VerificationLeaseRefusal })
      return unavailable
    }
    if (row.ok === true && keys(row, ['ok', 'receipt']) && bound.endpoint === 'complete_verified_challenge') {
      const receipt = projectVerifiedChallengeReceipt(row.receipt)
      return receipt && receipt.accountId === bound.accountId && receipt.sessionId === bound.sessionId
        && receipt.editionId === bound.descriptorBinding && JSON.stringify(receipt.transcript) === JSON.stringify(bound.transcript)
        ? Object.freeze({ kind: 'receipt', receipt }) : unavailable
    }
    if (row.ok !== true || !keys(row, ['ok', 'workerId', 'fence', 'endpoint', 'sessionId', 'descriptorBinding', 'expiresAt', 'uncertainUntil'])
      || !uuid(row.workerId) || !Number.isSafeInteger(row.fence) || (row.fence as number) <= 0
      || row.endpoint !== bound.endpoint || row.sessionId !== bound.sessionId || row.descriptorBinding !== bound.descriptorBinding) return unavailable
    const expires = utcMicros(row.expiresAt); const uncertain = utcMicros(row.uncertainUntil); const now = wallNow()
    if (expires === null || uncertain === null || uncertain - expires !== 400_000_000n
      || !Number.isSafeInteger(now) || expires <= BigInt(now) * 1000n) return unavailable
    return Object.freeze({ kind: 'lease', lease: Object.freeze({ ...bound, workerId: row.workerId, fence: row.fence as number,
      expiresAt: row.expiresAt as string, uncertainUntil: row.uncertainUntil as string }) })
  } catch { return unavailable }
}

/** Database revalidation occurs immediately before synchronous setup. */
export async function confirmVerificationComputeLease(lease: VerificationComputeLease, rpc: VerificationLeaseRpc): Promise<'current' | 'lost' | 'unavailable'> {
  try {
    const { data, error } = await rpc('verification_compute_lease_is_current', {
      p_account_id: lease.accountId, p_endpoint: lease.endpoint, p_session_id: lease.sessionId,
      p_descriptor_binding: lease.descriptorBinding, p_worker_id: lease.workerId, p_fence: lease.fence,
    })
    return error ? 'unavailable' : data === true ? 'current' : data === false ? 'lost' : 'unavailable'
  } catch { return 'unavailable' }
}

/** Call only after this synchronous invocation returned/threw, or before any
 * replay began. It is not remote death acknowledgement. An unreturned execution
 * must leave the database's 410-second uncertain cooldown intact. */
export async function releaseEndedVerificationComputeLease(lease: VerificationComputeLease, rpc: VerificationLeaseRpc): Promise<'released' | 'not_current' | 'unavailable'> {
  try {
    const { data, error } = await rpc('release_verification_compute_lease', {
      p_account_id: lease.accountId, p_worker_id: lease.workerId, p_fence: lease.fence,
    })
    return error ? 'unavailable' : data === true ? 'released' : data === false ? 'not_current' : 'unavailable'
  } catch { return 'unavailable' }
}
