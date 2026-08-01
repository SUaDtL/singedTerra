// join_room/handler.test.ts — seam pin for the exported handleJoinRoom entry
// (refactor: handler lifted out of `import.meta.main`). Asserts the no-DB
// validation-rejection path is reachable through the exported function.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleJoinRoom, joinRoomHandler } from './index.ts'

Deno.test('handleJoinRoom: missing code returns 400 (no DB)', async () => {
  const res = await handleJoinRoom({})
  assertEquals(res.status, 400)
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
