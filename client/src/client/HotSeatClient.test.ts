import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import { HotSeatClient } from './HotSeatClient';

function makeState(phase: GameState['phase']): GameState {
  return {
    phase,
    turn: 0,
    activePlayerId: 'p1',
    round: 1,
    totalRounds: 1,
    lastRoundWinnerId: null,
    wind: 0,
    walls: 'open',
    terrain: new Uint8Array(),
    terrainVersion: 0,
    tanks: [],
    projectiles: [],
    projectile: null,
    lastExplosion: null,
    explosions: [],
    wallImpacts: [],
    fire: [],
    winner: null,
  };
}

function makeEngine(initialState: GameState, gravity = 0.15) {
  let state = initialState;
  const tick = vi.fn();
  const applyAction = vi.fn();
  const getState = vi.fn(() => state);
  const getEffectiveGravity = vi.fn(() => gravity);

  return {
    engine: { tick, applyAction, getState, getEffectiveGravity } as unknown as GameEngine,
    tick,
    applyAction,
    getState,
    getEffectiveGravity,
    setState(next: GameState): void {
      state = next;
    },
  };
}

function makeRafQueue() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback): number => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number): void => {
    callbacks.delete(id);
  });

  return {
    request,
    cancel,
    pendingIds(): number[] {
      return [...callbacks.keys()];
    },
    run(id: number, timestamp = 0): void {
      const callback = callbacks.get(id);
      if (!callback) throw new Error(`No queued animation frame ${id}`);
      callbacks.delete(id);
      callback(timestamp);
    },
    runNext(timestamp: number): void {
      const [id] = this.pendingIds();
      if (id === undefined) throw new Error('No queued animation frame');
      this.run(id, timestamp);
    },
  };
}

describe('HotSeatClient', () => {
  let raf: ReturnType<typeof makeRafQueue>;

  beforeEach(() => {
    raf = makeRafQueue();
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts once, emits each frame, stops idempotently, and can restart', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const initialState = makeState('PLAYER_TURN');
    const frameState = makeState('FIRING');
    const restartState = makeState('ROUND_OVER');
    const engine = makeEngine(initialState);
    engine.tick.mockImplementation(() => engine.setState(frameState));
    const client = new HotSeatClient(engine.engine);
    const listener = vi.fn();
    const removedListener = vi.fn();
    client.onStateChange(listener);
    const unsubscribe = client.onStateChange(removedListener);

    client.stop();
    expect(raf.cancel).not.toHaveBeenCalled();

    client.start();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(initialState);
    expect(removedListener).toHaveBeenCalledTimes(1);
    expect(raf.pendingIds()).toEqual([1]);

    unsubscribe();
    client.start();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(raf.request).toHaveBeenCalledTimes(1);

    raf.run(1, 1_000 / 60);
    expect(engine.tick).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(frameState);
    expect(removedListener).toHaveBeenCalledTimes(1);
    expect(raf.pendingIds()).toEqual([2]);

    client.stop();
    client.stop();
    expect(raf.cancel).toHaveBeenCalledTimes(1);
    expect(raf.cancel).toHaveBeenCalledWith(2);
    expect(raf.pendingIds()).toEqual([]);

    engine.setState(restartState);
    client.start();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenLastCalledWith(restartState);
    expect(removedListener).toHaveBeenCalledTimes(1);
    expect(raf.pendingIds()).toEqual([3]);

    client.stop();
  });

  it('uses one normal tick, eight live fast-forward ticks, and stops on settlement', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const firingState = makeState('FIRING');
    const settledState = makeState('PLAYER_TURN');
    const engine = makeEngine(firingState);
    const client = new HotSeatClient(engine.engine);
    const listener = vi.fn();
    client.onStateChange(listener);
    client.start();

    raf.run(1, 1_000 / 60);
    expect(engine.tick).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(raf.pendingIds()).toEqual([2]);

    client.setFastForward(true);
    engine.tick.mockClear();
    raf.run(2, 2_000 / 60);
    expect(engine.tick).toHaveBeenCalledTimes(8);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(raf.pendingIds()).toEqual([3]);

    let settleTick = 0;
    engine.tick.mockReset();
    engine.tick.mockImplementation(() => {
      settleTick += 1;
      if (settleTick === 3) engine.setState(settledState);
    });
    raf.run(3, 3_000 / 60);
    expect(engine.tick).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenCalledTimes(4);
    expect(listener).toHaveBeenLastCalledWith(settledState);
    expect(raf.pendingIds()).toEqual([4]);

    client.stop();
  });

  it.each([30, 60, 120, 144])(
    'paces normal and fast-forward simulation at the declared 60 Hz logical rate on a %i Hz display',
    (displayHz) => {
      vi.spyOn(performance, 'now').mockReturnValue(0);
      const state = makeState('FIRING');
      const engine = makeEngine(state);
      const client = new HotSeatClient(engine.engine);
      const listener = vi.fn();
      client.onStateChange(listener);
      client.start();

      for (let frame = 1; frame <= displayHz; frame++) {
        raf.runNext(frame * (1_000 / displayHz));
      }

      expect(engine.tick).toHaveBeenCalledTimes(60);
      expect(listener).toHaveBeenCalledTimes(61);

      client.setFastForward(true);
      engine.tick.mockClear();
      listener.mockClear();
      for (let frame = displayHz + 1; frame <= displayHz * 2; frame++) {
        raf.runNext(frame * (1_000 / displayHz));
      }

      expect(engine.tick).toHaveBeenCalledTimes(60 * 8);
      expect(listener).toHaveBeenCalledTimes(60);
      client.stop();
    },
  );

  it('bounds a hidden-tab resume to four logical beats and discards the suspended backlog', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const engine = makeEngine(makeState('FIRING'));
    const client = new HotSeatClient(engine.engine);
    client.start();

    raf.runNext(1_000 / 60);
    client.setFastForward(true);
    engine.tick.mockClear();
    raf.runNext(5 * 60 * 1_000);
    expect(engine.tick).toHaveBeenCalledTimes(4 * 8);

    raf.runNext(5 * 60 * 1_000 + 1_000 / 60);
    expect(engine.tick).toHaveBeenCalledTimes(5 * 8);
    client.stop();
  });

  it('does not schedule when a listener stops the initial synchronous emission', () => {
    const engine = makeEngine(makeState('FIRING'));
    const client = new HotSeatClient(engine.engine);
    client.onStateChange(() => client.stop());

    client.start();

    expect(raf.pendingIds()).toEqual([]);
    expect(engine.tick).not.toHaveBeenCalled();
  });

  it('does not rearm when a listener stops a frame emission', () => {
    const engine = makeEngine(makeState('FIRING'));
    const client = new HotSeatClient(engine.engine);
    let emissions = 0;
    client.onStateChange(() => {
      emissions += 1;
      if (emissions === 2) client.stop();
    });
    client.start();

    raf.run(1, 1_000 / 60);

    expect(engine.tick).toHaveBeenCalledOnce();
    expect(raf.pendingIds()).toEqual([]);
  });

  it('lets a listener restart once without the retired frame generation rearming', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const engine = makeEngine(makeState('FIRING'));
    const client = new HotSeatClient(engine.engine);
    let emissions = 0;
    client.onStateChange(() => {
      emissions += 1;
      if (emissions === 2) {
        client.stop();
        client.start();
      }
    });
    client.start();

    raf.run(1, 1_000 / 60);

    expect(emissions).toBe(3);
    expect(raf.pendingIds()).toHaveLength(1);
    client.stop();
  });

  it('passes actions, state, and effective gravity through unchanged', () => {
    const state = makeState('PLAYER_TURN');
    state.terrain = new Uint8Array([0, 1, 1, 0]);
    const engine = makeEngine(state, 0.23);
    const client = new HotSeatClient(engine.engine);
    const pristineTerrain = state.terrain.slice();
    const action: PlayerAction = { type: 'set_angle', angle: 37 };

    client.sendAction(action);

    expect(engine.applyAction).toHaveBeenCalledOnce();
    expect(engine.applyAction.mock.calls[0]?.[0]).toBe(action);
    expect(client.getState()).toBe(state);
    expect(client.getInitialTerrain()).toEqual(pristineTerrain);
    expect(client.getInitialTerrain()).not.toBe(state.terrain);
    state.terrain[0] = 1;
    expect(client.getInitialTerrain()).toEqual(pristineTerrain);
    expect(client.getEffectiveGravity()).toBe(0.23);

    client.stop();
  });
});
