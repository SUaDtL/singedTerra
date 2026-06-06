import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

interface StoredOptions {
  maxPlayers: number
  maxWind: number
  gravity: number
  visibility?: 'public' | 'private'
}

interface StoredPlayer {
  id: string
  name: string
  color: string
  ready: boolean
  lastSeen?: number
}

interface RoomRow {
  id: string
  code: string
  options: StoredOptions
  players: StoredPlayer[]
  created_at: string
}

const STALE_MS = 30000

// Lazy-GC: keep only players seen within the stale window.
function reap(players: StoredPlayer[], nowMs: number): StoredPlayer[] {
  return players.filter(p => (p.lastSeen ?? 0) >= nowMs - STALE_MS)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders() }
    )
  }

  // Body is optional — tolerate empty/missing JSON
  try {
    await req.json()
  } catch {
    // ignore — no body required
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration: missing env vars' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Lazy GC replaces the old created_at "last 1 hour" filter. Fetch ALL
  // waiting rooms (every visibility) so private ghost rooms get reaped too.
  const { data: candidates, error: fetchError } = await supabase
    .from('rooms')
    .select('id, code, options, players, created_at')
    .eq('status', 'waiting')

  if (fetchError) {
    console.error('list_rooms: fetch error', fetchError)
    return new Response(
      JSON.stringify({ error: 'Failed to list rooms' }),
      { status: 500, headers: corsHeaders() }
    )
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

  const roomsOut = open.slice(0, 50).map(({ row, fresh }) => ({
    roomId: row.id,
    code: row.code,
    hostName: fresh[0]?.name ?? '',
    playerCount: fresh.length,
    maxPlayers: row.options.maxPlayers,
  }))

  return new Response(
    JSON.stringify({ rooms: roomsOut }),
    { status: 200, headers: corsHeaders() }
  )
})
