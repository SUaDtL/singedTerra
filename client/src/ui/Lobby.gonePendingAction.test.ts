import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LobbySession } from '../client/LobbySession'
import type { LobbyTransport, NetworkPlayer } from '../client/LobbyTransport'
import { Lobby } from './Lobby'

type CapturedChannel = {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  update?: (payload: { new: Record<string, unknown> }) => void
  delete?: () => void
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`)
  return value
}

const realtime = vi.hoisted(() => {
  const channels: CapturedChannel[] = []
  const removeChannel = vi.fn()
  const channel = vi.fn(() => {
    const captured = {} as CapturedChannel
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
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: realtime.channel,
    removeChannel: realtime.removeChannel,
  },
}))

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

interface LobbyInternals {
  session: LobbySession
  transport: LobbyTransport
  handleReadyUp(): Promise<void>
  updateMe(fields: { name?: string; color?: string }): Promise<void>
  subscribeWaitingRoom(): Promise<void>
  render(): void
  onlineBusy: boolean
  onlineError: string
  onlineSubView: string
  waitingRoomId: string
  waitingRoomCode: string
  waitingPlayerId: string
  waitingToken: string
  waitingPlayers: NetworkPlayer[]
}

function internals(lobby: Lobby): LobbyInternals {
  return lobby as unknown as LobbyInternals
}

const players: NetworkPlayer[] = [
  { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false },
  { id: 'p-2', name: 'Bob', color: '#4d8ce8', ready: false },
]

describe('Lobby pending action when the current room is gone', () => {
  let lobby: Lobby

  beforeEach(() => {
    vi.useFakeTimers()
    realtime.channels.length = 0
    realtime.channel.mockClear()
    realtime.removeChannel.mockClear()
    lobby = new Lobby(document.createElement('div'), vi.fn())
    Object.assign(internals(lobby), {
      waitingRoomId: 'room-1',
      waitingRoomCode: 'ABCD',
      waitingPlayerId: 'p-1',
      waitingToken: 'room-a-token',
      waitingPlayers: players.map((player) => ({ ...player })),
      onlineSubView: 'waiting',
    })
  })

  afterEach(() => {
    lobby.hide()
    vi.useRealTimers()
  })

  it('clears ready-up busy state immediately on DELETE and ignores its late rejection', async () => {
    const ready = deferred<never>()
    const readyUp = vi.spyOn(internals(lobby).transport, 'readyUp')
      .mockReturnValueOnce(ready.promise)
    await internals(lobby).subscribeWaitingRoom()
    const render = vi.spyOn(internals(lobby), 'render')

    const pendingReady = internals(lobby).handleReadyUp()
    expect(internals(lobby).onlineBusy).toBe(true)
    expect(readyUp).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'room-a-token',
    })

    required(required(realtime.channels[0], 'waiting realtime channel').delete, 'waiting DELETE callback')()

    expect(internals(lobby).onlineSubView).toBe('create')
    expect(internals(lobby).onlineError).toBe('This room is no longer available.')
    expect(internals(lobby).onlineBusy).toBe(false)
    const rendersAfterGone = render.mock.calls.length

    ready.reject(new Error('room A offline'))
    await pendingReady

    expect(internals(lobby).onlineSubView).toBe('create')
    expect(internals(lobby).onlineError).toBe('This room is no longer available.')
    expect(internals(lobby).onlineBusy).toBe(false)
    expect(render).toHaveBeenCalledTimes(rendersAfterGone)
  })

  it('clears update busy state immediately on roster removal and ignores its late rejection', async () => {
    const updating = deferred<never>()
    const updatePlayer = vi.spyOn(internals(lobby).transport, 'updatePlayer')
      .mockReturnValueOnce(updating.promise)
    await internals(lobby).subscribeWaitingRoom()
    const render = vi.spyOn(internals(lobby), 'render')

    const pendingUpdate = internals(lobby).updateMe({ name: 'Room A Alice' })
    expect(internals(lobby).onlineBusy).toBe(true)
    expect(updatePlayer).toHaveBeenCalledWith({
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'room-a-token',
      fields: { name: 'Room A Alice' },
    })

    required(required(realtime.channels[0], 'waiting realtime channel').update, 'waiting UPDATE callback')({
      new: { status: 'waiting', players: [{ ...players[1] }] },
    })

    expect(internals(lobby).onlineSubView).toBe('create')
    expect(internals(lobby).onlineError).toBe('You are no longer in this room.')
    expect(internals(lobby).onlineBusy).toBe(false)
    const rendersAfterGone = render.mock.calls.length

    updating.reject(new Error('room A offline'))
    await pendingUpdate

    expect(internals(lobby).onlineSubView).toBe('create')
    expect(internals(lobby).onlineError).toBe('You are no longer in this room.')
    expect(internals(lobby).onlineBusy).toBe(false)
    expect(render).toHaveBeenCalledTimes(rendersAfterGone)
  })

  it('preserves replacement-room state when ready-up rejects late', async () => {
    const ready = deferred<never>()
    vi.spyOn(internals(lobby).transport, 'readyUp').mockReturnValueOnce(ready.promise)
    const render = vi.spyOn(internals(lobby), 'render')

    const pendingReady = internals(lobby).handleReadyUp()
    Object.assign(internals(lobby), {
      waitingRoomId: 'room-2',
      waitingRoomCode: 'WXYZ',
      waitingPlayerId: 'p-9',
      waitingToken: 'room-b-token',
      onlineBusy: true,
      onlineError: 'Room B status',
    })
    render.mockClear()

    ready.reject(new Error('room A offline'))
    await pendingReady

    expect(internals(lobby).waitingRoomId).toBe('room-2')
    expect(internals(lobby).onlineBusy).toBe(true)
    expect(internals(lobby).onlineError).toBe('Room B status')
    expect(render).not.toHaveBeenCalled()
  })

  it('preserves replacement-room state when player update rejects late', async () => {
    const updating = deferred<never>()
    vi.spyOn(internals(lobby).transport, 'updatePlayer').mockReturnValueOnce(updating.promise)
    const render = vi.spyOn(internals(lobby), 'render')

    const pendingUpdate = internals(lobby).updateMe({ name: 'Room A Alice' })
    Object.assign(internals(lobby), {
      waitingRoomId: 'room-2',
      waitingRoomCode: 'WXYZ',
      waitingPlayerId: 'p-9',
      waitingToken: 'room-b-token',
      onlineBusy: true,
      onlineError: 'Room B status',
    })
    render.mockClear()

    updating.reject(new Error('room A offline'))
    await pendingUpdate

    expect(internals(lobby).waitingRoomId).toBe('room-2')
    expect(internals(lobby).onlineBusy).toBe(true)
    expect(internals(lobby).onlineError).toBe('Room B status')
    expect(render).not.toHaveBeenCalled()
  })
})
