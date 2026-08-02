import type { GameClient } from '../client/GameClient';

export interface BattlefieldWorldSelector {
  selectBattlefieldWorld(terrain: Uint8Array): void;
}

export function selectClientBattlefieldWorld(
  client: Pick<GameClient, 'getInitialTerrain'>,
  renderer: BattlefieldWorldSelector,
): void {
  renderer.selectBattlefieldWorld(client.getInitialTerrain());
}
