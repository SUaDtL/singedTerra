import type { GameState } from '@shared/types/GameState'

export interface HotSeatMatchResult {
  matchId: string
  won: boolean
}

export interface HotSeatProgressionReporter {
  observe(state: Pick<GameState, 'phase' | 'winner'>): void
}

interface HotSeatProgressionReporterOptions {
  mode: 'hotseat' | 'network'
  e2eMode: string | null
  accountTankId: string | null
  report(result: HotSeatMatchResult): Promise<boolean>
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
      void options.report({
        matchId,
        won: state.winner === options.accountTankId,
      }).catch(() => false)
    },
  }
}
