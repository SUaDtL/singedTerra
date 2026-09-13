// Real handler regressions for the owner-reported started-room cleanup defect.
// Only the PostgREST transport is substituted; these do not prove SQL behavior.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleHeartbeat } from '../heartbeat/index.ts'
import { handleLeaveRoom } from '../leave_room/index.ts'
import { handleJoinRoom } from '../join_room/index.ts'

const roomId = '11111111-1111-4111-8111-111111111111'
const playerId = '22222222-2222-4222-8222-222222222222'
const token = 'synthetic-seat-credential'

async function withStartedRoom(run: () => Promise<void>, rpcResult?: { body: unknown; status?: number }): Promise<void> {
  const originalFetch = globalThis.fetch
  const previousUrl = Deno.env.get('SUPABASE_URL')
  const previousKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  Deno.env.set('SUPABASE_URL', 'https://room-lifecycle.invalid')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key')
  const room = {
    id: roomId, status: 'active', seed: 42,
    options: { maxPlayers: 2 },
    players: [
      { id: playerId, name: 'Human', color: '#fff', ready: true },
      { id: 'cpu', name: 'CPU', color: '#000', ready: true, ai: 'easy' },
    ],
  }
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.hostname !== 'room-lifecycle.invalid') throw new Error('Unexpected network destination')
    let data: unknown
    if (url.pathname === '/rest/v1/rpc/room_lifecycle' && request.method === 'POST') {
      const args = await request.json()
      assertEquals(args.p_room_id, roomId)
      assertEquals(args.p_player_id, playerId)
      assertEquals(args.p_token, token)
      data = rpcResult ? rpcResult.body : { ok: true, players: room.players, roomDeleted: false }
    } else if (url.pathname === '/rest/v1/rooms' && request.method === 'GET') {
      const status = url.searchParams.get('status')
      const matches = status === null || status === 'eq.active' ||
        (status.startsWith('in.(') && status.slice(4, -1).split(',').includes('active'))
      data = matches ? [room] : []
    } else if (url.pathname === '/rest/v1/room_seats' && request.method === 'GET') {
      data = [{ token }]
    } else {
      throw new Error(`Unexpected lifecycle transport: ${request.method} ${url.pathname}`)
    }
    return new Response(JSON.stringify(data), { status: rpcResult?.status ?? 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    await run()
  } finally {
    globalThis.fetch = originalFetch
    if (previousUrl === undefined) Deno.env.delete('SUPABASE_URL')
    else Deno.env.set('SUPABASE_URL', previousUrl)
    if (previousKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY')
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previousKey)
  }
}

Deno.test('RL-01: an authenticated human can heartbeat after the room starts', async () => {
  await withStartedRoom(async () => {
    const response = await handleHeartbeat({ roomId, playerId, token })
    assertEquals(response.status, 200, 'Started rooms must accept human presence')
  })
})

Deno.test('RL-02: an authenticated human can explicitly leave a started room', async () => {
  await withStartedRoom(async () => {
    const response = await handleLeaveRoom({ roomId, playerId, token })
    assertEquals(response.status, 200, 'Started rooms must accept explicit human quits')
  })
})

for (const [code, status, error] of [
  ['invalid_seat_token', 403, 'Invalid or missing seat token'],
  ['room_not_found', 404, 'Room not found'],
  ['room_not_active', 409, 'room_not_active'],
  ['room_abandoned', 409, 'room_abandoned'],
  ['seat_left', 409, 'seat_left'],
  ['unexpected_internal_error', 500, 'Failed to update room'],
] as const) {
  Deno.test(`RL-04: heartbeat maps locked ${code} to its exact public refusal`, async () => {
    await withStartedRoom(async () => {
      const response = await handleHeartbeat({ roomId, playerId, token })
      assertEquals(response.status, status)
      assertEquals(await response.json(), { error })
    }, { body: { ok: false, error: code } })
  })
}

for (const result of [
  { body: null }, { body: {} }, { body: { ok: 'true' } },
  { body: { code: 'XX000', message: 'synthetic-seat-credential' }, status: 500 },
]) {
  Deno.test(`RL-04: malformed or failed lifecycle RPC stays generic (${JSON.stringify(result.body)})`, async () => {
    const originalError = console.error
    const logs: unknown[][] = []
    console.error = (...args: unknown[]) => { logs.push(args) }
    try {
      await withStartedRoom(async () => {
        const response = await handleLeaveRoom({ roomId, playerId, token })
        assertEquals(response.status, 500)
        assertEquals(await response.json(), { error: 'Failed to update room' })
      }, result)
      assertEquals(JSON.stringify(logs).includes(token), false)
    } finally { console.error = originalError }
  })
}

// Model a real waiting -> active transition after the handler's initial read.
// A PostgREST status filter is evaluated when the write happens, as in Postgres.
// This fixture proves handler write intent only; SQL locking needs separate tests.
async function withConcurrentStart(
  run: (live: { exists: boolean; players: unknown[] }) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch
  const previousUrl = Deno.env.get('SUPABASE_URL')
  const previousKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  Deno.env.set('SUPABASE_URL', 'https://room-lifecycle.invalid')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key')
  const human = { id: playerId, name: 'Human', color: '#fff', ready: true }
  const cpu = { id: 'cpu', name: 'CPU', color: '#000', ready: true, ai: 'easy' }
  const live = { exists: true, players: [human, cpu] as unknown[] }
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.hostname !== 'room-lifecycle.invalid') throw new Error('Unexpected network destination')
    let data: unknown = []
    if (url.pathname === '/rest/v1/rpc/apply_room_reap' && request.method === 'POST') {
      // Migration009 rechecks waiting status at write time; PG tests exercise it.
      data = null
    } else if (url.pathname === '/rest/v1/rpc/room_lifecycle' && request.method === 'POST') {
      // The handler sends identity + intent, never a stale roster snapshot.
      // The separate real PostgreSQL harness owns proof of the RPC's locking.
      const args = await request.json()
      assertEquals(Object.keys(args).sort(), ['p_operation', 'p_player_id', 'p_room_id', 'p_token'])
      assertEquals(args.p_room_id, roomId)
      data = { ok: true, players: live.players, roomDeleted: false }
    } else if (url.pathname === '/rest/v1/rooms' && request.method === 'GET') {
      data = [{ id: roomId, status: 'waiting', seed: 42, options: { maxPlayers: 2 }, players: [human] }]
    } else if (url.pathname === '/rest/v1/room_seats' && request.method === 'GET') {
      data = [{ token }]
    } else if (url.pathname === '/rest/v1/rooms' && request.method === 'PATCH') {
      if (url.searchParams.get('status') !== 'eq.waiting') {
        const patch = await request.json()
        if (patch.players !== undefined) live.players = patch.players
      }
    } else if (url.pathname === '/rest/v1/rooms' && request.method === 'DELETE') {
      if (url.searchParams.get('status') !== 'eq.waiting') live.exists = false
    } else if (url.pathname === '/rest/v1/room_seats' && request.method === 'DELETE') {
      // Seat cleanup does not repair a room deletion or roster overwrite.
    } else {
      throw new Error(`Unexpected lifecycle transport: ${request.method} ${url.pathname}`)
    }
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  }
  try {
    await run(live)
  } finally {
    globalThis.fetch = originalFetch
    if (previousUrl === undefined) Deno.env.delete('SUPABASE_URL')
    else Deno.env.set('SUPABASE_URL', previousUrl)
    if (previousKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY')
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previousKey)
  }
}

Deno.test('RL-04: a stale waiting heartbeat cannot overwrite a started roster', async () => {
  await withConcurrentStart(async (live) => {
    const startedPlayers = structuredClone(live.players)
    await handleHeartbeat({ roomId, playerId, token })
    assertEquals(live.players, startedPlayers, 'Waiting heartbeat must preserve the concurrently started roster')
  })
})

Deno.test('RL-04: a stale last-seat lobby quit cannot delete a started room', async () => {
  await withConcurrentStart(async (live) => {
    await handleLeaveRoom({ roomId, playerId, token })
    assertEquals(live.exists, true, 'Waiting quit must preserve the concurrently started room and canonical log')
  })
})

Deno.test('RL-04: joining a stale lobby cannot delete the concurrently started match', async () => {
  await withConcurrentStart(async (live) => {
    const startedPlayers = structuredClone(live.players)
    await handleJoinRoom({ code: 'ABCD', playerName: 'Joiner', color: '#e84d4d' })
    assertEquals(live.exists, true, 'Lazy join cleanup must retain the concurrently started match')
    assertEquals(live.players, startedPlayers)
  })
})
