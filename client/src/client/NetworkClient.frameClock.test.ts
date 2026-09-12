import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameEngine } from '@shared/engine/GameEngine';
import { NetworkClient } from './NetworkClient';

const OPTIONS = {
  maxPlayers: 2,
  seed: 23,
  players: [
    { id: 'seat-a', name: 'Alpha', color: '#e84d4d' },
    { id: 'seat-b', name: 'Bravo', color: '#4d8ce8' },
  ],
};

function makeClient(): NetworkClient {
  const supabase = { removeChannel: vi.fn() } as unknown as SupabaseClient;
  const client = new NetworkClient(supabase, 'room-clock', 'seat-a', OPTIONS, undefined, 2);
  const engine = (client as unknown as { engine: GameEngine }).engine;
  engine.applyAction({ type: 'set_angle', angle: 45 });
  engine.applyAction({ type: 'set_power', power: 50 });
  if (!engine.applyAction({ type: 'fire' })) throw new Error('Clock fixture fire was rejected');
  return client;
}

function runOneSecond(displayHz: number) {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const client = makeClient();
  let emissions = 0;
  client.onStateChange(() => { emissions += 1; });
  client.start();

  for (let frame = 1; frame <= displayHz; frame++) {
    const callback = callbacks.shift();
    if (!callback) throw new Error(`Missing animation callback ${frame}`);
    callback(frame * (1_000 / displayHz));
  }

  const state = client.getState();
  client.stop();
  return {
    emissions,
    phase: state.phase,
    projectile: state.projectile && {
      x: state.projectile.x,
      y: state.projectile.y,
      vx: state.projectile.vx,
      vy: state.projectile.vy,
      age: state.projectile.age,
    },
    terrainVersion: state.terrainVersion,
    turn: state.turn,
    activePlayerId: state.activePlayerId,
  };
}

describe('NetworkClient fixed-rate frame clock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('produces the same public simulation tuple and 60 state emissions at 30/60/120/144 Hz', () => {
    const schedules = [30, 60, 120, 144].map((hz) => [hz, runOneSecond(hz)] as const);
    const baseline = schedules.find(([hz]) => hz === 60)?.[1];
    expect(baseline).toBeDefined();
    for (const [, outcome] of schedules) {
      expect(outcome).toEqual(baseline);
      expect(outcome.emissions).toBe(60);
    }
  });
});
