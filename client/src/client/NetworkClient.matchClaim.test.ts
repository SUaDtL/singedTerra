import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { NetworkClient } from './NetworkClient';
import type { NetworkAction } from '@shared/net/replay';

const SEED = 0x5eed1234;
const OPTIONS = {
  maxPlayers: 2,
  seed: SEED,
  players: [
    { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
    { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
  ],
};
const NAPALM_KILL_SHOT: NetworkAction = { type: 'fire', angle: 45, power: 100, weapon: 'napalm' };

type QueryResult = { data: unknown; error: { message?: string } | null };

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function response(ok: boolean, status: number) {
  return { ok, status, json: async () => ({}) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve: (value: T) => resolve(value) };
}

function makeFakeSupabase(
  results: QueryResult[],
  session: { access_token: string } | null,
): { supabase: SupabaseClient } {
  const state = { idx: 0 };
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'order', 'abortSignal']) builder[method] = () => builder;
  builder.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(results[state.idx++] ?? { data: [], error: null }).then(resolve, reject);

  const makeChannel = () => {
    const channel: Record<string, unknown> = {};
    channel.on = () => channel;
    channel.subscribe = () => channel;
    return channel;
  };
  const supabase = {
    from: () => builder,
    channel: () => makeChannel(),
    removeChannel: () => {},
    auth: { getSession: async () => ({ data: { session }, error: null }) },
  } as unknown as SupabaseClient;
  return { supabase };
}

function row(seq: number, action: NetworkAction) {
  return { id: `r${seq}`, room_id: 'room-1', seq, player_id: 'player-abc', action, created_at: '' };
}

interface EngineAccess {
  engine: {
    getState(): {
      tanks: Array<{ health: number; inventory: Record<string, { count: number; unlimited: boolean }> }>;
    };
  };
}

function engineOf(client: NetworkClient): EngineAccess['engine'] {
  return (client as unknown as EngineAccess).engine;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function completeStateSnapshot(client: NetworkClient): unknown {
  const state = client.getState();
  return structuredClone({ ...state, terrain: Array.from(state.terrain) });
}

interface NetworkActionAccess {
  appliedLog: NetworkAction[];
  pendingActions: Map<number, NetworkAction>;
  nextExpectedSeq: number;
}

function actionTrackingSnapshot(client: NetworkClient): unknown {
  const { appliedLog, pendingActions, nextExpectedSeq } = client as unknown as NetworkActionAccess;
  return structuredClone({
    appliedLog,
    pendingActions: Array.from(pendingActions.entries()),
    nextExpectedSeq,
  });
}

async function gameOverClient(session: { access_token: string } | null): Promise<NetworkClient> {
  const { supabase } = makeFakeSupabase([{ data: [row(0, NAPALM_KILL_SHOT)], error: null }], session);
  const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS, 'seat-token-secret');
  const state = engineOf(client).getState();
  const shooter = required(state.tanks[0], 'shooter tank');
  const victim = required(state.tanks[1], 'victim tank');
  const napalm = required(shooter.inventory.napalm, 'shooter napalm inventory');
  napalm.count = 9;
  napalm.unlimited = false;
  victim.health = 5;
  await client.initialize();
  expect(client.getState().phase).toBe('GAME_OVER');
  return client;
}

describe('NetworkClient match-completion claim wiring', () => {
  let rafCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { rafCallback = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('waits for both failed finish attempts before bounded, one-shot signed-in claim failures without mutable side effects', async () => {
    const firstFinish = deferred<ReturnType<typeof response>>();
    const secondFinish = deferred<ReturnType<typeof response>>();
    const calls: string[] = [];
    const claimRequests: RequestInit[] = [];
    let finishAttempts = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const name = url.split('/').at(-1);
      calls.push(name ?? 'unknown');
      if (name === 'finish_game') {
        finishAttempts += 1;
        return finishAttempts === 1 ? firstFinish.promise : secondFinish.promise;
      }
      if (name === 'claim_match') claimRequests.push(required(init, 'claim_match request'));
      return Promise.resolve(response(false, 503));
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchMock);
    const client = await gameOverClient({ access_token: 'account-bearer-secret' });
    const completedState = completeStateSnapshot(client);
    const actionTracking = actionTrackingSnapshot(client);

    client.start();
    rafCallback?.(0);
    rafCallback?.(16);
    expect(calls).toEqual(['finish_game']);
    expect(completeStateSnapshot(client)).toEqual(completedState);
    expect(actionTrackingSnapshot(client)).toEqual(actionTracking);

    firstFinish.resolve(response(false, 503));
    await settle();
    expect(calls).toEqual(['finish_game']);

    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toEqual(['finish_game', 'finish_game']);
    secondFinish.resolve(response(false, 503));
    await settle();
    expect(calls).toEqual(['finish_game', 'finish_game', 'claim_match']);
    const firstClaimRequest = required(claimRequests[0], 'first claim_match request');
    expect(firstClaimRequest.headers).toEqual({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer account-bearer-secret',
      'apikey': 'anon-key-test',
    });
    expect(JSON.parse(required(firstClaimRequest.body as string | undefined, 'claim_match body'))).toEqual({
      roomId: 'room-1',
      playerId: 'player-abc',
      token: 'seat-token-secret',
    });

    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(calls).toEqual(['finish_game', 'finish_game', 'claim_match', 'claim_match']);
    expect(completeStateSnapshot(client)).toEqual(completedState);
    expect(actionTrackingSnapshot(client)).toEqual(actionTracking);
    expect(client.getState().phase).toBe('GAME_OVER');

    expect(error).toHaveBeenLastCalledWith('NetworkClient: claim_match error');
    expect(error.mock.calls.at(-1)).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    client.stop();
  });

  it('does not post claim_match for anonymous completion', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url.split('/').at(-1) ?? 'unknown');
      return response(true, 200);
    }));
    const client = await gameOverClient(null);

    client.start();
    rafCallback?.(0);
    await settle();

    expect(calls).toEqual(['finish_game']);
    client.stop();
  });
});
