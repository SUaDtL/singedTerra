import type { GameOptions } from '@shared/types/GameOptions'
import type { AiDifficulty } from '@shared/types/GameState'
import type { TankLoadout } from '@shared/types/TankLoadout'
import { quickOperationOptions, type QuickOperation } from './quickOperations'
import {
  resolvePublicSeedChallenge,
  type PublicSeedChallenge,
  type PublicSeedChallengeOrigin,
} from './seedChallenge'

export interface QuickDuelLaunchPlayer {
  readonly name: string
  readonly color: string
  readonly ai?: AiDifficulty
  readonly loadout: TankLoadout
}

/** Shared base for the chooser readout and the launch composer. */
export const QUICK_DUEL_DEFAULT_ROUNDS = 3 as const

export interface QuickDuelLaunch {
  readonly mode: 'hotseat'
  readonly players: QuickDuelLaunchPlayer[]
  readonly playerNames: string[]
  readonly settings: Omit<GameOptions, 'maxPlayers' | 'players'>
  readonly quickOperation: {
    readonly id: QuickOperation['id']
    readonly title: string
    readonly briefing: string
    readonly practiceObjective?: QuickOperation['practiceObjective']
  }
  readonly publicSeedChallenge?: PublicSeedChallenge
}

export function composeQuickDuelLaunch(options: {
  readonly operation: QuickOperation
  readonly seed: number
  readonly origin: PublicSeedChallengeOrigin
  readonly human: QuickDuelLaunchPlayer
  readonly cpu: QuickDuelLaunchPlayer & { readonly ai: 'medium' }
}): QuickDuelLaunch {
  const composed = quickOperationOptions(options.operation.id, {
    maxPlayers: 2,
    players: [options.human, options.cpu],
    seed: options.seed,
    rounds: QUICK_DUEL_DEFAULT_ROUNDS,
  })
  const { maxPlayers: _maxPlayers, players: _players, ...settings } = composed
  const publicSeedChallenge = resolvePublicSeedChallenge(
    options.operation.id,
    options.seed,
    options.origin,
    options.operation,
  )
  return {
    mode: 'hotseat',
    players: [options.human, options.cpu],
    playerNames: [options.human.name, options.cpu.name],
    settings,
    quickOperation: {
      id: options.operation.id,
      title: options.operation.title,
      briefing: options.operation.briefing,
      ...(options.operation.practiceObjective
        ? { practiceObjective: options.operation.practiceObjective }
        : {}),
    },
    ...(publicSeedChallenge ? { publicSeedChallenge } : {}),
  }
}
