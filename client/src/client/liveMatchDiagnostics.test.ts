import { describe, expect, it } from 'vitest'
import { projectLiveMatchSnapshot } from './liveMatchDiagnostics'

describe('projectLiveMatchSnapshot', () => {
  it('projects a bounded verified network turn without identity or session material', () => {
    const source = {
      mode: 'network',
      execution: 'verified',
      phase: 'PLAYER_TURN',
      round: 2,
      totalRounds: 3,
      turn: 7,
      activeSeatOrdinal: 2,
      activeSeatAlive: true,
      activeSeatHealth: 63,
      input: 'frozen',
      transport: 'reconnecting',
      roomId: 'room-private-123',
      roomCode: 'ABCD',
      playerId: 'player-private-456',
      seed: 42,
      transcript: [{ angle: 45, power: 70 }],
    } as const
    const snapshot = projectLiveMatchSnapshot(source)
    if (!snapshot) throw new Error('expected valid public snapshot')

    expect(snapshot).toEqual({
      schemaVersion: 1,
      mode: 'network',
      execution: 'verified',
      phase: 'PLAYER_TURN',
      round: 2,
      totalRounds: 3,
      turn: 7,
      activeSeat: { ordinal: 2, alive: true, health: 63 },
      input: 'frozen',
      transport: 'reconnecting',
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.activeSeat)).toBe(true)
    expect(JSON.stringify(snapshot)).not.toContain('private')
    expect(JSON.stringify(snapshot)).not.toContain('ABCD')
    expect(JSON.stringify(snapshot)).not.toContain('42')
  })

  it('fails closed for invalid public state instead of copying a partial session', () => {
    expect(projectLiveMatchSnapshot({
      mode: 'hotseat',
      execution: 'casual',
      phase: 'PLAYER_TURN',
      round: 0,
      totalRounds: 1,
      turn: 0,
      activeSeatOrdinal: 1,
      activeSeatAlive: true,
      activeSeatHealth: 100,
      input: 'ready',
      transport: 'not-applicable',
    })).toBeUndefined()
  })
})
