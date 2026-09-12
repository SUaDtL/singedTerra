// finish_game/handler.test.ts — seam pin for the exported handleFinishGame entry
// (refactor: handler lifted out of `import.meta.main`). Asserts the no-DB
// validation-rejection path is reachable through the exported function.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleFinishGame, type FinishGameDependencies } from './index.ts'

const ROOM_ID = '00000000-0000-4000-8000-000000000001'
const PLAYER_ID = '00000000-0000-4000-8000-000000000002'
const SCOREBOARD = [
  { tankId: 'p1', playerName: 'A', roundWins: 1, kills: 1, totalDamage: 100 },
  { tankId: 'p2', playerName: 'B', roundWins: 0, kills: 0, totalDamage: 20 },
]

function body(overrides: Record<string, unknown> = {}) {
  return {
    roomId: ROOM_ID,
    playerId: PLAYER_ID,
    token: 'seat-secret',
    winnerId: 'p1',
    rounds: 1,
    scoreboard: SCOREBOARD,
    ...overrides,
  }
}

function dependencies(result: { data: unknown; error: unknown }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []
  const deps: FinishGameDependencies = {
    supabase: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args })
        return result
      },
    } as never,
    logger: (message, context) => logs.push({ message, context }),
  }
  return { deps, calls, logs }
}

Deno.test('handleFinishGame: invalid roomId returns 400 (no DB)', async () => {
  const res = await handleFinishGame({})
  assertEquals(res.status, 400)
})

Deno.test('handleFinishGame sends one strict report to the atomic completion RPC', async () => {
  const fixture = dependencies({ data: { ok: true, evidence: 'casual_participant_reported' }, error: null })
  const response = await handleFinishGame(body(), undefined, fixture.deps)
  assertEquals(response.status, 200)
  assertEquals(await response.json(), { ok: true, evidence: 'casual_participant_reported' })
  assertEquals(fixture.calls, [{
    name: 'finish_casual_match_v1',
    args: {
      p_room_id: ROOM_ID,
      p_player_id: PLAYER_ID,
      p_token: 'seat-secret',
      p_winner: 'p1',
      p_rounds: 1,
      p_scoreboard: SCOREBOARD,
    },
  }])
})

Deno.test('handleFinishGame rejects malformed supplied scores before persistence', async () => {
  const fixture = dependencies({ data: null, error: null })
  const response = await handleFinishGame(body({ scoreboard: [SCOREBOARD[0]] }), undefined, fixture.deps)
  assertEquals(response.status, 400)
  assertEquals(await response.json(), { error: 'invalid_scoreboard', retryable: true })
  assertEquals(fixture.calls, [])
})

Deno.test('handleFinishGame preserves an absent legacy scoreboard as explicit RPC input', async () => {
  const fixture = dependencies({ data: { ok: true, receipt: { completionStatus: 'score_absent' } }, error: null })
  const response = await handleFinishGame(body({ rounds: undefined, scoreboard: undefined }), undefined, fixture.deps)
  assertEquals(response.status, 200)
  assertEquals(fixture.calls[0]?.args.p_rounds, null)
  assertEquals(fixture.calls[0]?.args.p_scoreboard, null)
})

Deno.test('handleFinishGame maps a contradictory report to a typed conflict', async () => {
  const fixture = dependencies({ data: { ok: false, error: 'completion_conflict' }, error: null })
  const response = await handleFinishGame(body(), undefined, fixture.deps)
  assertEquals(response.status, 409)
  assertEquals(await response.json(), { ok: false, error: 'completion_conflict' })
})

Deno.test('handleFinishGame preserves typed completion authorization refusals as 403', async () => {
  for (const error of ['not_room_member', 'invalid_seat_token']) {
    const fixture = dependencies({ data: { ok: false, error }, error: null })
    const response = await handleFinishGame(body(), undefined, fixture.deps)
    assertEquals(response.status, 403)
    assertEquals(await response.json(), { ok: false, error })
  }
})

Deno.test('handleFinishGame makes database failures retryable without reflecting backend detail', async () => {
  const fixture = dependencies({ data: null, error: { message: 'database secret detail' } })
  const response = await handleFinishGame(body(), undefined, fixture.deps)
  assertEquals(response.status, 500)
  const payload = await response.json()
  assertEquals(payload, { error: 'completion_failed', retryable: true })
  assertEquals(JSON.stringify(payload).includes('database secret detail'), false)
  assertEquals(fixture.logs[0]?.context.error, 'database secret detail')
})
