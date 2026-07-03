// heartbeat/heartbeat.test.ts — applyHeartbeat (lastSeen bump). #61.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { applyHeartbeat } from './index.ts'
import type { StoredPlayer } from '../_shared/mod.ts'

const NOW = 1_700_000_000_000
const P = (id: string, lastSeen?: number): StoredPlayer => ({ id, name: id, color: '#fff', ready: false, lastSeen })

Deno.test('applyHeartbeat: player not in room -> null', () => {
  assertEquals(applyHeartbeat([P('a', 1)], 'ghost', NOW), null)
})

Deno.test('applyHeartbeat: bumps lastSeen on the heartbeating seat only', () => {
  const out = applyHeartbeat([P('a', 1), P('b', 2)], 'a', NOW)
  assertEquals(out?.[0].lastSeen, NOW)
  assertEquals(out?.[1].lastSeen, 2) // b untouched
})
