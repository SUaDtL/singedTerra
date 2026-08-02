import { describe, expect, it, vi } from 'vitest';
import type { GameClient } from '../client/GameClient';
import { selectClientBattlefieldWorld } from './selectClientBattlefield';

describe('selectClientBattlefieldWorld', () => {
  it('selects a replayed network client world from pristine terrain, not current craters', () => {
    const pristineTerrain = new Uint8Array([1, 0, 1, 0]);
    const crateredTerrain = new Uint8Array([0, 0, 0, 0]);
    const client = {
      getInitialTerrain: () => pristineTerrain,
      getState: () => ({ terrain: crateredTerrain }),
    } as Pick<GameClient, 'getInitialTerrain' | 'getState'>;
    const selectBattlefieldWorld = vi.fn();

    selectClientBattlefieldWorld(client, {
      selectBattlefieldWorld,
    });

    expect(client.getState()?.terrain).toBe(crateredTerrain);
    expect(selectBattlefieldWorld).toHaveBeenCalledOnce();
    expect(selectBattlefieldWorld).toHaveBeenCalledWith(pristineTerrain);
    expect(selectBattlefieldWorld).not.toHaveBeenCalledWith(crateredTerrain);
  });
});
