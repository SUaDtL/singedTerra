import { describe, expect, it } from 'vitest';
import type { LobbyConfig } from '../ui/Lobby';
import { buildClientEngineOptions } from './gameEngineOptions';

const players = [
  { id: 'seat-1', name: 'Player 1', color: '#e84d4d' },
  { id: 'seat-2', name: 'Player 2', color: '#4d8ce8' },
];

function config<Mode extends LobbyConfig['mode']>(
  mode: Mode,
): LobbyConfig & { mode: Mode } {
  return {
    mode,
    players,
    playerNames: players.map((player) => player.name),
    settings: { seed: 17, maxWind: 8, gravity: 0.2, walls: 'wrap' },
  };
}

describe('buildClientEngineOptions', () => {
  it('pins network engines to the mixed-version-compatible linear curve', () => {
    expect(buildClientEngineOptions(config('network'))).toMatchObject({
      starterWeaponFalloff: 'linear',
      seed: 17,
      maxWind: 8,
      gravity: 0.2,
      walls: 'wrap',
    });
  });

  it('opts hot-seat engines into decisive starter-weapon falloff', () => {
    expect(buildClientEngineOptions(config('hotseat'))).toMatchObject({
      starterWeaponFalloff: 'decisive',
      seed: 17,
      maxWind: 8,
      gravity: 0.2,
      walls: 'wrap',
    });
  });
});
