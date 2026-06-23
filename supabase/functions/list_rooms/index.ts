import { withCors, json, getServiceClient, reap, StoredOptions, StoredPlayer, RoomRow } from '../_shared/mod.ts'
import { mapListedRoom } from './mapRoom.ts'

// list_rooms takes no body — optionalBody tolerates an empty/missing/invalid one.
Deno.serve(withCors(async () => {
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

  // Reap each room (writing back as needed), then collect the post-reap rooms.
  const reaped: { row: RoomRow; fresh: StoredPlayer[] }[] = []
  for (const row of rows) {
    const players = row.players ?? []
    const fresh = reap(players, nowMs)

    if (fresh.length === players.length) {
      // Unchanged
    } else if (fresh.length === 0) {
      // Fully dead — delete the room row
      await supabase.from('rooms').delete().eq('id', row.id)
      continue
    } else {
      // Some ghosts reaped — persist the trimmed players
      await supabase.from('rooms').update({ players: fresh }).eq('id', row.id)
    }

    reaped.push({ row, fresh })
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
}, { optionalBody: true, rateLimit: 'list_rooms' }))
