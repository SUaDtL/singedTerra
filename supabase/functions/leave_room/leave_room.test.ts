// leave_room/leave_room.test.ts — applyLeave (roster drop + empty-room delete). #61.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { applyLeave } from './index.ts'
import type { StoredPlayer } from '../_shared/mod.ts'

const P = (id: string): StoredPlayer => ({ id, name: id, color: '#fff', ready: false })

Deno.test('applyLeave: one of two leaves -> remaining 1, not deleted', () => {
  assertEquals(applyLeave([P('a'), P('b')], 'a'), { remaining: [P('b')], roomDeleted: false })
})

Deno.test('applyLeave: last player leaves -> empty, room deleted', () => {
  assertEquals(applyLeave([P('a')], 'a'), { remaining: [], roomDeleted: true })
})

Deno.test('applyLeave: absent player is idempotent (roster unchanged, not deleted)', () => {
  assertEquals(applyLeave([P('a'), P('b')], 'ghost'), { remaining: [P('a'), P('b')], roomDeleted: false })
})
