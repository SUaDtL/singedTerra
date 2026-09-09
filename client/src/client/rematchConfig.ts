import {
  normalizeBattlefieldWorldId,
  normalizeWallMode,
} from '@shared/types/GameOptions';
import { normalizeTerrainHazardMode } from '@shared/engine/Terrain';
import { normalizeTankLoadout } from '@shared/types/TankLoadout';
import type { LobbyConfig } from '../ui/Lobby';
import type { RematchInfo } from './GameClient';

/** Convert an authoritative successor-room payload into the next network lobby. */
export function rematchToConfig(info: RematchInfo, myPlayerId: string): LobbyConfig {
  const walls = normalizeWallMode(info.options.walls);
  const battlefieldWorld = normalizeBattlefieldWorldId(info.options.battlefieldWorld);
  const hazards = normalizeTerrainHazardMode(info.options.hazards);
  return {
    mode: 'network',
    players: info.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      ...(player.ai ? { ai: player.ai } : {}),
      ...(player.team === 1 || player.team === 2 ? { team: player.team } : {}),
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
      ...(battlefieldWorld !== undefined ? { battlefieldWorld } : {}),
      ...(hazards !== 'none' ? { hazards } : {}),
      ...(info.options.rounds !== undefined ? { rounds: info.options.rounds } : {}),
      ...(info.options.interestRate !== undefined ? { interestRate: info.options.interestRate } : {}),
      ...(info.options.suddenDeathTurn !== undefined ? { suddenDeathTurn: info.options.suddenDeathTurn } : {}),
      ...(info.options.armsLevel !== undefined ? { armsLevel: info.options.armsLevel } : {}),
      ...(info.options.teamMode === true ? { teamMode: true } : {}),
      ...(info.options.rulesetVersion !== undefined
        ? { rulesetVersion: info.options.rulesetVersion }
        : {}),
    },
  };
}
