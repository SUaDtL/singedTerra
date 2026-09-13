import { describe, expect, it } from 'vitest'
import type { GamePhase, TankState } from '@shared/types/GameState'
import type { PlayerAction } from '@shared/types/PlayerAction'
import {
  createPracticeFieldOrderEvidence,
  observePracticeFieldOrderAction,
  practiceFieldOrderObservationFromEvidence,
  settlePracticeFieldOrderEvidence,
  snapshotPracticeFieldOrder,
  type PracticeFieldOrderSnapshot,
} from './practiceFieldOrder'

const tank = (patch: Partial<Pick<TankState, 'id' | 'ai' | 'x' | 'totalDamage'>>): Pick<TankState, 'id' | 'ai' | 'x' | 'totalDamage'> => ({
  id: 'p1', ai: null, x: 120, totalDamage: 0, ...patch,
})

const snapshot = (
  phase: GamePhase,
  human: Partial<Pick<TankState, 'x' | 'totalDamage'>> = {},
  patch: Partial<PracticeFieldOrderSnapshot> = {},
): PracticeFieldOrderSnapshot => ({
  phase,
  activePlayerId: 'p1',
  winner: null,
  tanks: [tank(human), tank({ id: 'p2', ai: 'medium', x: 680 })],
  ...patch,
})

const action = (value: PlayerAction): PlayerAction => value

describe('practice Field Order evidence', () => {
  it('captures the accepted-action boundary before an in-place engine mutation', () => {
    const opening = snapshot('PLAYER_TURN')
    const before = snapshotPracticeFieldOrder(opening)
    const mutableOpening = opening as unknown as {
      phase: GamePhase
      tanks: Array<{ x: number; totalDamage: number }>
    }

    mutableOpening.phase = 'FIRING'
    mutableOpening.tanks[0]!.x = 136
    mutableOpening.tanks[0]!.totalDamage = 9

    expect(before.phase).toBe('PLAYER_TURN')
    expect(before.tanks[0]).toMatchObject({ id: 'p1', x: 120, totalDamage: 0 })
  })

  it('uses net displacement at an accepted first human fire and the settled human totalDamage delta', () => {
    const initial = snapshot('PLAYER_TURN')
    let evidence = createPracticeFieldOrderEvidence(initial)
    expect(evidence).not.toBeNull()

    evidence = observePracticeFieldOrderAction(evidence!, action({ type: 'move', delta: 8 }), initial, snapshot('PLAYER_TURN', { x: 128 }))
    evidence = observePracticeFieldOrderAction(evidence, action({ type: 'move', delta: 8 }), snapshot('PLAYER_TURN', { x: 128 }), snapshot('PLAYER_TURN', { x: 136 }))
    evidence = observePracticeFieldOrderAction(evidence, action({ type: 'move', delta: -8 }), snapshot('PLAYER_TURN', { x: 136 }), snapshot('PLAYER_TURN', { x: 128 }))
    evidence = observePracticeFieldOrderAction(evidence, action({ type: 'fire' }), snapshot('PLAYER_TURN', { x: 128, totalDamage: 0 }), snapshot('FIRING', { x: 128, totalDamage: 0 }))

    evidence = settlePracticeFieldOrderEvidence(evidence, snapshot('PLAYER_TURN', { x: 128, totalDamage: 21 }, { activePlayerId: 'p2' }))
    expect(practiceFieldOrderObservationFromEvidence(evidence, snapshot('PLAYER_TURN', { x: 128, totalDamage: 21 }, { activePlayerId: 'p2' })))
      .toMatchObject({ humanSalvos: 1, settledHumanDamage: [21], openingPositionDelta: 8, activeSeat: 'cpu' })
  })

  it('does not accept CPU, rejected, or post-settlement hazard facts as human-shot progress', () => {
    const initial = snapshot('PLAYER_TURN')
    let evidence = createPracticeFieldOrderEvidence(initial)!
    const cpuTurn = snapshot('PLAYER_TURN', {}, { activePlayerId: 'p2' })

    evidence = observePracticeFieldOrderAction(evidence, action({ type: 'move', delta: -8 }), cpuTurn, snapshot('PLAYER_TURN', {}, { activePlayerId: 'p2' }))
    evidence = observePracticeFieldOrderAction(evidence, action({ type: 'fire' }), initial, initial)
    evidence = settlePracticeFieldOrderEvidence(evidence, snapshot('PLAYER_TURN', { totalDamage: 0 }, { activePlayerId: 'p2' }))

    expect(practiceFieldOrderObservationFromEvidence(evidence, snapshot('PLAYER_TURN', { totalDamage: 0 }, { activePlayerId: 'p2' })))
      .toMatchObject({ humanSalvos: 0, settledHumanDamage: [], openingPositionDelta: 0, activeSeat: 'cpu' })
  })
})
