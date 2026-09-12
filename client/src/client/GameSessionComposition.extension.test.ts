import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import type { GameOptions } from '@shared/types/GameOptions';
import type { GameClient } from './GameClient';
import { createModeClient } from './createModeClient';
import { GameSessionComposition, type GameSessionCompositionPorts } from './GameSessionComposition';
import { HotSeatClient } from './HotSeatClient';
import { MatchSessionLifecycle } from './MatchSessionLifecycle';
import { NetworkClient } from './NetworkClient';
import type { ClientModeSetup, ModePlayer } from './modeConfig';

const supabaseBoundary = vi.hoisted(() => {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) query[method] = () => query;
  query.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  const channel = () => {
    const value: Record<string, unknown> = {};
    value.on = () => value;
    value.subscribe = () => value;
    return value;
  };
  return {
    from: vi.fn(() => query),
    channel: vi.fn(channel),
    removeChannel: vi.fn(),
  };
});

vi.mock('../lib/supabase', () => ({ supabase: supabaseBoundary }));

const players: Array<ModePlayer & { id: string }> = [
  { id: 'extension-seat-a', name: 'North', color: '#e84d4d', team: 2 },
  { id: 'extension-seat-b', name: 'East', color: '#4d8ce8', team: 1, ai: 'medium' },
  { id: 'extension-seat-c', name: 'South', color: '#4de87a', team: 2 },
  { id: 'extension-seat-d', name: 'West', color: '#e8c84d', team: 1, ai: 'hard' },
];
const settings = {
  seed: 173, maxWind: 3, gravity: 0.2, rounds: 3, interestRate: 0.1,
  suddenDeathTurn: 7, armsLevel: 2, walls: 'wrap' as const,
  battlefieldWorld: 'glassstorm-expanse' as const, hazards: 'lava' as const, teamMode: true,
};

const setups: ClientModeSetup[] = [
  { mode: 'hotseat', players, playerNames: players.map((player) => player.name), settings },
  {
    mode: 'network', players, playerNames: players.map((player) => player.name),
    settings: { ...settings, rulesetVersion: 4, commandProtocolVersion: 2 },
    roomId: 'extension-room', roomCode: 'EXTEND', playerId: 'extension-seat-a',
  },
];

const expectedOptions: GameOptions = {
  maxPlayers: 4,
  players: players.map((player) => ({
    ...player,
    loadout: { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' },
  })),
  ...settings,
  starterWeaponFalloff: 'decisive',
};

function expectExactState(actual: GameState | null, expected: GameState): void {
  if (actual === null) throw new Error('Composition client did not expose an initial state');
  const { terrain: actualTerrain, ...actualRest } = actual;
  const { terrain: expectedTerrain, ...expectedRest } = expected;
  expect(actualRest).toStrictEqual(expectedRest);
  expect(actualTerrain.length).toBe(expectedTerrain.length);
  let firstMismatch = -1;
  for (let index = 0; index < actualTerrain.length; index += 1) {
    if (actualTerrain[index] !== expectedTerrain[index]) { firstMismatch = index; break; }
  }
  expect(firstMismatch, 'Exact deterministic terrain bytes').toBe(-1);
}

describe('mode extension through GameSessionComposition', () => {
  it.each(setups)('delivers the complete $mode setup to its real client constructor', async (setup) => {
    const lifecycle = new MatchSessionLifecycle<
      GameClient, { detach(): void }, { reset(): void }
    >();
    const composition = new GameSessionComposition<
      GameClient, { detach(): void }, { reset(): void }, GameState
    >(lifecycle);
    const renderer = { reset: vi.fn() };
    const input = { detach: vi.fn() };
    const ports: GameSessionCompositionPorts<GameClient, typeof input, typeof renderer, GameState> = {
      retirePresentation: () => undefined,
      afterRetire: () => undefined,
      prepareAcquisition: () => setup,
      acquireClient: async (admitted) => ({
        status: 'acquired', client: await createModeClient(admitted), verifiedComplete: false,
      }),
      constructRenderer: () => renderer,
      configureRendererEvents: () => undefined,
      primeTerminalHistory: () => undefined,
      configureInitialPresentation: () => undefined,
      constructInput: () => input,
      attachInput: () => undefined,
      configureClient: () => undefined,
      createStateListener: () => () => undefined,
      subscribe: () => () => undefined,
      // This constructor/composition boundary deliberately does not start RAF or transport.
      start: () => undefined,
    };

    const active = await composition.start(ports);
    const canonical = new GameEngine(expectedOptions);
    expect(active?.setup).toBe(setup);
    expect(active?.client).toBeInstanceOf(setup.mode === 'hotseat' ? HotSeatClient : NetworkClient);
    expectExactState(active?.initial ?? null, canonical.getState());
    expect(active?.client.getEffectiveGravity()).toBe(0.2);
    await composition.retire(() => undefined);
  });
});
