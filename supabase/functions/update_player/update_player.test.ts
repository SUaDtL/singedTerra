// update_player/update_player.test.ts — applyPlayerUpdate (name/color + conflicts). #61.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { applyPlayerUpdate } from './index.ts'
import type { StoredPlayer } from '../_shared/mod.ts'

const NOW = 1_700_000_000_000
const P = (id: string, name: string, color: string): StoredPlayer => ({ id, name, color, ready: false })

Deno.test('applyPlayerUpdate: player not in room -> 400', () => {
  assertEquals(applyPlayerUpdate([P('a', 'Ana', '#f00')], 'ghost', 'X', undefined, NOW), {
    ok: false,
    status: 400,
    error: 'Player not in room',
  })
})

Deno.test('applyPlayerUpdate: name clash with ANOTHER seat -> 409', () => {
  assertEquals(applyPlayerUpdate([P('a', 'Ana', '#f00'), P('b', 'Bo', '#0f0')], 'a', '  bo  ', undefined, NOW), {
    ok: false,
    status: 409,
    error: 'That name is already taken. Choose a different name.',
  })
})

Deno.test('applyPlayerUpdate: color clash with ANOTHER seat -> 409', () => {
  assertEquals(applyPlayerUpdate([P('a', 'Ana', '#f00'), P('b', 'Bo', '#0f0')], 'a', undefined, '#0f0', NOW), {
    ok: false,
    status: 409,
    error: 'That color is already taken. Choose a different color.',
  })
})

Deno.test('applyPlayerUpdate: renaming to your OWN current name is allowed (self excluded)', () => {
  const r = applyPlayerUpdate([P('a', 'Ana', '#f00')], 'a', 'Ana', undefined, NOW)
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.updatedPlayers[0].name, 'Ana')
    assertEquals(r.updatedPlayers[0].lastSeen, NOW)
  }
})

Deno.test('applyPlayerUpdate: applies trimmed name + color, bumps lastSeen, leaves others', () => {
  const r = applyPlayerUpdate([P('a', 'Ana', '#f00'), P('b', 'Bo', '#0f0')], 'a', '  Cy  ', '#00f', NOW)
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.updatedPlayers[0], { id: 'a', name: 'Cy', color: '#00f', ready: false, lastSeen: NOW })
    assertEquals(r.updatedPlayers[1], { id: 'b', name: 'Bo', color: '#0f0', ready: false })
  }
})
