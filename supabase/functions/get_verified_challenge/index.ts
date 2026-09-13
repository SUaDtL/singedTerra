import { challengeJson, challengeRecord, createChallengeRequestHandler } from '../_shared/verifiedChallenge.ts'
import { getServiceClient } from '../_shared/mod.ts'
import { projectChallengeStatus } from '../_shared/verifiedChallengeStatus.ts'

export interface Dependencies {
  get?: (args: { p_account_id: string; p_session_id: string }) => PromiseLike<{ data: unknown; error: unknown }>
}
export async function handleGetVerifiedChallenge(body: unknown, _req: Request, accountId: string, dependencies: Dependencies = {}): Promise<Response> {
  if (!challengeRecord(body, ['sessionId']) || typeof body.sessionId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.sessionId)) {
    return challengeJson({ error: 'invalid_request' }, 400)
  }
  const unavailable = () => challengeJson({ error: 'verification_unavailable' }, 503)
  try {
    const get = dependencies.get ?? ((args) => getServiceClient().rpc('get_verified_challenge', args))
    const response = await get({ p_account_id: accountId, p_session_id: body.sessionId })
    if (response.error) return unavailable()
    const data = response.data
    if (challengeRecord(data, ['ok', 'error']) && data.ok === false && data.error === 'challenge_not_found') {
      return challengeJson({ error: 'challenge_not_found' }, 404)
    }
    const status = projectChallengeStatus(data, accountId, body.sessionId)
    if (!status) return unavailable()
    return challengeJson({ ...status })
  } catch {
    return unavailable()
  }
}

export const serveGetVerifiedChallenge = createChallengeRequestHandler(handleGetVerifiedChallenge, 'get_verified_challenge', 128)
if (import.meta.main) Deno.serve(serveGetVerifiedChallenge)
