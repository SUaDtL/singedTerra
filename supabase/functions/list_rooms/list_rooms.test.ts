// list_rooms/list_rooms.test.ts
//
// Pure unit tests for mapListedRoom — the row→public-output mapper for the room browser.
// No IO, no DB, no live handler. First test for list_rooms (closes the 2026-06-21 checkpoint
// "list_rooms untested" gap). Covers spec ACs 1–4 + the falsy-zero contract guard (AC-C1).
//
// Run: "C:/Users/brenn/.deno/bin/deno.exe" test supabase/functions/list_rooms/list_rooms.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { mapListedRoom, type ListedRoomRow } from './mapRoom.ts'
import type { StoredPlayer } from '../_shared/mod.ts'

function player(name: string, ai?: StoredPlayer['ai']): StoredPlayer {
  return { id: `id-${name}`, name, color: '#fff', ready: true, ...(ai ? { ai } : {}) }
}

function room(options: Partial<ListedRoomRow['options']>): ListedRoomRow {
  return {
    id: 'room-1',
    code: 'ABCD',
    created_at: '2026-06-22T00:00:00Z',
    options: { maxPlayers: 4, maxWind: 10, gravity: 0.15, ...options },
    players: [],
  }
}

// AC1 — rounds carried through.
Deno.test('mapListedRoom: surfaces stored rounds', () => {
  const out = mapListedRoom(room({ rounds: 5 }), [player('Host')])
  assertEquals(out.rounds, 5)
})

// AC2 — armsLevel carried through.
Deno.test('mapListedRoom: surfaces stored armsLevel', () => {
  const out = mapListedRoom(room({ armsLevel: 2 }), [player('Host')])
  assertEquals(out.armsLevel, 2)
})

// AC3 — botCount = roster seats with ai set.
Deno.test('mapListedRoom: counts CPU seats', () => {
  const roster = [player('Host'), player('Bot1', 'hard'), player('Bot2', 'easy')]
  const out = mapListedRoom(room({}), roster)
  assertEquals(out.botCount, 2)
  assertEquals(out.playerCount, 3)
})

// AC4 — back-compat defaults for a pre-feature room (no rounds/armsLevel in options).
Deno.test('mapListedRoom: defaults rounds=1, armsLevel=4 when absent', () => {
  const out = mapListedRoom(room({}), [player('Host')])
  assertEquals(out.rounds, 1)
  assertEquals(out.armsLevel, 4)
})

// AC-C1 — falsy-zero guard: armsLevel 0 ("Basic") is preserved, NOT defaulted to 4.
Deno.test('mapListedRoom: armsLevel 0 is preserved, not defaulted', () => {
  const out = mapListedRoom(room({ armsLevel: 0 }), [player('Host')])
  assertEquals(out.armsLevel, 0)
})

// Identity passthrough — roomId/code/hostName/maxPlayers.
Deno.test('mapListedRoom: passes through identity fields', () => {
  const out = mapListedRoom(room({ maxPlayers: 3 }), [player('Alice')])
  assertEquals(out.roomId, 'room-1')
  assertEquals(out.code, 'ABCD')
  assertEquals(out.hostName, 'Alice')
  assertEquals(out.maxPlayers, 3)
})
