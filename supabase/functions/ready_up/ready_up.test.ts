// ready_up/ready_up.test.ts
//
// Unit tests for applyReadyUp — the waiting->active start transition. Closes the
// coverage gap flagged by the 2026-06-25 review (testcov-004 / #61): ready_up's
// branchy start logic (all-ready AND >= 2 players) had no test. Hermetic — the
// module's Deno.serve is guarded behind import.meta.main.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { applyReadyUp } from './index.ts'
import type { StoredPlayer } from '../_shared/mod.ts'

const NOW = 1_700_000_000_000
const P = (id: string, ready: boolean, extra: Partial<StoredPlayer> = {}): StoredPlayer => ({
  id,
  name: id,
  color: '#fff',
  ready,
  ...extra,
})

Deno.test('applyReadyUp: player not in room -> null', () => {
  assertEquals(applyReadyUp([P('a', false)], 'ghost', NOW), null)
})

Deno.test('applyReadyUp: a single ready player does NOT start (needs >= 2)', () => {
  const out = applyReadyUp([P('a', false)], 'a', NOW)
  assertEquals(out?.shouldStart, false)
  assertEquals(out?.updatedPlayers[0].ready, true)
})

Deno.test('applyReadyUp: last unready seat readying starts the game', () => {
  // b was already ready; a readies -> all ready, 2 players -> start
  const out = applyReadyUp([P('a', false), P('b', true)], 'a', NOW)
  assertEquals(out?.shouldStart, true)
})

Deno.test('applyReadyUp: readying while another seat is still unready does NOT start', () => {
  const out = applyReadyUp([P('a', false), P('b', false)], 'a', NOW)
  assertEquals(out?.shouldStart, false)
  // only a flipped to ready
  assertEquals(out?.updatedPlayers.map((p) => p.ready), [true, false])
})

Deno.test('applyReadyUp: a room with a ready bot + human starts when the human readies', () => {
  const out = applyReadyUp([P('h', false), P('bot', true, { ai: 'medium' })], 'h', NOW)
  assertEquals(out?.shouldStart, true)
  // the bot seat is untouched (still ready, ai preserved)
  assertEquals(out?.updatedPlayers[1].ai, 'medium')
  assertEquals(out?.updatedPlayers[1].ready, true)
})

Deno.test('applyReadyUp: stamps lastSeen on the readying seat only', () => {
  const out = applyReadyUp([P('a', false, { lastSeen: 1 }), P('b', true, { lastSeen: 2 })], 'a', NOW)
  assertEquals(out?.updatedPlayers[0].lastSeen, NOW)
  assertEquals(out?.updatedPlayers[1].lastSeen, 2) // b untouched
})
