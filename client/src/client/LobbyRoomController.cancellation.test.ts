import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  LobbyRoomController,
  type LobbyRoomHandoff,
} from './LobbyRoomController'
import { LobbySession, type LobbyWaitingState } from './LobbySession'
import type {
  CreateRoomResponse,
  CreateRoomParams,
  FetchedRoom,
  JoinRoomParams,
  JoinRoomResponse,
  LobbyTransport,
} from './LobbyTransport'
import type { EdgeResult } from '../lib/edgeFunctions'
import type { SessionDescriptor } from '../lib/sessionDescriptor'
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout'

const emptyWaiting: LobbyWaitingState = {
  roomId: '',
  roomCode: '',
  playerId: '',
  token: '',
  players: [],
  seed: 0,
  options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
  thisPlayerReady: false,
}

const createParams: CreateRoomParams = {
  playerName: 'Alice',
  color: '#e84d4d',
  loadout: { ...DEFAULT_TANK_LOADOUT },
  bots: [],
  maxPlayers: 2,
  visibility: 'public',
  maxWind: '10',
  gravity: '0.15',
  walls: 'none',
  rounds: '1',
  interestRate: '0',
  suddenDeath: 'off',
  armsLevel: 'standard',
}

const joinParams: JoinRoomParams = {
  code: 'ROOM',
  playerName: 'Alice',
  color: '#e84d4d',
  loadout: { ...DEFAULT_TANK_LOADOUT },
}

function acceptedRoom(
  roomId: string,
  playerId: string,
  token: string,
): EdgeResult<CreateRoomResponse & JoinRoomResponse> {
  return {
    ok: true,
    status: 200,
    data: {
      roomId,
      code: roomId.toUpperCase(),
      playerId,
      token,
      players: [],
      options: {
        maxPlayers: 2,
        maxWind: 10,
        gravity: 0.15,
        rulesetVersion: 4,
        commandProtocolVersion: 2,
      },
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

type ControllerTransport = Pick<
  LobbyTransport,
  'createRoom' | 'joinRoom' | 'fetchRoom' | 'leaveRoom'
>
type ControllerSession = Pick<
  LobbySession,
  'waiting' | 'replaceWaiting' | 'subscribeWaitingRoom' | 'stopBrowsePoll' | 'leaveRoom'
>

function setup() {
  let waiting = { ...emptyWaiting }
  const session: ControllerSession = {
    get waiting() { return waiting },
    replaceWaiting: vi.fn((value: LobbyWaitingState) => { waiting = value }),
    subscribeWaitingRoom: vi.fn(async () => undefined),
    stopBrowsePoll: vi.fn(),
    leaveRoom: vi.fn(async () => undefined),
  }
  const transport: ControllerTransport = {
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    fetchRoom: vi.fn(),
    leaveRoom: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
  }
  const persistence = {
    writeSeatToken: vi.fn(),
    writeSession: vi.fn(),
    clearSession: vi.fn(),
    readSession: vi.fn((): SessionDescriptor | null => null),
    readSeatToken: vi.fn((): string | undefined => undefined),
  }
  const handoff = vi.fn<(value: LobbyRoomHandoff) => void>()
  const onChanged = vi.fn()
  const controller = new LobbyRoomController(
    transport,
    session,
    onChanged,
    vi.fn(),
    handoff,
    persistence,
  )
  const fallback = () => ({
    players: [],
    seed: 0,
    options: emptyWaiting.options,
  })
  return { controller, transport, session, persistence, handoff, onChanged, fallback, waiting: () => waiting }
}

describe('LobbyRoomController cancellation ownership', () => {
  it('new join supersedes an older create and releases only the stale remote seat', async () => {
    const test = setup()
    const oldCreate = deferred<EdgeResult<CreateRoomResponse>>()
    vi.mocked(test.transport.createRoom).mockReturnValue(oldCreate.promise)
    vi.mocked(test.transport.joinRoom).mockResolvedValue(acceptedRoom('new', 'new-p', 'new-t'))

    const pending = test.controller.create(createParams, test.fallback)
    await test.controller.join(joinParams, 'NEW', emptyWaiting.options)
    oldCreate.resolve(acceptedRoom('old', 'old-p', 'old-t'))
    await pending

    expect(test.waiting().roomId).toBe('new')
    expect(test.session.replaceWaiting).toHaveBeenCalledTimes(1)
    expect(test.transport.leaveRoom).toHaveBeenCalledWith({
      roomId: 'old', playerId: 'old-p', token: 'old-t',
    })
  })

  it('new create supersedes an older join and releases only the stale joined seat', async () => {
    const test = setup()
    const oldJoin = deferred<EdgeResult<JoinRoomResponse>>()
    vi.mocked(test.transport.joinRoom).mockReturnValue(oldJoin.promise)
    vi.mocked(test.transport.createRoom).mockResolvedValue(acceptedRoom('new', 'new-p', 'new-t'))

    const pending = test.controller.join(joinParams, 'OLD', emptyWaiting.options)
    await test.controller.create(createParams, test.fallback)
    oldJoin.resolve(acceptedRoom('old', 'old-p', 'old-t'))
    await pending

    expect(test.waiting().roomId).toBe('new')
    expect(test.session.replaceWaiting).toHaveBeenCalledTimes(1)
    expect(test.transport.leaveRoom).toHaveBeenCalledWith({
      roomId: 'old', playerId: 'old-p', token: 'old-t',
    })
  })

  it('does not release a stale duplicate response for the seat a newer operation adopted', async () => {
    const test = setup()
    const oldCreate = deferred<EdgeResult<CreateRoomResponse>>()
    vi.mocked(test.transport.createRoom).mockReturnValue(oldCreate.promise)
    vi.mocked(test.transport.joinRoom).mockResolvedValue(acceptedRoom('same', 'p', 'tok'))

    const pending = test.controller.create(createParams, test.fallback)
    await test.controller.join(joinParams, 'SAME', emptyWaiting.options)
    oldCreate.resolve(acceptedRoom('same', 'p', 'tok'))
    await pending

    expect(test.transport.leaveRoom).not.toHaveBeenCalled()
  })

  it('a new admission supersedes pending leave without retaining leaving state', async () => {
    const test = setup()
    const leaving = deferred<void>()
    vi.mocked(test.session.leaveRoom).mockReturnValue(leaving.promise)

    const pendingLeave = test.controller.leave()
    vi.mocked(test.transport.createRoom).mockResolvedValue(acceptedRoom('new', 'p', 'tok'))
    await test.controller.create(createParams, test.fallback)
    leaving.resolve()
    await pendingLeave

    expect(test.controller.projection).toMatchObject({
      leaving: false,
      busy: false,
      error: '',
      waiting: { roomId: 'new' },
    })
    expect(test.persistence.clearSession).not.toHaveBeenCalled()
  })

  it('leave during join prevents adoption and releases the late joined seat', async () => {
    const test = setup()
    const joining = deferred<EdgeResult<JoinRoomResponse>>()
    vi.mocked(test.transport.joinRoom).mockReturnValue(joining.promise)

    const pending = test.controller.join(joinParams, 'LATE', emptyWaiting.options)
    await test.controller.leave()
    joining.resolve(acceptedRoom('late', 'p', 'tok'))
    await pending

    expect(test.session.replaceWaiting).not.toHaveBeenCalled()
    expect(test.persistence.writeSession).not.toHaveBeenCalled()
    expect(test.transport.leaveRoom).toHaveBeenCalledWith({
      roomId: 'late', playerId: 'p', token: 'tok',
    })
  })

  it('activate invalidates a pending error and permits a clean new admission after retirement', async () => {
    const test = setup()
    const oldCreate = deferred<EdgeResult<CreateRoomResponse>>()
    vi.mocked(test.transport.createRoom).mockReturnValueOnce(oldCreate.promise)

    const pending = test.controller.create(createParams, test.fallback)
    test.controller.retire()
    test.controller.activate()
    expect(test.controller.projection).toMatchObject({ busy: false, leaving: false, error: '' })

    vi.mocked(test.transport.createRoom).mockResolvedValueOnce(acceptedRoom('new', 'p', 'tok'))
    await test.controller.create(createParams, test.fallback)
    oldCreate.reject(new Error('late'))
    await pending

    expect(test.waiting().roomId).toBe('new')
    expect(test.controller.projection.error).toBe('')
  })

  it('recovery supersedes pending foreground work and clears its transient state', async () => {
    const test = setup()
    const oldCreate = deferred<EdgeResult<CreateRoomResponse>>()
    const recovery = deferred<FetchedRoom | null>()
    vi.mocked(test.transport.createRoom).mockReturnValue(oldCreate.promise)
    vi.mocked(test.transport.fetchRoom).mockReturnValue(recovery.promise)
    test.persistence.readSession.mockReturnValue({ roomId: 'saved', roomCode: 'SAVE', playerId: 'p' })

    const pendingCreate = test.controller.create(createParams, test.fallback)
    test.onChanged.mockClear()
    const pendingRecovery = test.controller.checkRejoinCandidate()
    expect(test.controller.projection.busy).toBe(false)
    expect(test.onChanged).toHaveBeenCalledTimes(1)

    recovery.resolve(null)
    await pendingRecovery
    oldCreate.reject(new Error('late'))
    await pendingCreate
    expect(test.controller.projection).toMatchObject({ busy: false, leaving: false, error: '' })
  })

  it('account identity invalidation discards a late recovery fetch', async () => {
    const test = setup()
    const fetch = deferred<FetchedRoom | null>()
    test.persistence.readSession.mockReturnValue({ roomId: 'saved', roomCode: 'SAVE', playerId: 'p' })
    vi.mocked(test.transport.fetchRoom).mockReturnValue(fetch.promise)

    const pending = test.controller.checkRejoinCandidate()
    test.controller.accountIdentityChanged()
    fetch.resolve({
      id: 'saved', code: 'SAVE', status: 'active', seed: 17,
      players: [{ id: 'p', name: 'Alice', color: '#e84d4d', ready: true }],
      options: { maxPlayers: 2, maxWind: 6, gravity: 0.15 },
    })
    await pending

    expect(test.controller.projection.rejoinCandidate).toBeNull()
    expect(test.handoff).not.toHaveBeenCalled()
  })

  it('a fresh lifecycle can recover and hand off after the prior lifecycle was retired', async () => {
    const test = setup()
    const descriptor = { roomId: 'saved', roomCode: 'SAVE', playerId: 'p' }
    const live: FetchedRoom = {
      id: 'saved', code: 'SAVE', status: 'active', seed: 17,
      players: [{ id: 'p', name: 'Alice', color: '#e84d4d', ready: true }],
      options: { maxPlayers: 2, maxWind: 6, gravity: 0.15, rulesetVersion: 4, commandProtocolVersion: 2 },
    }
    test.persistence.readSession.mockReturnValue(descriptor)
    test.persistence.readSeatToken.mockReturnValue('tok')
    vi.mocked(test.transport.fetchRoom).mockResolvedValue(live)

    test.controller.retire()
    test.controller.activate()
    await test.controller.checkRejoinCandidate()
    await test.controller.rejoin()

    expect(test.controller.projection.rejoinCandidate).toEqual({ descriptor, room: live })
    expect(test.handoff).toHaveBeenCalledTimes(1)
    expect(test.handoff.mock.calls[0]![0]).toMatchObject({
      roomId: 'saved', playerId: 'p', token: 'tok',
    })
  })

  it('failed leave settles locally and a later leave intent is accepted', async () => {
    const test = setup()
    vi.mocked(test.session.leaveRoom)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)

    await test.controller.leave()
    await test.controller.leave()

    expect(test.session.leaveRoom).toHaveBeenCalledTimes(2)
    expect(test.controller.projection.leaving).toBe(false)
  })
})

type SessionTransport = Pick<
  LobbyTransport,
  'heartbeat' | 'readyUp' | 'updatePlayer' | 'leaveRoom'
>

function realSessionFixture() {
  const channels = new Set<object>()
  const transport: SessionTransport = {
    heartbeat: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
    readyUp: vi.fn(),
    updatePlayer: vi.fn(),
    leaveRoom: vi.fn(),
  }
  const supabase = {
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => { channels.add(channel); return channel }),
      }
      return channel
    }),
    removeChannel: vi.fn(async (channel: object) => { channels.delete(channel) }),
  }
  const session = new LobbySession(
    transport,
    vi.fn(),
    async () => supabase as unknown as Pick<SupabaseClient, 'channel' | 'removeChannel'>,
  )
  return { channels, transport, session }
}

it('rejected stale admission cleanup settles without disturbing the newer seat or channel', async () => {
  const fixture = realSessionFixture()
  const test = setup()
  const obsolete = deferred<EdgeResult<CreateRoomResponse>>()
  const cleanup = deferred<EdgeResult<unknown>>()
  vi.mocked(test.transport.createRoom).mockReturnValue(obsolete.promise)
  vi.mocked(test.transport.joinRoom).mockResolvedValue(acceptedRoom('new', 'new-p', 'new-t'))
  vi.mocked(test.transport.leaveRoom).mockReturnValue(cleanup.promise)
  const controller = new LobbyRoomController(
    test.transport, fixture.session, test.onChanged, vi.fn(), test.handoff, test.persistence,
  )
  try {
    const pending = controller.create(createParams, test.fallback)
    await controller.join(joinParams, 'NEW', emptyWaiting.options)
    await Promise.resolve()
    const currentChannel = [...fixture.channels][0]
    expect(fixture.channels.size).toBe(1)
    const projection = controller.projection
    const notifications = test.onChanged.mock.calls.length

    obsolete.resolve(acceptedRoom('old', 'old-p', 'old-t'))
    await Promise.resolve()
    expect(test.transport.leaveRoom).toHaveBeenCalledExactlyOnceWith({
      roomId: 'old', playerId: 'old-p', token: 'old-t',
    })
    cleanup.reject(new Error('offline cleanup'))
    await expect(pending).resolves.toBeUndefined()

    expect(controller.projection).toEqual(projection)
    expect(test.onChanged).toHaveBeenCalledTimes(notifications)
    expect(test.persistence.writeSession).toHaveBeenCalledExactlyOnceWith({
      roomId: 'new', roomCode: 'NEW', playerId: 'new-p',
    })
    expect(test.persistence.writeSeatToken).toHaveBeenCalledExactlyOnceWith('new-p', 'new-t')
    expect(test.persistence.clearSession).not.toHaveBeenCalled()
    expect([...fixture.channels]).toEqual([currentChannel])
    expect(test.handoff).not.toHaveBeenCalled()
  } finally {
    fixture.session.cleanupWaitingChannel()
  }
})

it('a retiring real LobbySession cannot clear a newer waiting subscription', async () => {
  const fixture = realSessionFixture()
  const leaving = deferred<EdgeResult<unknown>>()
  vi.mocked(fixture.transport.leaveRoom).mockReturnValue(leaving.promise)
  const test = setup()
  const controller = new LobbyRoomController(
    test.transport,
    fixture.session,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    test.persistence,
  )
  fixture.session.replaceWaiting({ ...emptyWaiting, roomId: 'old', playerId: 'old-p', token: 'old-t' })
  await fixture.session.subscribeWaitingRoom()

  const pending = controller.leave()
  vi.mocked(test.transport.createRoom).mockResolvedValue(acceptedRoom('new', 'new-p', 'new-t'))
  await controller.create(createParams, test.fallback)
  await Promise.resolve()
  leaving.resolve({ ok: true, status: 200, data: {} })
  await pending

  expect(fixture.session.waiting.roomId).toBe('new')
  expect(fixture.channels.size).toBe(1)
  fixture.session.cleanupWaitingChannel()
})

it('a failed real LobbySession leave can be retried without reopening a subscription', async () => {
  const fixture = realSessionFixture()
  vi.mocked(fixture.transport.leaveRoom)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
  fixture.session.replaceWaiting({ ...emptyWaiting, roomId: 'room', playerId: 'p', token: 'tok' })
  await fixture.session.subscribeWaitingRoom()

  await expect(fixture.session.leaveRoom()).rejects.toThrow('offline')
  expect(fixture.channels.size).toBe(0)
  await fixture.session.leaveRoom()

  expect(fixture.transport.leaveRoom).toHaveBeenCalledTimes(2)
  expect(fixture.channels.size).toBe(0)
})

it('an unsuccessful HTTP leave can be retried without reopening a subscription', async () => {
  const fixture = realSessionFixture()
  vi.mocked(fixture.transport.leaveRoom)
    .mockResolvedValueOnce({ ok: false, status: 503, data: { error: 'unavailable' } })
    .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
  fixture.session.replaceWaiting({ ...emptyWaiting, roomId: 'room', playerId: 'p', token: 'tok' })
  await fixture.session.subscribeWaitingRoom()

  await expect(fixture.session.leaveRoom()).rejects.toThrow('Room leave failed (503).')
  expect(fixture.channels.size).toBe(0)
  await fixture.session.leaveRoom()

  expect(fixture.transport.leaveRoom).toHaveBeenCalledTimes(2)
  expect(fixture.channels.size).toBe(0)
})

it('repeated real session admission and exit keeps one channel on entry and zero on exit', async () => {
  const fixture = realSessionFixture()
  vi.mocked(fixture.transport.leaveRoom).mockResolvedValue({ ok: true, status: 200, data: {} })
  const test = setup()
  const transport: ControllerTransport = {
    ...test.transport,
    leaveRoom: fixture.transport.leaveRoom,
  }
  const controller = new LobbyRoomController(
    transport,
    fixture.session,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    test.persistence,
  )

  for (const [roomId, playerId, token] of [
    ['one', 'p1', 't1'],
    ['two', 'p2', 't2'],
  ] as const) {
    vi.mocked(transport.createRoom).mockResolvedValueOnce(acceptedRoom(roomId, playerId, token))
    await controller.create(createParams, test.fallback)
    await Promise.resolve()
    expect(fixture.channels.size).toBe(1)

    await controller.leave()
    expect(fixture.channels.size).toBe(0)
  }
  expect(fixture.transport.leaveRoom).toHaveBeenCalledTimes(2)
})
