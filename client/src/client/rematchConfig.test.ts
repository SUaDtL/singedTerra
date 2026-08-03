import { describe, expect, it } from 'vitest';
import type { RematchInfo } from './GameClient';
import { buildClientEngineOptions } from './gameEngineOptions';
import { rematchToConfig } from './rematchConfig';

describe('rematchToConfig', () => {
  it.each([
    [1, 'linear'],
    [2, 'decisive'],
  ] as const)('carries successor ruleset %i into %s network engine construction', (
    rulesetVersion,
    starterWeaponFalloff,
  ) => {
    const info: RematchInfo = {
      roomId: 'room-next',
      code: 'NEXT42',
      seed: 42,
      options: {
        maxPlayers: 2,
        maxWind: 8,
        gravity: 0.2,
        walls: 'concrete',
        rulesetVersion,
      },
      players: [
        { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
        { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
      ],
    };

    const config = rematchToConfig(info, 'player-abc');
    expect(config.settings?.rulesetVersion).toBe(rulesetVersion);
    expect(config.settings?.walls).toBe('concrete');
    expect(buildClientEngineOptions({ ...config, mode: 'network' }).starterWeaponFalloff)
      .toBe(starterWeaponFalloff);
  });
});
