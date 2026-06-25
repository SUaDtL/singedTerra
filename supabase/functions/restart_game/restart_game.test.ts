// Unit tests for restart_game's roster-rebuild logic.
//
// Regression guard for the rematch bug where the new room's players dropped the
// `ai` CPU-difficulty flag: a rematch of a room containing CPU seats produced a
// successor whose bot seats looked human, so no client drove them and the game
// froze on bot turns. buildRematchPlayers must preserve `ai`.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildRematchPlayers } from './index.ts'
import type { StoredPlayer } from '../_shared/mod.ts'

const NOW = 1_700_000_000_000

Deno.test('buildRematchPlayers preserves the ai flag on bot seats', () => {
  const players: StoredPlayer[] = [
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: false },
    { id: 'uid-b', name: 'CPU', color: '#0f0', ready: true, ai: 'medium' },
  ]
  const out = buildRematchPlayers(players, NOW)
  assertEquals(out[0].ai, undefined) // human seat: no ai
  assertEquals(out[1].ai, 'medium') // bot seat: ai carried over
})

Deno.test('buildRematchPlayers omits ai entirely for an all-human roster', () => {
  const players: StoredPlayer[] = [
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: false },
    { id: 'uid-b', name: 'Bo', color: '#00f', ready: false },
  ]
  const out = buildRematchPlayers(players, NOW)
  for (const p of out) {
    assertEquals('ai' in p, false)
  }
})

Deno.test('buildRematchPlayers marks everyone ready and stamps lastSeen', () => {
  const players: StoredPlayer[] = [
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: false, ai: 'hard' },
  ]
  const out = buildRematchPlayers(players, NOW)
  assertEquals(out[0].ready, true)
  assertEquals(out[0].lastSeen, NOW)
  assertEquals(out[0].id, 'uid-a')
  assertEquals(out[0].ai, 'hard')
})
