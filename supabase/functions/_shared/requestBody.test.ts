import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { withCors, json } from './mod.ts'
import { handleCreateRoom } from '../create_room/index.ts'
import { handleJoinRoom } from '../join_room/index.ts'
import { handleRestartGame } from '../restart_game/index.ts'
import { handleSubmitAction } from '../submit_action/index.ts'
import { handleUpdatePlayer } from '../update_player/index.ts'
import { handleHeartbeat } from '../heartbeat/index.ts'
import { handleLeaveRoom } from '../leave_room/index.ts'
import { handleReadyUp } from '../ready_up/index.ts'
import { handleFinishGame } from '../finish_game/index.ts'

const handlers = {
  create_room: handleCreateRoom,
  join_room: handleJoinRoom,
  restart_game: handleRestartGame,
  submit_action: handleSubmitAction,
  update_player: handleUpdatePlayer,
  heartbeat: handleHeartbeat,
  leave_room: handleLeaveRoom,
  ready_up: handleReadyUp,
  finish_game: handleFinishGame,
}

for (const [name, handler] of Object.entries(handlers)) {
  for (const body of [null, [], ['unexpected'], true, 42, 'unexpected']) {
    Deno.test(`object body: ${name} refuses ${JSON.stringify(body)} before limiter or handler`, async () => {
      let limiterCalls = 0
      let handlerCalls = 0
      const serve = withCors((parsed) => {
        handlerCalls += 1
        return handler(parsed)
      }, { rateLimit: name }, { rateLimit: {
        bumpRateLimit: async () => { limiterCalls += 1; return { data: 1, error: null } },
      } })
      const response = await serve(new Request('https://example.invalid', {
        method: 'POST', body: JSON.stringify(body),
      }))
      assertEquals(response.status, 400)
      assertEquals(await response.json(), { error: 'JSON body must be an object' })
      assertEquals(handlerCalls, 0)
      assertEquals(limiterCalls, 0)
    })
  }
}

Deno.test('object body: optional-body routes retain their ignored-body contract', async () => {
  for (const body of ['null', '[]', '42', 'not-json', '']) {
    let calls = 0
    const serve = withCors(() => { calls += 1; return json({ ok: true }) }, { optionalBody: true })
    const response = await serve(new Request('https://example.invalid', { method: 'POST', body }))
    assertEquals(response.status, 200)
    assertEquals(calls, 1)
  }
})
