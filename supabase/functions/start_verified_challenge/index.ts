import { challengeJson, challengeRecord, createChallengeRequestHandler } from '../_shared/verifiedChallenge.ts'
import { getServiceClient } from '../_shared/mod.ts'
import { parseVerifiedChallengeDescriptor, parseVerifiedChallengeStart } from '../../../shared/src/net/verifiedChallenge.ts'
import { getVerifiedChallengeArtifact } from '../../../shared/src/verified/challengeArtifacts.ts'
export interface StartChallengeDependencies {
  artifact?: typeof getVerifiedChallengeArtifact
  start?: (args: { p_account_id: string; p_trial_id: string; p_supported_descriptor_versions: number[] }) => PromiseLike<{ data: unknown; error: unknown }>
}
export async function handleStartVerifiedChallenge(
  body: unknown, _req: Request, accountId: string, dependencies: StartChallengeDependencies = {},
): Promise<Response> {
  const parsed = parseVerifiedChallengeStart(body)
  if (!parsed) return challengeJson({ error: 'invalid_request' }, 400)
  const unavailable = () => challengeJson({ error: 'verification_unavailable' }, 503)
  try {
    (dependencies.artifact ?? getVerifiedChallengeArtifact)('cq1')
    const start = dependencies.start ?? ((args) => getServiceClient().rpc('start_verified_challenge', args))
    const response = await start({ p_account_id: accountId, p_trial_id: parsed.trialId, p_supported_descriptor_versions: [...parsed.supportedDescriptorVersions] })
    if (response.error) return unavailable()
    const data = response.data
    if (challengeRecord(data, ['ok', 'error']) && data.ok === false) {
      if (data.error === 'challenge_starts_disabled') return challengeJson({ error: data.error }, 503)
      if (data.error === 'active_challenge_incompatible') return challengeJson({ error: data.error }, 409)
      return unavailable()
    }
    if (!challengeRecord(data, ['ok', 'descriptor', 'resumed']) || data.ok !== true || typeof data.resumed !== 'boolean') return unavailable()
    const descriptor = parseVerifiedChallengeDescriptor(data.descriptor)
    if (!descriptor || descriptor.accountId !== accountId) return unavailable()
    return challengeJson({ descriptor, resumed: data.resumed })
  } catch { return unavailable() }
}
export const serveStartVerifiedChallenge = createChallengeRequestHandler(handleStartVerifiedChallenge, 'start_verified_challenge', 256)
if (import.meta.main) Deno.serve(serveStartVerifiedChallenge)
