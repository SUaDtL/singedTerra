// ready_up/handler.test.ts — seam pin for the exported handleReadyUp entry
// (refactor: handler lifted out of `import.meta.main`). Asserts the no-DB
// validation-rejection path is reachable through the exported function.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleReadyUp } from './index.ts'

Deno.test('handleReadyUp: invalid roomId returns 400 (no DB)', async () => {
  const res = await handleReadyUp({})
  assertEquals(res.status, 400)
})
