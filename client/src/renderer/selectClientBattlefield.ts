import type { GameClient } from '../client/GameClient';
import type { BattlefieldWorldId } from '@shared/types/GameOptions';
import type { BattlefieldWorld } from './BattlefieldBackdrop';

export interface BattlefieldWorldSelector {
  selectBattlefieldWorld(
    terrain: Uint8Array,
    requestedWorld?: BattlefieldWorldId,
  ): BattlefieldWorld | undefined;
}

export function selectClientBattlefieldWorld(
  client: Pick<GameClient, 'getInitialTerrain'>,
  renderer: BattlefieldWorldSelector,
  requestedWorld?: BattlefieldWorldId,
): BattlefieldWorld | undefined {
  const terrain = client.getInitialTerrain();
  if (requestedWorld === undefined) {
    return renderer.selectBattlefieldWorld(terrain);
  }
  return renderer.selectBattlefieldWorld(terrain, requestedWorld);
}
