// create_room/handler.test.ts — seam pin for the exported handleCreateRoom entry
// (refactor: handler lifted out of a top-level Deno.serve into an import.meta.main
// guard). Asserts the no-DB validation-rejection path is reachable through the
// exported function.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleCreateRoom } from './index.ts'

Deno.test('handleCreateRoom: missing playerName returns 400 (no DB)', async () => {
  const res = await handleCreateRoom({})
  assertEquals(res.status, 400)
})
