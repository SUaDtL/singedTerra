import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameOptions } from '@shared/types/GameOptions';
import type { GameState } from '@shared/types/GameState';
import { HotSeatClient } from './HotSeatClient';
import { NetworkClient } from './NetworkClient';
import { buildClientEngineOptions } from './gameEngineOptions';
import { normalizeRawModeSettings, projectAuthoritativeNetworkMode, type ModePlayer } from './modeConfig';

// A test-only variation of existing rules, not a new selectable game mode.
const players: Array<ModePlayer & { id: string }> = [
  { id: 'extension-seat-a', name: 'North', color: '#e84d4d', team: 2 },
  { id: 'extension-seat-b', name: 'East', color: '#4d8ce8', team: 1, ai: 'medium' },
  { id: 'extension-seat-c', name: 'South', color: '#4de87a', team: 2 },
  { id: 'extension-seat-d', name: 'West', color: '#e8c84d', team: 1, ai: 'hard' },
];

function expectExactState(actual: GameState | null, expected: GameState): void {
  if (actual === null) throw new Error('Client constructor did not create an engine state');
  const { terrain: actualTerrain, ...actualRest } = actual;
  const { terrain: expectedTerrain, ...expectedRest } = expected;
  expect(actualRest).toStrictEqual(expectedRest);
  expect(actualTerrain.length).toBe(expectedTerrain.length);
  let firstMismatch = -1;
  for (let i = 0; i < actualTerrain.length; i += 1) {
    if (actualTerrain[i] !== expectedTerrain[i]) { firstMismatch = i; break; }
  }
  expect(firstMismatch, 'Exact deterministic terrain bytes').toBe(-1);
}

describe('mode extension example: four-seat lava crosswind', () => {
  it('carries explicit rules through normalization and both real client engine constructors', () => {
    const settings = normalizeRawModeSettings({
      seed: '173', maxWind: '3', gravity: '0.2', rounds: '3',
      interestRate: '0.1', suddenDeathTurn: '7', armsLevel: '2',
      walls: 'wrap', battlefieldWorld: 'glassstorm-expanse', hazards: 'lava', teamMode: '2v2',
    });
    expect(settings).toStrictEqual({
      seed: 173, maxWind: 3, gravity: 0.2, rounds: 3, interestRate: 0.1,
      suddenDeathTurn: 7, armsLevel: 2, walls: 'wrap',
      battlefieldWorld: 'glassstorm-expanse', hazards: 'lava', teamMode: true,
    });

    // Literal oracle does not obtain its options from either production projector.
    const expected: GameOptions = {
      maxPlayers: 4,
      players: players.map(player => ({ ...player, loadout: {
        treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry',
      } })),
      seed: 173, maxWind: 3, gravity: 0.2, rounds: 3, interestRate: 0.1,
      suddenDeathTurn: 7, armsLevel: 2, walls: 'wrap',
      battlefieldWorld: 'glassstorm-expanse', hazards: 'lava', teamMode: true,
      starterWeaponFalloff: 'decisive',
    };
    const hotOptions = buildClientEngineOptions({
      mode: 'hotseat', players, playerNames: players.map(player => player.name), settings,
    });
    const admitted = projectAuthoritativeNetworkMode({
      roomId: 'extension-room', code: 'EXTEND', seed: 173, players,
      options: {
        maxWind: 3, gravity: 0.2, rounds: 3, interestRate: 0.1,
        suddenDeathTurn: 7, armsLevel: 2, walls: 'wrap',
        battlefieldWorld: 'glassstorm-expanse', hazards: 'lava', teamMode: true, rulesetVersion: 4,
      },
    }, { playerId: 'extension-seat-a' });
    const networkOptions = buildClientEngineOptions(admitted);
    expect(hotOptions).toStrictEqual(expected);
    expect(networkOptions).toStrictEqual({ ...expected, rulesetVersion: 4 });

    const canonical = new GameEngine(expected);
    const hot = new HotSeatClient(new GameEngine(hotOptions));
    // Constructor-only boundary: no transport, subscription, RAF or initialize() runs.
    const network = new NetworkClient({} as SupabaseClient, 'extension-room', 'extension-seat-a', networkOptions, '', 2);
    try {
      expectExactState(hot.getState(), canonical.getState());
      expectExactState(network.getState(), canonical.getState());
      expect(hot.getEffectiveGravity()).toBe(0.2);
      expect(network.getEffectiveGravity()).toBe(0.2);
      expect(canonical.getState().tanks.map(tank => tank.team)).toStrictEqual([2, 1, 2, 1]);
    } finally {
      hot.stop();
      network.stop();
    }
  });
});
