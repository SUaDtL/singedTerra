import { describe, expect, it } from 'vitest';
import type { BorrowedGameState, GameState } from '@shared/types/GameState';
import type { GameClient } from './GameClient';
import type { HotSeatClient } from './HotSeatClient';
import type { NetworkClient } from './NetworkClient';
import { projectMatchPresentationState } from './matchPresentation';

/** Compile-only negative contracts for every concrete/public publication seam. */
function assertBorrowedStateTypes(
  gameClient: GameClient,
  hotSeatClient: HotSeatClient,
  networkClient: NetworkClient,
  canonical: BorrowedGameState,
): void {
  const publicState = gameClient.getState();
  if (publicState) {
    // @ts-expect-error GameClient state is borrowed at the top level.
    publicState.phase = 'GAME_OVER';
    // @ts-expect-error Winners cannot be rewritten through GameClient.
    publicState.winner = 'p1';
    // @ts-expect-error Collection properties cannot be replaced through GameClient.
    publicState.tanks = [];
  }

  const hotSeatState = hotSeatClient.getState();
  if (hotSeatState) {
    // @ts-expect-error HotSeatClient preserves the borrowed concrete return type.
    hotSeatState.phase = 'GAME_OVER';
  }
  const networkState = networkClient.getState();
  // @ts-expect-error NetworkClient preserves the borrowed concrete return type.
  networkState.winner = 'p2';

  gameClient.onStateChange((emitted) => {
    // @ts-expect-error Interface listeners cannot rewrite emitted state.
    emitted.phase = 'GAME_OVER';
  });
  hotSeatClient.onStateChange((emitted) => {
    // @ts-expect-error Hot-seat listeners cannot replace emitted collections.
    emitted.projectiles = [];
  });
  networkClient.onStateChange((emitted) => {
    // @ts-expect-error Network listeners cannot rewrite the emitted winner.
    emitted.winner = 'p1';
  });

  const projected = projectMatchPresentationState(canonical, { winnerId: 'p1' });
  // @ts-expect-error The projector also returns a borrowed top-level view.
  projected.phase = 'PLAYER_TURN';
  // @ts-expect-error The projector does not expose replaceable collection properties.
  projected.explosions = [];
}
void assertBorrowedStateTypes;

function state(): GameState {
  return {
    phase: 'PLAYER_TURN',
    winner: null,
    terrain: new Uint8Array(800 * 500),
    tanks: [{ health: 100 }],
    projectiles: [],
    explosions: [],
    wallImpacts: [],
    fire: [],
  } as unknown as GameState;
}

describe('borrowed game state boundary', () => {
  it('freezes the detached top level while explicitly retaining nested and terrain identities', () => {
    const canonical = state();
    const projected = projectMatchPresentationState(canonical, { winnerId: 'p1' });

    expect(() => {
      (projected as GameState).phase = 'PLAYER_TURN';
    }).toThrow(TypeError);
    projected.terrain[0] = 1;
    projected.tanks[0]!.health = 75;
    expect(canonical.terrain[0]).toBe(1);
    expect(canonical.tanks[0]!.health).toBe(75);
  });
});
