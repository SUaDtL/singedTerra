import { describe, expect, it, vi } from 'vitest'
import type { GameState } from '@shared/types/GameState'
import { createHotSeatProgressionReporter } from './hotSeatProgression'

function state(phase: GameState['phase'], winner: string | null): GameState {
  return { phase, winner } as GameState
}

describe('createHotSeatProgressionReporter', () => {
  it('reports the injected match id once on the first terminal observation', () => {
    const report = vi.fn(async () => true)
    const reporter = createHotSeatProgressionReporter({
      mode: 'hotseat',
      e2eMode: null,
      accountTankId: 'p1',
      report,
      matchId: '00000000-0000-4000-8000-000000000071',
    })
    if (!reporter) throw new Error('Expected reporter')

    reporter.observe(state('PLAYER_TURN', null))
    reporter.observe(state('ROUND_OVER', null))
    reporter.observe(state('GAME_OVER', 'p1'))
    reporter.observe(state('GAME_OVER', 'p1'))

    expect(report).toHaveBeenCalledOnce()
    expect(report).toHaveBeenCalledWith({
      matchId: '00000000-0000-4000-8000-000000000071',
      won: true,
    })
  })

  it.each([
    ['another tank wins', 'p2'],
    ['the match draws', null],
  ])('records a non-win when %s', (_label, winner) => {
    const report = vi.fn(async () => true)
    const reporter = createHotSeatProgressionReporter({
      mode: 'hotseat',
      e2eMode: null,
      accountTankId: 'p1',
      report,
      matchId: '00000000-0000-4000-8000-000000000072',
    })
    reporter?.observe(state('GAME_OVER', winner))
    expect(report).toHaveBeenCalledWith({
      matchId: '00000000-0000-4000-8000-000000000072',
      won: false,
    })
  })

  it('creates a fresh id once per reporter instead of once per state frame', () => {
    const createMatchId = vi.fn(() => '00000000-0000-4000-8000-000000000073')
    const report = vi.fn(async () => true)
    const reporter = createHotSeatProgressionReporter({
      mode: 'hotseat',
      e2eMode: null,
      accountTankId: 'p1',
      report,
      createMatchId,
    })
    reporter?.observe(state('PLAYER_TURN', null))
    reporter?.observe(state('GAME_OVER', 'p1'))
    expect(createMatchId).toHaveBeenCalledOnce()
  })

  it.each([
    ['network mode', { mode: 'network' as const, e2eMode: null, accountTankId: 'p1' }],
    ['deterministic hot-seat fixture', { mode: 'hotseat' as const, e2eMode: 'hotseat', accountTankId: 'p1' }],
    ['victory fixture', { mode: 'hotseat' as const, e2eMode: 'victory', accountTankId: 'p1' }],
    ['missing account tank', { mode: 'hotseat' as const, e2eMode: null, accountTankId: null }],
  ])('omits reporting for %s', (_label, options) => {
    const report = vi.fn(async () => true)
    expect(createHotSeatProgressionReporter({ ...options, report })).toBeNull()
    expect(report).not.toHaveBeenCalled()
  })
})
