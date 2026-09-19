import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TankLoadout } from '@shared/types/TankLoadout'
import type {
  LobbySession,
  LobbySessionStaleOutcome,
} from '../client/LobbySession'
import type { LobbyTransport, NetworkPlayer } from '../client/LobbyTransport'
import { Lobby } from './Lobby'

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

interface LobbyInternals {
  session: LobbySession
  transport: LobbyTransport
  handleReadyUp(): Promise<void>
  updateMe(fields: { name?: string; color?: string; loadout?: TankLoadout }): Promise<void>
  handleLeaveRoom(): Promise<void>
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

function seedWaitingRoom(lobby: Lobby): void {
  Object.assign(internals(lobby), {
    waitingRoomId: 'room-1',
    waitingRoomCode: 'ABCD',
    waitingPlayerId: 'p-1',
    waitingToken: 't1',
    waitingPlayers: [
      { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false },
      { id: 'p-2', name: 'Bob', color: '#4d8ce8', ready: false },
    ],
    onlineSubView: 'waiting',
  })
}

describe('Lobby stale session actions', () => {
  let lobby: Lobby

  beforeEach(() => {
    lobby = new Lobby(document.createElement('div'), vi.fn())
    seedWaitingRoom(lobby)
  })

  it('ignores a stale ready-up outcome without changing or rendering the replacement room', async () => {
    const ready = deferred<LobbySessionStaleOutcome>()
    vi.spyOn(internals(lobby).session, 'readyUp').mockReturnValueOnce(ready.promise)
    const render = vi.spyOn(internals(lobby), 'render')

    const pendingReady = internals(lobby).handleReadyUp()
    expect(internals(lobby).onlineBusy).toBe(true)

    Object.assign(internals(lobby), {
      waitingRoomId: 'room-2',
      waitingRoomCode: 'WXYZ',
      waitingPlayerId: 'p-9',
      waitingToken: 't2',
      onlineBusy: true,
      onlineError: 'Room B status',
    })
    render.mockClear()
    ready.resolve({ stale: true })
    await pendingReady

    expect(internals(lobby).onlineBusy).toBe(true)
    expect(internals(lobby).onlineError).toBe('Room B status')
    expect(internals(lobby).waitingRoomId).toBe('room-2')
    expect(render).not.toHaveBeenCalled()
  })

  it('ignores a stale Garage loadout outcome without changing or rendering the replacement room', async () => {
    const updating = deferred<LobbySessionStaleOutcome>()
    const updatePlayer = vi.spyOn(internals(lobby).session, 'updatePlayer')
      .mockReturnValueOnce(updating.promise)
    const render = vi.spyOn(internals(lobby), 'render')
    const loadout: TankLoadout = {
      treads: 'ranger',
      hull: 'foundry',
      turret: 'bulwark',
      barrel: 'jackal',
    }

    const pendingUpdate = internals(lobby).updateMe({ loadout })
    expect(updatePlayer).toHaveBeenCalledWith({ loadout })
    expect(internals(lobby).onlineBusy).toBe(true)

    Object.assign(internals(lobby), {
      waitingRoomId: 'room-2',
      waitingRoomCode: 'WXYZ',
      waitingPlayerId: 'p-9',
      waitingToken: 't2',
      onlineBusy: true,
      onlineError: 'Room B status',
    })
    render.mockClear()
    updating.resolve({ stale: true })
    await pendingUpdate

    expect(internals(lobby).onlineBusy).toBe(true)
    expect(internals(lobby).onlineError).toBe('Room B status')
    expect(internals(lobby).waitingRoomId).toBe('room-2')
    expect(render).not.toHaveBeenCalled()
  })

  it('clears busy state when explicit leave completes into the create view', async () => {
    vi.spyOn(internals(lobby).session, 'leaveRoom').mockResolvedValueOnce()
    Object.assign(internals(lobby), {
      onlineBusy: true,
      onlineError: 'Ready request pending',
      onlineSubView: 'waiting',
    })

    await internals(lobby).handleLeaveRoom()

    expect(internals(lobby).onlineSubView).toBe('create')
    expect(internals(lobby).onlineBusy).toBe(false)
    expect(internals(lobby).onlineError).toBe('')
  })

  it('disables waiting actions and ignores duplicate leave while the leave request is pending', async () => {
    const leaving = deferred<{ ok: boolean; status: number; data: null }>()
    const leaveRoom = vi.spyOn(internals(lobby).transport, 'leaveRoom')
      .mockReturnValueOnce(leaving.promise)
    const readyUp = vi.spyOn(internals(lobby).transport, 'readyUp')
    const updatePlayer = vi.spyOn(internals(lobby).transport, 'updatePlayer')

    const pendingLeave = internals(lobby).handleLeaveRoom()

    expect(internals(lobby).onlineSubView).toBe('waiting')
    expect(internals(lobby).onlineBusy).toBe(true)

    await internals(lobby).handleReadyUp()
    await internals(lobby).updateMe({ name: 'Too Late' })
    await internals(lobby).handleLeaveRoom()

    expect(leaveRoom).toHaveBeenCalledTimes(1)
    expect(readyUp).not.toHaveBeenCalled()
    expect(updatePlayer).not.toHaveBeenCalled()
    expect(internals(lobby).onlineSubView).toBe('waiting')
    expect(internals(lobby).onlineBusy).toBe(true)

    leaving.resolve({ ok: true, status: 200, data: null })
    await pendingLeave

    expect(internals(lobby).onlineSubView).toBe('create')
    expect(internals(lobby).onlineBusy).toBe(false)
  })
})
