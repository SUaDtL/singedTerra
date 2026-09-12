import { describe, expect, it } from 'vitest';
import type { BorrowedGameState, GameState } from '@shared/types/GameState';
import { projectMatchPresentationState } from './matchPresentation';

function state(phase: GameState['phase'] = 'PLAYER_TURN'): GameState {
  return {
    phase,
    winner: phase === 'GAME_OVER' ? 'p1' : null,
    terrain: new Uint8Array(800 * 500),
    tanks: [],
    projectiles: [],
    explosions: [],
    wallImpacts: [],
    fire: [],
  } as unknown as GameState;
}

describe('match presentation projection', () => {
  it('wraps a capped outcome without changing canonical state or copying live storage', () => {
    const canonical = state();
    const borrowed: BorrowedGameState = canonical;
    const projected = projectMatchPresentationState(borrowed, { winnerId: 'p2' });

    expect(projected).not.toBe(canonical);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(projected).toMatchObject({ phase: 'GAME_OVER', winner: 'p2' });
    expect(canonical).toMatchObject({ phase: 'PLAYER_TURN', winner: null });
    expect(projected.terrain).toBe(canonical.terrain);
    expect(projected.tanks).toBe(canonical.tanks);
    expect(projected.projectiles).toBe(canonical.projectiles);
    expect(projected.explosions).toBe(canonical.explosions);
    expect(projected.wallImpacts).toBe(canonical.wallImpacts);
    expect(projected.fire).toBe(canonical.fire);
  });

  it('passes natural terminal and ordinary live state through by identity', () => {
    const natural = state('GAME_OVER');
    const live = state();

    expect(projectMatchPresentationState(natural, { winnerId: 'p2' })).toBe(natural);
    expect(projectMatchPresentationState(live, null)).toBe(live);
  });
});
