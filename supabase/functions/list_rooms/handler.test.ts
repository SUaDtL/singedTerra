// list_rooms/handler.test.ts — seam pin for the exported handleListRooms entry
// (refactor: handler lifted out of a top-level Deno.serve into an import.meta.main
// guard). list_rooms reaches getServiceClient() with no prior no-DB branch, so this
// pins the seam's existence; live-body coverage (reap + visibility filter) is #120.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleListRooms } from './index.ts'

Deno.test('handleListRooms: exported as a callable handler', () => {
  assertEquals(typeof handleListRooms, 'function')
})
