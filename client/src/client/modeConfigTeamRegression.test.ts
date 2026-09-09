import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { LobbyRoomController, type LobbyRoomHandoff } from './LobbyRoomController'
import type { FetchedRoom } from './LobbyTransport'
import type { LobbyWaitingState } from './LobbySession'
import { Lobby, type LobbyConfig } from '../ui/Lobby'

const players = [
  { id: 'seat-1', name: 'Player 1', color: '#e84d4d', ready: true, team: 2 as const },
  { id: 'seat-2', name: 'Player 2', color: '#4d8ce8', ready: true, team: 1 as const },
  { id: 'seat-3', name: 'Player 3', color: '#4de87a', ready: true, team: 2 as const },
  { id: 'seat-4', name: 'Player 4', color: '#e8c84d', ready: true, team: 1 as const },
]

const options = {
  maxPlayers: 4, maxWind: 7, gravity: 0.2, rounds: 3, interestRate: 0.25,
  suddenDeathTurn: 12, armsLevel: 2, teamMode: true, rulesetVersion: 4 as const,
}

function expectTeams(config: LobbyConfig | LobbyRoomHandoff | undefined): void {
  expect(config?.players).toHaveLength(players.length)
  players.forEach(({ id, name, color, team }, index) => {
    expect(config?.players[index]).toEqual(expect.objectContaining({ id, name, color, team }))
  })
}

interface ReadyInternals {
  handleReadyUp(): Promise<void>
  cleanupWaitingChannel(): void
  [key: string]: unknown
}

function internals(lobby: Lobby): ReadyInternals {
  return lobby as unknown as ReadyInternals
}

function startedResponse(): Mock {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ started: true, players }),
  })
}

describe('mode configuration team regressions', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it('preserves asymmetric authoritative teams through the Lobby ready callback', async () => {
    vi.stubGlobal('fetch', startedResponse())
    const root = document.createElement('div')
    document.body.appendChild(root)
    const onReady = vi.fn<(config: LobbyConfig) => void>()
    const lobby = new Lobby(root, onReady)
    Object.assign(internals(lobby), {
      waitingRoomId: 'room-1', waitingRoomCode: 'TEAM', waitingPlayerId: 'seat-1',
      waitingToken: 'seat-credential', waitingSeed: 109, waitingOptions: options,
      waitingPlayers: players,
    })

    try {
      await internals(lobby).handleReadyUp()
      expect(onReady).toHaveBeenCalledTimes(1)
      expectTeams(onReady.mock.calls[0]?.[0])
    } finally {
      internals(lobby).cleanupWaitingChannel()
    }
  })

  it('preserves asymmetric authoritative teams when rebuilding a rejoined room', async () => {
    const room: FetchedRoom = {
      id: 'room-1', code: 'TEAM', seed: 109, status: 'active',
      players, options,
    }
    const waiting: LobbyWaitingState = {
      roomId: '', roomCode: '', playerId: '', token: '', players: [], seed: 0,
      options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 }, thisPlayerReady: false,
    }
    let handoff: LobbyRoomHandoff | undefined
    const controller = new LobbyRoomController(
      { createRoom: vi.fn(), joinRoom: vi.fn(), fetchRoom: vi.fn(async () => room), leaveRoom: vi.fn() },
      {
        waiting, replaceWaiting: vi.fn(), subscribeWaitingRoom: vi.fn(),
        stopBrowsePoll: vi.fn(), leaveRoom: vi.fn(),
      },
      vi.fn(), vi.fn(), (next) => { handoff = next },
      {
        writeSeatToken: vi.fn(), writeSession: vi.fn(), clearSession: vi.fn(),
        readSession: vi.fn(), readSeatToken: vi.fn(() => 'seat-credential'),
      },
    )
    controller.setRejoinCandidate({
      descriptor: { roomId: 'room-1', roomCode: 'TEAM', playerId: 'seat-1' }, room,
    })

    await controller.rejoin()

    expectTeams(handoff)
  })
})
