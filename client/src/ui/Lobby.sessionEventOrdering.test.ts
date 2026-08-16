import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LobbySessionEvent } from '../client/LobbySession'
import type { NetworkPlayer, RoomOptions } from '../client/LobbyTransport'
import { Lobby } from './Lobby'

interface LobbyInternals {
  handleSessionEvent(event: LobbySessionEvent): void
  onlineBusy: boolean
  waitingRoomId: string
  waitingRoomCode: string
  waitingPlayerId: string
  waitingToken: string
}

const readyRoom: Extract<LobbySessionEvent, { type: 'ready' }>['room'] = {
  players: [
    { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: true },
    { id: 'p-2', name: 'Bob', color: '#4d8ce8', ready: true },
  ] satisfies NetworkPlayer[],
  seed: 42,
  options: { maxPlayers: 2, maxWind: 10, gravity: 0.15, rulesetVersion: 4 } satisfies RoomOptions,
}

function internals(lobby: Lobby): LobbyInternals {
  return lobby as unknown as LobbyInternals
}

function seedReadyIdentity(lobby: Lobby): void {
  Object.assign(internals(lobby), {
    waitingRoomId: 'room-1',
    waitingRoomCode: 'ABCD',
    waitingPlayerId: 'p-1',
    waitingToken: 'tok-secret',
    onlineBusy: true,
  })
}

describe('Lobby session ready event ordering', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
  })

  it('clears direct ready-up busy state before handing off to onReady', () => {
    let busyAtReady: boolean | undefined
    const lobby = new Lobby(root, () => {
      busyAtReady = internals(lobby).onlineBusy
    })
    seedReadyIdentity(lobby)

    internals(lobby).handleSessionEvent({ type: 'ready', source: 'direct', room: readyRoom })

    expect(busyAtReady).toBe(false)
  })

  it('preserves Realtime busy state while handing off to onReady', () => {
    let busyAtReady: boolean | undefined
    const lobby = new Lobby(root, () => {
      busyAtReady = internals(lobby).onlineBusy
    })
    seedReadyIdentity(lobby)

    internals(lobby).handleSessionEvent({ type: 'ready', source: 'realtime', room: readyRoom })

    expect(busyAtReady).toBe(true)
  })
})
