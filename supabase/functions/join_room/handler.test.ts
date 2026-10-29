// join_room/handler.test.ts — seam pin for the exported handleJoinRoom entry
// (refactor: handler lifted out of `import.meta.main`). Asserts the no-DB
// validation-rejection path is reachable through the exported function.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleJoinRoom, joinRoomHandler } from './index.ts'

Deno.test('join admission failures log only public correlation and a fixed failure code', async () => {
  const roomId = '11111111-1111-4111-8111-111111111111'
  let playerId: unknown
  let seatToken: unknown
  const rooms = {
    select: () => rooms,
    eq: () => rooms,
    maybeSingle: () => Promise.resolve({ data: {
      id: roomId, seed: 42, options: { maxPlayers: 2 },
      players: [{ id: 'host', name: 'Host', color: '#fff', lastSeen: Date.now() }],
    }, error: null }),
  }
  const logs: unknown[][] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => { logs.push(args) }
  try {
    const serviceClient = {
      from: () => rooms,
      rpc: (_name: string, args: { p_player_id: string; p_token: string }) => {
        playerId = args.p_player_id
        seatToken = args.p_token
        return Promise.resolve({ data: null, error: {
          message: `private RPC arguments ${args.p_token}`, details: 'synthetic-service-key',
        } })
      },
    }
    const response = await joinRoomHandler({ serviceClient: serviceClient as never })({
      code: 'ABCD', playerName: 'Joiner', color: '#000',
    })
    assertEquals(response.status, 500)
    assertEquals(await response.json(), { error: 'Failed to join room' })
    assertEquals(typeof playerId, 'string')
    assertEquals(logs, [['join_room: admission transaction failed', {
      operation: 'join', roomId, playerId,
    }]])
    assertEquals(JSON.stringify(logs).includes(String(seatToken)), false)
    assertEquals(JSON.stringify(logs).includes('synthetic-service-key'), false)
  } finally { console.error = originalError }
})

Deno.test('RL-08: legacy join cannot enter a room that requires active presence', async () => {
  const host = { id: 'host', name: 'Ana', color: '#e84d4d', ready: false, lastSeen: Date.now() }
  let mutations = 0
  const rooms = {
    select: () => rooms,
    eq: () => rooms,
    maybeSingle: () => Promise.resolve({ data: {
      id: 'room-1', seed: 42,
      options: { maxPlayers: 2, roomLifecycleVersion: 1 }, players: [host],
    }, error: null }),
    update: () => { mutations++; return rooms },
  }
  const serviceClient = { from: (name: string) => name === 'rooms' ? rooms : {
    insert: () => { mutations++; return Promise.resolve({ error: null }) },
  } }
  const res = await joinRoomHandler({ serviceClient: serviceClient as never })({
    code: 'ABCD', playerName: 'Bo', color: '#4d8ce8',
  })
  assertEquals(res.status, 409)
  assertEquals(await res.json(), { error: 'room_lifecycle_mismatch', requiredRoomLifecycleVersion: 1 })
  assertEquals(mutations, 0)
})

Deno.test('handleJoinRoom: missing code returns 400 (no DB)', async () => {
  const res = await handleJoinRoom({})
  assertEquals(res.status, 400)
})

Deno.test('handleJoinRoom rejects command protocol mismatch before roster mutation', async () => {
  let mutations = 0
  const rooms = {
    select: () => rooms,
    eq: () => rooms,
    maybeSingle: () => Promise.resolve({
      data: {
        id: 'room-v2', seed: 42,
        options: { maxPlayers: 2, rulesetVersion: 1, commandProtocolVersion: 2 },
        players: [{ id: 'host', name: 'Host', color: '#e84d4d', ready: false, lastSeen: Date.now() }],
      },
      error: null,
    }),
    update: () => { mutations++; return rooms },
  }
  const serviceClient = { from: () => rooms }
  const res = await joinRoomHandler({ serviceClient: serviceClient as never })({
    code: 'ABCD', playerName: 'Bo', color: '#4d8ce8', commandProtocolVersion: 1,
  })
  assertEquals(res.status, 409)
  assertEquals(await res.json(), { error: 'command_protocol_mismatch', requiredCommandProtocolVersion: 2 })
  assertEquals(mutations, 0)
})

Deno.test('handleJoinRoom: rejects an over-posted tank loadout before DB access', async () => {
  const res = await handleJoinRoom({
    code: 'ABCD',
    playerName: 'Bo',
    color: '#4d8ce8',
    loadout: {
      treads: 'foundry',
      hull: 'foundry',
      turret: 'foundry',
      barrel: 'foundry',
      armor: 999,
    },
  })
  assertEquals(res.status, 400)
  assertEquals(await res.json(), { error: 'Invalid input: loadout' })
})

Deno.test('handleJoinRoom: appends the exact bounded joiner loadout', async () => {
  const loadout = {
    treads: 'jackal',
    hull: 'ranger',
    turret: 'foundry',
    barrel: 'jackal',
  } as const
  const host = {
    id: 'host',
    name: 'Ana',
    color: '#e84d4d',
    ready: false,
    lastSeen: Date.now(),
  }
  let updatedPlayers: Array<{ loadout?: unknown }> = []
  const rooms = {
    select: () => rooms,
    eq: () => rooms,
    maybeSingle: () => Promise.resolve({
      data: {
        id: 'room-1',
        seed: 42,
        options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
        players: [host],
      },
      error: null,
    }),
    update: (value: { players: Array<{ loadout?: unknown }> }) => {
      updatedPlayers = value.players
      return rooms
    },
  }
  const roomSeats = {
    insert: () => Promise.resolve({ error: null }),
  }
  const serviceClient = {
    from: (table: string) => table === 'rooms' ? rooms : roomSeats,
    rpc: (_name: string, args: { p_players: Array<{ loadout?: unknown }> }) => {
      updatedPlayers = args.p_players
      return Promise.resolve({ data: { ok: true }, error: null })
    },
  }

  const res = await joinRoomHandler({
    serviceClient: serviceClient as never,
  })({
    code: 'ABCD',
    playerName: 'Bo',
    color: '#4d8ce8',
    loadout,
  })

  assertEquals(res.status, 200)
  assertEquals(updatedPlayers[1].loadout, loadout)
  assertEquals((await res.json()).options.commandProtocolVersion, 1)
})

Deno.test('handleJoinRoom: rejects a ruleset mismatch before mutating the room or seat table', async () => {
  const host = {
    id: 'host',
    name: 'Ana',
    color: '#e84d4d',
    ready: false,
    lastSeen: Date.now(),
  }
  let mutations = 0
  const rooms = {
    select: () => rooms,
    eq: () => rooms,
    maybeSingle: () => Promise.resolve({
      data: {
        id: 'room-2',
        seed: 42,
        options: { maxPlayers: 2, maxWind: 10, gravity: 0.15, rulesetVersion: 2 },
        players: [host],
      },
      error: null,
    }),
    update: () => {
      mutations += 1
      return rooms
    },
    delete: () => {
      mutations += 1
      return rooms
    },
  }
  const roomSeats = {
    insert: () => {
      mutations += 1
      return Promise.resolve({ error: null })
    },
  }

  const res = await joinRoomHandler({
    serviceClient: {
      from: (table: string) => table === 'rooms' ? rooms : roomSeats,
    } as never,
  })({
    code: 'ABCD',
    playerName: 'Bo',
    color: '#4d8ce8',
    rulesetVersion: 1,
  })

  assertEquals(res.status, 409)
  assertEquals(await res.json(), {
    error: 'ruleset_mismatch',
    requiredRulesetVersion: 2,
  })
  assertEquals(mutations, 0)
})

Deno.test('handleJoinRoom: rejects corrupt stored options before mutating the room or seat table', async () => {
  let mutations = 0
  const rooms = {
    select: () => rooms,
    eq: () => rooms,
    maybeSingle: () => Promise.resolve({
      data: {
        id: 'room-corrupt',
        seed: 42,
        options: null,
        players: [{ id: 'host', name: 'Ana', color: '#e84d4d', ready: false, lastSeen: Date.now() }],
      },
      error: null,
    }),
    update: () => {
      mutations += 1
      return rooms
    },
    delete: () => {
      mutations += 1
      return rooms
    },
  }
  const roomSeats = {
    insert: () => {
      mutations += 1
      return Promise.resolve({ error: null })
    },
  }

  const res = await joinRoomHandler({
    serviceClient: {
      from: (table: string) => table === 'rooms' ? rooms : roomSeats,
    } as never,
  })({
    code: 'ABCD',
    playerName: 'Bo',
    color: '#4d8ce8',
    rulesetVersion: 1,
  })

  assertEquals(res.status, 409)
  assertEquals(await res.json(), { error: 'ruleset_unavailable' })
  assertEquals(mutations, 0)
})
