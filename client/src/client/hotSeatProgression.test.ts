import { describe, expect, it, vi } from 'vitest'
import type { GameState } from '@shared/types/GameState'
import { createHotSeatProgressionReporter } from './hotSeatProgression'

function state(phase: GameState['phase'], winner: string | null): GameState {
  return { phase, winner } as GameState
}

describe('createHotSeatProgressionReporter', () => {
  it('reports the injected match id once on the first terminal observation', () => {
    const report = vi.fn(async () => null)
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

  it('emits one receipt only after the existing server-confirmed report succeeds', async () => {
    const summary = {
      progressionVersion: 1 as const,
      totalXp: 200,
      level: 1,
      levelXp: 200,
      nextLevelXp: 500,
    }
    let complete!: (recorded: typeof summary | null) => void
    const report = vi.fn(() => new Promise<typeof summary | null>((resolve) => { complete = resolve }))
    const onRecorded = vi.fn()
    const reporter = createHotSeatProgressionReporter({
      mode: 'hotseat',
      e2eMode: null,
      accountTankId: 'p1',
      report,
      onRecorded,
      matchId: '00000000-0000-4000-8000-000000000074',
    })
    if (!reporter) throw new Error('Expected reporter')

    reporter.observe(state('GAME_OVER', 'p1'))
    expect(onRecorded).not.toHaveBeenCalled()

    complete(summary)
    await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledWith(
      {
        matchId: '00000000-0000-4000-8000-000000000074',
        won: true,
      },
      summary,
    ))
    reporter.observe(state('GAME_OVER', 'p1'))
    expect(onRecorded).toHaveBeenCalledOnce()
  })

  it('emits one unrecorded result when the existing report declines the match', async () => {
    const onRecorded = vi.fn()
    const onUnrecorded = vi.fn()
    const reporter = createHotSeatProgressionReporter({
      mode: 'hotseat',
      e2eMode: null,
      accountTankId: 'p1',
      report: async () => null,
      onRecorded,
      onUnrecorded,
      matchId: '00000000-0000-4000-8000-000000000075',
    })
    if (!reporter) throw new Error('Expected reporter')

    reporter.observe(state('GAME_OVER', 'p1'))
    reporter.observe(state('GAME_OVER', 'p1'))

    await vi.waitFor(() => expect(onUnrecorded).toHaveBeenCalledWith({
      matchId: '00000000-0000-4000-8000-000000000075',
      won: true,
    }))
    expect(onUnrecorded).toHaveBeenCalledOnce()
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('keeps recorded and unrecorded terminal callbacks mutually exclusive', async () => {
    const summary = {
      progressionVersion: 1 as const,
      totalXp: 200,
      level: 1,
      levelXp: 200,
      nextLevelXp: 500,
    }
    const onRecorded = vi.fn()
    const onUnrecorded = vi.fn()
    const reporter = createHotSeatProgressionReporter({
      mode: 'hotseat',
      e2eMode: null,
      accountTankId: 'p1',
      report: async () => summary,
      onRecorded,
      onUnrecorded,
    })
    if (!reporter) throw new Error('Expected reporter')

    reporter.observe(state('GAME_OVER', 'p1'))
    reporter.observe(state('GAME_OVER', 'p1'))

    await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledOnce())
    expect(onUnrecorded).not.toHaveBeenCalled()
  })

  it.each([
    ['a declined record', () => Promise.resolve(null)],
    ['a failed record', () => Promise.reject(new Error('unavailable'))],
  ])('does not emit a receipt after %s', async (_label, reportMatch) => {
    const report = vi.fn(reportMatch)
    const onRecorded = vi.fn()
    const reporter = createHotSeatProgressionReporter({
      mode: 'hotseat',
      e2eMode: null,
      accountTankId: 'p1',
      report,
      onRecorded,
    })

    reporter?.observe(state('GAME_OVER', 'p1'))
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())
    await Promise.resolve()
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('does not classify a rejected report as an unrecorded anonymous match', async () => {
    const report = vi.fn(() => Promise.reject(new Error('unavailable')))
    const onRecorded = vi.fn()
    const onUnrecorded = vi.fn()
    const reporter = createHotSeatProgressionReporter({
      mode: 'hotseat',
      e2eMode: null,
      accountTankId: 'p1',
      report,
      onRecorded,
      onUnrecorded,
    })
    if (!reporter) throw new Error('Expected reporter')

    reporter.observe(state('GAME_OVER', 'p1'))
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onRecorded).not.toHaveBeenCalled()
    expect(onUnrecorded).not.toHaveBeenCalled()
  })

  it.each([
    ['another tank wins', 'p2'],
    ['the match draws', null],
  ])('records a non-win when %s', (_label, winner) => {
    const report = vi.fn(async () => null)
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
    const report = vi.fn(async () => null)
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
    const report = vi.fn(async () => null)
    expect(createHotSeatProgressionReporter({ ...options, report })).toBeNull()
    expect(report).not.toHaveBeenCalled()
  })
})
