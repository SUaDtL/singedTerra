import { describe, expect, it } from 'vitest'
import {
  createFieldOrder,
  observeFieldOrder,
  type FieldOrderObservation,
} from './fieldOrder'

const observation = (patch: Partial<FieldOrderObservation> = {}): FieldOrderObservation => ({
  humanSalvos: 0,
  settledHumanDamage: [],
  phase: 'PLAYER_TURN',
  activeSeat: 'human',
  winner: null,
  ...patch,
})

describe('Field Orders', () => {
  it.each([
    [0, 'first-strike', 'First Strike', 'Damage the CPU within your first three salvos.'],
    [1, 'fire-for-effect', 'Fire for Effect', 'Damage the CPU on two separate human salvos.'],
    [2, 'hold-the-field', 'Hold the Field', 'Win the duel.'],
    [3, 'first-strike', 'First Strike', 'Damage the CPU within your first three salvos.'],
    [Number.MAX_SAFE_INTEGER, 'fire-for-effect', 'Fire for Effect', 'Damage the CPU on two separate human salvos.'],
  ] as const)('selects %s from a valid matchesPlayed count', (matchesPlayed, id, title, instruction) => {
    expect(createFieldOrder({ matchesPlayed })).toEqual({
      id,
      title,
      instruction,
      progress: id === 'first-strike'
        ? { salvosRemaining: 3 }
        : id === 'fire-for-effect'
          ? { damagedSalvos: 0, requiredDamagedSalvos: 2 }
          : { awaitingWinner: true },
      result: null,
    })
  })

  it.each([
    null,
    undefined,
    {},
    { matchesPlayed: -1 },
    { matchesPlayed: 1.5 },
    { matchesPlayed: Number.MAX_SAFE_INTEGER + 1 },
    { matchesPlayed: '1' },
  ])('does not make an order claim from a malformed summary: %j', (summary) => {
    expect(createFieldOrder(summary)).toBeNull()
  })

  it('selects the same public order again when the same deployment resumes', () => {
    const started = createFieldOrder({ matchesPlayed: 1 })
    const resumed = createFieldOrder({ matchesPlayed: 1 })

    expect(resumed).toEqual(started)
    expect(resumed).not.toBe(started)
  })

  it('exposes only receipt-safe public state', () => {
    const order = createFieldOrder({ matchesPlayed: 0 })

    expect(Object.keys(order ?? {})).toEqual(['id', 'title', 'instruction', 'progress', 'result'])
    expect(JSON.stringify(order)).not.toMatch(/session|descriptor|transcript|seed|account|reward|xp/i)
  })

  it('keeps First Strike active while the third salvo settles, then credits its damage', () => {
    const order = createFieldOrder({ matchesPlayed: 0 })!
    const firing = observeFieldOrder(order, observation({
      humanSalvos: 3,
      phase: 'FIRING',
    }))
    expect(firing).toMatchObject({ progress: { salvosRemaining: 0 }, result: null })

    expect(observeFieldOrder(firing, observation({
      humanSalvos: 3,
      settledHumanDamage: [0, 0, 17],
      phase: 'RESOLVING',
    }))).toMatchObject({ result: { status: 'achieved', achievedOnSalvo: 3 } })
  })

  it.each([
    ['CPU turn after a clean third salvo', observation({ humanSalvos: 3, activeSeat: 'cpu' })],
    ['a terminal draw before the CPU response', observation({ humanSalvos: 3, phase: 'GAME_OVER' })],
    ['a later fourth-salvo hit', observation({
      humanSalvos: 4,
      settledHumanDamage: [0, 0, 0, 19],
      phase: 'GAME_OVER',
      activeSeat: 'cpu',
    })],
  ] as const)('misses First Strike on %s', (_label, firstStrikeObservation) => {
    expect(observeFieldOrder(createFieldOrder({ matchesPlayed: 0 })!, firstStrikeObservation))
      .toMatchObject({ result: { status: 'missed' } })
  })

  it('counts equal damage values on separate settled human salvos for Fire for Effect', () => {
    const order = createFieldOrder({ matchesPlayed: 1 })!
    const active = observeFieldOrder(order, observation({ settledHumanDamage: [14] }))
    expect(active).toMatchObject({ progress: { damagedSalvos: 1, requiredDamagedSalvos: 2 }, result: null })

    expect(observeFieldOrder(active, observation({ settledHumanDamage: [14, 14] })))
      .toMatchObject({ result: { status: 'achieved', damagedSalvos: 2 } })
  })

  it('does not credit the same Fire for Effect damage receipt twice', () => {
    const order = createFieldOrder({ matchesPlayed: 1 })!
    const once = observeFieldOrder(order, observation({ settledHumanDamage: [22] }))
    const repeated = observeFieldOrder(once, observation({ settledHumanDamage: [22] }))

    expect(repeated).toEqual(once)
    expect(repeated).not.toBe(once)
  })

  it('misses Fire for Effect only after terminal winner facts arrive without two damaged salvos', () => {
    const order = createFieldOrder({ matchesPlayed: 1 })!
    const active = observeFieldOrder(order, observation({
      settledHumanDamage: [8],
      winner: 'human',
    }))
    expect(active.result).toBeNull()

    expect(observeFieldOrder(active, observation({
      settledHumanDamage: [8],
      phase: 'GAME_OVER',
      winner: 'human',
    }))).toMatchObject({ result: { status: 'missed', damagedSalvos: 1 } })
  })

  it.each([
    ['human', 'achieved'],
    ['cpu', 'missed'],
    [null, 'missed'],
  ] as const)('resolves Hold the Field from terminal winner facts: %s', (winner, status) => {
    expect(observeFieldOrder(createFieldOrder({ matchesPlayed: 2 })!, observation({
      phase: 'GAME_OVER',
      winner,
    }))).toMatchObject({ result: { status } })
  })

  it('keeps terminal field-order results idempotent under repeat receipts', () => {
    const achieved = observeFieldOrder(createFieldOrder({ matchesPlayed: 0 })!, observation({
      humanSalvos: 1,
      settledHumanDamage: [40],
    }))
    const repeated = observeFieldOrder(achieved, observation({
      humanSalvos: 3,
      phase: 'GAME_OVER',
      activeSeat: 'cpu',
      winner: 'cpu',
    }))

    expect(repeated).toBe(achieved)
  })
})
