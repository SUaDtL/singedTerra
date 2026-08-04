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
) => Promise<Pick<EdgeResult<unknown>, 'ok' | 'status'>>

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
  if (!result.ok) throw new Error(`claim_match HTTP ${result.status}`)
  return 'linked'
}
