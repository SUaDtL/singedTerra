// Actual handler with substituted PostgREST transport. SQL locking is separately
// checked by room-lifecycle-postgres; this fixture proves only the wire intent.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleUpdatePlayer } from './index.ts'

const roomId = '11111111-1111-4111-8111-111111111111'
const playerId = 'seat-a'
const token = 'synthetic-seat-token'
const before = [
  { id: playerId, name: 'A', color: '#fff', ready: false, lastSeen: 1 },
  { id: 'seat-b', name: 'B', color: '#000', ready: false, lastSeen: 1 },
]

for (const transition of ['ready', 'start', 'join', 'leave', 'edit', 'revoke'] as const) {
  Deno.test(`player edit preserves concurrent ${transition} and sends only editable fields`, async () => {
    const oldFetch = globalThis.fetch
    const priorUrl = Deno.env.get('SUPABASE_URL')
    const priorKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    Deno.env.set('SUPABASE_URL', 'https://player-update.invalid')
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key')
    let players = structuredClone(before)
    let status = 'waiting'
    let credentialValid = true
    if (transition === 'ready') players[1].ready = true
    if (transition === 'start') { status = 'active'; players.forEach(p => { p.ready = true }) }
    if (transition === 'join') players.push({ id: 'seat-c', name: 'C', color: '#abc', ready: false, lastSeen: 1 })
    if (transition === 'leave') players = players.filter(p => p.id !== 'seat-b')
    if (transition === 'edit') players[1].name = 'Updated B'
    if (transition === 'revoke') credentialValid = false
    const expected = structuredClone(players)
    if (status === 'waiting' && credentialValid) expected[0].name = 'Updated A'
    let rpcCalls = 0
    globalThis.fetch = async (input, init) => {
      const req = new Request(input, init)
      const url = new URL(req.url)
      if (url.hostname !== 'player-update.invalid') throw new Error('Unexpected network')
      let data: unknown
      if (req.method === 'GET' && url.pathname === '/rest/v1/rooms') {
        data = [{ id: roomId, status: 'waiting', players: before }]
      } else if (req.method === 'GET' && url.pathname === '/rest/v1/room_seats') {
        data = [{ token }]
      } else if (req.method === 'PATCH' && url.pathname === '/rest/v1/rooms') {
        players = (await req.json()).players
        data = null
      } else if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/update_room_player') {
        rpcCalls += 1
        const args = await req.json()
        assertEquals(args, { p_room_id: roomId, p_player_id: playerId, p_token: token, p_changes: { name: 'Updated A' } })
        if (status !== 'waiting') data = { ok: false, error: 'room_not_waiting' }
        else if (!credentialValid) data = { ok: false, error: 'invalid_seat_token' }
        else { players[0].name = 'Updated A'; data = { ok: true, players } }
      } else throw new Error(`Unexpected ${req.method} ${url.pathname}`)
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
    }
    try {
      const response = await handleUpdatePlayer({ roomId, playerId, token, name: ' Updated A ' })
      assertEquals(response.status, status !== 'waiting' ? 404 : credentialValid ? 200 : 403)
      assertEquals(players.map(({ lastSeen: _lastSeen, ...p }) => p), expected.map(({ lastSeen: _lastSeen, ...p }) => p))
      assertEquals(rpcCalls, 1)
    } finally {
      globalThis.fetch = oldFetch
      if (priorUrl === undefined) Deno.env.delete('SUPABASE_URL'); else Deno.env.set('SUPABASE_URL', priorUrl)
      if (priorKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY'); else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', priorKey)
    }
  })
}

Deno.test('player update preserves refusal responses and logs only public transaction context', async () => {
  const oldFetch = globalThis.fetch
  const oldError = console.error
  const priorUrl = Deno.env.get('SUPABASE_URL')
  const priorKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const serviceKey = 'synthetic-service-key'
  Deno.env.set('SUPABASE_URL', 'https://player-update.invalid')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', serviceKey)
  const refusals = [
    ['room_not_waiting', 404, 'Room not found or already started'],
    ['invalid_seat_token', 403, 'Invalid or missing seat token'],
    ['player_not_in_room', 400, 'Player not in room'],
    ['name_conflict', 409, 'That name is already taken. Choose a different name.'],
    ['color_conflict', 409, 'That color is already taken. Choose a different color.'],
    ['unexpected', 500, 'Failed to update player'],
  ] as const
  const cases = [
    ...refusals.map(([error, status, message]) => ({ data: { ok: false, error }, status, message, transportStatus: 200, log: false })),
    ...[null, {}, { ok: true }, { ok: true, players: 'invalid' }, { ok: 'true', players: [] }].map(data => ({
      data, status: 500, message: 'Failed to update player', transportStatus: 200, log: true,
    })),
    { data: { message: `raw database ${token} ${serviceKey}` }, status: 500,
      message: 'Failed to update player', transportStatus: 500, log: true },
  ]
  try {
    for (const testCase of cases) {
      const logs: unknown[][] = []
      console.error = (...args) => logs.push(args)
      globalThis.fetch = async (input, init) => {
        const req = new Request(input, init)
        assertEquals(req.url, 'https://player-update.invalid/rest/v1/rpc/update_room_player')
        assertEquals(req.method, 'POST')
        return new Response(JSON.stringify(testCase.data), {
          status: testCase.transportStatus, headers: { 'content-type': 'application/json' },
        })
      }
      const response = await handleUpdatePlayer({ roomId, playerId, token, name: 'Updated A' })
      assertEquals(response.status, testCase.status)
      assertEquals(await response.json(), { error: testCase.message })
      assertEquals(logs, testCase.log
        ? [['update_player: transaction failed', { operation: 'update', roomId, playerId }]] : [])
      assertEquals(JSON.stringify(logs).includes(token), false)
      assertEquals(JSON.stringify(logs).includes(serviceKey), false)
    }
  } finally {
    globalThis.fetch = oldFetch
    console.error = oldError
    if (priorUrl === undefined) Deno.env.delete('SUPABASE_URL'); else Deno.env.set('SUPABASE_URL', priorUrl)
    if (priorKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY'); else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', priorKey)
  }
})
