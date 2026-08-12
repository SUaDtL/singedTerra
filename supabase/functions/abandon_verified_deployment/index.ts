import { getServiceClient, json, UUID_REGEX } from '../_shared/mod.ts'
import { createVerifiedRequestHandler, type VerifiedServiceClient } from '../_shared/verifiedDeployment.ts'

export interface AbandonVerifiedDeploymentDependencies {
  supabase?: VerifiedServiceClient
  logger?: (message: string, context: Record<string, unknown>) => void
}

function exactRequest(body: unknown): body is { sessionId: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const row = body as Record<string, unknown>
  return Object.keys(row).length === 1 && typeof row.sessionId === 'string' && UUID_REGEX.test(row.sessionId)
}

function validAbandonRow(
  value: unknown,
  userId: string,
  sessionId: string,
): value is { id: string; user_id: string; status: 'abandoned' } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return row.id === sessionId && row.user_id === userId && row.status === 'abandoned'
}

export async function handleAbandonVerifiedDeployment(
  body: unknown,
  _req: Request,
  userId: string,
  dependencies: AbandonVerifiedDeploymentDependencies = {},
): Promise<Response> {
  if (!exactRequest(body)) return json({ error: 'invalid_request' }, 400)
  const sessionId = body.sessionId.toLowerCase()
  const supabase = dependencies.supabase ?? getServiceClient()
  const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
  try {
    const result = await supabase.rpc('abandon_verified_deployment', { p_user_id: userId, p_session_id: sessionId })
    const row = Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : null
    if (result.error || !validAbandonRow(row, userId, sessionId)) {
      logger('abandon_verified_deployment: unavailable', { stage: 'rpc', code: 'request_failed' })
      return json({ error: 'verified_deployment_unavailable' }, 409)
    }
    return json({ ok: true, sessionId, status: 'abandoned' })
  } catch {
    logger('abandon_verified_deployment: unavailable', { stage: 'unexpected', code: 'request_failed' })
    return json({ error: 'verified_deployment_unavailable' }, 500)
  }
}

export function createAbandonVerifiedDeploymentHandler(
  wrap: typeof createVerifiedRequestHandler = createVerifiedRequestHandler,
) {
  return wrap(handleAbandonVerifiedDeployment, { operation: 'abandon_verified_deployment', bodyLimit: 128 })
}

export const serveAbandonVerifiedDeployment = createAbandonVerifiedDeploymentHandler()

if (import.meta.main) Deno.serve(serveAbandonVerifiedDeployment)
