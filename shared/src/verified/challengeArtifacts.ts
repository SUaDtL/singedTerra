// Reviewed static allowlist. Digests identify content; they are not credentials.
import * as cq1 from './retained/cq1.mjs';
export const CQ1_ARTIFACT_SHA256 = 'c9e3c55636a6cc2407cbc338e674ebfa0a3dd1285f3a95f72dd354fd3c348c81';
export const CQ1_MANIFEST_INTEGRITY = 'f80bd24b9ed17cd6e1519a662a50dd21262167dbd3044163f758f529e608c6ab';
const retainedCq1 = Object.freeze({ ...cq1, sha256: CQ1_ARTIFACT_SHA256 });
export function getVerifiedChallengeArtifact(editionId: unknown): typeof retainedCq1 {
  if (editionId !== 'cq1') throw new Error('unsupported_verified_challenge_artifact');
  return retainedCq1;
}
