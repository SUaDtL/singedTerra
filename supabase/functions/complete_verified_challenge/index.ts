import { challengeJson, challengeRecord, createChallengeRequestHandler } from '../_shared/verifiedChallenge.ts'
import type { VerificationLeaseRpc } from '../_shared/verificationComputeLease.ts'
import { runNativeVerification } from '../_shared/verificationWorker.ts'
import { projectChallengeStatus } from '../_shared/verifiedChallengeStatus.ts'
import { projectVerifiedChallengeReceipt } from '../_shared/verifiedCareer.ts'
import { getServiceClient } from '../_shared/mod.ts'
import type { Database } from '../_shared/database.types.ts'
import { parseVerifiedChallengeCompletion } from '../../../shared/src/net/verifiedChallenge.ts'
import { getVerifiedChallengeArtifact } from '../../../shared/src/verified/challengeArtifacts.ts'
import type { HumanFire, Terminal, Result, Work } from '../../../shared/src/verified/retained/cq1.d.mts'
export interface Dependencies {
  rpc?: VerificationLeaseRpc
  artifact?: typeof getVerifiedChallengeArtifact
  replay?: (transcript: unknown) => unknown
  wallNow?: () => number
  now?: () => number
}
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const invalidErrors = new Set(['invalid_verified_challenge_transcript', 'trailing_verified_challenge_action', 'incomplete_verified_challenge'])
const integer = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max
const health = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
const fire = (value: unknown): boolean => challengeRecord(value, ['angle', 'power'])
  && integer(value.angle, 180) && integer(value.power, 100)

/** The cq1 trace has at most three human settlements, two CPU selections and
 * two CPU settlements. Validate this finite trace, not a second physics replay. */
function consistentEvents(result: Result, work: Work): boolean {
  if (result.events.length < 1 || result.events.length > 8) return false
  let next: 'human' | 'selection' | 'cpu' = 'human'
  let humans = 0, cpus = 0, selected = 0, ticks = 0, simulationTicks = 0, probes = 0, maximumProbes = 0
  let humanHealth = 100, cpuHealth = 100
  let terminal: Terminal | null = null
  for (let index = 0; index < result.events.length - 1; index++) {
    const event: unknown = result.events[index]
    if (terminal || !event || typeof event !== 'object') return false
    if (challengeRecord(event, ['type', 'salvo', 'angle', 'power', 'probeCount', 'simulationTicks', 'coarseBest'])
      && event.type === 'cpu_selected') {
      if (next !== 'selection' || !integer(event.salvo, 2) || event.salvo !== selected + 1
        || !integer(event.angle, 180) || !integer(event.power, 100) || !integer(event.probeCount, 60) || event.probeCount === 0
        || !integer(event.simulationTicks, 60 * 391) || !fire(event.coarseBest)) return false
      selected++
      simulationTicks += event.simulationTicks
      probes += event.probeCount
      maximumProbes = Math.max(maximumProbes, event.probeCount)
      next = 'cpu'
      continue
    }
    if (!challengeRecord(event, ['type', 'actor', 'salvo', 'ticks', 'humanHealth', 'cpuHealth', 'damageToCpu', 'phase'])
      || event.type !== 'salvo_settled' || (event.actor !== 'human' && event.actor !== 'cpu') || event.actor !== next
      || !integer(event.salvo, 3) || !integer(event.ticks, 391) || event.ticks === 0 || !health(event.humanHealth) || !health(event.cpuHealth)
      || !health(event.damageToCpu) || event.humanHealth > humanHealth || event.cpuHealth > cpuHealth
      || (event.phase !== 'PLAYER_TURN' && event.phase !== 'ROUND_OVER' && event.phase !== 'GAME_OVER')) return false
    if (event.actor === 'human') {
      if (event.salvo !== ++humans || event.damageToCpu !== Math.max(0, cpuHealth - event.cpuHealth)) return false
      next = 'selection'
    } else {
      if (event.salvo !== ++cpus || event.salvo !== selected || event.damageToCpu !== 0) return false
      next = 'human'
    }
    ticks += event.ticks
    humanHealth = event.humanHealth; cpuHealth = event.cpuHealth
    // Match the retained objective precedence: human-attributed damage wins,
    // then engine termination, then the third-human-salvo miss.
    terminal = event.actor === 'human' && event.damageToCpu > 0 ? 'objective_cleared'
      : event.phase === 'ROUND_OVER' || event.phase === 'GAME_OVER' ? 'terminal_without_clear'
      : event.actor === 'human' && humans === 3 ? 'objective_not_cleared' : null
  }
  if (work.engineTicks < result.liveTicks + result.cpuSimulationTicks || work.cpuProbes < probes) return false
  if (result.terminal === 'work_limit') {
    // Refusal can interrupt a charged tick or CPU plan before its event/counter
    // is committed. Only lower bounds are valid for those partial attempts.
    return terminal === null && result.humanHealth === 0 && result.cpuHealth === 0
      && result.humanSalvos >= humans && result.humanSalvos <= humans + (next === 'human' ? 1 : 0)
      && result.cpuSalvos === selected && result.liveTicks >= ticks && result.liveTicks - ticks <= 391
      && result.cpuSimulationTicks >= simulationTicks && result.maximumProbeCount >= maximumProbes
  }
  return terminal === result.terminal && result.humanSalvos === humans && result.cpuSalvos === cpus && cpus === selected
    && result.liveTicks === ticks && result.cpuSimulationTicks === simulationTicks && result.maximumProbeCount === maximumProbes
    && result.humanHealth === humanHealth && result.cpuHealth === cpuHealth
    && work.engineTicks === result.liveTicks + result.cpuSimulationTicks && work.cpuProbes === probes
}

/** Validate the trusted retained artifact's output before dispatch. Unknown
 * execution output is infrastructure failure, never an invalid-player receipt. */
function outcomeOf(value: unknown, artifact: ReturnType<typeof getVerifiedChallengeArtifact>, transcript: readonly HumanFire[]): Terminal {
  const invalid = (): never => { throw new Error('invalid_artifact_output') }
  if (!challengeRecord(value, ['result', 'work'])) return invalid()
  const { result, work } = value
  if (!challengeRecord(result, ['editionId', 'seed', 'terminal', 'humanSalvos', 'cpuSalvos', 'humanHealth', 'cpuHealth',
    'liveTicks', 'cpuSimulationTicks', 'maximumProbeCount', 'transcript', 'events'])
    || result.editionId !== 'cq1' || result.seed !== 42
    || typeof result.terminal !== 'string'
    || !['objective_cleared', 'terminal_without_clear', 'objective_not_cleared', 'work_limit'].includes(result.terminal)) return invalid()
  for (const key of ['humanSalvos', 'cpuSalvos', 'liveTicks', 'cpuSimulationTicks', 'maximumProbeCount']) {
    if (!Number.isSafeInteger(result[key]) || (result[key] as number) < 0) return invalid()
  }
  if ((result.humanSalvos as number) > 3 || (result.cpuSalvos as number) > 2
    || (result.maximumProbeCount as number) > 60 || (result.liveTicks as number) > 2346) return invalid()
  for (const key of ['humanHealth', 'cpuHealth']) if (typeof result[key] !== 'number' || !Number.isFinite(result[key])
    || (result[key] as number) < 0 || (result[key] as number) > 100) return invalid()
  if (!Array.isArray(result.transcript) || result.transcript.length !== result.humanSalvos
    || !same(result.transcript, transcript.slice(0, result.transcript.length))
    || (result.terminal !== 'work_limit' && !same(result.transcript, transcript))) return invalid()
  if (!Array.isArray(result.events) || !same(result.events.at(-1), { type: 'terminal', terminal: result.terminal })) return invalid()
  if (!challengeRecord(work, Object.keys(artifact.workLimits))) return invalid()
  let total = 0
  for (const key of Object.keys(artifact.workLimits) as (keyof typeof artifact.workLimits)[]) {
    if (!Number.isSafeInteger(work[key]) || (work[key] as number) < 0 || (work[key] as number) > artifact.workLimits[key]) return invalid()
    if (key !== 'totalUnits') total += work[key] as number
  }
  if (total !== work.totalUnits) return invalid()
  if (!consistentEvents(result as unknown as Result, work as unknown as Work)) return invalid()
  return result.terminal as Terminal
}

export async function handleCompleteVerifiedChallenge(body: unknown, _req: Request, accountId: string, dependencies: Dependencies = {}): Promise<Response> {
  const parsed = parseVerifiedChallengeCompletion(body)
  if (!parsed) return challengeJson({ error: 'invalid_request' }, 400)
  const unavailable = () => challengeJson({ error: 'verification_unavailable' }, 503)
  try {
    const rpc: VerificationLeaseRpc = dependencies.rpc ?? (async (name, args) =>
      await getServiceClient().rpc(name as keyof Database['public']['Functions'], args as never))
    const current = await rpc('get_verified_challenge', { p_account_id: accountId, p_session_id: parsed.sessionId })
    if (current.error) return unavailable()
    if (challengeRecord(current.data, ['ok', 'error']) && current.data.ok === false && current.data.error === 'challenge_not_found')
      return challengeJson({ error: 'challenge_not_found' }, 404)
    const status = projectChallengeStatus(current.data, accountId, parsed.sessionId)
    if (!status) return unavailable()
    if (status.boundTranscript && !same(status.boundTranscript, parsed.transcript))
      return challengeJson({ error: 'challenge_transcript_conflict' }, 409)
    if (status.receipt) return challengeJson({ receipt: status.receipt })
    if (status.status !== 'active') return challengeJson({ error: 'challenge_not_completable' }, 409)
    const artifact = (dependencies.artifact ?? getVerifiedChallengeArtifact)(status.descriptor.verifierArtifactId)
    if (artifact.artifactApiVersion !== 1 || artifact.editionId !== 'cq1') return unavailable()
    const result = await runNativeVerification({ accountId, endpoint: 'complete_verified_challenge', sessionId: parsed.sessionId,
      descriptorBinding: 'cq1', transcript: parsed.transcript }, {
      rpc, wallNow: dependencies.wallNow, now: dependencies.now,
      setup: () => artifact,
      replay: () => (dependencies.replay ?? artifact.replayWithWork)(parsed.transcript),
      validate: (raw) => outcomeOf(raw, artifact, parsed.transcript),
      isInvalidReplayError: (error) => error instanceof Error && invalidErrors.has(error.message),
      onInvalid: async (lease) => {
        const response = await rpc('reject_verified_challenge', { p_account_id: accountId, p_session_id: parsed.sessionId,
          p_worker_id: lease.workerId, p_fence: lease.fence })
        const rejected = response.error ? null : projectChallengeStatus(response.data, accountId, parsed.sessionId)
        return rejected?.status === 'invalid' && same(rejected.boundTranscript, parsed.transcript)
      },
      finalize: async (outcome, lease) => {
        const response = await rpc('finalize_verified_challenge', { p_account_id: accountId, p_session_id: parsed.sessionId,
          p_edition_id: 'cq1', p_transcript: parsed.transcript, p_outcome: outcome, p_worker_id: lease.workerId, p_fence: lease.fence })
        if (response.error || !challengeRecord(response.data, ['ok', 'receipt']) || response.data.ok !== true) return null
        const receipt = projectVerifiedChallengeReceipt(response.data.receipt)
        return receipt && receipt.accountId === accountId && receipt.sessionId === parsed.sessionId && receipt.outcome === outcome
          && same(receipt.transcript, parsed.transcript) ? { ok: true, value: receipt } : null
      },
    })
    if (result.kind === 'completed') return challengeJson({ receipt: result.value })
    if (result.kind === 'receipt') return challengeJson({ receipt: result.receipt })
    if (result.kind === 'busy') {
      const response = challengeJson({ error: 'verification_busy', retryAfter: result.retryAfter }, 503)
      response.headers.set('Access-Control-Expose-Headers', 'Retry-After')
      response.headers.set('Retry-After', String(result.retryAfter)); return response
    }
    if (result.kind === 'replay_invalid') return challengeJson({ error: 'invalid_challenge_transcript' }, 409)
    if (result.kind === 'rejected') return challengeJson({ error: result.code }, result.code === 'challenge_not_found' ? 404 : 409)
    return unavailable()
  } catch { return unavailable() }
}
export const serveCompleteVerifiedChallenge = createChallengeRequestHandler(handleCompleteVerifiedChallenge, 'complete_verified_challenge', 2048)
if (import.meta.main) Deno.serve(serveCompleteVerifiedChallenge)
