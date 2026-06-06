import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders() })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders() })
  }

  const { roomId, winnerId } = body as { roomId?: unknown; winnerId?: unknown }

  if (typeof roomId !== 'string' || roomId.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Invalid input: roomId' }), { status: 400, headers: corsHeaders() })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500, headers: corsHeaders() })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { error } = await supabase
    .from('rooms')
    .update({
      status: 'finished',
      winner: typeof winnerId === 'string' ? winnerId : null,
    })
    .eq('id', roomId.trim())
    .eq('status', 'active')

  if (error) {
    console.error('finish_game: update error', error)
    return new Response(JSON.stringify({ error: 'Failed to finish game' }), { status: 500, headers: corsHeaders() })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders() })
})
