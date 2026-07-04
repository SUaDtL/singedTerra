// join_room/handler.test.ts — seam pin for the exported handleJoinRoom entry
// (refactor: handler lifted out of `import.meta.main`). Asserts the no-DB
// validation-rejection path is reachable through the exported function.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleJoinRoom } from './index.ts'

Deno.test('handleJoinRoom: missing code returns 400 (no DB)', async () => {
  const res = await handleJoinRoom({})
  assertEquals(res.status, 400)
})
