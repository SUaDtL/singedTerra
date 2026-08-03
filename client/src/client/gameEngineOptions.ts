import type { GameOptions } from '@shared/types/GameOptions';
import { normalizeTankLoadout } from '@shared/types/TankLoadout';
import type { LobbyConfig } from '../ui/Lobby';
import { normalizeNetworkRulesetVersion } from './networkRuleset';

type EnginePlayer = NonNullable<GameOptions['players']>[number];
type NetworkEnginePlayer = EnginePlayer & { id: string };

/** Engine inputs derived from the selected client execution mode. */
export interface ClientEngineOptions extends Omit<GameOptions, 'players'> {
  players: EnginePlayer[];
}

/** Network variant retains the required Supabase seat id on every player. */
export interface NetworkClientEngineOptions extends Omit<GameOptions, 'players'> {
  players: NetworkEnginePlayer[];
}

/**
 * Build the exact options passed to every client-side GameEngine.
 *
 * The explicit mode rule is a lockstep compatibility boundary: hot-seat can
 * adopt the decisive starter curve immediately, while network engines remain
 * linear until the Edge referee can reject mismatched room rulesets.
 */
export function buildClientEngineOptions(
  config: LobbyConfig & { mode: 'network' },
): NetworkClientEngineOptions;
export function buildClientEngineOptions(
  config: LobbyConfig & { mode: 'hotseat' },
): ClientEngineOptions;
export function buildClientEngineOptions(
  config: LobbyConfig,
): ClientEngineOptions | NetworkClientEngineOptions {
  const settings = config.settings;

  if (config.mode === 'network') {
    const rulesetVersion = normalizeNetworkRulesetVersion(settings?.rulesetVersion);
    const players = config.players.map((player) => ({
      ...player,
      id: player.id!,
      loadout: normalizeTankLoadout(player.loadout),
    }));
    return {
      maxPlayers: players.length,
      players,
      seed: settings?.seed,
      maxWind: settings?.maxWind,
      gravity: settings?.gravity,
      walls: settings?.walls,
      battlefieldWorld: settings?.battlefieldWorld,
      hazards: settings?.hazards,
      rounds: settings?.rounds,
      interestRate: settings?.interestRate,
      suddenDeathTurn: settings?.suddenDeathTurn,
      armsLevel: settings?.armsLevel,
      teamMode: settings?.teamMode,
      rulesetVersion,
      starterWeaponFalloff: rulesetVersion === 2 || rulesetVersion === 3 ? 'decisive' : 'linear',
    };
  }

  const players = config.players.map((player) => ({
    ...player,
    loadout: normalizeTankLoadout(player.loadout),
  }));
  return {
    players,
    maxPlayers: players.length,
    ...(settings?.seed != null ? { seed: settings.seed } : {}),
    ...(settings?.maxWind != null ? { maxWind: settings.maxWind } : {}),
    ...(settings?.gravity != null ? { gravity: settings.gravity } : {}),
    ...(settings?.walls != null ? { walls: settings.walls } : {}),
    ...(settings?.battlefieldWorld != null ? { battlefieldWorld: settings.battlefieldWorld } : {}),
    ...(settings?.hazards != null ? { hazards: settings.hazards } : {}),
    ...(settings?.rounds != null ? { rounds: settings.rounds } : {}),
    ...(settings?.interestRate != null ? { interestRate: settings.interestRate } : {}),
    ...(settings?.suddenDeathTurn != null ? { suddenDeathTurn: settings.suddenDeathTurn } : {}),
    ...(settings?.armsLevel != null ? { armsLevel: settings.armsLevel } : {}),
    ...(settings?.teamMode === true ? { teamMode: true } : {}),
    starterWeaponFalloff: 'decisive',
  };
}
