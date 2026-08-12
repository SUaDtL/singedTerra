import { getServiceClient, json, type Database, type ServiceClient } from '../_shared/mod.ts'
import {
  createVerifiedRequestHandler,
  parseVerifiedDeploymentCompletion,
  projectVerifiedDeploymentReceipt,
  type VerifiedDeploymentCompletionRequest,
  type VerifiedDeploymentResultReceipt,
  type VerifiedHumanFire,
} from '../_shared/verifiedDeployment.ts'
import { replayVerifiedDuel } from '../../../shared/src/net/verifiedDuel.ts'

type StoredConfig = { seed: 17 | 42 | 73 | 109; options: Record<string, unknown> }

type VerifiedFunctions = Database['public']['Functions']
type CompletionContextRow = VerifiedFunctions['verified_deployment_completion_context']['Returns'][number] & { config: StoredConfig }
type CompletionResultRow = VerifiedFunctions['complete_verified_deployment']['Returns'][number]
type CompletionServiceClient = Pick<ServiceClient, 'rpc'>

export interface CompleteVerifiedDeploymentDependencies {
  supabase?: CompletionServiceClient
  replay?: typeof replayVerifiedDuel
  now?: () => Date
  logger?: (message: string, context: Record<string, unknown>) => void
}

function sameTranscript(left: readonly VerifiedHumanFire[], right: readonly VerifiedHumanFire[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry.angle === right[index]?.angle && entry.power === right[index]?.power)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function validStoredConfig(value: unknown): value is StoredConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const config = value as Record<string, unknown>
  if (!exactKeys(config, ['seed', 'options']) || ![17, 42, 73, 109].includes(config.seed as number) || !config.options || typeof config.options !== 'object' || Array.isArray(config.options)) return false
  const options = config.options as Record<string, unknown>
  if (!exactKeys(options, ['maxPlayers', 'maxWind', 'gravity', 'walls', 'hazards', 'rounds', 'interestRate', 'suddenDeathTurn', 'armsLevel', 'starterWeaponFalloff', 'teamMode', 'players'])) return false
  if (!(options.maxPlayers === 2 && options.maxWind === 6 && options.gravity === 0.15
    && options.walls === 'open' && options.hazards === 'none' && options.rounds === 1
    && options.interestRate === 0 && options.suddenDeathTurn === 0 && options.armsLevel === 0
    && options.starterWeaponFalloff === 'decisive' && options.teamMode === false
    && Array.isArray(options.players) && options.players.length === 2)) return false
  const [human, cpu] = options.players
  if (!human || typeof human !== 'object' || Array.isArray(human) || !cpu || typeof cpu !== 'object' || Array.isArray(cpu)) return false
  const humanRow = human as Record<string, unknown>
  const cpuRow = cpu as Record<string, unknown>
  return exactKeys(humanRow, ['name', 'color']) && typeof humanRow.name === 'string' && humanRow.color === '#e8554d'
    && exactKeys(cpuRow, ['name', 'color', 'ai']) && cpuRow.name === 'CPU 1' && cpuRow.color === '#3f78b8' && cpuRow.ai === 'hard'
}

function validContext(value: unknown, userId: string, sessionId: string): value is CompletionContextRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return exactKeys(row, [
    'session_id', 'user_id', 'config', 'contract_version', 'engine_version', 'ruleset_version',
    'status', 'expires_at', 'transcript', 'won', 'outcome', 'verified_xp',
    'prior_verified_matches', 'prior_verified_wins', 'prior_total_xp',
    'current_verified_matches', 'current_verified_wins', 'current_total_xp', 'result_created_at',
  ])
    && row.session_id === sessionId && row.user_id === userId && validStoredConfig(row.config)
    && row.contract_version === 1 && row.engine_version === 1 && row.ruleset_version === 3
    && typeof row.status === 'string' && typeof row.expires_at === 'string' && Number.isFinite(Date.parse(row.expires_at))
}

type ProjectedReceipt = NonNullable<ReturnType<typeof projectVerifiedDeploymentReceipt>>

function projectResultSpecificReceipt(
  result: VerifiedDeploymentResultReceipt,
  row: Record<string, unknown>,
): ProjectedReceipt | null {
  const progressionKeys = [
    'prior_verified_matches', 'prior_verified_wins', 'prior_total_xp',
    'current_verified_matches', 'current_verified_wins', 'current_total_xp',
  ] as const
  if (!progressionKeys.every((key) => Number.isSafeInteger(row[key]) && (row[key] as number) >= 0)) return null
  const receipt = projectVerifiedDeploymentReceipt(result, {
    matchesPlayed: row.current_verified_matches as number,
    wins: row.current_verified_wins as number,
    totalXp: row.current_total_xp as number,
  })
  if (!receipt
    || receipt.progression.prior.matchesPlayed !== row.prior_verified_matches
    || receipt.progression.prior.wins !== row.prior_verified_wins
    || receipt.progression.prior.totalXp !== row.prior_total_xp) return null
  return receipt
}

function receiptFromRow(value: unknown, userId: string, sessionId: string, expectedTranscript: readonly VerifiedHumanFire[]): ProjectedReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (!exactKeys(raw, [
    'session_id', 'user_id', 'transcript', 'won', 'outcome', 'verified_xp',
    'prior_verified_matches', 'prior_verified_wins', 'prior_total_xp',
    'current_verified_matches', 'current_verified_wins', 'current_total_xp', 'created_at',
  ])) return null
  const row = raw as unknown as CompletionResultRow
  const parsed = parseVerifiedDeploymentCompletion({ sessionId: row.session_id, transcript: row.transcript })
  if (!parsed || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
    || row.session_id !== sessionId || row.user_id !== userId || !sameTranscript(parsed.transcript, expectedTranscript)) return null
  if (typeof row.won !== 'boolean' || (row.outcome !== 'win' && row.outcome !== 'loss' && row.outcome !== 'draw') || (row.verified_xp !== 100 && row.verified_xp !== 200)) return null
  const receipt = { sessionId, won: row.won, outcome: row.outcome, verifiedXp: row.verified_xp } as VerifiedDeploymentResultReceipt
  const validResult = (receipt.won && receipt.outcome === 'win' && receipt.verifiedXp === 200)
    || (!receipt.won && (receipt.outcome === 'loss' || receipt.outcome === 'draw') && receipt.verifiedXp === 100)
  return validResult ? projectResultSpecificReceipt(receipt, raw) : null
}

function completedReceipt(row: CompletionContextRow, userId: string, sessionId: string, transcript: readonly VerifiedHumanFire[]): ProjectedReceipt | null {
  if (row.status !== 'completed' || typeof row.result_created_at !== 'string' || !Number.isFinite(Date.parse(row.result_created_at))) return null
  const parsed = parseVerifiedDeploymentCompletion({ sessionId: row.session_id, transcript: row.transcript })
  if (!parsed || row.session_id !== sessionId || row.user_id !== userId || !sameTranscript(parsed.transcript, transcript)
    || typeof row.won !== 'boolean' || (row.outcome !== 'win' && row.outcome !== 'loss' && row.outcome !== 'draw')
    || (row.verified_xp !== 100 && row.verified_xp !== 200)) return null
  const receipt = { sessionId, won: row.won, outcome: row.outcome, verifiedXp: row.verified_xp } as VerifiedDeploymentResultReceipt
  const validResult = (receipt.won && receipt.outcome === 'win' && receipt.verifiedXp === 200)
    || (!receipt.won && (receipt.outcome === 'loss' || receipt.outcome === 'draw') && receipt.verifiedXp === 100)
  return validResult ? projectResultSpecificReceipt(receipt, row as unknown as Record<string, unknown>) : null
}

export async function handleCompleteVerifiedDeployment(
  body: unknown,
  _req: Request,
  userId: string,
  dependencies: CompleteVerifiedDeploymentDependencies = {},
): Promise<Response> {
  const request = parseVerifiedDeploymentCompletion(body)
  if (!request) return json({ error: 'invalid_request' }, 400)
  const supabase = dependencies.supabase ?? getServiceClient()
  const replay = dependencies.replay ?? replayVerifiedDuel
  const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
  const unavailable = (status: number) => json({ error: 'verified_deployment_unavailable' }, status)
  try {
    const contextResult = await supabase.rpc('verified_deployment_completion_context', {
      p_user_id: userId, p_session_id: request.sessionId,
    })
    const context = Array.isArray(contextResult.data) && contextResult.data.length === 1 ? contextResult.data[0] : null
    if (contextResult.error || !validContext(context, userId, request.sessionId)) return unavailable(409)
    if (new Date(context.expires_at).getTime() <= (dependencies.now ?? (() => new Date()))().getTime()) return unavailable(409)

    const stored = completedReceipt(context, userId, request.sessionId, request.transcript)
    if (context.status === 'completed') {
      if (!stored) return unavailable(409)
      return json(stored)
    }
    if (context.status !== 'active' || context.transcript !== null || context.won !== null || context.outcome !== null
      || context.verified_xp !== null || context.prior_verified_matches !== null || context.prior_verified_wins !== null
      || context.prior_total_xp !== null || context.current_verified_matches !== null || context.current_verified_wins !== null
      || context.current_total_xp !== null || context.result_created_at !== null) return unavailable(409)

    let replayed
    try {
      replayed = replay(context.config.seed, request.transcript)
    } catch {
      logger('complete_verified_deployment: replay refused', { stage: 'replay', code: 'replay_failed' })
      return unavailable(409)
    }
    const replayTranscript = parseVerifiedDeploymentCompletion({ sessionId: request.sessionId, transcript: replayed.transcript })
    if (!replayTranscript || !sameTranscript(replayTranscript.transcript, request.transcript)) return unavailable(409)
    const result: VerifiedDeploymentResultReceipt = replayed.outcome === 'human_win'
      ? { sessionId: request.sessionId, won: true, outcome: 'win', verifiedXp: 200 }
      : replayed.outcome === 'cpu_win'
      ? { sessionId: request.sessionId, won: false, outcome: 'loss', verifiedXp: 100 }
      : replayed.outcome === 'draw'
      ? { sessionId: request.sessionId, won: false, outcome: 'draw', verifiedXp: 100 }
      : (() => { throw new Error('invalid_replay_outcome') })()
    const completion = await supabase.rpc('complete_verified_deployment', {
      p_user_id: userId, p_session_id: request.sessionId,
      p_transcript: request.transcript.map(({ angle, power }) => ({ angle, power })),
      p_won: result.won, p_outcome: result.outcome, p_verified_xp: result.verifiedXp,
    })
    const storedResult = Array.isArray(completion.data) && completion.data.length === 1
      ? receiptFromRow(completion.data[0], userId, request.sessionId, request.transcript)
      : null
    if (completion.error || !storedResult || storedResult.result.won !== result.won
      || storedResult.result.outcome !== result.outcome || storedResult.result.verifiedXp !== result.verifiedXp) return unavailable(409)
    return json(storedResult)
  } catch {
    logger('complete_verified_deployment: unavailable', { stage: 'storage', code: 'request_failed' })
    return unavailable(500)
  }
}

export function createCompleteVerifiedDeploymentHandler(
  wrap: typeof createVerifiedRequestHandler = createVerifiedRequestHandler,
) {
  return wrap(handleCompleteVerifiedDeployment, { operation: 'complete_verified_deployment', bodyLimit: 1024 })
}

export const serveCompleteVerifiedDeployment = createCompleteVerifiedDeploymentHandler()

if (import.meta.main) Deno.serve(serveCompleteVerifiedDeployment)
