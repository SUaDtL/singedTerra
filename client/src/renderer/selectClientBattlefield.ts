import type { GameClient } from '../client/GameClient';

export interface BattlefieldBackdropSelector {
  selectBattlefieldBackdrop(terrain: Uint8Array): void;
}

export function selectClientBattlefieldBackdrop(
  client: Pick<GameClient, 'getInitialTerrain'>,
  renderer: BattlefieldBackdropSelector,
): void {
  renderer.selectBattlefieldBackdrop(client.getInitialTerrain());
}
