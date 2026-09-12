import type { BorrowedGameState } from '@shared/types/GameState';

export interface MatchTerminalOutcome {
  readonly winnerId: string | null;
}

/**
 * Project a verified cap adjudication at the existing presentation boundary.
 * Natural engine GAME_OVER states pass through unchanged. A capped result gets
 * one shallow frozen wrapper; all nested records, collections, and the 720,000-byte
 * terrain buffer retain their canonical identities.
 */
export function projectMatchPresentationState(
  canonical: BorrowedGameState,
  terminalOutcome: MatchTerminalOutcome | null,
): BorrowedGameState {
  if (terminalOutcome === null || canonical.phase === 'GAME_OVER') return canonical;
  return Object.freeze({
    ...canonical,
    phase: 'GAME_OVER' as const,
    winner: terminalOutcome.winnerId,
  });
}
