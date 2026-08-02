import { describe, expect, it, vi } from 'vitest';
import type { GameClient } from '../client/GameClient';
import { selectClientBattlefieldBackdrop } from './selectClientBattlefield';

describe('selectClientBattlefieldBackdrop', () => {
  it('selects a replayed network client world from pristine terrain, not current craters', () => {
    const pristineTerrain = new Uint8Array([1, 0, 1, 0]);
    const crateredTerrain = new Uint8Array([0, 0, 0, 0]);
    const client = {
      getInitialTerrain: () => pristineTerrain,
      getState: () => ({ terrain: crateredTerrain }),
    } as Pick<GameClient, 'getInitialTerrain' | 'getState'>;
    const selectBattlefieldBackdrop = vi.fn();

    selectClientBattlefieldBackdrop(client, { selectBattlefieldBackdrop });

    expect(client.getState()?.terrain).toBe(crateredTerrain);
    expect(selectBattlefieldBackdrop).toHaveBeenCalledOnce();
    expect(selectBattlefieldBackdrop).toHaveBeenCalledWith(pristineTerrain);
    expect(selectBattlefieldBackdrop).not.toHaveBeenCalledWith(crateredTerrain);
  });
});
