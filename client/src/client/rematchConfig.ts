import { projectAuthoritativeNetworkMode, type NetworkModeSetup } from './modeConfig';
import type { RematchInfo } from './GameClient';

/** Convert an authoritative successor-room payload into the next network setup. */
export function rematchToConfig(info: RematchInfo, myPlayerId: string): NetworkModeSetup {
  return projectAuthoritativeNetworkMode(info, { playerId: myPlayerId });
}
