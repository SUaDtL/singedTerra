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
}

interface RoomRow {
  id: string
  code: string
  options: StoredOptions
  players: StoredPlayer[]
  created_at: string
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

  // Cutoff: one hour ago (wall-clock read allowed in Edge Functions)
  const cutoffIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data: candidates, error: fetchError } = await supabase
    .from('rooms')
    .select('id, code, options, players, created_at')
    .eq('status', 'waiting')
    .gte('created_at', cutoffIso)

  if (fetchError) {
    console.error('list_rooms: fetch error', fetchError)
    return new Response(
      JSON.stringify({ error: 'Failed to list rooms' }),
      { status: 500, headers: corsHeaders() }
    )
  }

  const rows = (candidates ?? []) as RoomRow[]

  const open = rows.filter(r => {
    const options = r.options ?? ({} as StoredOptions)
    const players = r.players ?? []
    return (
      options.visibility === 'public' &&
      players.length >= 1 &&
      players.length < options.maxPlayers
    )
  })

  // Sort by created_at desc, cap at 50
  open.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

  const roomsOut = open.slice(0, 50).map(r => ({
    roomId: r.id,
    code: r.code,
    hostName: r.players[0]?.name ?? '',
    playerCount: r.players.length,
    maxPlayers: r.options.maxPlayers,
  }))

  return new Response(
    JSON.stringify({ rooms: roomsOut }),
    { status: 200, headers: corsHeaders() }
  )
})
