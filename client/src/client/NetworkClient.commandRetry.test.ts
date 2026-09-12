import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NetworkAction } from '@shared/net/replay';
import type { PlayerAction } from '@shared/types/PlayerAction';
import { NetworkClient } from './NetworkClient';

const OPTIONS = {
  maxPlayers: 2,
  seed: 1,
  rulesetVersion: 4 as const,
  players: [
    { id: 'seat-a', name: 'Alice', color: '#e84d4d' },
    { id: 'seat-b', name: 'Bob', color: '#4d8ce8' },
  ],
};

type QueryResult = { data: unknown; error: { message?: string } | null };

function commandRow(seq: number, intentId: string, action: NetworkAction, actorPlayerId = 'seat-a') {
  return {
    id: `row-${seq}`,
    room_id: 'room-1',
    seq,
    player_id: actorPlayerId,
    action,
    created_at: '',
    command_version: 2,
    intent_id: intentId,
    expected_revision: seq,
    submitted_by: 'seat-a',
    command_ends_turn: action.type === 'fire' || action.type === 'use_shield',
    command_next_index: action.type === 'fire' || action.type === 'use_shield' ? 1 : null,
    command_round_over: false,
  };
}

function makeFakeSupabase(results: Array<QueryResult | Promise<QueryResult>>) {
  const state = { index: 0 };
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'order', 'abortSignal']) builder[method] = () => builder;
  builder.then = (resolve: (value: QueryResult) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(results[state.index++] ?? { data: [], error: null }).then(resolve, reject);

  const captured: { insert: ((payload: { new: unknown }) => void) | null } = { insert: null };
  const channel = () => {
    const result: Record<string, unknown> = {};
    result.on = (_event: unknown, filter: { table?: string }, handler: (payload: { new: unknown }) => void) => {
      if (filter.table === 'room_actions') captured.insert = handler;
      return result;
    };
    result.subscribe = () => result;
    result.send = () => Promise.resolve();
    return result;
  };
  const supabase = {
    from: () => builder,
    channel,
    removeChannel: () => undefined,
  } as unknown as SupabaseClient;
  return { supabase, captured };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function receipt(intentId: string, seq = 0) {
  return {
    ok: true,
    protocolVersion: 2,
    intentId,
    seq,
    revision: seq + 1,
    actorPlayerId: 'seat-a',
    actorTankId: 'p1',
  };
}

describe('NetworkClient command-v2 retry and reconciliation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'human-intent-1') });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('retries response loss with one immutable envelope and unlocks only from its ordered echo', async () => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('response lost after commit'))
      .mockResolvedValueOnce({ ok: true, json: async () => receipt('human-intent-1') });
    vi.stubGlobal('fetch', fetchMock);
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    await settle();
    await vi.advanceTimersByTimeAsync(200);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
    const retryBody = (fetchMock.mock.calls[1]?.[1] as RequestInit).body;
    expect(retryBody).toBe(firstBody);
    expect(JSON.parse(firstBody as string)).toMatchObject({
      roomId: 'room-1', playerId: 'seat-a', token: 'seat-token', rulesetVersion: 4,
      command: {
        version: 2, intentId: 'human-intent-1', expectedRevision: 0, actorPlayerId: 'seat-a',
        action: { type: 'fire', angle: 45, power: 50, weapon: 'baby_missile' },
      },
    });
    expect(JSON.parse(firstBody as string)).not.toHaveProperty('action');
    expect(client.isFiring).toBe(true);

    captured.insert?.({ new: commandRow(0, 'human-intent-1', {
      type: 'fire', angle: 45, power: 50, weapon: 'baby_missile',
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });
    expect(client.getState().phase).toBe('FIRING');
    expect(client.isFiring).toBe(false);
    const inventoryAfterEcho = client.getState().tanks[0]!.inventory.baby_missile.count;

    captured.insert?.({ new: commandRow(0, 'human-intent-1', {
      type: 'fire', angle: 45, power: 50, weapon: 'baby_missile',
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });
    expect(client.getState().tanks[0]!.inventory.baby_missile.count).toBe(inventoryAfterEcho);
  });

  it('settles a default-shield command from the server-shaped row that omits its default weapon', async () => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'shield-intent') });
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    const failures: string[] = [];
    client.onFireFailed((message) => failures.push(message));
    await client.initialize();
    client.getState().tanks[0]!.inventory.shield.count = 1;

    client.sendAction({ type: 'use_shield', weapon: 'shield' });
    const submitted = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(submitted.command.action).toEqual({ type: 'use_shield', weapon: 'shield' });
    expect(client.isFiring).toBe(true);

    captured.insert?.({ new: commandRow(0, 'shield-intent', {
      type: 'use_shield', commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });

    expect(client.getState().tanks[0]!.shieldHp).toBeGreaterThan(0);
    expect(client.getState().activePlayerId).toBe('p2');
    expect(client.isFiring).toBe(false);
    expect(failures).toEqual([]);
  });

  it('does not equate an omitted default shield with a pending heavy shield', async () => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'heavy-shield-intent') });
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    const failures: string[] = [];
    client.onFireFailed((message) => failures.push(message));
    await client.initialize();
    client.getState().tanks[0]!.inventory.shield.count = 1;
    client.getState().tanks[0]!.inventory.heavy_shield.count = 1;

    client.sendAction({ type: 'use_shield', weapon: 'heavy_shield' });
    captured.insert?.({ new: commandRow(0, 'heavy-shield-intent', {
      type: 'use_shield', commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });

    expect(client.getState().tanks[0]!.inventory.shield.count).toBe(0);
    expect(client.getState().tanks[0]!.inventory.heavy_shield.count).toBe(1);
    expect(client.getState().activePlayerId).toBe('p2');
    expect(client.isFiring).toBe(false);
    expect(failures).toEqual(['Turn changed — review the updated game and try again.']);
  });

  it('keeps an actor-mismatched row unconsumed and keeps input locked', async () => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => receipt('human-intent-1'),
    }));
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    await client.initialize();
    client.sendAction({ type: 'fire' });
    await settle();

    expect(() => captured.insert?.({ new: commandRow(0, 'human-intent-1', {
      type: 'fire', angle: 45, power: 50, weapon: 'baby_missile',
      commandActor: { role: 'engine-seat', tankId: 'p2' },
    }, 'seat-a') })).not.toThrow();

    const ordered = client as unknown as {
      orderedActions: { nextExpectedSeq: number; pendingSequences: number[] };
    };
    expect(ordered.orderedActions.nextExpectedSeq).toBe(0);
    expect(ordered.orderedActions.pendingSequences).toEqual([0]);
    expect(client.getState().phase).toBe('PLAYER_TURN');
    expect(client.isFiring).toBe(true);
  });

  it.each([
    ['protocol', { protocolVersion: 1 }],
    ['intent', { intentId: 'another-intent' }],
    ['sequence', { seq: 99 }],
    ['revision', { revision: 99 }],
    ['player', { actorPlayerId: 'seat-b' }],
    ['tank', { actorTankId: 'p2' }],
  ])('rejects a success receipt bound to the wrong %s without unlocking, applying, or rebinding', async (_field, mismatch) => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...receipt('human-intent-1'), ...mismatch }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const randomUUID = vi.fn(() => 'human-intent-1');
    vi.stubGlobal('crypto', { randomUUID });
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    const fireFailed = vi.fn();
    client.onFireFailed(fireFailed);
    await client.initialize();
    const inventoryBefore = client.getState().tanks[0]!.inventory.baby_missile.count;

    client.sendAction({ type: 'fire' });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(client.getState().phase).toBe('PLAYER_TURN');
    expect(client.getState().tanks[0]!.inventory.baby_missile.count).toBe(inventoryBefore);
    expect(client.isFiring).toBe(true);
    expect(fireFailed).toHaveBeenCalledWith('Command receipt mismatch — reload to continue.');

    client.sendAction({ type: 'fire' });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(randomUUID).toHaveBeenCalledTimes(1);

    captured.insert?.({ new: commandRow(0, 'human-intent-1', {
      type: 'fire', angle: 45, power: 50, weapon: 'baby_missile',
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });
    expect(client.getState().phase).toBe('FIRING');
    expect(client.isFiring).toBe(false);
  });

  it.each([
    ['null', null],
    ['primitive', 7],
    ['missing fields', { ok: true, protocolVersion: 2 }],
  ])('handles a %s receipt without an unhandled rejection or response authority', async (_shape, responseBody) => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => responseBody }));
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    const failure = vi.fn();
    client.onFireFailed(failure);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    await settle();

    expect(client.getState().phase).toBe('PLAYER_TURN');
    expect(client.isFiring).toBe(true);
    expect(failure).toHaveBeenCalledWith('Command receipt mismatch — reload to continue.');
    captured.insert?.({ new: commandRow(0, 'human-intent-1', {
      type: 'fire', angle: 45, power: 50, weapon: 'baby_missile',
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });
    expect(client.getState().phase).toBe('FIRING');
    expect(client.isFiring).toBe(false);
  });

  it('does not arm an unsent fire while a move command is pending', async () => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    const failure = vi.fn();
    client.onFireFailed(failure);
    await client.initialize();

    client.sendAction({ type: 'move', delta: 8 });
    client.sendAction({ type: 'fire' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.isFiring).toBe(false);
    expect(failure).toHaveBeenCalledWith('Another action is still pending.');

    captured.insert?.({ new: commandRow(0, 'human-intent-1', {
      type: 'move', delta: 8, commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });
    expect(client.isFiring).toBe(false);
  });

  it.each([
    ['move', { type: 'move', delta: 8 } satisfies PlayerAction],
    ['buy', { type: 'buy', weapon: 'missile' } satisfies PlayerAction],
  ])('makes a timed-out %s explicitly retryable with the same command body', async (_kind, action) => {
    const { supabase } = makeFakeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    const randomUUID = vi.fn(() => 'human-intent-1');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID });
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    await client.initialize();

    client.sendAction(action);
    const firstBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
    await vi.advanceTimersByTimeAsync(9_000);
    await settle();
    client.sendAction(action);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(firstBody);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(client.isFiring).toBe(false);
  });

  it('times out a non-cooperating transport and explicitly retries the same displayed shot identity', async () => {
    const { supabase } = makeFakeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    const randomUUID = vi.fn(() => 'human-intent-1');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID });
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    const failure = vi.fn();
    client.onFireFailed(failure);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    const firstBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
    client.sendAction({ type: 'set_angle', angle: 60 });
    expect(client.getState().tanks[0]!.angle).toBe(45);
    expect(failure).toHaveBeenCalledWith('Another action is still pending.');

    await vi.advanceTimersByTimeAsync(9_000);
    await settle();
    expect(client.isFiring).toBe(false);
    client.sendAction({ type: 'fire' });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(firstBody);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(client.isFiring).toBe(true);
  });

  it('bounds a non-cooperating response body and retains its exact command for explicit retry', async () => {
    const { supabase } = makeFakeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    const never = new Promise<unknown>(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ json: () => never });
    const randomUUID = vi.fn(() => 'human-intent-1');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID });
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    const firstBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
    await vi.advanceTimersByTimeAsync(9_000);
    await settle();
    expect(client.isFiring).toBe(false);

    client.sendAction({ type: 'fire' });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(firstBody);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('logs a sanitized client desync diagnostic for a not-your-turn refusal', async () => {
    const { supabase } = makeFakeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, error: 'Not your turn' }),
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'secret-seat-token', 2);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    await settle();

    expect(warn).toHaveBeenCalledWith(
      'NetworkClient: submit_action "Not your turn" — possible desync',
      { roomId: 'room-1', localActivePlayerId: 'p1' },
    );
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('secret-seat-token');
    expect(logged).not.toContain('human-intent-1');
    expect(logged).not.toContain('baby_missile');
  });

  it('handles the actual v2 not_your_turn refusal as a resync conflict with sanitized diagnostics', async () => {
    const winningFire = commandRow(0, 'winning-intent', {
      type: 'fire', angle: 45, power: 50, weapon: 'baby_missile',
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    });
    const { supabase } = makeFakeSupabase([
      { data: [], error: null },
      { data: [winningFire], error: null },
    ]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ ok: false, error: 'not_your_turn' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = vi.fn();
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'secret-seat-token', 2);
    client.onFireFailed(failure);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    await settle();
    await vi.waitFor(() => expect(failure).toHaveBeenCalledWith(
      'Turn changed — review the updated game and try again.',
    ));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.getState().phase).toBe('FIRING');
    expect(client.getState().projectile).not.toBeNull();
    expect(client.isFiring).toBe(false);
    expect(failure).toHaveBeenCalledWith('Turn changed — review the updated game and try again.');
    expect(warn).toHaveBeenCalledWith(
      'NetworkClient: submit_action "Not your turn" — possible desync',
      { roomId: 'room-1', localActivePlayerId: 'p1' },
    );
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('secret-seat-token');
    expect(logged).not.toContain('human-intent-1');
    expect(logged).not.toContain('baby_missile');
  });

  it('retains one immutable human intent when the v2 mapper returns an opaque 500', async () => {
    const { supabase, captured } = makeFakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ ok: false, error: 'Failed to submit command' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => receipt('human-intent-1'),
      });
    vi.stubGlobal('fetch', fetchMock);
    const randomUUID = vi.fn()
      .mockReturnValueOnce('human-intent-1')
      .mockReturnValueOnce('human-intent-2');
    vi.stubGlobal('crypto', { randomUUID });
    const failure = vi.fn();
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    client.onFireFailed(failure);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    await settle();
    await vi.waitFor(() => expect(failure).toHaveBeenCalledWith(
      'Server response uncertain — retry the same action.',
    ));
    const firstBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.isFiring).toBe(false);
    expect(failure).toHaveBeenCalledWith('Server response uncertain — retry the same action.');

    client.sendAction({ type: 'fire' });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(firstBody);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(client.isFiring).toBe(true);

    captured.insert?.({ new: commandRow(0, 'human-intent-1', {
      type: 'fire', angle: 45, power: 50, weapon: 'baby_missile',
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });
    expect(client.isFiring).toBe(false);
  });

  it('recovers a command committed before an opaque v2 500 without posting it again', async () => {
    const committed = commandRow(0, 'human-intent-1', {
      type: 'fire', angle: 45, power: 50, weapon: 'baby_missile',
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    });
    const { supabase, captured } = makeFakeSupabase([
      { data: [], error: null },
      { data: [committed], error: null },
    ]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'Failed to submit command' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    await settle();
    await vi.waitFor(() => expect(client.getState().phase).toBe('FIRING'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const projectileAfterRecovery = client.getState().projectile;
    expect(projectileAfterRecovery).not.toBeNull();
    expect(client.isFiring).toBe(false);
    captured.insert?.({ new: committed });
    expect(client.getState().projectile).toBe(projectileAfterRecovery);
    await vi.advanceTimersByTimeAsync(9_000);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['invalid_command', 400],
    ['not_room_member', 403],
    ['invalid_seat_token', 403],
    ['actor_not_in_room', 403],
    ['cannot_proxy_human', 403],
    ['shop_actor_mismatch', 403],
    ['room_not_found', 404],
    ['room_not_active', 409],
    ['command_protocol_mismatch', 409],
    ['command_protocol_unavailable', 409],
    ['ruleset_mismatch', 409],
    ['ruleset_unavailable', 409],
  ])('releases a human command after the mapped %s/%i refusal', async (error, status) => {
    const { supabase } = makeFakeSupabase([{ data: [], error: null }]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ ok: false, error }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const failure = vi.fn();
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    client.onFireFailed(failure);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.isFiring).toBe(false);
    expect(failure).toHaveBeenCalledWith('Action failed — try again.');
  });

  it('keeps an unknown HTTP failure fail-closed until its ordered echo decides authority', async () => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 418,
      json: async () => ({ ok: false, error: 'future_command_failure' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const failure = vi.fn();
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    client.onFireFailed(failure);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.isFiring).toBe(true);
    expect(failure).toHaveBeenCalledWith('Command receipt mismatch — reload to continue.');
    client.sendAction({ type: 'fire' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    captured.insert?.({ new: commandRow(0, 'human-intent-1', {
      type: 'fire', angle: 45, power: 50, weapon: 'baby_missile',
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });
    expect(client.isFiring).toBe(false);
  });

  it('prevents an old same-generation recovery from unlocking a newer delivery epoch', async () => {
    let resolveOld!: (value: QueryResult) => void;
    const oldRecovery = new Promise<QueryResult>((resolve) => { resolveOld = resolve; });
    const { supabase } = makeFakeSupabase([{ data: [], error: null }, oldRecovery]);
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    const firstBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
    await vi.advanceTimersByTimeAsync(9_000);
    await vi.advanceTimersByTimeAsync(8_000);
    await settle();
    expect(client.isFiring).toBe(false);
    client.sendAction({ type: 'fire' });
    expect(client.isFiring).toBe(true);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(firstBody);
    resolveOld({ data: [], error: null });
    await settle();
    expect(client.isFiring).toBe(true);
  });

  it('resyncs a stale revision without automatically re-enveloping it for the advanced log', async () => {
    const canonicalMove = commandRow(0, 'other-intent', {
      type: 'move', delta: 8, commandActor: { role: 'engine-seat', tankId: 'p1' },
    });
    const { supabase } = makeFakeSupabase([
      { data: [], error: null },
      { data: [canonicalMove], error: null },
    ]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'revision_conflict', currentRevision: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => receipt('human-intent-2', 1) });
    vi.stubGlobal('fetch', fetchMock);
    const randomUUID = vi.fn()
      .mockReturnValueOnce('human-intent-1')
      .mockReturnValueOnce('human-intent-2');
    vi.stubGlobal('crypto', { randomUUID });
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    await client.initialize();
    const beforeX = client.getState().tanks[0]!.x;

    client.sendAction({ type: 'fire' });
    await settle();
    await vi.waitFor(() => expect(client.getState().tanks[0]!.x).not.toBe(beforeX));
    expect(client.getState().tanks[0]!.x).not.toBe(beforeX);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(randomUUID).toHaveBeenCalledTimes(1);

    client.sendAction({ type: 'fire' });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    const explicitRetry = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string);
    expect(first.command).toMatchObject({ intentId: 'human-intent-1', expectedRevision: 0 });
    expect(explicitRetry.command).toMatchObject({ intentId: 'human-intent-2', expectedRevision: 1 });
  });

  it('invalidates an uncertain retry without abandoning later canonical replay', async () => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    await client.initialize();
    const beforeX = client.getState().tanks[0]!.x;

    client.sendAction({ type: 'fire' });
    await settle();
    client.invalidatePendingCommands();
    expect(client.isFiring).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    captured.insert?.({ new: commandRow(0, 'canonical-after-invalidation', {
      type: 'move', delta: 8, commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });
    expect(client.getState().tanks[0]!.x).not.toBe(beforeX);
  });

  it('ignores a stale receipt-recovery callback after invalidation', async () => {
    let resolveRecovery!: (value: QueryResult) => void;
    const recovery = new Promise<QueryResult>((resolve) => { resolveRecovery = resolve; });
    const committed = commandRow(0, 'human-intent-1', {
      type: 'fire', angle: 45, power: 50, weapon: 'baby_missile',
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    });
    const { supabase, captured } = makeFakeSupabase([
      { data: [], error: null },
      recovery,
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => receipt('human-intent-1'),
    }));
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', OPTIONS, 'seat-token', 2);
    await client.initialize();

    client.sendAction({ type: 'fire' });
    await settle();
    client.invalidatePendingCommands();
    resolveRecovery({ data: [committed], error: null });
    await settle();
    expect(client.getState().phase).toBe('PLAYER_TURN');

    captured.insert?.({ new: committed });
    expect(client.getState().phase).toBe('FIRING');
  });

  it('drives a successor CPU command only after the canonical cursor commits', async () => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const human = OPTIONS.players[0];
    const bot = OPTIONS.players[1];
    if (!human || !bot) throw new Error('network CPU fixture requires two players');
    const options = {
      ...OPTIONS,
      players: [human, { ...bot, ai: 'easy' as const }],
    };
    const client = new NetworkClient(supabase, 'room-1', 'seat-a', options, 'seat-token', 2);
    await client.initialize();
    client.getState().tanks[0]!.inventory.shield.count = 1;

    client.sendAction({ type: 'fire' });
    captured.insert?.({ new: commandRow(0, 'other-human-intent', {
      type: 'use_shield',
      weapon: 'shield',
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    }) });

    expect(client.getState().activePlayerId).toBe('p2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(body.command.expectedRevision).toBe(1);
    client.stop();
  });
});
