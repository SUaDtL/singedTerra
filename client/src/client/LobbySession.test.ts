import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LobbySession,
  type LobbySessionEvent,
  type LobbyWaitingState,
} from './LobbySession'
import type { LobbyTransport, NetworkPlayer } from './LobbyTransport'

type CapturedChannel = {
  name: string
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  update?: (payload: { new: Record<string, unknown> }) => void
  delete?: () => void
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`)
  return value
}

const waiting: LobbyWaitingState = {
  roomId: 'room-1',
  roomCode: 'ABCD',
  playerId: 'p-1',
  token: 'tok-secret',
  players: [
    { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false, lastSeen: 100 } as NetworkPlayer & { lastSeen: number },
    { id: 'p-2', name: 'CPU', color: '#4d8ce8', ready: true, ai: 'medium', lastSeen: 100 } as NetworkPlayer & { lastSeen: number },
  ],
  seed: 42,
  options: { maxPlayers: 3, maxWind: 7, gravity: 0.2, rounds: 3 },
  thisPlayerReady: false,
}

function cloneWaiting(): LobbyWaitingState {
  return { ...waiting, players: waiting.players.map((player) => ({ ...player })) }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createRealtime(): {
  channels: CapturedChannel[]
  channel: ReturnType<typeof vi.fn>
  removeChannel: ReturnType<typeof vi.fn>
} {
  const channels: CapturedChannel[] = []
  const removeChannel = vi.fn()
  const channel = vi.fn((name: string) => {
    const captured = { name } as CapturedChannel
    captured.on = vi.fn((_kind: string, filter: { event: string }, callback: unknown) => {
      if (filter.event === 'UPDATE') captured.update = callback as CapturedChannel['update']
      if (filter.event === 'DELETE') captured.delete = callback as CapturedChannel['delete']
      return captured
    })
    captured.subscribe = vi.fn(() => captured)
    channels.push(captured)
    return captured
  })
  return { channels, channel, removeChannel }
}

type SessionTransport = Pick<LobbyTransport, 'heartbeat' | 'readyUp' | 'updatePlayer' | 'leaveRoom'>

function createTransport(): {
  transport: SessionTransport
  heartbeat: ReturnType<typeof vi.fn>
  readyUp: ReturnType<typeof vi.fn>
  updatePlayer: ReturnType<typeof vi.fn>
  leaveRoom: ReturnType<typeof vi.fn>
} {
  const heartbeat = vi.fn().mockResolvedValue({ ok: true, status: 200, data: null })
  const readyUp = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { players: [] } })
  const updatePlayer = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { players: [] } })
  const leaveRoom = vi.fn().mockResolvedValue({ ok: true, status: 200, data: null })
  return {
    transport: { heartbeat, readyUp, updatePlayer, leaveRoom } as unknown as SessionTransport,
    heartbeat,
    readyUp,
    updatePlayer,
    leaveRoom,
  }
}

function expectRoomSubscription(channel: CapturedChannel, roomId: string): void {
  expect(channel.name).toBe(`rooms:${roomId}`)
  expect(channel.on).toHaveBeenNthCalledWith(1, 'postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
  }, expect.any(Function))
  expect(channel.on).toHaveBeenNthCalledWith(2, 'postgres_changes', {
    event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
  }, expect.any(Function))
  expect(channel.subscribe).toHaveBeenCalledTimes(1)
}

describe('LobbySession', () => {
  let realtime: ReturnType<typeof createRealtime>
  let transport: ReturnType<typeof createTransport>
  let events: LobbySessionEvent[]
  let session: LobbySession

  beforeEach(() => {
    vi.useFakeTimers()
    realtime = createRealtime()
    transport = createTransport()
    events = []
    session = new LobbySession(transport.transport, (event) => events.push(event), async () => realtime as never)
  })

  afterEach(() => {
    session.cleanupWaitingChannel()
    session.stopBrowsePoll()
    vi.useRealTimers()
  })

  it('starts empty and replaces waiting state without retaining the caller player array', () => {
    expect(session.waiting).toEqual({
      roomId: '', roomCode: '', playerId: '', token: '', players: [], seed: 0,
      options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 }, thisPlayerReady: false,
    })

    const next = cloneWaiting()
    session.replaceWaiting(next)
    next.players.push({ id: 'later', name: 'Later', color: '#000', ready: false })

    expect(session.waiting).toEqual(waiting)
    expect(events).toEqual([])
  })

  it('wires one exact room subscription and a 10000 ms heartbeat timer', async () => {
    session.replaceWaiting(cloneWaiting())
    const setInterval = vi.spyOn(globalThis, 'setInterval')

    await session.subscribeWaitingRoom()

    expect(realtime.channels).toHaveLength(1)
    expectRoomSubscription(required(realtime.channels[0], 'initial realtime channel'), 'room-1')
    expect(setInterval).toHaveBeenLastCalledWith(expect.any(Function), 10_000)
    expect(vi.getTimerCount()).toBe(1)

    session.startHeartbeat()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('replaces an existing subscription and retains only one heartbeat timer', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const first = required(realtime.channels[0], 'first realtime channel')
    session.replaceWaiting({ ...cloneWaiting(), roomId: 'room-2' })

    await session.subscribeWaitingRoom()

    expect(realtime.removeChannel).toHaveBeenCalledWith(first)
    expectRoomSubscription(required(realtime.channels[1], 'replacement realtime channel'), 'room-2')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('ignores an active UPDATE from a replaced channel and lets the replacement become ready', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const first = required(realtime.channels[0], 'first realtime channel')
    const roomTwo = { ...cloneWaiting(), roomId: 'room-2', roomCode: 'WXYZ', seed: 84 }
    session.replaceWaiting(roomTwo)
    await session.subscribeWaitingRoom()
    const second = required(realtime.channels[1], 'replacement realtime channel')
    const active = {
      players: roomTwo.players.map((player) => ({ ...player, ready: true })),
      seed: 88,
      options: { ...roomTwo.options, gravity: 0.25 },
    }

    required(first.update, 'first UPDATE callback')({
      new: { status: 'active', players: waiting.players, seed: 77, options: waiting.options },
    })

    expect(session.waiting).toEqual(roomTwo)
    expect(events).toEqual([])
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    required(second.update, 'replacement UPDATE callback')({ new: { status: 'active', ...active } })

    expect(events).toEqual([{ type: 'ready', source: 'realtime', room: active }])
    expect(realtime.removeChannel).toHaveBeenLastCalledWith(second)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a DELETE from a replaced channel and lets the replacement report deletion', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const first = required(realtime.channels[0], 'first realtime channel')
    const roomTwo = { ...cloneWaiting(), roomId: 'room-2', roomCode: 'WXYZ', seed: 84 }
    session.replaceWaiting(roomTwo)
    await session.subscribeWaitingRoom()
    const second = required(realtime.channels[1], 'replacement realtime channel')

    required(first.delete, 'first DELETE callback')()

    expect(session.waiting).toEqual(roomTwo)
    expect(events).toEqual([])
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    required(second.delete, 'replacement DELETE callback')()

    expect(session.waiting).toMatchObject({
      roomId: '',
      roomCode: '',
      playerId: '',
      token: '',
      players: [],
      thisPlayerReady: false,
    })
    expect(events).toEqual([{
      type: 'gone',
      message: 'This room is no longer available.',
    }])
    expect(realtime.removeChannel).toHaveBeenLastCalledWith(second)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not install a subscription after cleanup invalidates an unresolved loader', async () => {
    const loading = deferred<ReturnType<typeof createRealtime>>()
    const loadSupabase = vi.fn(() => loading.promise as never)
    session = new LobbySession(transport.transport, (event) => events.push(event), loadSupabase)
    session.replaceWaiting(cloneWaiting())

    const subscribing = session.subscribeWaitingRoom()
    session.cleanupWaitingChannel()
    loading.resolve(realtime)
    await subscribing

    expect(loadSupabase).toHaveBeenCalledTimes(1)
    expect(realtime.channels).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not install a captured room subscription after identity changes during loading', async () => {
    const loading = deferred<ReturnType<typeof createRealtime>>()
    const loadSupabase = vi.fn(() => loading.promise as never)
    session = new LobbySession(transport.transport, (event) => events.push(event), loadSupabase)
    session.replaceWaiting(cloneWaiting())

    const subscribing = session.subscribeWaitingRoom()
    session.replaceWaiting({
      ...cloneWaiting(),
      roomId: 'room-2',
      roomCode: 'WXYZ',
      playerId: 'p-9',
      token: 'room-two-token',
    })
    loading.resolve(realtime)
    await subscribing

    expect(loadSupabase).toHaveBeenCalledTimes(1)
    expect(realtime.channels).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('memoizes a concurrent loader and installs only the newest room subscription', async () => {
    const loading = deferred<ReturnType<typeof createRealtime>>()
    const loadSupabase = vi.fn(() => loading.promise as never)
    session = new LobbySession(transport.transport, (event) => events.push(event), loadSupabase)
    session.replaceWaiting(cloneWaiting())

    const first = session.subscribeWaitingRoom()
    session.replaceWaiting({ ...cloneWaiting(), roomId: 'room-2' })
    const second = session.subscribeWaitingRoom()
    loading.resolve(realtime)
    await Promise.all([first, second])

    expect(loadSupabase).toHaveBeenCalledTimes(1)
    expect(realtime.channels).toHaveLength(1)
    expectRoomSubscription(required(realtime.channels[0], 'memoized realtime channel'), 'room-2')
    expect(realtime.removeChannel).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('retries the Supabase loader after a rejected attempt', async () => {
    const loadError = new Error('loader unavailable')
    const loadSupabase = vi.fn()
      .mockRejectedValueOnce(loadError)
      .mockResolvedValueOnce(realtime)
    session = new LobbySession(transport.transport, (event) => events.push(event), loadSupabase)
    session.replaceWaiting(cloneWaiting())

    await expect(session.subscribeWaitingRoom()).rejects.toBe(loadError)
    await session.subscribeWaitingRoom()

    expect(loadSupabase).toHaveBeenCalledTimes(2)
    expect(realtime.channels).toHaveLength(1)
    expectRoomSubscription(required(realtime.channels[0], 'retried realtime channel'), 'room-1')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('adopts waiting updates and suppresses changed for lastSeen-only updates', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const update = required(required(realtime.channels[0], 'realtime channel').update, 'waiting UPDATE callback')
    const updatedPlayers = waiting.players.map((player) => ({ ...player, lastSeen: 200 }))

    update({ new: { status: 'waiting', players: updatedPlayers, seed: 99, options: { ...waiting.options, maxWind: 9 } } })
    expect(session.waiting).toMatchObject({ players: updatedPlayers, seed: 99, options: { maxWind: 9 } })
    expect(events).toEqual([{ type: 'changed' }])

    update({ new: { status: 'waiting', players: updatedPlayers.map((player) => ({ ...player, lastSeen: 300 })) } })
    expect((session.waiting.players[0] as NetworkPlayer & { lastSeen: number }).lastSeen).toBe(300)
    expect(events).toEqual([{ type: 'changed' }])
  })

  it('cleans waiting resources and emits one exact ready room for an active update', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const channel = required(realtime.channels[0], 'active realtime channel')
    const active = { players: waiting.players, seed: 77, options: { ...waiting.options, gravity: 0.3 } }

    required(channel.update, 'active UPDATE callback')({ new: { status: 'active', ...active } })

    expect(realtime.removeChannel).toHaveBeenCalledWith(channel)
    expect(vi.getTimerCount()).toBe(0)
    expect(events).toEqual([{ type: 'ready', source: 'realtime', room: active }])
  })

  it('resets and emits each exact gone message once for roster removal and DELETE', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    required(required(realtime.channels[0], 'roster realtime channel').update, 'roster UPDATE callback')({ new: { status: 'waiting', players: [waiting.players[1]] } })

    expect(session.waiting).toMatchObject({ roomId: '', roomCode: '', playerId: '', token: '', players: [], thisPlayerReady: false })
    expect(events).toEqual([{ type: 'gone', message: 'You are no longer in this room.' }])
    required(required(realtime.channels[0], 'roster realtime channel').delete, 'roster DELETE callback')()
    expect(events).toHaveLength(1)

    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    required(required(realtime.channels[1], 'replacement realtime channel').delete, 'replacement DELETE callback')()
    expect(events).toEqual([
      { type: 'gone', message: 'You are no longer in this room.' },
      { type: 'gone', message: 'This room is no longer available.' },
    ])
    required(required(realtime.channels[1], 'replacement realtime channel').delete, 'replacement DELETE callback')()
    expect(events).toHaveLength(2)
  })

  it('delegates actions with the exact seat and adopts successful action state', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const readyPlayers = waiting.players.map((player) => ({ ...player, ready: true }))
    transport.readyUp.mockResolvedValueOnce({ ok: true, status: 200, data: { players: readyPlayers, started: true } })

    await session.readyUp()
    expect(transport.readyUp).toHaveBeenCalledWith({ roomId: 'room-1', playerId: 'p-1', token: 'tok-secret' })
    expect(session.waiting).toMatchObject({ players: readyPlayers, thisPlayerReady: true })
    expect(realtime.removeChannel).toHaveBeenCalledWith(realtime.channels[0])
    expect(events).toEqual([{
      type: 'ready',
      source: 'direct',
      room: { players: readyPlayers, seed: waiting.seed, options: waiting.options },
    }])

    session.replaceWaiting({
      ...cloneWaiting(),
      roomId: 'room-2',
      roomCode: 'WXYZ',
      playerId: 'p-9',
      token: 'room-two-token',
      players: readyPlayers,
    })
    const renamed = readyPlayers.map((player) => player.id === 'p-1' ? { ...player, name: 'Alicia' } : player)
    transport.updatePlayer.mockResolvedValueOnce({ ok: true, status: 200, data: { players: renamed } })
    await session.updatePlayer({ name: 'Alicia' })
    expect(transport.updatePlayer).toHaveBeenCalledWith({
      roomId: 'room-2',
      playerId: 'p-9',
      token: 'room-two-token',
      fields: { name: 'Alicia' },
    })
    expect(session.waiting.players).toEqual(renamed)

    transport.leaveRoom.mockRejectedValueOnce(new Error('offline'))
    await expect(session.leaveRoom()).rejects.toThrow('offline')
    expect(transport.leaveRoom).toHaveBeenCalledWith({
      roomId: 'room-2',
      playerId: 'p-9',
      token: 'room-two-token',
    })
  })

  it('marks this player ready without replacing players when ready-up omits the roster', async () => {
    session.replaceWaiting(cloneWaiting())
    transport.readyUp.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { started: false },
    })

    await expect(session.readyUp()).resolves.toEqual({
      ok: true,
      status: 200,
      data: { started: false },
    })

    expect(session.waiting.players).toEqual(waiting.players)
    expect(session.waiting.thisPlayerReady).toBe(true)
    expect(events).toEqual([])
  })

  it('returns stale and leaves a replacement room untouched when ready-up resolves late', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const ready = deferred<{
      ok: boolean
      status: number
      data: { players: NetworkPlayer[]; started: boolean }
    }>()
    transport.readyUp.mockReturnValueOnce(ready.promise)

    const pendingReady = session.readyUp()
    expect(transport.readyUp).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'tok-secret',
    })

    const roomTwo = {
      ...cloneWaiting(),
      roomId: 'room-2',
      roomCode: 'WXYZ',
      playerId: 'p-9',
      token: 'room-two-token',
      seed: 84,
    }
    session.replaceWaiting(roomTwo)
    await session.subscribeWaitingRoom()
    const replacementChannel = realtime.channels[1]
    const readyPlayers = waiting.players.map((player) => ({ ...player, ready: true }))

    ready.resolve({ ok: true, status: 200, data: { players: readyPlayers, started: true } })

    await expect(pendingReady).resolves.toEqual({ stale: true })
    expect(session.waiting).toEqual(roomTwo)
    expect(events).toEqual([])
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(realtime.removeChannel).not.toHaveBeenCalledWith(replacementChannel)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('returns stale and leaves a replacement room untouched when ready-up rejects late', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const ready = deferred<{
      ok: boolean
      status: number
      data: { players: NetworkPlayer[]; started: boolean }
    }>()
    transport.readyUp.mockReturnValueOnce(ready.promise)

    const pendingReady = session.readyUp()
    expect(transport.readyUp).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'tok-secret',
    })

    const roomTwo = {
      ...cloneWaiting(),
      roomId: 'room-2',
      roomCode: 'WXYZ',
      playerId: 'p-9',
      token: 'room-two-token',
      seed: 84,
    }
    session.replaceWaiting(roomTwo)
    await session.subscribeWaitingRoom()
    const replacementChannel = realtime.channels[1]

    ready.reject(new Error('room A offline'))

    await expect(pendingReady).resolves.toEqual({ stale: true })
    expect(session.waiting).toEqual(roomTwo)
    expect(events).toEqual([])
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(realtime.removeChannel).not.toHaveBeenCalledWith(replacementChannel)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('rethrows a current-room ready-up rejection unchanged', async () => {
    session.replaceWaiting(cloneWaiting())
    const readyError = new Error('current room offline')
    transport.readyUp.mockRejectedValueOnce(readyError)

    await expect(session.readyUp()).rejects.toBe(readyError)

    expect(session.waiting).toEqual(waiting)
    expect(events).toEqual([])
  })

  it('returns stale and leaves a replacement room untouched when player update resolves after leave', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const updating = deferred<{
      ok: boolean
      status: number
      data: { players: NetworkPlayer[] }
    }>()
    transport.updatePlayer.mockReturnValueOnce(updating.promise)

    const pendingUpdate = session.updatePlayer({ name: 'Room A Alice' })
    expect(transport.updatePlayer).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'tok-secret',
      fields: { name: 'Room A Alice' },
    })

    await session.leaveRoom()
    expect(transport.leaveRoom).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'tok-secret',
    })
    const roomTwo = {
      ...cloneWaiting(),
      roomId: 'room-2',
      roomCode: 'WXYZ',
      playerId: 'p-9',
      token: 'room-two-token',
      seed: 84,
    }
    session.replaceWaiting(roomTwo)
    await session.subscribeWaitingRoom()
    const replacementChannel = realtime.channels[1]
    const renamed = waiting.players.map((player) => (
      player.id === 'p-1' ? { ...player, name: 'Room A Alice' } : player
    ))

    updating.resolve({ ok: true, status: 200, data: { players: renamed } })

    await expect(pendingUpdate).resolves.toEqual({ stale: true })
    expect(session.waiting).toEqual(roomTwo)
    expect(events).toEqual([])
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(realtime.removeChannel).not.toHaveBeenCalledWith(replacementChannel)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('returns stale and leaves a replacement room untouched when player update rejects after leave', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const updating = deferred<{
      ok: boolean
      status: number
      data: { players: NetworkPlayer[] }
    }>()
    transport.updatePlayer.mockReturnValueOnce(updating.promise)

    const pendingUpdate = session.updatePlayer({ name: 'Room A Alice' })
    expect(transport.updatePlayer).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'tok-secret',
      fields: { name: 'Room A Alice' },
    })

    await session.leaveRoom()
    expect(transport.leaveRoom).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'tok-secret',
    })
    const roomTwo = {
      ...cloneWaiting(),
      roomId: 'room-2',
      roomCode: 'WXYZ',
      playerId: 'p-9',
      token: 'room-two-token',
      seed: 84,
    }
    session.replaceWaiting(roomTwo)
    await session.subscribeWaitingRoom()
    const replacementChannel = realtime.channels[1]

    updating.reject(new Error('room A offline'))

    await expect(pendingUpdate).resolves.toEqual({ stale: true })
    expect(session.waiting).toEqual(roomTwo)
    expect(events).toEqual([])
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(realtime.removeChannel).not.toHaveBeenCalledWith(replacementChannel)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('rethrows a current-room player update rejection unchanged', async () => {
    session.replaceWaiting(cloneWaiting())
    const updateError = new Error('current room offline')
    transport.updatePlayer.mockRejectedValueOnce(updateError)

    await expect(session.updatePlayer({ name: 'Alice 2' })).rejects.toBe(updateError)

    expect(session.waiting).toEqual(waiting)
    expect(events).toEqual([])
  })

  it('immediately cleans a subscribed room while a successful leave request is pending', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const channel = realtime.channels[0]
    const leaving = deferred<{ ok: boolean; status: number; data: null }>()
    transport.leaveRoom.mockReturnValueOnce(leaving.promise)

    const pendingLeave = session.leaveRoom()

    expect(transport.leaveRoom).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'tok-secret',
    })
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(realtime.removeChannel).toHaveBeenCalledWith(channel)
    expect(vi.getTimerCount()).toBe(0)

    leaving.resolve({ ok: true, status: 200, data: null })
    await pendingLeave

    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('immediately cleans a subscribed room and stays clean when leave rejects', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const channel = realtime.channels[0]
    const leaving = deferred<{ ok: boolean; status: number; data: null }>()
    transport.leaveRoom.mockReturnValueOnce(leaving.promise)

    const pendingLeave = session.leaveRoom()

    expect(transport.leaveRoom).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'tok-secret',
    })
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(realtime.removeChannel).toHaveBeenCalledWith(channel)
    expect(vi.getTimerCount()).toBe(0)

    const leaveError = new Error('offline')
    leaving.reject(leaveError)
    await expect(pendingLeave).rejects.toBe(leaveError)

    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('closes the action lifecycle while leave is pending', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const beforeLeave = cloneWaiting()
    const leaving = deferred<{ ok: boolean; status: number; data: null }>()
    transport.leaveRoom.mockReturnValueOnce(leaving.promise)

    const pendingLeave = session.leaveRoom()
    const blockedReady = session.readyUp()
    const blockedUpdate = session.updatePlayer({ name: 'Too Late' })
    const duplicateLeave = session.leaveRoom()
    await session.subscribeWaitingRoom()

    await expect(blockedReady).resolves.toEqual({ stale: true })
    await expect(blockedUpdate).resolves.toEqual({ stale: true })
    await duplicateLeave
    expect(transport.readyUp).not.toHaveBeenCalled()
    expect(transport.updatePlayer).not.toHaveBeenCalled()
    expect(transport.leaveRoom).toHaveBeenCalledTimes(1)
    expect(transport.leaveRoom).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'tok-secret',
    })
    expect(realtime.channels).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(session.waiting).toEqual(beforeLeave)
    expect(events).toEqual([])

    leaving.resolve({ ok: true, status: 200, data: null })
    await pendingLeave
  })

  it('keeps the action lifecycle closed after the room becomes active', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    required(required(realtime.channels[0], 'active lifecycle channel').update, 'active lifecycle UPDATE callback')({
      new: {
        status: 'active',
        players: waiting.players.map((player) => ({ ...player, ready: true })),
        seed: 77,
        options: waiting.options,
      },
    })
    events.length = 0
    const terminalState = {
      ...session.waiting,
      players: session.waiting.players.map((player) => ({ ...player })),
    }

    await expect(session.readyUp()).resolves.toEqual({ stale: true })
    await expect(session.updatePlayer({ name: 'Too Late' })).resolves.toEqual({ stale: true })
    await session.subscribeWaitingRoom()

    expect(transport.readyUp).not.toHaveBeenCalled()
    expect(transport.updatePlayer).not.toHaveBeenCalled()
    expect(realtime.channels).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(session.waiting).toEqual(terminalState)
    expect(events).toEqual([])
  })

  it('keeps the action lifecycle closed after the room is gone', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()

    required(required(realtime.channels[0], 'gone lifecycle channel').delete, 'gone lifecycle DELETE callback')()
    events.length = 0

    await expect(session.readyUp()).resolves.toEqual({ stale: true })
    await expect(session.updatePlayer({ name: 'Too Late' })).resolves.toEqual({ stale: true })
    await session.leaveRoom()
    await session.subscribeWaitingRoom()

    expect(transport.readyUp).not.toHaveBeenCalled()
    expect(transport.updatePlayer).not.toHaveBeenCalled()
    expect(transport.leaveRoom).not.toHaveBeenCalled()
    expect(realtime.channels).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(session.waiting).toMatchObject({
      roomId: '',
      playerId: '',
      token: '',
      players: [],
    })
    expect(events).toEqual([])
  })

  it('reopens the action lifecycle only for a complete replacement identity', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.leaveRoom()
    const incompleteRoomTwo = {
      ...cloneWaiting(),
      roomId: 'room-2',
      roomCode: 'WXYZ',
      playerId: 'p-9',
      token: '',
    }

    session.replaceWaiting(incompleteRoomTwo)
    await expect(session.readyUp()).resolves.toEqual({ stale: true })
    expect(transport.readyUp).not.toHaveBeenCalled()

    session.replaceWaiting({ ...incompleteRoomTwo, token: 'room-two-token' })
    await expect(session.readyUp()).resolves.toEqual({
      ok: true,
      status: 200,
      data: { players: [] },
    })
    expect(transport.readyUp).toHaveBeenCalledWith({
      roomId: 'room-2',
      playerId: 'p-9',
      token: 'room-two-token',
    })
  })

  it('emits ready once when Realtime becomes active before ready-up reports started', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const readyPlayers = waiting.players.map((player) => ({ ...player, ready: true }))
    const started = deferred<{
      ok: boolean
      status: number
      data: { players: NetworkPlayer[]; started: boolean }
    }>()
    transport.readyUp.mockReturnValueOnce(started.promise)

    const pendingReady = session.readyUp()
    required(required(realtime.channels[0], 'ready-up realtime channel').update, 'ready-up UPDATE callback')({
      new: { status: 'active', players: readyPlayers, seed: 77, options: waiting.options },
    })
    started.resolve({ ok: true, status: 200, data: { players: readyPlayers, started: true } })
    await pendingReady

    expect(events).toEqual([{
      type: 'ready',
      source: 'realtime',
      room: { players: readyPlayers, seed: 77, options: waiting.options },
    }])
  })

  it('emits ready once when ready-up reports started before Realtime becomes active', async () => {
    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    const readyPlayers = waiting.players.map((player) => ({ ...player, ready: true }))
    transport.readyUp.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { players: readyPlayers, started: true },
    })

    await session.readyUp()
    required(required(realtime.channels[0], 'ready-up realtime channel').update, 'ready-up UPDATE callback')({
      new: { status: 'active', players: readyPlayers, seed: 77, options: waiting.options },
    })

    expect(events).toEqual([{
      type: 'ready',
      source: 'direct',
      room: { players: readyPlayers, seed: waiting.seed, options: waiting.options },
    }])
  })

  it('owns exactly one replaceable browse poll and has idempotent lifecycle cleanup', async () => {
    const tick = vi.fn()
    session.startBrowsePoll(tick)
    session.startBrowsePoll(tick)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(tick).toHaveBeenCalledTimes(1)
    session.stopBrowsePoll()
    session.stopBrowsePoll()
    expect(vi.getTimerCount()).toBe(0)

    session.replaceWaiting(cloneWaiting())
    await session.subscribeWaitingRoom()
    session.cleanupWaitingChannel()
    session.cleanupWaitingChannel()
    expect(realtime.removeChannel).toHaveBeenCalledWith(realtime.channels[0])
    expect(vi.getTimerCount()).toBe(0)
  })
})
