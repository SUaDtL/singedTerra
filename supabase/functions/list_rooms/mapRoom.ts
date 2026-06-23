// Pure mapping of a reaped room (row + post-reap roster) into the public list_rooms
// output object. Extracted from index.ts so it is unit-testable without a live Supabase
// (mirrors create_room/validate.ts). Back-compat: a room whose options omit rounds/armsLevel
// gets the GameOptions defaults (1 round, full arsenal = 4). armsLevel 0 ("Basic") is a VALID
// tier, so defaults are applied via `=== undefined`, NEVER `|| 4` (which would corrupt 0 → 4).
//
// Run: "C:/Users/brenn/.deno/bin/deno.exe" test supabase/functions/list_rooms/list_rooms.test.ts

import type { RoomRow, StoredPlayer } from '../_shared/mod.ts'

export interface ListedRoom {
  roomId: string
  code: string
  hostName: string
  playerCount: number
  maxPlayers: number
  /** Best-of-N match length; 1 (Single) when the room predates the rounds option. */
  rounds: number
  /** Arms tier 0–4; 4 (Full arsenal) when the room omits the option. */
  armsLevel: number
  /** Count of live roster seats that are CPU-controlled (`ai` set). */
  botCount: number
}

export function mapListedRoom(row: RoomRow, fresh: StoredPlayer[]): ListedRoom {
  const o = row.options
  return {
    roomId: row.id,
    code: row.code,
    hostName: fresh[0]?.name ?? '',
    playerCount: fresh.length,
    maxPlayers: o.maxPlayers,
    // `=== undefined`, never `|| 1` / `|| 4`: armsLevel 0 ("Basic") is a valid tier and
    // must NOT be coerced to the default. rounds is kept symmetric for clarity.
    rounds: o.rounds === undefined ? 1 : o.rounds,
    armsLevel: o.armsLevel === undefined ? 4 : o.armsLevel,
    botCount: fresh.filter((p) => p.ai !== undefined).length,
  }
}
