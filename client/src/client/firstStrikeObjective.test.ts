import { describe, expect, it } from 'vitest'
import {
  createFirstStrikeObjective,
  observeFirstStrikeObjective,
  type FirstStrikeObservation,
} from './firstStrikeObjective'

const observation = (patch: Partial<FirstStrikeObservation> = {}): FirstStrikeObservation => ({
  humanSalvos: 0,
  humanDamageBySalvo: [],
  phase: 'PLAYER_TURN',
  activeSeat: 'human',
  ...patch,
})

describe('First Strike objective', () => {
  it('stays active while the third salvo is firing or resolving, then succeeds when that salvo damages the CPU', () => {
    let objective = createFirstStrikeObjective()

    objective = observeFirstStrikeObjective(objective, observation({
      humanSalvos: 3, phase: 'FIRING', activeSeat: 'human',
    }))
    expect(objective).toEqual({ status: 'active', salvosRemaining: 0 })

    objective = observeFirstStrikeObjective(objective, observation({
      humanSalvos: 3, phase: 'RESOLVING', activeSeat: 'human', humanDamageBySalvo: [0, 0, 17],
    }))
    expect(objective).toEqual({ status: 'achieved', achievedOnSalvo: 3 })
  })

  it('marks a clean third-salvo miss as soon as its resolution reaches the CPU turn', () => {
    let objective = createFirstStrikeObjective()

    objective = observeFirstStrikeObjective(objective, observation({
      humanSalvos: 3, phase: 'FIRING', activeSeat: 'human',
    }))
    expect(objective.status).toBe('active')

    objective = observeFirstStrikeObjective(objective, observation({
      humanSalvos: 3, phase: 'PLAYER_TURN', activeSeat: 'cpu',
    }))
    expect(objective).toEqual({ status: 'missed' })

    expect(observeFirstStrikeObjective(objective, observation({
      humanSalvos: 3, phase: 'PLAYER_TURN', activeSeat: 'human',
    }))).toBe(objective)
  })

  it('gives damage priority over a terminal result and never changes a terminal result afterward', () => {
    const achieved = observeFirstStrikeObjective(createFirstStrikeObjective(), observation({
      humanSalvos: 3, humanDamageBySalvo: [0, 0, 100], phase: 'GAME_OVER', activeSeat: 'cpu',
    }))
    expect(achieved).toEqual({ status: 'achieved', achievedOnSalvo: 3 })

    expect(observeFirstStrikeObjective(achieved, observation({
      humanSalvos: 3, humanDamageBySalvo: [], phase: 'GAME_OVER', activeSeat: 'cpu',
    }))).toBe(achieved)
  })

  it('derives compact remaining-salvo progress without treating a resumed transcript as a new shot', () => {
    const active = observeFirstStrikeObjective(createFirstStrikeObjective(), observation({
      humanSalvos: 2, phase: 'PLAYER_TURN', activeSeat: 'human',
    }))
    expect(active).toEqual({ status: 'active', salvosRemaining: 1 })
  })

  it('fails a terminal no-damage result even when the CPU never receives a response turn', () => {
    expect(observeFirstStrikeObjective(createFirstStrikeObjective(), observation({
      humanSalvos: 3, phase: 'GAME_OVER', activeSeat: 'cpu',
    }))).toEqual({ status: 'missed' })
  })

  it('does not backdate a fourth-salvo hit into a First Strike success after a reload', () => {
    expect(observeFirstStrikeObjective(createFirstStrikeObjective(), observation({
      humanSalvos: 4, humanDamageBySalvo: [0, 0, 0, 22], phase: 'GAME_OVER', activeSeat: 'cpu',
    }))).toEqual({ status: 'missed' })
  })

  it('does not credit CPU-side damage while a first or second response is in flight', () => {
    expect(observeFirstStrikeObjective(createFirstStrikeObjective(), observation({
      humanSalvos: 2, humanDamageBySalvo: [0, 0], phase: 'FIRING', activeSeat: 'cpu',
    }))).toEqual({ status: 'active', salvosRemaining: 1 })
  })
})
