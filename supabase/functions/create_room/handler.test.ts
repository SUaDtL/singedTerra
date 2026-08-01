// create_room/handler.test.ts — seam pin for the exported handleCreateRoom entry
// (refactor: handler lifted out of a top-level Deno.serve into an import.meta.main
// guard). Asserts the no-DB validation-rejection path is reachable through the
// exported function.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createRoomHandler, handleCreateRoom } from './index.ts'

function captureRoomInsert() {
  let insertedRoom: Record<string, unknown> | undefined
  const rooms = {
    select: () => rooms,
    eq: () => rooms,
    neq: () => rooms,
    maybeSingle: () => Promise.resolve({ data: null }),
    insert: (value: Record<string, unknown>) => {
      insertedRoom = value
      return rooms
    },
    single: () => Promise.resolve({ data: { id: 'room-1' }, error: null }),
  }
  const roomSeats = {
    insert: () => Promise.resolve({ error: null }),
  }
  return {
    serviceClient: {
      from: (table: string) => table === 'rooms' ? rooms : roomSeats,
    },
    insertedRoom: () => insertedRoom,
  }
}

Deno.test('handleCreateRoom: missing playerName returns 400 (no DB)', async () => {
  const res = await handleCreateRoom({})
  assertEquals(res.status, 400)
})

Deno.test('handleCreateRoom: rejects an unknown tank loadout before DB access', async () => {
  const res = await handleCreateRoom({
    playerName: 'Ana',
    color: '#e84d4d',
    loadout: {
      treads: 'foundry',
      hull: 'foundry',
      turret: 'foundry',
      barrel: 'prototype',
    },
    options: { maxPlayers: 2 },
  })
  assertEquals(res.status, 400)
  assertEquals(await res.json(), { error: 'Invalid input: loadout' })
})

Deno.test('handleCreateRoom: stores the exact bounded creator loadout', async () => {
  const loadout = {
    treads: 'jackal',
    hull: 'bulwark',
    turret: 'foundry',
    barrel: 'jackal',
  } as const
  const capture = captureRoomInsert()

  const res = await createRoomHandler({
    serviceClient: capture.serviceClient as never,
  })({
    playerName: 'Ana',
    color: '#e84d4d',
    loadout,
    options: { maxPlayers: 2, walls: 'wrap' },
  })

  assertEquals(res.status, 200)
  const insertedRoom = capture.insertedRoom()
  const players = insertedRoom?.players as Array<{ loadout: unknown }>
  assertEquals(players[0].loadout, loadout)
  assertEquals((insertedRoom?.options as { walls: string }).walls, 'wrap')
})

Deno.test('handleCreateRoom: normalizes an invalid wall value to open before insert', async () => {
  const capture = captureRoomInsert()
  const res = await createRoomHandler({
    serviceClient: capture.serviceClient as never,
  })({
    playerName: 'Ana',
    color: '#e84d4d',
    options: { maxPlayers: 2, walls: 'invalid' },
  })

  assertEquals(res.status, 200)
  assertEquals(
    (capture.insertedRoom()?.options as { walls: string }).walls,
    'open',
  )
})

Deno.test('handleCreateRoom: stores and echoes the authoritative Phase A ruleset', async () => {
  const capture = captureRoomInsert()
  const res = await createRoomHandler({
    serviceClient: capture.serviceClient as never,
  })({
    playerName: 'Ana',
    color: '#e84d4d',
    rulesetVersion: 1,
    options: { maxPlayers: 2 },
  })

  assertEquals(res.status, 200)
  const storedOptions = capture.insertedRoom()?.options as Record<string, unknown>
  assertEquals(storedOptions.rulesetVersion, 1)
  const response = await res.json()
  assertEquals(response.options, storedOptions)
})

Deno.test('handleCreateRoom: rejects prepared ruleset 2 before DB access in Phase A', async () => {
  let dbTouched = false
  const res = await createRoomHandler({
    serviceClient: {
      from: () => {
        dbTouched = true
        throw new Error('DB must not be touched')
      },
    } as never,
  })({
    playerName: 'Ana',
    color: '#e84d4d',
    rulesetVersion: 2,
    options: { maxPlayers: 2 },
  })

  assertEquals(res.status, 409)
  assertEquals(await res.json(), {
    error: 'ruleset_not_available',
    availableRulesetVersion: 1,
  })
  assertEquals(dbTouched, false)
})

Deno.test('handleCreateRoom: omitted ruleset stores and echoes legacy version 1', async () => {
  const capture = captureRoomInsert()
  const res = await createRoomHandler({
    serviceClient: capture.serviceClient as never,
  })({
    playerName: 'Ana',
    color: '#e84d4d',
    options: { maxPlayers: 2 },
  })

  assertEquals(res.status, 200)
  const response = await res.json()
  assertEquals((capture.insertedRoom()?.options as Record<string, unknown>).rulesetVersion, 1)
  assertEquals(response.options.rulesetVersion, 1)
})

Deno.test('handleCreateRoom: rejects an unsupported ruleset before DB access', async () => {
  let dbTouched = false
  const res = await createRoomHandler({
    serviceClient: {
      from: () => {
        dbTouched = true
        throw new Error('DB must not be touched')
      },
    } as never,
  })({
    playerName: 'Ana',
    color: '#e84d4d',
    rulesetVersion: 99,
    options: { maxPlayers: 2 },
  })

  assertEquals(res.status, 400)
  assertEquals(await res.json(), { error: 'Invalid input: rulesetVersion' })
  assertEquals(dbTouched, false)
})
