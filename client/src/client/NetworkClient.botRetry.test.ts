/**
 * NetworkClient.botRetry.test.ts — client-driven CPU seat self-heal (#119 /
 * reliability-002).
 *
 * A single-driver networked room (one human driving all bots) must not wedge when a
 * fire-and-forget bot submit fails: the driver has to re-attempt the bot's action on a
 * later frame. These exercise OBSERVABLE behavior — how many times submit_action is
 * POSTed across rAF frames — through the public API and the two captured seams (the
 * Realtime INSERT handler + the subscribe status callback), plus a stubbed
 * requestAnimationFrame so a frame can be pumped deterministically.
 *
 * Determinism (ADR-0002) is untouched: the submitted action is the same deterministic
 * plan every client computes, and exactly-once stays enforced by the referee's
 * seq-unique + turn-cursor — a retried submit the referee already has is a harmless
 * no-op (seq_conflict), which this driver then latches.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NetworkClient } from './NetworkClient';
import type { NetworkAction } from '@shared/net/replay';

// p1 is THIS client (a human); p2 is a CPU seat this client drives.
const OPTIONS = {
  maxPlayers: 2,
  seed: 1,
  players: [
    { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
    { id: 'bot-def', name: 'CPU 1', color: '#4d8ce8', ai: 'easy' as const },
  ],
};

type QueryResult = { data: unknown; error: { message?: string } | null };

interface Captured {
  insertHandler: ((p: { new: unknown }) => void) | null;
  statusCb: ((s: string) => void) | null;
}

/** Minimal SupabaseClient stand-in (mirrors NetworkClient.lockstep.test.ts). */
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

const fire = (angle = 45, power = 50): NetworkAction => ({ type: 'fire', angle, power, weapon: 'baby_missile' });

/** A committed fire by p1 (the opener) at seq 0 — after replay the turn is p2's (the bot). */
function p1FireRow() {
  return { new: { id: 'r0', room_id: 'room-1', seq: 0, player_id: 'player-abc', action: fire(), created_at: '' } };
}

/** Let queued microtasks + setTimeout(0) settle (so a fetch .then/.catch runs). */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('NetworkClient — client-driven bot submit self-heal (#119)', () => {
  let rafCb: FrameRequestCallback | null = null;

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
    // Capture the rAF loop callback so frames can be pumped one at a time.
    rafCb = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafCb = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /** Run one rAF frame (emitState -> maybeDriveBot), then let async fetch handlers settle. */
  async function pumpFrame(): Promise<void> {
    rafCb?.(0);
    await settle();
  }

  /** Build a client already at the bot's (p2) turn, with the rAF loop started. */
  async function botTurnClient(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchMock);
    // initialize() replays p1's committed fire and ticks to completion, handing the
    // turn to p2 (the bot). maybeDriveBot is suppressed during replay (isReplaying).
    const { supabase } = makeFakeSupabase([{ data: [p1FireRow().new], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS);
    await client.initialize();
    expect(client.getState().activePlayerId).toBe('p2'); // bot holds the turn
    client.start();
    return client;
  }

  it('re-attempts a bot submit after a transient failure (does not wedge) — OB-1', async () => {
    // Every submit_action POST fails with a non-conflict 500 (the RPC errored, so the
    // action did NOT commit). A correct driver must retry on a later frame.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Failed to submit action' }),
    });
    const client = await botTurnClient(fetchMock);

    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(1); // first attempt fired

    await pumpFrame();
    // BUG (#119): lastBotKey was latched before the POST and never cleared on failure,
    // so this second frame is suppressed and the room wedges forever -> still 1 call.
    // FIX: the failed submit self-heals, so the bot action is re-attempted here.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    client.stop();
  });

  it('latches a committed bot submit — no duplicate POST across frames — OB-2', async () => {
    // The POST is accepted. Exactly-once (ADR-0002): once committed, the driver must not
    // re-submit the same phase, no matter how many frames pass.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
    const client = await botTurnClient(fetchMock);

    await pumpFrame();
    await pumpFrame();
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(1); // committed on frame 1, latched thereafter

    client.stop();
  });

  it('does not spam duplicate submits while one POST is in flight — OB-3', async () => {
    // A fetch that never resolves keeps the phase in flight. The per-frame emitState
    // cadence must not fire a second POST while the first is outstanding.
    const fetchMock = vi.fn().mockReturnValue(new Promise<never>(() => {}));
    const client = await botTurnClient(fetchMock);

    await pumpFrame();
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(1); // in-flight guard blocks the second frame

    client.stop();
  });

  it('latches when a racer already committed the bot action (seq_conflict) — OB-4', async () => {
    // The COMMON exactly-once outcome: another client won the race, so the referee
    // returns seq_conflict. The action IS on the log, so the driver must latch, not retry.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'seq_conflict', retry: true }),
    });
    const client = await botTurnClient(fetchMock);

    await pumpFrame();
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(1); // conflict = committed elsewhere -> latched

    client.stop();
  });

  it('re-attempts after a network-level error (fetch rejects) — OB-5', async () => {
    // The COMMON transient: the POST never reaches the server. Nothing committed, so
    // the driver must clear the in-flight mark and retry on the next frame.
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    const client = await botTurnClient(fetchMock);

    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(2); // self-heal on the .catch path

    client.stop();
  });

  it('latches when the referee says the turn already advanced ("Not your turn") — OB-6', async () => {
    // A rare desync where the referee rejects with "Not your turn": the turn moved on
    // (someone committed), so re-attempting is pointless — latch instead of spinning.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'Not your turn' }),
    });
    const client = await botTurnClient(fetchMock);

    await pumpFrame();
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(1); // turn advanced -> latched, no spin

    client.stop();
  });
});
