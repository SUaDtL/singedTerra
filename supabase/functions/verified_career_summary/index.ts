import { challengeJson, challengeRecord, createChallengeRequestHandler } from '../_shared/verifiedChallenge.ts'
import { getServiceClient } from '../_shared/mod.ts'
import { projectVerifiedCareer } from '../../../shared/src/net/verifiedCareer.ts'

export interface Dependencies {
  snapshot?: (args: { p_account_id: string }) => PromiseLike<{ data: unknown; error: unknown }>
}
export async function handleVerifiedCareerSummary(body: unknown, _req: Request, accountId: string, dependencies: Dependencies = {}): Promise<Response> {
  if (!challengeRecord(body, [])) return challengeJson({ error: 'invalid_request' }, 400)
  const unavailable = () => challengeJson({ error: 'verification_unavailable' }, 503)
  try {
    const snapshot = dependencies.snapshot ?? ((args) => getServiceClient().rpc('verified_career_ledger_snapshot', args))
    const response = await snapshot({ p_account_id: accountId })
    if (response.error) return unavailable()
    const career = projectVerifiedCareer(response.data)
    if (!career) return unavailable()
    return challengeJson({ career })
  } catch {
    return unavailable()
  }
}

export const serveVerifiedCareerSummary = createChallengeRequestHandler(handleVerifiedCareerSummary, 'verified_career_summary', 128)
if (import.meta.main) Deno.serve(serveVerifiedCareerSummary)
