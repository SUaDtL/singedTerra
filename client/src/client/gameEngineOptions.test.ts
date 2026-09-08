import { describe, expect, it } from 'vitest';
import type { LobbyConfig } from '../ui/Lobby';
import { buildClientEngineOptions } from './gameEngineOptions';

const players = [
  { id: 'seat-1', name: 'Player 1', color: '#e84d4d' },
  { id: 'seat-2', name: 'Player 2', color: '#4d8ce8' },
];

function config<Mode extends LobbyConfig['mode']>(
  mode: Mode,
  rulesetVersion?: 1 | 2 | 4,
): LobbyConfig & { mode: Mode } {
  return {
    mode,
    players,
    playerNames: players.map((player) => player.name),
    settings: {
      seed: 17,
      maxWind: 8,
      gravity: 0.2,
      walls: 'wrap',
      battlefieldWorld: 'glassstorm-expanse',
      rulesetVersion,
    },
  };
}

describe('buildClientEngineOptions', () => {
  it.each([undefined, 1, 2] as const)('refuses network ruleset %s before constructing an engine', (rulesetVersion) => {
    expect(() => buildClientEngineOptions(config('network', rulesetVersion))).toThrow('network_ruleset_incompatible');
  });

  it('maps protected-floor network ruleset 4 to the decisive curve', () => {
    expect(buildClientEngineOptions(config('network', 4))).toMatchObject({
      starterWeaponFalloff: 'decisive',
      rulesetVersion: 4,
    });
  });

  it('opts hot-seat engines into decisive starter-weapon falloff', () => {
    expect(buildClientEngineOptions(config('hotseat'))).toMatchObject({
      starterWeaponFalloff: 'decisive',
      seed: 17,
      maxWind: 8,
      gravity: 0.2,
      walls: 'wrap',
      battlefieldWorld: 'glassstorm-expanse',
    });
  });

  it('carries the opt-in hazard mode through both engine-option builders', () => {
    const withHazards = { ...config('hotseat'), settings: { ...config('hotseat').settings, hazards: 'lava' as const, rulesetVersion: 4 as const } };
    expect(buildClientEngineOptions(withHazards)).toMatchObject({ hazards: 'lava' });
    expect(buildClientEngineOptions({ ...withHazards, mode: 'network' })).toMatchObject({ hazards: 'lava' });
  });
});
