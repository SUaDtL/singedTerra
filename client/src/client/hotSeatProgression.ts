import type { GameState } from '@shared/types/GameState'

export interface HotSeatMatchResult {
  matchId: string
  won: boolean
}

export interface HotSeatProgressionSummary {
  progressionVersion: 1
  totalXp: number
  level: number
  levelXp: number
  nextLevelXp: number
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
  report(result: HotSeatMatchResult): Promise<HotSeatProgressionSummary | null>
  onRecorded?(result: HotSeatMatchResult, summary: HotSeatProgressionSummary): void
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
        .then((summary) => {
          if (summary) options.onRecorded?.(result, summary)
          else options.onUnrecorded?.(result)
        })
        .catch(() => undefined)
    },
  }
}
