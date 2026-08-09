import {
  authenticateBearer,
  getServiceClient,
  json,
  safeErrorMessage,
  type ServiceClient,
  UUID_REGEX,
  withCors,
} from '../_shared/mod.ts'

type HotSeatMatchRecord = {
  user_id: string
  match_id: string
  won: boolean
}

export interface RecordHotSeatMatchDependencies {
  supabase?: ServiceClient
  logger?: (message: string, context: Record<string, unknown>) => void
}

function isRecordRequest(body: unknown): body is { matchId: string; won: boolean } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const record = body as Record<string, unknown>
  return Object.keys(record).length === 2
    && Object.hasOwn(record, 'matchId')
    && Object.hasOwn(record, 'won')
    && typeof record.matchId === 'string'
    && UUID_REGEX.test(record.matchId)
    && typeof record.won === 'boolean'
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === '23505'
}

function sameOutcome(record: HotSeatMatchRecord, expected: HotSeatMatchRecord): boolean {
  return record.user_id === expected.user_id
    && record.match_id === expected.match_id
    && record.won === expected.won
}

export async function handleRecordHotSeatMatch(
  body: unknown,
  req: Request,
  dependencies: RecordHotSeatMatchDependencies = {},
): Promise<Response> {
  if (!isRecordRequest(body)) return json({ error: 'invalid_hotseat_match' }, 400)

  const matchId = body.matchId.toLowerCase()

  const supabase = dependencies.supabase ?? getServiceClient()
  const userId = await authenticateBearer(req, supabase)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const logger = dependencies.logger ?? ((message, context) => console.error(message, context))
  const fail = (stage: string, error: unknown): Response => {
    logger(`record_hotseat_match: ${stage}`, {
      matchId,
      error: safeErrorMessage(error),
    })
    return json({ error: 'hotseat_match_failed' }, 500)
  }
  const expected: HotSeatMatchRecord = {
    user_id: userId,
    match_id: matchId,
    won: body.won,
  }

  const readExisting = () => supabase
    .from('hotseat_match_results')
    .select('user_id, match_id, won')
    .eq('user_id', userId)
    .eq('match_id', matchId)
    .maybeSingle()

  const firstRead = await readExisting()
  if (firstRead.error) return fail('lookup failed', firstRead.error)
  if (firstRead.data) {
    return sameOutcome(firstRead.data, expected)
      ? json({ ok: true, recorded: false })
      : json({ error: 'hotseat_match_conflict' }, 409)
  }

  const { error: insertError } = await supabase
    .from('hotseat_match_results')
    .insert(expected)
  if (!insertError) return json({ ok: true, recorded: true })
  if (!isUniqueViolation(insertError)) return fail('insert failed', insertError)

  const raceRead = await readExisting()
  if (raceRead.error) return fail('race lookup failed', raceRead.error)
  return raceRead.data && sameOutcome(raceRead.data, expected)
    ? json({ ok: true, recorded: false })
    : json({ error: 'hotseat_match_conflict' }, 409)
}

if (import.meta.main) {
  Deno.serve(withCors(handleRecordHotSeatMatch, { rateLimit: 'record_hotseat_match' }))
}
