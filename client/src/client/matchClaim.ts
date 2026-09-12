import { callFunction, type EdgeResult } from '../lib/edgeFunctions'

export interface ClaimMatchPayload {
  roomId: string
  playerId: string
  token: string
}

export interface SessionReader {
  getSession(): Promise<{
    data: { session: { access_token: string } | null }
    error: unknown | null
  }>
}

export type ClaimMatchPost = (
  name: string,
  body: ClaimMatchPayload,
  options: { bearerToken: string },
) => Promise<Pick<EdgeResult<unknown>, 'ok' | 'status' | 'data'>>

export type MatchClaimErrorCode =
  | 'match_not_ready'
  | 'legacy_score_malformed'
  | 'match_receipt_malformed'
  | 'completion_dispute'
  | 'claim_conflict'
  | 'claim_failed'
  | 'claim_contract_invalid'

export class MatchClaimError extends Error {
  readonly code: MatchClaimErrorCode
  readonly retryable: boolean

  constructor(code: MatchClaimErrorCode, retryable: boolean, message: string) {
    super(message)
    this.name = 'MatchClaimError'
    this.code = code
    this.retryable = retryable
  }
}

function responseRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export async function claimCompletedMatch(
  auth: SessionReader,
  payload: ClaimMatchPayload,
  post: ClaimMatchPost = callFunction,
): Promise<'linked' | 'anonymous'> {
  let sessionResult: Awaited<ReturnType<SessionReader['getSession']>>
  try {
    sessionResult = await auth.getSession()
  } catch {
    throw new Error('Account session unavailable.')
  }
  if (sessionResult.error) throw new Error('Account session unavailable.')
  if (!sessionResult.data.session) return 'anonymous'

  const result = await post(
    'claim_match',
    { roomId: payload.roomId, playerId: payload.playerId, token: payload.token },
    { bearerToken: sessionResult.data.session.access_token },
  )
  const data = responseRecord(result.data)
  if (!result.ok) {
    const code = typeof data?.error === 'string' ? data.error : 'claim_failed'
    const knownCode: MatchClaimErrorCode = [
      'match_not_ready', 'legacy_score_malformed', 'match_receipt_malformed',
      'completion_dispute', 'claim_conflict',
    ].includes(code) ? code as MatchClaimErrorCode : 'claim_failed'
    const retryable = data?.retryable === true || result.status >= 500
    throw new MatchClaimError(knownCode, retryable, `claim_match HTTP ${result.status}`)
  }
  // Older claim_match deployments returned no evidence field. They can only
  // link the historical match_scores table, whose trust ceiling is casual.
  if (data?.evidence !== undefined && data.evidence !== 'casual_participant_reported') {
    throw new MatchClaimError('claim_contract_invalid', false, 'Unexpected claim evidence.')
  }
  return 'linked'
}
