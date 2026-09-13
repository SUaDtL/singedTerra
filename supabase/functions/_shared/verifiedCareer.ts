import { projectVerifiedCareer } from '../../../shared/src/net/verifiedCareer.ts'
import { parseVerifiedChallengeReceipt, type VerifiedChallengeReceipt } from '../../../shared/src/net/verifiedChallenge.ts'

/** Transform only the exact challenge_receipt_json SQL result, not a current
 * aggregate. Auth/owner checks and responseVersion belong to the calling endpoint.
 * Invalid historical facts fail closed; the adapter cannot repair or guess XP. */
export function projectVerifiedChallengeReceipt(value: unknown): VerifiedChallengeReceipt | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return null
  const row = value as Record<string, unknown>
  const keys = ['sessionId', 'accountId', 'editionId', 'transcript', 'outcome', 'disposition', 'xpGranted',
    'completedAt', 'careerBeforeLedger', 'careerAfterLedger']
  if (Reflect.ownKeys(row).length !== keys.length || !keys.every((key) => Object.hasOwn(row, key))) return null
  const careerBefore = projectVerifiedCareer(row.careerBeforeLedger)
  const careerAfter = projectVerifiedCareer(row.careerAfterLedger)
  if (!careerBefore || !careerAfter) return null
  return parseVerifiedChallengeReceipt({ evidence: 'verified_challenge_cq1', sessionId: row.sessionId,
    accountId: row.accountId, editionId: row.editionId, transcript: row.transcript, outcome: row.outcome,
    disposition: row.disposition, xpGranted: row.xpGranted, completedAt: row.completedAt, careerBefore, careerAfter })
}
