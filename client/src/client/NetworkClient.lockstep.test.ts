/**
 * NetworkClient.lockstep.test.ts — behavioral coverage of the deterministic
 * lockstep core (ADR-0002).
 *
 * These exercise OBSERVABLE behavior through the public API and the two captured
 * Realtime seams (the room_actions INSERT handler and the subscribe status
 * callback), never engine internals:
 *   - initialize() replays the existing action log into the local engine.
 *   - Out-of-order Realtime delivery is buffered and flushed in strict seq order.
 *   - Already-applied (stale) seqs are dropped, never double-applied.
 *   - Connection state transitions (connecting → reconnecting → connected).
 *   - A reconnect re-fetches actions missed during the outage (resyncLog).
 *   - sendAction: a fire POSTs submit_action and is NOT applied locally; an aim
 *     action applies locally with no network; input off-turn is ignored.
 *
 * Seams: the SupabaseClient object (from()/channel()) is faked; submit_action
 * goes through global fetch, mocked as in NetworkClient.requestRematch.test.ts.
 * No real network, no dev server.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NetworkClient } from './NetworkClient';
import type { NetworkAction } from '@shared/net/replay';
import type { ConnectionState } from './GameClient';

const OPTIONS = {
  maxPlayers: 2,
  seed: 1,
  players: [
    { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
    { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
  ],
};

type QueryResult = { data: unknown; error: { message?: string } | null };

interface Captured {
  insertHandler: ((p: { new: unknown }) => void) | null;
  statusCb: ((s: string) => void) | null;
}

/** Minimal SupabaseClient stand-in (see NetworkClient.initializeGap.test.ts for the shape). */
function makeFakeSupabase(results: QueryResult[]): { supabase: SupabaseClient; captured: Captured } {
  const state = { idx: 0 };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'abortSignal']) builder[m] = () => builder;
  builder.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(results[state.idx++] ?? { data: [], error: null }).then(resolve, reject);

  const captured: Captured = { insertHandler: null, statusCb: null };
  const makeChannel = () => {
    const ch: Record<string, unknown> = {};
    ch.on = (_e: unknown, _f: unknown, handler: (p: { new: unknown }) => void) => {
      if (!captured.insertHandler) captured.insertHandler = handler;
      return ch;
    };
    ch.subscribe = (cb?: (s: string) => void) => {
      if (cb && !captured.statusCb) captured.statusCb = cb;
      return ch;
    };
    return ch;
  };
  const supabase = {
    from: () => builder,
    channel: () => makeChannel(),
    removeChannel: () => {},
  } as unknown as SupabaseClient;
  return { supabase, captured };
}

/** Build a room_actions INSERT payload. */
function row(seq: number, action: NetworkAction) {
  return { new: { id: `r${seq}`, room_id: 'room-1', seq, player_id: 'player-abc', action, created_at: '' } };
}

const fire = (angle = 45, power = 50): NetworkAction => ({ type: 'fire', angle, power, weapon: 'baby_missile' });

/** Let queued microtasks + setTimeout(0) settle. */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('NetworkClient — deterministic lockstep core', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('replays the existing action log during initialize() — a logged fire advances the turn', async () => {
    // A single committed fire by p1 (the opener). After replay the round advances to p2.
    const { supabase } = makeFakeSupabase([{ data: [row(0, fire()).new], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS);

    expect(client.getState().activePlayerId).toBe('p1');
    await client.initialize();

    // The replayed fire ticked to completion (isReplaying path) and handed the turn to p2.
    expect(client.getState().activePlayerId).toBe('p2');
  });

  it('buffers an out-of-order Realtime action and applies it only once the gap fills', async () => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS);
    await client.initialize();
    captured.statusCb?.('SUBSCRIBED');
    await settle();

    // Deliver seq=1 BEFORE seq=0. nextExpectedSeq is 0, so seq=1 must be held.
    captured.insertHandler?.(row(1, fire()));
    expect(client.getState().phase).toBe('PLAYER_TURN'); // nothing applied — gap at seq 0

    // Now seq=0 arrives: it applies (engine → FIRING), and seq=1 stays buffered behind
    // the in-flight shot (drained by the RAF loop in real play). Ordering preserved.
    captured.insertHandler?.(row(0, fire()));
    expect(client.getState().phase).toBe('FIRING');
  });

  it('drops a stale (already-applied) Realtime seq without double-applying', async () => {
    // Log already has seq=0 (a fire) → nextExpectedSeq becomes 1, engine on p2's turn.
    const { supabase, captured } = makeFakeSupabase([{ data: [row(0, fire()).new], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS);
    await client.initialize();
    captured.statusCb?.('SUBSCRIBED');
    await settle();
    expect(client.getState().activePlayerId).toBe('p2');

    // A duplicate delivery of seq=0 must be ignored (shouldBufferSeq gate) — no re-fire.
    captured.insertHandler?.(row(0, fire()));
    expect(client.getState().activePlayerId).toBe('p2'); // unchanged, not double-applied
  });

  it('reports connection state transitions to subscribers', async () => {
    const { supabase, captured } = makeFakeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS);
    const seen: ConnectionState[] = [];
    client.onConnectionChange((s) => seen.push(s)); // primes with current state

    await client.initialize();
    captured.statusCb?.('SUBSCRIBED');
    await settle();
    captured.statusCb?.('CHANNEL_ERROR');
    captured.statusCb?.('SUBSCRIBED');
    await settle();

    expect(seen[0]).toBe('connecting');        // primed
    expect(seen).toContain('connected');
    expect(seen).toContain('reconnecting');
    expect(seen[seen.length - 1]).toBe('connected'); // recovered
  });

  it('re-fetches actions missed during an outage on re-subscribe', async () => {
    // result[0]: initial fetch (empty). result[1]: first-SUBSCRIBED resync (empty).
    // result[2]: re-subscribe resync — carries a fire committed while we were down.
    const { supabase, captured } = makeFakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
      { data: [row(0, fire()).new], error: null },
    ]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS);
    await client.initialize();

    captured.statusCb?.('SUBSCRIBED'); // first subscribe — resync #1 (empty)
    await settle();
    expect(client.getState().activePlayerId).toBe('p1');

    captured.statusCb?.('CHANNEL_ERROR');  // socket drops
    captured.statusCb?.('SUBSCRIBED');     // recovers — resync #2 picks up the missed fire
    await settle();

    // The missed fire is applied on recovery (engine → FIRING). Unlike initialize()
    // replay, a live/resync apply is NOT ticked to completion here — the RAF loop
    // (start(), not called in this unit test) would advance the turn to p2.
    expect(client.getState().phase).toBe('FIRING');
  });

  it('sendAction(fire) POSTs submit_action and does NOT apply the shot locally', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { supabase } = makeFakeSupabase([{ data: [], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS);
    await client.initialize();

    // Commit an aim, then fire. It's p1's turn (this client).
    client.sendAction({ type: 'set_angle', angle: 30 });
    client.sendAction({ type: 'set_power', power: 70 });
    client.sendAction({ type: 'fire' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/functions/v1/submit_action');
    const body = JSON.parse(init.body as string);
    expect(body.roomId).toBe('room-1');
    expect(body.action).toMatchObject({ type: 'fire', angle: 30, power: 70, weapon: 'baby_missile' });

    // The shot is applied by the Realtime echo, NOT locally — engine stays put, input locks.
    expect(client.getState().phase).toBe('PLAYER_TURN');
    expect(client.isFiring).toBe(true);
  });

  it('sendAction ignores input when it is not this client’s turn', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    // Log already advanced the turn to p2 (opponent). This client is p1.
    const { supabase, captured } = makeFakeSupabase([{ data: [row(0, fire()).new], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS);
    await client.initialize();
    captured.statusCb?.('SUBSCRIBED');
    await settle();
    expect(client.getState().activePlayerId).toBe('p2');

    client.sendAction({ type: 'fire' }); // not our turn — must be a no-op
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.isFiring).toBe(false);
  });

  it('sendAction applies an aim action locally with no network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { supabase } = makeFakeSupabase([{ data: [], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS);
    await client.initialize();

    client.sendAction({ type: 'set_angle', angle: 12 });
    const p1 = client.getState().tanks.find((t) => t.id === 'p1');
    expect(p1?.angle).toBe(12);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
