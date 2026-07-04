/**
 * NetworkClient.sessionClear.test.ts — T-07 (rejoin-after-refresh #46, AC-04).
 *
 * Asserts the ONE-SHOT GAME_OVER hook in emitState() also clears the persisted
 * rejoin session descriptor (`singedterra:session`), alongside the existing
 * `callFinishGame` side effect.
 *
 * Driving a REAL engine to GAME_OVER (rather than faking the assertion) reuses
 * the exact tuning `scripts/checks/gameover.mjs` already proves deterministic:
 * seed 0x5eed1234 + a napalm shot at angle=27/power=68 lands on the far tank.
 * Mirroring that harness's TEST SETUP, the victim's health is lowered first
 * (a low-HP tank dies mid-burn, ending the — single-round-by-default — match
 * on that exact tick) so the shot is a reliable, deterministic kill rather
 * than a probabilistic direct hit. The shot is delivered as the room's
 * existing action-log row so `initialize()`'s replay-to-completion path (the
 * same seam `NetworkClient.lockstep.test.ts` uses) drives the ENGINE all the
 * way to GAME_OVER during replay. `initialize()`'s historical replay itself
 * never calls `emitState()` though (that only happens on a live Realtime
 * apply or a rAF frame) — the one-shot GAME_OVER hook lives inside
 * `emitState()`. So, matching real bootstrap (`initialize()` then `start()`),
 * this test also stubs `requestAnimationFrame` (the frame-pump seam
 * `NetworkClient.botRetry.test.ts` documents) and pumps exactly one frame
 * after `start()` to let `emitState()` observe the already-GAME_OVER engine
 * state and fire its one-shot clear.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NetworkClient } from './NetworkClient';
import type { NetworkAction } from '@shared/net/replay';
import { writeSession, readSession } from '../lib/sessionDescriptor';

// Same seed/aim `scripts/checks/gameover.mjs` uses: a napalm shot at
// angle=27/power=68 lands on the far tank under this seed.
const SEED = 0x5eed1234;
const OPTIONS = {
  maxPlayers: 2,
  seed: SEED,
  players: [
    { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
    { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
  ],
};

type QueryResult = { data: unknown; error: { message?: string } | null };

/** Minimal SupabaseClient stand-in (shape shared with the lockstep/initializeGap suites). */
function makeFakeSupabase(results: QueryResult[]): { supabase: SupabaseClient } {
  const state = { idx: 0 };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'abortSignal']) builder[m] = () => builder;
  builder.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(results[state.idx++] ?? { data: [], error: null }).then(resolve, reject);

  const makeChannel = () => {
    const ch: Record<string, unknown> = {};
    ch.on = () => ch;
    ch.subscribe = () => ch;
    return ch;
  };
  const supabase = {
    from: () => builder,
    channel: () => makeChannel(),
    removeChannel: () => {},
  } as unknown as SupabaseClient;
  return { supabase };
}

const NAPALM_KILL_SHOT: NetworkAction = { type: 'fire', angle: 27, power: 68, weapon: 'napalm' };

function row(seq: number, action: NetworkAction) {
  return { new: { id: `r${seq}`, room_id: 'room-1', seq, player_id: 'player-abc', action, created_at: '' } };
}

/** The private `engine` field, reached the same way the other NetworkClient
 *  suites reach private internals — here only to reproduce gameover.mjs's
 *  TEST SETUP (grant napalm ammo + lower the victim's HP) before replay. */
interface EngineAccess {
  engine: {
    getState(): { tanks: Array<{ id: string; health: number; inventory: Record<string, { count: number; unlimited: boolean }> }> };
  };
}
function engineOf(client: NetworkClient): EngineAccess['engine'] {
  return (client as unknown as EngineAccess).engine;
}

describe('NetworkClient — clearSession() on GAME_OVER (T-07, AC-04)', () => {
  let rafCb: FrameRequestCallback | null = null;

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
    try {
      localStorage.clear();
    } catch {
      /* jsdom localStorage always present, but stay defensive */
    }
    rafCb = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafCb = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('clears a stored session descriptor once the replayed log drives the engine to GAME_OVER', async () => {
    writeSession({ roomId: 'room-1', roomCode: 'ABCD', playerId: 'player-abc' });
    expect(readSession()).not.toBeNull();

    // The log already contains the eliminating shot; initialize() replays it
    // to completion (isReplaying -> tickToCompletion) but does not itself call
    // emitState() — the TEST SETUP (napalm grant + low HP) is applied to the
    // engine BEFORE that replay runs.
    const { supabase } = makeFakeSupabase([{ data: [row(0, NAPALM_KILL_SHOT).new], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS);

    // TEST SETUP (mirrors scripts/checks/gameover.mjs): grant napalm to the
    // shooter (P1) and lower the victim's (P2) HP so the burn is a reliable kill.
    const state = engineOf(client).getState();
    state.tanks[0].inventory.napalm.count = 9;
    state.tanks[0].inventory.napalm.unlimited = false;
    state.tanks[1].health = 5;

    await client.initialize();
    expect(client.getState().phase).toBe('GAME_OVER'); // the replay itself already reached it

    // emitState()'s one-shot GAME_OVER hook fires on the first real frame after
    // start(), same as live bootstrap (initialize() then start()).
    client.start();
    rafCb?.(0);

    expect(readSession()).toBeNull();
  });
});
