/**
 * NetworkClient.initializeGap.test.ts — the initialize() fetch-then-subscribe
 * gap (#118, reliability-001).
 *
 * initialize() fetches the action log, THEN subscribes to Realtime INSERTs. An
 * action committed in the window between the fetch snapshot and the subscription
 * going live (first SUBSCRIBED) is in neither: the fetch already returned without
 * it, and the INSERT fired before the channel was live. Because flushPendingActions
 * only ever consumes the exact nextExpectedSeq, that hole wedges the client — every
 * later seq buffers behind the missing one forever.
 *
 * The fix reuses the existing idempotent resyncLog() catch-up: run it once after the
 * FIRST SUBSCRIBED (not only on a re-subscribe), re-fetching from nextExpectedSeq so
 * the missed row is picked up and flushed.
 *
 * The seam is the SupabaseClient object (not global fetch): initialize() calls
 * `supabase.from('room_actions').select()...` for the fetch and `supabase.channel()
 * .on().subscribe(statusCb)` for the subscription. The fake below drives both — the
 * status callback is captured so the test can fire 'SUBSCRIBED' at will, modelling
 * the exact async ordering that opens the gap.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NetworkClient } from './NetworkClient';

const OPTIONS = {
  maxPlayers: 2,
  seed: 1,
  players: [
    { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
    { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
  ],
};

type QueryResult = { data: unknown; error: { message?: string } | null };

/**
 * A minimal SupabaseClient stand-in.
 *
 * - `from()` returns a chainable thenable builder that resolves the next queued
 *   result — result[0] is initialize()'s log fetch, result[1] is resyncLog()'s
 *   re-fetch. Every builder method returns the builder, so it works regardless of
 *   where a given query chain ends (.order() for the fetch, .abortSignal() for resync).
 * - `channel()` captures the FIRST on-handler (the room_actions INSERT handler) and
 *   the FIRST subscribe status callback (the room_actions channel's), so the test can
 *   drive delivery and lifecycle by hand. The second (rooms:game) channel subscribes
 *   with no callback and is inert here.
 */
function makeFakeSupabase(results: QueryResult[]): {
  supabase: SupabaseClient;
  captured: { insertHandler: ((p: { new: unknown }) => void) | null; statusCb: ((s: string) => void) | null };
  fromCalls: number;
} {
  const state = { idx: 0, fromCalls: 0 };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'abortSignal']) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(results[state.idx++] ?? { data: [], error: null }).then(resolve, reject);

  const captured: {
    insertHandler: ((p: { new: unknown }) => void) | null;
    statusCb: ((s: string) => void) | null;
  } = { insertHandler: null, statusCb: null };

  const makeChannel = () => {
    const ch: Record<string, unknown> = {};
    ch.on = (_event: unknown, _filter: unknown, handler: (p: { new: unknown }) => void) => {
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
    from: () => {
      state.fromCalls++;
      return builder;
    },
    channel: () => makeChannel(),
    removeChannel: () => {},
  } as unknown as SupabaseClient;

  return { supabase, captured, get fromCalls() { return state.fromCalls; } };
}

/** Let queued microtasks + a setTimeout(0) settle (resyncLog is async). */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

const MISSED_FIRE = {
  seq: 0,
  action: { type: 'fire', angle: 45, power: 50, weapon: 'baby_missile' },
};

describe('NetworkClient.initialize() fetch-then-subscribe gap (#118)', () => {
  it('applies an action committed in the initial fetch→subscribe gap once the subscription goes live', async () => {
    // result[0]: initialize()'s log fetch — EMPTY (the gap action is not in the snapshot).
    // result[1]: resyncLog()'s re-fetch after the first SUBSCRIBED — carries the missed seq=0.
    const { supabase, captured } = makeFakeSupabase([
      { data: [], error: null },
      { data: [MISSED_FIRE], error: null },
    ]);

    const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS);
    await client.initialize();

    // Precondition: the empty snapshot left the engine untouched, awaiting seq 0.
    expect(client.getState().phase).toBe('PLAYER_TURN');

    // The subscription goes live AFTER the fetch — the exact window the seq=0 fire
    // committed in and was never delivered as an INSERT.
    captured.statusCb?.('SUBSCRIBED');
    await settle();

    // The missed fire must now be applied: the engine has left PLAYER_TURN for FIRING.
    // With the bug (resync gated to re-subscribe only) it stalls in PLAYER_TURN forever.
    expect(client.getState().phase).toBe('FIRING');
  });

  it('is a no-op when the first SUBSCRIBED finds no gap (idempotent catch-up)', async () => {
    // No gap: the log fetch already had everything, so the resync re-fetch returns nothing new.
    const { supabase, captured } = makeFakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
    ]);

    const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS);
    await client.initialize();

    captured.statusCb?.('SUBSCRIBED');
    await settle();

    // Nothing to catch up on — engine remains cleanly in PLAYER_TURN, not wedged.
    expect(client.getState().phase).toBe('PLAYER_TURN');
  });
});
