import { describe, expect, it, vi } from 'vitest'
import { LobbyRoomController } from './LobbyRoomController'
import type { LobbyWaitingState } from './LobbySession'

const seatCredential = ['seat', 'test-value'].join(':')

const emptyWaiting: LobbyWaitingState = {
  roomId: '', roomCode: '', playerId: '', token: '', players: [], seed: 0,
  options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 }, thisPlayerReady: false,
}

function setup() {
  let waiting = emptyWaiting
  let subscriptions = 0
  const session = {
    get waiting() { return waiting },
    replaceWaiting: vi.fn((next: LobbyWaitingState) => { waiting = next }),
    subscribeWaitingRoom: vi.fn(async () => { subscriptions += 1 }),
    stopBrowsePoll: vi.fn(),
    leaveRoom: vi.fn(async () => { subscriptions = 0 }),
  }
  const transport = { createRoom: vi.fn(), joinRoom: vi.fn(), fetchRoom: vi.fn(), leaveRoom: vi.fn() }
  const persistence = {
    writeSeatToken: vi.fn(), writeSession: vi.fn(), clearSession: vi.fn(),
    readSession: vi.fn(() => null), readSeatToken: vi.fn(() => undefined),
  }
  const intents: string[] = []
  const changed = vi.fn()
  const controller = new LobbyRoomController(
    transport as never, session as never, changed, (intent) => intents.push(intent), () => undefined, persistence,
  )
  return { controller, transport, session, persistence, intents, changed, subscriptions: () => subscriptions }
}

describe('LobbyRoomController', () => {
  it('clears an abandoned resume candidate and explains that the player should start a new game — RL-07', async () => {
    const test = setup()
    test.persistence.readSession.mockReturnValue({ roomId: 'ended-room', roomCode: 'ROOM', playerId: 'p1' } as never)
    test.transport.fetchRoom.mockResolvedValue({
      id: 'ended-room', code: 'ROOM', status: 'finished', abandoned_at: '2026-09-12T16:00:00Z',
      players: [{ id: 'p1' }], options: { rulesetVersion: 4, commandProtocolVersion: 2, roomLifecycleVersion: 1 },
    })
    await test.controller.checkRejoinCandidate()
    expect(test.controller.projection.rejoinCandidate).toBeNull()
    expect(test.persistence.clearSession).toHaveBeenCalledOnce()
    expect(test.controller.projection.error).toBe('That game ended after everyone left. Start a new game.')
    expect(test.changed).toHaveBeenCalledOnce()
  })

  it('reads create fallback presentation and seed after an authoritative v2 response resolves', async () => {
    const test = setup()
    let resolve!: (value: unknown) => void
    test.transport.createRoom.mockReturnValue(new Promise((done) => { resolve = done }))
    let fallback = {
      players: [{ id: '', name: 'Alice', color: '#e84d4d', ready: false }],
      seed: 17,
      options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
    }
    const pending = test.controller.create({ playerName: 'Alice' } as never, () => fallback)
    fallback = {
      players: [{ id: '', name: 'Alice', color: '#4d8ce8', ready: false }],
      seed: 42,
      options: { maxPlayers: 3, maxWind: 6, gravity: 0.2 },
    }
    resolve({ ok: true, data: {
      roomId: 'room-1', code: 'ABCD', playerId: 'p1', token: seatCredential,
      options: { maxPlayers: 3, maxWind: 6, gravity: 0.2, rulesetVersion: 4, commandProtocolVersion: 2 },
    } })
    await pending
    expect(test.controller.projection.waiting).toMatchObject({
      seed: 42,
      options: { maxPlayers: 3, maxWind: 6, gravity: 0.2, commandProtocolVersion: 2 },
      players: [{ id: 'p1', color: '#4d8ce8' }],
    })
  })

  it('adopts one created room, persists its identity, and starts one waiting subscription', async () => {
    const test = setup()
    test.transport.createRoom.mockResolvedValue({ ok: true, data: {
      roomId: 'room-1', code: 'ABCD', playerId: 'p1', token: seatCredential,
      options: { maxPlayers: 3, maxWind: 7, gravity: 0.2, rulesetVersion: 4, commandProtocolVersion: 2 },
      players: [{ id: 'p1', name: 'Alice', color: '#e84d4d', ready: false }],
    } })
    await test.controller.create({ playerName: 'Alice' } as never, () => ({
      players: [], seed: 0, options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
    }))
    expect(test.session.replaceWaiting).toHaveBeenCalledTimes(1)
    expect(test.persistence.writeSeatToken).toHaveBeenCalledWith('p1', seatCredential)
    expect(test.persistence.writeSession).toHaveBeenCalledWith({ roomId: 'room-1', roomCode: 'ABCD', playerId: 'p1' })
    expect(test.intents).toEqual(['waiting'])
    expect(test.session.subscribeWaitingRoom).toHaveBeenCalledTimes(1)
    expect(test.subscriptions()).toBe(1)
    expect(test.controller.projection).toMatchObject({ busy: false, error: '', leaving: false })
  })

  it('joins through the current ruleset, stops browse, and adopts exactly once', async () => {
    const test = setup()
    test.transport.joinRoom.mockResolvedValue({ ok: true, data: {
      roomId: 'room-2', playerId: 'p2', token: seatCredential, seed: 42,
      options: { maxPlayers: 2, maxWind: 6, gravity: 0.15, rulesetVersion: 4, commandProtocolVersion: 2 }, players: [],
    } })
    await test.controller.join({ code: 'WXYZ' } as never, 'WXYZ', emptyWaiting.options)
    expect(test.session.stopBrowsePoll).toHaveBeenCalledTimes(1)
    expect(test.session.replaceWaiting).toHaveBeenCalledTimes(1)
    expect(test.session.subscribeWaitingRoom).toHaveBeenCalledTimes(1)
    expect(test.controller.projection.waiting).toMatchObject({ roomId: 'room-2', roomCode: 'WXYZ', seed: 42 })
  })

  it('tears down the owned session before clearing persistence and exposes zero subscriptions', async () => {
    const test = setup()
    test.transport.createRoom.mockResolvedValue({ ok: true, data: {
      roomId: 'room-1', code: 'ABCD', playerId: 'p1', token: seatCredential,
      options: { maxPlayers: 2, maxWind: 10, gravity: 0.15, rulesetVersion: 4, commandProtocolVersion: 2 }, players: [],
    } })
    await test.controller.create({ playerName: 'Alice' } as never, () => ({ players: [], seed: 0, options: emptyWaiting.options }))
    await test.controller.leave()
    expect(test.session.leaveRoom).toHaveBeenCalledTimes(1)
    expect(test.persistence.clearSession).toHaveBeenCalledTimes(1)
    expect(test.subscriptions()).toBe(0)
    expect(test.intents).toEqual(['waiting', 'create'])
  })
})
