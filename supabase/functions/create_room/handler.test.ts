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
