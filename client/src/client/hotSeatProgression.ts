import type { GameState } from '@shared/types/GameState'

export interface HotSeatMatchResult {
  matchId: string
  won: boolean
}

export interface HotSeatProgressionSummary {
  readonly progressionVersion: 1
  readonly totalXp: number
  readonly level: number
  readonly levelXp: number
  readonly nextLevelXp: number
}

export interface HotSeatProgressionReceipt {
  readonly prior: HotSeatProgressionSummary
  readonly current: HotSeatProgressionSummary
}

export const MATCH_PARTICIPATION_XP = 100
export const MATCH_WIN_BONUS_XP = 100

export function earnedHotSeatMatchXp(won: boolean): number {
  return MATCH_PARTICIPATION_XP + (won ? MATCH_WIN_BONUS_XP : 0)
}

export interface HotSeatProgressionReporter {
  observe(state: Pick<GameState, 'phase' | 'winner'>): void
}

export interface HotSeatProgressionReporterOptions {
  mode: 'hotseat' | 'network'
  e2eMode: string | null
  accountTankId: string | null
  report(result: HotSeatMatchResult): Promise<HotSeatProgressionReceipt | null>
  onRecorded?(result: HotSeatMatchResult, receipt: HotSeatProgressionReceipt): void
  onUnrecorded?(result: HotSeatMatchResult): void
  matchId?: string
  createMatchId?: () => string
}

export function createHotSeatProgressionReporter(
  options: HotSeatProgressionReporterOptions,
): HotSeatProgressionReporter | null {
  if (
    options.mode !== 'hotseat'
    || options.e2eMode !== null
    || !options.accountTankId
  ) return null

  const matchId = options.matchId ?? (options.createMatchId ?? (() => crypto.randomUUID()))()
  let reported = false
  return {
    observe(state) {
      if (reported || state.phase !== 'GAME_OVER') return
      reported = true
      const result = {
        matchId,
        won: state.winner === options.accountTankId,
      }
      void options.report(result)
        .then((receipt) => {
          if (receipt) options.onRecorded?.(result, receipt)
          else options.onUnrecorded?.(result)
        })
        .catch(() => undefined)
    },
  }
}
