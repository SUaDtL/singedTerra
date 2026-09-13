import {
  authenticateBearer,
  getServiceClient,
  json,
  rateWindow,
  type Database,
  type ServiceClient,
  withCors,
} from '../_shared/mod.ts'
import {
  replayVerifiedTranscript,
  VerifiedReplayError,
} from '../_shared/verifiedMatchReplay.ts'
import {
  VERIFIED_REPLAY_PROBE_ENGINE_VERSION,
  VERIFIED_REPLAY_PROBE_FIXTURES,
  VERIFIED_REPLAY_PROBE_RULESET_VERSION,
  VERIFIED_REPLAY_PROBE_VERSION,
} from '../_shared/verifiedReplayProbeFixture.ts'
import { replayVerifiedDuel } from '../../../shared/src/net/verifiedDuel.ts'
import { NATIVE_VERIFICATION_ACCEPTANCE_MS, runNativeVerification } from '../_shared/verificationWorker.ts'
import { confirmVerificationComputeLease, type VerificationLeaseRpc } from '../_shared/verificationComputeLease.ts'
import { getVerifiedChallengeArtifact, CQ1_MANIFEST_INTEGRITY } from '../../../shared/src/verified/challengeArtifacts.ts'
import { challengeProbeTranscript, parseChallengeProbeMode, serializeChallengeProbeSample } from '../_shared/verifiedChallengeProbeFixture.ts'

export interface VerifiedReplayProbeDependencies {
  supabase?: Pick<ServiceClient, 'auth'>
  rpc?: VerificationLeaseRpc
  wallNow?: () => number
  nativeNow?: () => number
  replay?: typeof replayVerifiedTranscript
  challengeReplay?: (transcript: readonly { angle: number; power: number }[]) => unknown
  logger?: (message: string, context: Record<string, unknown>) => void
}

export async function handleVerifiedReplayProbe(
  _body: unknown,
  req: Request,
  dependencies: VerifiedReplayProbeDependencies = {},
): Promise<Response> {
  const mode = parseChallengeProbeMode(req.url)
  if (mode.kind === 'invalid') return json({ error: 'invalid_probe_request' }, 400)
  const supabase = dependencies.supabase ?? getServiceClient()
  const authenticated = await authenticateBearer(req, supabase)
  if (!authenticated || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authenticated)) {
    return json({ error: 'unauthorized' }, 401)
  }
  const userId = authenticated.toLowerCase()

  const replay = dependencies.replay ?? replayVerifiedTranscript
  const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
  const rpc: VerificationLeaseRpc = dependencies.rpc ?? (async (name, args) =>
    await getServiceClient().rpc(name as keyof Database['public']['Functions'], args as never))
  const unavailable = (status = 503) => json({ error: 'probe_unavailable' }, status)
  const wallNow = dependencies.wallNow ?? Date.now
  try {
    const rate = await rpc('bump_rate_limit', {
      p_bucket: `verified_account:verified_replay_probe:${userId}`, p_window: rateWindow(wallNow()),
    })
    if (rate.error || !Number.isSafeInteger(rate.data) || (rate.data as number) < 1) return unavailable()
    if ((rate.data as number) > 10) return json({ error: 'rate_limited' }, 429)
    if (mode.kind === 'cq1') {
      const artifact = getVerifiedChallengeArtifact('cq1')
      const verified = await runNativeVerification({ accountId: userId, endpoint: 'verified_replay_probe',
        sessionId: null, descriptorBinding: 'probe-v1', transcript: null }, {
        rpc, wallNow, now: dependencies.nativeNow,
        setup: () => challengeProbeTranscript(mode.fixtureId),
        replay: (shots) => (dependencies.challengeReplay ?? artifact.replayWithWork)(shots as { angle: number; power: number }[]),
        validate: (sample) => {
          const serialized = serializeChallengeProbeSample(mode.fixtureId, sample)
          if (serialized === null) return null
          // Prepare bounded evidence within the native acceptance measurement.
          // This registry declaration is not a digest measured from hosted source bytes.
          return JSON.stringify({ ok: true, probeVersion: 1, mode: 'cq1', fixtureVersion: 1,
            fixtureId: mode.fixtureId, artifactSha256: artifact.sha256,
            artifactIdentity: 'static-registry', manifestIntegrity: CQ1_MANIFEST_INTEGRITY,
            acceptanceLimitMs: NATIVE_VERIFICATION_ACCEPTANCE_MS,
            executionModel: 'synchronous-acceptance-gate', sample: JSON.parse(serialized) })
        },
        finalize: async (evidence, lease) => {
          const current = await confirmVerificationComputeLease(lease, rpc)
          return current === 'current' ? { ok: true, value: evidence } : { ok: false }
        },
      })
      if (verified.kind === 'completed' && typeof verified.value === 'string') {
        // Only native elapsed and cleanup metadata are added after the measured
        // evidence serialization. Auth, RPC, import, and HTTP time are excluded.
        return new Response(verified.value.slice(0, -1) + `,"nativeElapsedMs":${verified.elapsedMs},"cleanup":${JSON.stringify(verified.cleanup)}}`, {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      if (verified.kind === 'busy') {
        const response = unavailable()
        response.headers.set('Retry-After', String(verified.retryAfter))
        response.headers.set('Access-Control-Expose-Headers', 'Retry-After')
        return response
      }
      return json({ error: 'probe_unavailable', mode: 'cq1', fixtureId: mode.fixtureId,
        failure: verified.kind === 'replay_invalid' ? 'fixture_mismatch'
          : verified.kind === 'unavailable' && verified.reason === 'acceptance_deadline' ? 'acceptance_deadline' : 'execution_unavailable',
        nativeElapsedMs: 'elapsedMs' in verified ? verified.elapsedMs ?? null : null,
        cleanup: verified.cleanup }, 503)
    }
    const verified = await runNativeVerification({ accountId: userId, endpoint: 'verified_replay_probe',
      sessionId: null, descriptorBinding: 'probe-v1', transcript: null }, {
      rpc, wallNow, now: dependencies.nativeNow,
      setup: () => VERIFIED_REPLAY_PROBE_FIXTURES,
      replay: () => {
        try {
          const results: unknown[] = []
          const operations = [
            () => replay(VERIFIED_REPLAY_PROBE_FIXTURES.maximumLifecycle.config, VERIFIED_REPLAY_PROBE_FIXTURES.maximumLifecycle.transcript),
            () => replay(VERIFIED_REPLAY_PROBE_FIXTURES.maximumTurn.config, VERIFIED_REPLAY_PROBE_FIXTURES.maximumTurn.transcript),
            () => replayVerifiedDuel(VERIFIED_REPLAY_PROBE_FIXTURES.verifiedDuel.seed, VERIFIED_REPLAY_PROBE_FIXTURES.verifiedDuel.transcript),
          ]
          for (const operation of operations) {
            const result: unknown = operation()
            // Propagate uncertainty to the native guard without awaiting or
            // starting remaining fixtures. Even a throwing then getter is
            // uncertain; the inert thenable makes the guard retain cooldown.
            try {
              if (result !== null && (typeof result === 'object' || typeof result === 'function')
                && typeof (result as { then?: unknown }).then === 'function') return { then() {} }
            } catch { return { then() {} } }
            results.push(result)
          }
          return { maximumLifecycle: results[0], maximumTurn: results[1], verifiedDuel: results[2] }
        } catch (error) {
          logger('verified_replay_probe: replay failed', {
            stage: 'replay', code: error instanceof VerifiedReplayError ? error.code : 'unexpected',
          })
          throw error
        }
      },
      validate: (fixtures) => {
        if (!fixtures || typeof fixtures !== 'object'
          || Object.values(fixtures).some((value) => !value || typeof value !== 'object' || Array.isArray(value))) return null
        // Serialize the entire response inside the acceptance measurement.
        return json({ ok: true, probeVersion: VERIFIED_REPLAY_PROBE_VERSION,
          engineVersion: VERIFIED_REPLAY_PROBE_ENGINE_VERSION,
          rulesetVersion: VERIFIED_REPLAY_PROBE_RULESET_VERSION, fixtures })
      },
      finalize: async (response, lease) => {
        // This read is the probe's final fenced dispatch; it awards nothing.
        const current = await confirmVerificationComputeLease(lease, rpc)
        return current === 'current' ? { ok: true, value: response } : { ok: false }
      },
    })
    if (verified.kind === 'completed' && verified.value instanceof Response) return verified.value
    if (verified.kind === 'busy') {
      const response = unavailable(); response.headers.set('Retry-After', String(verified.retryAfter)); return response
    }
    if (verified.kind === 'replay_invalid' || (verified.kind === 'unavailable' && verified.reason === 'execution_unavailable')) return unavailable(500)
    return unavailable()
  } catch { return unavailable() }
}

const VERIFIED_REPLAY_PROBE_WRAPPER_OPTIONS = Object.freeze({
  bodyMode: 'none',
  rateLimit: 'verified_replay_probe',
} as const)

export function createVerifiedReplayProbeHandler(
  wrap: typeof withCors = withCors,
): (req: Request) => Promise<Response> {
  return wrap(handleVerifiedReplayProbe, VERIFIED_REPLAY_PROBE_WRAPPER_OPTIONS)
}

export const serveVerifiedReplayProbe = createVerifiedReplayProbeHandler()

export function registerVerifiedReplayProbe(
  serve: (handler: typeof serveVerifiedReplayProbe) => unknown = Deno.serve,
): void {
  serve(serveVerifiedReplayProbe)
}

export function startVerifiedReplayProbe(
  isMain: boolean,
  register: () => void = registerVerifiedReplayProbe,
): void {
  if (isMain) register()
}

startVerifiedReplayProbe(import.meta.main)
