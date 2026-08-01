import { describe, expect, it } from 'vitest';
import type { RematchInfo } from './GameClient';
import { buildClientEngineOptions } from './gameEngineOptions';
import { rematchToConfig } from './rematchConfig';

describe('rematchToConfig', () => {
  it('carries a successor ruleset 2 into decisive network engine construction', () => {
    const info: RematchInfo = {
      roomId: 'room-next',
      code: 'NEXT42',
      seed: 42,
      options: {
        maxPlayers: 2,
        maxWind: 8,
        gravity: 0.2,
        walls: 'wrap',
        rulesetVersion: 2,
      },
      players: [
        { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
        { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
      ],
    };

    const config = rematchToConfig(info, 'player-abc');
    expect(config.settings?.rulesetVersion).toBe(2);
    expect(buildClientEngineOptions({ ...config, mode: 'network' }).starterWeaponFalloff).toBe('decisive');
  });
});
