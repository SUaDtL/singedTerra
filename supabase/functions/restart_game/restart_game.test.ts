// Unit tests for restart_game's roster-rebuild logic.
//
// Regression guard for the rematch bug where the new room's players dropped the
// `ai` CPU-difficulty flag: a rematch of a room containing CPU seats produced a
// successor whose bot seats looked human, so no client drove them and the game
// froze on bot turns. buildRematchPlayers must preserve `ai`.
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildRematchPlayers,
  handleRestartGame,
  normalizeRematchOptions,
  normalizeStoredRematchOptions,
  projectCreatedRematchInfo,
  projectExistingRematchInfo,
} from './index.ts'
import type { StoredPlayer } from '../_shared/mod.ts'
import { DEFAULT_TANK_LOADOUT } from '../_shared/mod.ts'

const NOW = 1_700_000_000_000

Deno.test('buildRematchPlayers preserves the ai flag on bot seats', () => {
  const players: StoredPlayer[] = [
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: false },
    { id: 'uid-b', name: 'CPU', color: '#0f0', ready: true, ai: 'medium' },
  ]
  const out = buildRematchPlayers(players, NOW)
  assertEquals(out[0].ai, undefined) // human seat: no ai
  assertEquals(out[1].ai, 'medium') // bot seat: ai carried over
})

Deno.test('buildRematchPlayers omits ai entirely for an all-human roster', () => {
  const players: StoredPlayer[] = [
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: false },
    { id: 'uid-b', name: 'Bo', color: '#00f', ready: false },
  ]
  const out = buildRematchPlayers(players, NOW)
  for (const p of out) {
    assertEquals('ai' in p, false)
  }
})

Deno.test('buildRematchPlayers marks everyone ready and stamps lastSeen', () => {
  const players: StoredPlayer[] = [
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: false, ai: 'hard' },
  ]
  const out = buildRematchPlayers(players, NOW)
  assertEquals(out[0].ready, true)
  assertEquals(out[0].lastSeen, NOW)
  assertEquals(out[0].id, 'uid-a')
  assertEquals(out[0].ai, 'hard')
})

Deno.test('buildRematchPlayers preserves valid cosmetics and defaults old seats', () => {
  const mixed = {
    treads: 'jackal',
    hull: 'bulwark',
    turret: 'foundry',
    barrel: 'jackal',
  } as const
  const out = buildRematchPlayers([
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: false, loadout: mixed },
    { id: 'uid-b', name: 'Bo', color: '#00f', ready: false },
  ], NOW)

  assertEquals(out[0].loadout, mixed)
  assertEquals(out[1].loadout, DEFAULT_TANK_LOADOUT)
})

Deno.test('normalizeRematchOptions preserves wrap walls and rejects invalid values', () => {
  assertEquals(
    normalizeRematchOptions({
      maxPlayers: 2,
      maxWind: 7,
      gravity: 0.2,
      walls: 'wrap' as never,
      rulesetVersion: 2,
    }, 2),
    {
      maxPlayers: 2,
      maxWind: 7,
      gravity: 0.2,
      walls: 'wrap' as never,
      rulesetVersion: 2,
    },
  )
  assertEquals(
    normalizeRematchOptions({
      maxPlayers: 2,
      maxWind: 7,
      gravity: 0.2,
      walls: 'invalid' as never,
    }, 2).walls,
    'open',
  )
})

Deno.test('normalizeRematchOptions preserves concrete walls', () => {
  assertEquals(
    normalizeRematchOptions({
      maxPlayers: 2,
      maxWind: 7,
      gravity: 0.2,
      walls: 'concrete' as never,
      rulesetVersion: 2,
    }, 2).walls,
    'concrete',
  )
})

Deno.test('successor normalization and both response projectors preserve rulesets 1 and 2', () => {
  const players: StoredPlayer[] = [
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: true },
    { id: 'uid-b', name: 'Bo', color: '#00f', ready: true },
  ]

  for (const rulesetVersion of [1, 2] as const) {
    const options = {
      maxPlayers: 2,
      maxWind: 7,
      gravity: 0.2,
      walls: 'wrap' as const,
      rulesetVersion,
    }

    assertEquals(normalizeRematchOptions(options, players.length).rulesetVersion, rulesetVersion)
    assertEquals(normalizeStoredRematchOptions(options).rulesetVersion, rulesetVersion)
    assertEquals(projectExistingRematchInfo({
      id: `existing-v${rulesetVersion}`,
      code: `EXV${rulesetVersion}42`,
      seed: 42,
      options,
      players,
    }).options.rulesetVersion, rulesetVersion)
    assertEquals(projectCreatedRematchInfo(
      `created-v${rulesetVersion}`,
      `CRV${rulesetVersion}42`,
      43,
      options,
      players,
    ).options.rulesetVersion, rulesetVersion)
  }
})

Deno.test('normalizeRematchOptions fails closed for corrupt stored options', () => {
  assertThrows(
    () => normalizeRematchOptions(null as never, 2),
    Error,
    'Invalid stored ruleset',
  )
})

Deno.test('normalizeStoredRematchOptions preserves the room contract but never persists invalid walls', () => {
  assertEquals(
    normalizeStoredRematchOptions({
      maxPlayers: 2,
      maxWind: 7,
      gravity: 0.2,
      walls: 'wrap' as never,
      rounds: 3,
      interestRate: 0.1,
    }),
    {
      maxPlayers: 2,
      maxWind: 7,
      gravity: 0.2,
      walls: 'wrap',
      rounds: 3,
      interestRate: 0.1,
    },
  )
  assertEquals(
    normalizeStoredRematchOptions({
      maxPlayers: 2,
      maxWind: 7,
      gravity: 0.2,
      walls: 'invalid' as never,
      rounds: 5,
    }).walls,
    'open',
  )
})

Deno.test('handleRestartGame persists normalized walls through the successor insert', async () => {
  const roomId = '00000000-0000-4000-8000-000000000001'

  async function insertedWalls(walls: unknown) {
    let insertedRoom: Record<string, unknown> | null = null
    const oldRoom = {
      id: roomId,
      options: {
        maxPlayers: 2,
        maxWind: 7,
        gravity: 0.2,
        walls,
        rounds: 3,
      },
      players: [
        { id: 'uid-a', name: 'Ana', color: '#f00', ready: true },
        { id: 'uid-b', name: 'Bo', color: '#00f', ready: true },
      ],
    }
    const rooms = {
      select: (columns: string) => columns === '*'
        ? {
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: oldRoom, error: null }),
          }),
        }
        : {
          eq: () => ({
            neq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        },
      update: () => ({
        eq: () => ({
          is: () => ({
            select: () => Promise.resolve({ data: [{ id: roomId }], error: null }),
          }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        insertedRoom = row
        return Promise.resolve({ error: null })
      },
    }
    const roomSeats = {
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }
    const supabase = {
      from: (table: string) => table === 'rooms' ? rooms : roomSeats,
    }

    const response = await handleRestartGame(
      { roomId, playerId: 'uid-a' },
      undefined,
      {
        supabase: supabase as never,
        verifySeat: () => Promise.resolve(true),
      },
    )

    assertEquals(response.status, 200)
    const captured = insertedRoom as Record<string, unknown> | null
    if (!captured) throw new Error('success path did not insert a successor room')
    return (captured.options as { walls?: unknown }).walls
  }

  assertEquals(await insertedWalls('wrap'), 'wrap')
  assertEquals(await insertedWalls('invalid'), 'open')
})

Deno.test('handleRestartGame rejects corrupt stored options after auth and before claiming a successor', async () => {
  const roomId = '00000000-0000-4000-8000-000000000001'
  let mutationCalls = 0
  const rooms = {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: {
            id: roomId,
            options: null,
            players: [{ id: 'uid-a', name: 'Ana', color: '#f00', ready: true }],
          },
          error: null,
        }),
      }),
    }),
    update: () => {
      mutationCalls += 1
      throw new Error('must not claim a successor')
    },
    insert: () => {
      mutationCalls += 1
      throw new Error('must not insert a successor')
    },
  }
  const response = await handleRestartGame(
    { roomId, playerId: 'uid-a' },
    undefined,
    {
      supabase: { from: () => rooms } as never,
      verifySeat: () => Promise.resolve(true),
    },
  )

  assertEquals(response.status, 409)
  assertEquals(await response.json(), { error: 'ruleset_unavailable' })
  assertEquals(mutationCalls, 0)
})

Deno.test('lost-claim response projector preserves wrap walls', () => {
  const players: StoredPlayer[] = [
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: true },
    { id: 'uid-b', name: 'Bo', color: '#00f', ready: true },
  ]

  const info = projectExistingRematchInfo({
    id: 'existing-room',
    code: 'BANK42',
    seed: 4242,
    options: {
      maxPlayers: 2,
      maxWind: 7,
      gravity: 0.2,
      walls: 'wrap' as never,
    },
    players,
  })

  assertEquals(info.roomId, 'existing-room')
  assertEquals(info.options.walls, 'wrap')
  assertEquals(info.players, [
    { id: 'uid-a', name: 'Ana', color: '#f00', loadout: DEFAULT_TANK_LOADOUT },
    { id: 'uid-b', name: 'Bo', color: '#00f', loadout: DEFAULT_TANK_LOADOUT },
  ])
})

Deno.test('winning-create response projector preserves reflective walls', () => {
  const players: StoredPlayer[] = [
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: true },
    { id: 'uid-b', name: 'CPU', color: '#0f0', ready: true, ai: 'medium' },
  ]

  const info = projectCreatedRematchInfo(
    'created-room',
    'RICO42',
    8181,
    {
      maxPlayers: 2,
      maxWind: 9,
      gravity: 0.18,
      walls: 'reflective',
    },
    players,
  )

  assertEquals(info.roomId, 'created-room')
  assertEquals(info.options.walls, 'reflective')
  assertEquals(info.players, [
    { id: 'uid-a', name: 'Ana', color: '#f00', loadout: DEFAULT_TANK_LOADOUT },
    { id: 'uid-b', name: 'CPU', color: '#0f0', loadout: DEFAULT_TANK_LOADOUT },
  ])
})

Deno.test('rematch response projectors carry the synchronized loadout', () => {
  const loadout = {
    treads: 'jackal',
    hull: 'bulwark',
    turret: 'ranger',
    barrel: 'jackal',
  } as const
  const players: StoredPlayer[] = [
    { id: 'uid-a', name: 'Ana', color: '#f00', ready: true, loadout },
  ]

  const existing = projectExistingRematchInfo({
    id: 'existing-room',
    code: 'LOAD42',
    seed: 42,
    options: { maxPlayers: 2, maxWind: 7, gravity: 0.2 },
    players,
  })
  const created = projectCreatedRematchInfo(
    'created-room',
    'KIT042',
    43,
    { maxPlayers: 2, maxWind: 7, gravity: 0.2 },
    players,
  )

  assertEquals(existing.players[0].loadout, loadout)
  assertEquals(created.players[0].loadout, loadout)
})
