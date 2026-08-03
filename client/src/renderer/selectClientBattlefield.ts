import type { GameClient } from '../client/GameClient';
import type { BattlefieldWorldId } from '@shared/types/GameOptions';

export interface BattlefieldWorldSelector {
  selectBattlefieldWorld(terrain: Uint8Array, requestedWorld?: BattlefieldWorldId): void;
}

export function selectClientBattlefieldWorld(
  client: Pick<GameClient, 'getInitialTerrain'>,
  renderer: BattlefieldWorldSelector,
  requestedWorld?: BattlefieldWorldId,
): void {
  const terrain = client.getInitialTerrain();
  if (requestedWorld === undefined) {
    renderer.selectBattlefieldWorld(terrain);
  } else {
    renderer.selectBattlefieldWorld(terrain, requestedWorld);
  }
}
