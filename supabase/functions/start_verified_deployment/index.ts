import { getServiceClient, json, UUID_REGEX } from '../_shared/mod.ts'
import {
  chooseVerifiedSeed,
  createVerifiedRequestHandler,
  normalizeVerifiedDisplayName,
  VERIFIED_DEPLOYMENT_OPTIONS,
  type VerifiedServiceClient,
} from '../_shared/verifiedDeployment.ts'

type StartRow = { id: string; user_id: string; config: unknown; contract_version: number; engine_version: number; ruleset_version: number; status: string; expires_at: string; created_at: string; resumed: boolean }
type VerifiedCapability = { contractVersion: 2 | 3; engineVersion: 2 | 3; rulesetVersion: 4 }

const VERIFIED_CAPABILITIES: readonly VerifiedCapability[] = [
  { contractVersion: 2, engineVersion: 2, rulesetVersion: 4 },
  { contractVersion: 3, engineVersion: 3, rulesetVersion: 4 },
]

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

export function parseVerifiedStartCapabilities(body: unknown): readonly VerifiedCapability[] | null {
  if (body === undefined) return [VERIFIED_CAPABILITIES[0]!]
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const request = body as Record<string, unknown>
  if (!exactKeys(request, ['capabilities']) || !Array.isArray(request.capabilities)
    || request.capabilities.length < 1 || request.capabilities.length > VERIFIED_CAPABILITIES.length) return null
  const parsed: VerifiedCapability[] = []
  for (const value of request.capabilities) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const tuple = value as Record<string, unknown>
    if (!exactKeys(tuple, ['contractVersion', 'engineVersion', 'rulesetVersion'])) return null
    const canonical = VERIFIED_CAPABILITIES.find((candidate) => candidate.contractVersion === tuple.contractVersion
      && candidate.engineVersion === tuple.engineVersion && candidate.rulesetVersion === tuple.rulesetVersion)
    if (!canonical || parsed.some((candidate) => candidate.contractVersion === canonical.contractVersion)) return null
    parsed.push(canonical)
  }
  return parsed
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

function validStartRow(value: unknown, userId: string, capabilities: readonly VerifiedCapability[]): value is StartRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const canonicalTuple = VERIFIED_CAPABILITIES.some((candidate) => candidate.contractVersion === row.contract_version
    && candidate.engineVersion === row.engine_version && candidate.rulesetVersion === row.ruleset_version)
  return typeof row.id === 'string' && UUID_REGEX.test(row.id)
    && row.user_id === userId
    && row.status === 'active' && canonicalTuple
    && capabilities.some(({ contractVersion }) => contractVersion === row.contract_version)
    && typeof row.expires_at === 'string' && Number.isFinite(Date.parse(row.expires_at))
    && typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
    && typeof row.resumed === 'boolean'
    && validStoredConfig(row.config)
}

export async function handleStartVerifiedDeployment(
  body: unknown,
  _req: Request,
  userId: string,
  dependencies: StartVerifiedDeploymentDependencies = {},
): Promise<Response> {
  const capabilities = parseVerifiedStartCapabilities(body)
  if (!capabilities) return json({ error: 'invalid_request' }, 400)
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
    const result = await supabase.rpc('start_verified_deployment_for_contracts', {
      p_user_id: userId,
      p_config: config,
      p_expires_at: expiresAt,
      p_supported_contract_versions: capabilities.map(({ contractVersion }) => contractVersion),
    })
    const row = Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : null
    if (result.error || !validStartRow(row, userId, capabilities)) {
      logger('start_verified_deployment: start unavailable', { stage: 'rpc', code: 'request_failed' })
      return fail(result.error && String((result.error as { message?: unknown }).message).includes('starts_disabled') ? 503 : 500)
    }
    return json({
      sessionId: row.id.toLowerCase(), resumed: row.resumed, expiresAt: row.expires_at,
      contractVersion: row.contract_version, engineVersion: row.engine_version, rulesetVersion: row.ruleset_version,
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
  return wrap(handleStartVerifiedDeployment, {
    operation: 'start_verified_deployment', bodyLimit: 256, bodyMode: 'optional-json',
  })
}

export const serveStartVerifiedDeployment = createStartVerifiedDeploymentHandler()

if (import.meta.main) Deno.serve(serveStartVerifiedDeployment)
