import { getServiceClient, json, UUID_REGEX } from '../_shared/mod.ts'
import {
  chooseVerifiedSeed,
  createVerifiedRequestHandler,
  normalizeVerifiedDisplayName,
  VERIFIED_CONTRACT_VERSION,
  VERIFIED_DEPLOYMENT_OPTIONS,
  VERIFIED_ENGINE_VERSION,
  VERIFIED_RULESET_VERSION,
  type VerifiedServiceClient,
} from '../_shared/verifiedDeployment.ts'

type StartRow = { id: string; user_id: string; config: unknown; contract_version: number; engine_version: number; ruleset_version: number; status: string; expires_at: string; created_at: string; resumed: boolean }

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

function validStoredConfig(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const config = value as Record<string, unknown>
  if (!exactKeys(config, ['seed', 'options']) || ![17, 42, 73, 109].includes(config.seed as number)) return false
  if (!config.options || typeof config.options !== 'object' || Array.isArray(config.options)) return false
  const options = config.options as Record<string, unknown>
  if (!exactKeys(options, [...Object.keys(VERIFIED_DEPLOYMENT_OPTIONS), 'players'])) return false
  for (const [key, expected] of Object.entries(VERIFIED_DEPLOYMENT_OPTIONS)) {
    if (options[key] !== expected) return false
  }
  if (!Array.isArray(options.players) || options.players.length !== 2) return false
  const [human, cpu] = options.players
  if (!human || typeof human !== 'object' || Array.isArray(human) || !cpu || typeof cpu !== 'object' || Array.isArray(cpu)) return false
  const humanRow = human as Record<string, unknown>
  const cpuRow = cpu as Record<string, unknown>
  return exactKeys(humanRow, ['name', 'color'])
    && typeof humanRow.name === 'string'
    && normalizeVerifiedDisplayName(humanRow.name) === humanRow.name
    && humanRow.color === '#e8554d'
    && exactKeys(cpuRow, ['name', 'color', 'ai'])
    && cpuRow.name === 'CPU 1'
    && cpuRow.color === '#3f78b8'
    && cpuRow.ai === 'hard'
}

export interface StartVerifiedDeploymentDependencies {
  supabase?: VerifiedServiceClient
  chooseSeed?: () => 17 | 42 | 73 | 109
  now?: () => Date
  logger?: (message: string, context: Record<string, unknown>) => void
}

export function buildVerifiedDeploymentConfig(displayName: string, seed: 17 | 42 | 73 | 109) {
  return {
    seed,
    options: {
      ...VERIFIED_DEPLOYMENT_OPTIONS,
      players: [
        { name: normalizeVerifiedDisplayName(displayName), color: '#e8554d' },
        { name: 'CPU 1', color: '#3f78b8', ai: 'hard' },
      ],
    },
  }
}

function validStartRow(value: unknown, userId: string): value is StartRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && UUID_REGEX.test(row.id)
    && row.user_id === userId
    && row.status === 'active' && row.contract_version === 1 && row.engine_version === 1 && row.ruleset_version === 3
    && typeof row.expires_at === 'string' && Number.isFinite(Date.parse(row.expires_at))
    && typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
    && typeof row.resumed === 'boolean'
    && validStoredConfig(row.config)
}

export async function handleStartVerifiedDeployment(
  _body: unknown,
  _req: Request,
  userId: string,
  dependencies: StartVerifiedDeploymentDependencies = {},
): Promise<Response> {
  const supabase = dependencies.supabase ?? getServiceClient()
  const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
  const fail = (status = 500) => json({ error: 'verified_deployment_unavailable' }, status)
  try {
    const profile = await supabase.from('profiles').select('display_name').eq('id', userId).single()
    if (profile.error || !profile.data || typeof profile.data.display_name !== 'string') {
      logger('start_verified_deployment: profile unavailable', { stage: 'profile', code: 'query_failed' })
      return fail()
    }
    const seed = (dependencies.chooseSeed ?? chooseVerifiedSeed)()
    const config = buildVerifiedDeploymentConfig(profile.data.display_name, seed)
    const now = (dependencies.now ?? (() => new Date()))()
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString()
    const result = await supabase.rpc('start_verified_deployment', { p_user_id: userId, p_config: config, p_expires_at: expiresAt })
    const row = Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : null
    if (result.error || !validStartRow(row, userId)) {
      logger('start_verified_deployment: start unavailable', { stage: 'rpc', code: 'request_failed' })
      return fail(result.error && String((result.error as { message?: unknown }).message).includes('starts_disabled') ? 503 : 500)
    }
    return json({
      sessionId: row.id.toLowerCase(), resumed: row.resumed, expiresAt: row.expires_at,
      contractVersion: VERIFIED_CONTRACT_VERSION, engineVersion: VERIFIED_ENGINE_VERSION, rulesetVersion: VERIFIED_RULESET_VERSION,
      limits: { humanSalvos: 6, cpuSalvos: 6, angle: { min: 0, max: 180 }, power: { min: 0, max: 100 } },
      config: row.config,
    })
  } catch {
    logger('start_verified_deployment: unavailable', { stage: 'unexpected', code: 'request_failed' })
    return fail()
  }
}

export function createStartVerifiedDeploymentHandler(
  wrap: typeof createVerifiedRequestHandler = createVerifiedRequestHandler,
) {
  return wrap(handleStartVerifiedDeployment, { operation: 'start_verified_deployment', bodyLimit: 0 })
}

export const serveStartVerifiedDeployment = createStartVerifiedDeploymentHandler()

if (import.meta.main) Deno.serve(serveStartVerifiedDeployment)
