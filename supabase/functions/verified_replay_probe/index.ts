import {
  authenticateBearer,
  getServiceClient,
  json,
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

export interface VerifiedReplayProbeDependencies {
  supabase?: Pick<ServiceClient, 'auth'>
  replay?: typeof replayVerifiedTranscript
  logger?: (message: string, context: Record<string, unknown>) => void
}

export async function handleVerifiedReplayProbe(
  _body: unknown,
  req: Request,
  dependencies: VerifiedReplayProbeDependencies = {},
): Promise<Response> {
  const supabase = dependencies.supabase ?? getServiceClient()
  const userId = await authenticateBearer(req, supabase)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const replay = dependencies.replay ?? replayVerifiedTranscript
  const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
  try {
    return json({
      ok: true,
      probeVersion: VERIFIED_REPLAY_PROBE_VERSION,
      engineVersion: VERIFIED_REPLAY_PROBE_ENGINE_VERSION,
      rulesetVersion: VERIFIED_REPLAY_PROBE_RULESET_VERSION,
      fixtures: {
        maximumLifecycle: replay(
          VERIFIED_REPLAY_PROBE_FIXTURES.maximumLifecycle.config,
          VERIFIED_REPLAY_PROBE_FIXTURES.maximumLifecycle.transcript,
        ),
        maximumTurn: replay(
          VERIFIED_REPLAY_PROBE_FIXTURES.maximumTurn.config,
          VERIFIED_REPLAY_PROBE_FIXTURES.maximumTurn.transcript,
        ),
      },
    })
  } catch (error) {
    logger('verified_replay_probe: replay failed', {
      stage: 'replay',
      code: error instanceof VerifiedReplayError ? error.code : 'unexpected',
    })
    return json({ error: 'probe_unavailable' }, 500)
  }
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
