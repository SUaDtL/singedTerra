import { normalizeWallMode } from '@shared/types/GameOptions';
import { normalizeTankLoadout } from '@shared/types/TankLoadout';
import type { LobbyConfig } from '../ui/Lobby';
import type { RematchInfo } from './GameClient';

/** Convert an authoritative successor-room payload into the next network lobby. */
export function rematchToConfig(info: RematchInfo, myPlayerId: string): LobbyConfig {
  const walls = normalizeWallMode(info.options.walls);
  return {
    mode: 'network',
    players: info.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      loadout: normalizeTankLoadout(player.loadout),
    })),
    playerNames: info.players.map((player) => player.name),
    roomCode: info.code,
    roomId: info.roomId,
    playerId: myPlayerId,
    settings: {
      seed: info.seed,
      maxWind: info.options.maxWind,
      gravity: info.options.gravity,
      ...(walls !== 'open' ? { walls } : {}),
      ...(info.options.rounds !== undefined ? { rounds: info.options.rounds } : {}),
      ...(info.options.rulesetVersion !== undefined
        ? { rulesetVersion: info.options.rulesetVersion }
        : {}),
    },
  };
}
