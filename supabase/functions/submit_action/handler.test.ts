// submit_action/handler.test.ts — seam pin for the exported handleSubmitAction
// entry (refactor: handler lifted out of `import.meta.main`). Asserts the no-DB
// shape-rejection path is reachable through the exported function. Full live-body
// coverage (turn-gate, seq allocation, roundOver, bot-proxy) is #122.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleSubmitAction } from './index.ts'

Deno.test('handleSubmitAction: missing roomId returns 400 (no DB)', async () => {
  const res = await handleSubmitAction({})
  assertEquals(res.status, 400)
})
