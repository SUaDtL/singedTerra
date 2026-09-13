import type { VerifiedChallengeDescriptor, VerifiedChallengeHumanFire, VerifiedChallengeReceipt } from '../../../shared/src/net/verifiedChallenge.ts'
import { parseVerifiedChallengeDescriptor, parseVerifiedChallengeTranscript } from '../../../shared/src/net/verifiedChallenge.ts'
import { challengeRecord } from './verifiedChallenge.ts'
import { projectVerifiedChallengeReceipt } from './verifiedCareer.ts'
export interface ChallengeStatus {
  descriptor: VerifiedChallengeDescriptor
  status: 'active' | 'completed' | 'expired' | 'abandoned' | 'invalid' | 'verification_unavailable'
  computeAttempts: number
  boundTranscript: readonly VerifiedChallengeHumanFire[] | null
  receipt: VerifiedChallengeReceipt | null
}
export function projectChallengeStatus(value: unknown, accountId: string, sessionId: string): ChallengeStatus | null {
  if (!challengeRecord(value, ['ok', 'descriptor', 'status', 'computeAttempts', 'boundTranscript', 'receipt']) || value.ok !== true) return null
  const descriptor = parseVerifiedChallengeDescriptor(value.descriptor)
  if (!descriptor || descriptor.accountId !== accountId || descriptor.sessionId !== sessionId) return null
  if (typeof value.status !== 'string' || !['active', 'completed', 'expired', 'abandoned', 'invalid', 'verification_unavailable'].includes(value.status)
    || !Number.isSafeInteger(value.computeAttempts) || (value.computeAttempts as number) < 0 || (value.computeAttempts as number) > 3) return null
  const boundTranscript = value.boundTranscript === null ? null : parseVerifiedChallengeTranscript(value.boundTranscript)
  if (value.boundTranscript !== null && !boundTranscript) return null
  if ((value.computeAttempts === 0) !== (boundTranscript === null)) return null
  if (value.status === 'invalid' && value.computeAttempts === 0) return null
  if (value.status === 'verification_unavailable' && value.computeAttempts !== 3) return null
  const receipt = value.receipt === null ? null : projectVerifiedChallengeReceipt(value.receipt)
  if (value.receipt !== null && !receipt) return null
  if ((value.status === 'completed') !== (receipt !== null)) return null
  if (receipt && (receipt.accountId !== accountId || receipt.sessionId !== sessionId
    || JSON.stringify(receipt.transcript) !== JSON.stringify(boundTranscript))) return null
  return Object.freeze({ descriptor, status: value.status as ChallengeStatus['status'],
    computeAttempts: value.computeAttempts as number, boundTranscript, receipt })
}
