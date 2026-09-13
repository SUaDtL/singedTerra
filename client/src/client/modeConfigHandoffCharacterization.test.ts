import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FetchedRoom, NetworkPlayer, RoomOptions, JoinRoomParams, JoinRoomResponse } from './LobbyTransport'
import type { EdgeResult } from '../lib/edgeFunctions'
import { LobbyRoomController, type LobbyRoomHandoff } from './LobbyRoomController'
import type { LobbyWaitingState } from './LobbySession'
import { rematchToConfig } from './rematchConfig'
import type { RematchInfo } from './GameClient'
import { Lobby, type LobbyConfig } from '../ui/Lobby'

vi.mock('@supabase/supabase-js', () => {
  const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
  return { createClient: vi.fn(() => ({ channel: vi.fn(() => channel), removeChannel: vi.fn() })) }
})

const players: NetworkPlayer[] = [
  { id: 'seat-1', name: 'Ranger', color: '#e84d4d', ready: true },
  { id: 'seat-2', name: 'Longshot', color: '#4d8ce8', ready: true },
]
const options: RoomOptions = {
  maxPlayers: 2, maxWind: 6, gravity: 0.2, walls: 'concrete', rounds: 3,
  interestRate: 0.25, suddenDeathTurn: 12, armsLevel: 2, rulesetVersion: 4,
  commandProtocolVersion: 2,
}
const waiting: LobbyWaitingState = {
  roomId: '', roomCode: '', playerId: '', token: '', players: [], seed: 0,
  options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 }, thisPlayerReady: false,
}
const loadout = { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' } as const
const expectedPlayers = [
  { id: 'seat-1', name: 'Ranger', color: '#e84d4d', loadout },
  { id: 'seat-2', name: 'Longshot', color: '#4d8ce8', loadout },
]
const expectedSettings = {
  seed: 71, maxWind: 6, gravity: 0.2, walls: 'concrete', rounds: 3,
  interestRate: 0.25, suddenDeathTurn: 12, armsLevel: 2, rulesetVersion: 4,
  commandProtocolVersion: 2,
}
const expectedHandoff = {
  mode: 'network', players: expectedPlayers, playerNames: ['Ranger', 'Longshot'],
  roomId: 'room-1', roomCode: 'ROOM', playerId: 'seat-1', token: 'test-seat-token',
  settings: expectedSettings,
}

interface LobbyInternals {
  handleCreateRoom(): Promise<void>
  handleReadyUp(): Promise<void>
  cleanupWaitingChannel(): void
  [key: string]: unknown
}

function internals(lobby: Lobby): LobbyInternals {
  return lobby as unknown as LobbyInternals
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function room(): FetchedRoom {
  return { id: 'room-1', code: 'ROOM', seed: 71, status: 'active', players, options }
}

function controller(onHandoff: (next: LobbyRoomHandoff) => void) {
  const transport = { createRoom: vi.fn(), joinRoom: vi.fn<() => Promise<EdgeResult<JoinRoomResponse>>>(), fetchRoom: vi.fn(async () => room()), leaveRoom: vi.fn() }
  const session = { waiting, replaceWaiting: vi.fn(), subscribeWaitingRoom: vi.fn(), stopBrowsePoll: vi.fn(), leaveRoom: vi.fn() }
  const persistence = { writeSeatToken: vi.fn(), writeSession: vi.fn(), clearSession: vi.fn(), readSession: vi.fn(), readSeatToken: vi.fn(() => 'test-seat-token') }
  const subject = new LobbyRoomController(
    transport, session,
    vi.fn(), vi.fn(), onHandoff,
    persistence,
  )
  return { subject, transport, session, persistence }
}

describe('mode configuration handoff characterization', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it('snapshots the create request at click time and reads player fallback after a v2 response', async () => {
    const response = deferred<Response>()
    const fetch = vi.fn<typeof globalThis.fetch>(() => response.promise)
    vi.stubGlobal('fetch', fetch)
    const root = document.createElement('div')
    const lobby = new Lobby(root, vi.fn())
    Object.assign(internals(lobby), {
      onlineName: 'Ranger', onlineMaxWind: '9', onlineGravity: '0.18', onlineWalls: 'wrap',
      onlineRounds: '4', onlineInterestRate: '0.2', onlineSuddenDeath: '3', onlineArmsLevel: '2',
    })
    try {
      const pending = internals(lobby).handleCreateRoom()
      await Promise.resolve()
      const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)
      expect(body).toStrictEqual({ playerName: 'Ranger', color: '#e84d4d', loadout, rulesetVersion: 4,
        commandProtocolVersion: 2, roomLifecycleVersion: 1, options: {
        visibility: 'public',
        maxPlayers: 2, maxWind: 9, gravity: 0.18, walls: 'wrap', rounds: 5,
        interestRate: 0.2, suddenDeathTurn: 3, armsLevel: 2,
      } })

      Object.assign(internals(lobby), {
        onlineName: 'Changed later', onlineRounds: '9', onlineInterestRate: '0.4',
        onlineSuddenDeath: '20', onlineArmsLevel: '1',
        onlineMaxWind: '4', onlineGravity: '0.3', onlineWalls: 'concrete',
        onlineColor: '#4d8ce8',
      })
      response.resolve(new Response(JSON.stringify({
        roomId: 'room-1', code: 'ROOM', playerId: 'seat-1', token: 'test-seat-token', options,
      }), { status: 200 }))
      await pending
      expect(internals(lobby).waitingOptions).toStrictEqual(options)
      expect(internals(lobby).waitingPlayers).toStrictEqual([
        { id: 'seat-1', name: 'Ranger', color: '#4d8ce8', ready: false, loadout },
      ])
    } finally { lobby.hide() }
  })

  it('still reads fallback seed and players when server options are authoritative', async () => {
    const { subject, transport, session } = controller(vi.fn())
    const fallback = vi.fn(() => ({
      seed: 83,
      players: [{ id: '', name: 'Ranger', color: '#e84d4d', ready: false, loadout }],
      options: { maxPlayers: 4 as const, maxWind: 1, gravity: 0.1 },
    }))
    transport.createRoom.mockResolvedValue({ ok: true, status: 200, data: {
      roomId: 'room-1', code: 'ROOM', playerId: 'seat-1', token: 'test-seat-token', options,
    } })
    await subject.create({
      playerName: 'Ranger', color: '#e84d4d', loadout, bots: [], maxPlayers: 2, visibility: 'public',
      maxWind: '', gravity: '', walls: 'open', battlefieldWorld: '', hazards: 'none',
      rounds: '', interestRate: '', suddenDeath: '', armsLevel: '', teamMode: false,
    }, fallback)
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(session.replaceWaiting).toHaveBeenCalledExactlyOnceWith({
      roomId: 'room-1', roomCode: 'ROOM', playerId: 'seat-1', token: 'test-seat-token',
      seed: 83, players: [{ id: 'seat-1', name: 'Ranger', color: '#e84d4d', ready: false, loadout }],
      options, thisPlayerReady: false,
    })
  })

  it('rejects missing or incompatible response protocols before join fallback adoption', async () => {
    const handoff = vi.fn<(next: LobbyRoomHandoff) => void>()
    const { subject, transport, session, persistence } = controller(handoff)
    const input: JoinRoomParams = { code: 'ROOM', playerName: 'Ranger', color: '#e84d4d', loadout }
    transport.joinRoom.mockResolvedValue({ ok: true, status: 200, data: { roomId: 'room-1', playerId: 'seat-1', token: 'test-seat-token' } })
    await subject.join(input, 'ROOM', { maxPlayers: 2, maxWind: 10, gravity: 0.15, rulesetVersion: 4 })
    expect(subject.projection.error).toContain('older game build')
    transport.joinRoom.mockResolvedValue({ ok: true, status: 200, data: { roomId: 'room-1', playerId: 'seat-1', token: 'test-seat-token', options: { ...options, rulesetVersion: 1 } } })
    await subject.join(input, 'ROOM', options)
    expect(subject.projection.error).toContain('older game build')
    transport.joinRoom.mockResolvedValue({ ok: true, status: 200, data: {
      roomId: 'room-1', playerId: 'seat-1', token: 'test-seat-token',
      options: { ...options, commandProtocolVersion: 1 },
    } })
    await subject.join(input, 'ROOM', options)
    expect(subject.projection.error).toContain('command protocol')
    const { commandProtocolVersion: _omitted, ...withoutCommandProtocol } = options
    transport.joinRoom.mockResolvedValue({ ok: true, status: 200, data: {
      roomId: 'room-1', playerId: 'seat-1', token: 'test-seat-token', options: withoutCommandProtocol,
    } })
    await subject.join(input, 'ROOM', options)
    expect(subject.projection.error).toContain('command protocol')
    expect(handoff).not.toHaveBeenCalled()
    expect(session.replaceWaiting).not.toHaveBeenCalled()
    expect(session.subscribeWaitingRoom).not.toHaveBeenCalled()
    expect(persistence.writeSeatToken).not.toHaveBeenCalled()
    expect(persistence.writeSession).not.toHaveBeenCalled()
    expect(session.waiting).toStrictEqual(waiting)
  })

  it('refuses a create success without an exact v2 command protocol before persistence', async () => {
    const { subject, transport, session, persistence } = controller(vi.fn())
    const fallback = vi.fn(() => ({ seed: 83, players, options }))
    const { commandProtocolVersion: _omitted, ...withoutCommandProtocol } = options
    transport.createRoom.mockResolvedValue({ ok: true, status: 200, data: {
      roomId: 'room-1', code: 'ROOM', playerId: 'seat-1', token: 'test-seat-token',
      options: withoutCommandProtocol,
    } })

    await subject.create({
      playerName: 'Ranger', color: '#e84d4d', loadout, bots: [], maxPlayers: 2, visibility: 'public',
      maxWind: '', gravity: '', walls: 'open', battlefieldWorld: '', hazards: 'none',
      rounds: '', interestRate: '', suddenDeath: '', armsLevel: '', teamMode: false,
    }, fallback)

    expect(subject.projection.error).toContain('command protocol')
    expect(session.replaceWaiting).not.toHaveBeenCalled()
    expect(persistence.writeSession).not.toHaveBeenCalled()
  })

  it('hands a started waiting room to the ready callback with authoritative optional properties', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ started: true, players }) })
    vi.stubGlobal('fetch', fetch)
    const root = document.createElement('div')
    const onReady = vi.fn<(config: LobbyConfig) => void>()
    const lobby = new Lobby(root, onReady)
    Object.assign(internals(lobby), {
      waitingRoomId: 'room-1', waitingRoomCode: 'ROOM', waitingPlayerId: 'seat-1', waitingToken: 'test-seat-token',
      waitingSeed: 71, waitingOptions: options, waitingPlayers: players,
    })
    try {
      await internals(lobby).handleReadyUp()
      expect(onReady).toHaveBeenCalledTimes(1)
      expect(onReady.mock.calls[0]?.[0]).toStrictEqual(expectedHandoff)
    } finally { lobby.hide() }
  })

  it('rejoins with the authoritative values before handing off, retaining the stored seat token', async () => {
    let handoff: LobbyRoomHandoff | undefined
    const { subject } = controller((next) => { handoff = next })
    subject.setRejoinCandidate({ descriptor: { roomId: 'room-1', roomCode: 'ROOM', playerId: 'seat-1' }, room: room() })
    await subject.rejoin()
    expect(handoff).toStrictEqual(expectedHandoff)
  })

  it('keeps successor optional-property presence in the rematch projection', () => {
    const config = rematchToConfig({ roomId: 'next-1', code: 'NEXT', seed: 71, options, players }, 'seat-1')
    expect(config).toStrictEqual({
      mode: 'network', roomId: 'next-1', roomCode: 'NEXT', playerId: 'seat-1',
      players: expectedPlayers, playerNames: ['Ranger', 'Longshot'], settings: expectedSettings,
    })
    const sparse = rematchToConfig({ roomId: 'next-2', code: 'BARE', seed: 71, // Legacy runtime payload deliberately lacks required numeric fields.
      options: { maxPlayers: 2 } as RematchInfo['options'], players }, 'seat-1')
    expect(sparse).toStrictEqual({
      mode: 'network', roomId: 'next-2', roomCode: 'BARE', playerId: 'seat-1',
      players: expectedPlayers, playerNames: ['Ranger', 'Longshot'],
      settings: { seed: 71, maxWind: undefined, gravity: undefined },
    })
  })
})
