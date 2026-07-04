import { withCors, json, getServiceClient, reap, StoredOptions, StoredPlayer, RoomRow } from '../_shared/mod.ts'
import { mapListedRoom } from './mapRoom.ts'

// list_rooms takes no body — optionalBody tolerates an empty/missing/invalid one.
export async function handleListRooms(): Promise<Response> {
  const supabase = getServiceClient()

  // Lazy GC replaces the old created_at "last 1 hour" filter. Fetch ALL
  // waiting rooms (every visibility) so private ghost rooms get reaped too.
  const { data: candidates, error: fetchError } = await supabase
    .from('rooms')
    .select('id, code, options, players, created_at')
    .eq('status', 'waiting')

  if (fetchError) {
    console.error('list_rooms: fetch error', fetchError)
    return json({ error: 'Failed to list rooms' }, 500)
  }

  const rows = (candidates ?? []) as RoomRow[]
  const nowMs = Date.now()

  // Reap each room in memory (reap() staleness logic stays single-sourced in
  // _shared), collecting the writes so they can be flushed in ONE round-trip
  // instead of an O(N) DELETE/UPDATE per affected room (GH #62).
  const reaped: { row: RoomRow; fresh: StoredPlayer[] }[] = []
  const deadIds: string[] = []
  const trims: { id: string; players: StoredPlayer[] }[] = []
  for (const row of rows) {
    const players = row.players ?? []
    const fresh = reap(players, nowMs)

    if (fresh.length === players.length) {
      // Unchanged
    } else if (fresh.length === 0) {
      // Fully dead — delete the room row
      deadIds.push(row.id)
      continue
    } else {
      // Some ghosts reaped — persist the trimmed players
      trims.push({ id: row.id, players: fresh })
    }

    reaped.push({ row, fresh })
  }

  // Flush all reap writes in a single batched RPC. Best-effort GC: the response is
  // built from the in-memory `fresh` rosters below, so a failed reap write only
  // delays cleanup — it never returns stale rooms.
  if (deadIds.length > 0 || trims.length > 0) {
    const { error: reapError } = await supabase.rpc('apply_room_reap', {
      p_dead: deadIds,
      p_trims: trims,
    })
    if (reapError) {
      console.error('list_rooms: reap rpc error', reapError?.message ?? reapError)
    }
  }

  const open = reaped.filter(({ row, fresh }) => {
    const options = row.options ?? ({} as StoredOptions)
    return (
      options.visibility === 'public' &&
      fresh.length >= 1 &&
      fresh.length < options.maxPlayers
    )
  })

  // Sort by created_at desc, cap at 50
  open.sort((a, b) =>
    a.row.created_at < b.row.created_at ? 1 : a.row.created_at > b.row.created_at ? -1 : 0
  )

  const roomsOut = open.slice(0, 50).map(({ row, fresh }) => mapListedRoom(row, fresh))

  return json({ rooms: roomsOut }, 200)
}

if (import.meta.main) {
  Deno.serve(withCors(handleListRooms, { optionalBody: true, rateLimit: 'list_rooms' }))
}
