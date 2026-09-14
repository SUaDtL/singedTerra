import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GameEngine } from '@shared/engine/GameEngine';
import { replayNetworkAction, type NetworkAction } from '@shared/net/replay';
import { NetworkClient } from './NetworkClient';
import type { ConnectionState } from './GameClient';

const PAGE_SIZE = 3;
const OPTIONS = {
  maxPlayers: 2,
  seed: 73,
  players: [
    { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
    { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
  ],
};

interface RoomActionRow {
  id: string;
  room_id: string;
  seq: number;
  player_id: string;
  action: NetworkAction;
  created_at: string;
  command_version: 2;
  intent_id: string;
  expected_revision: number;
  submitted_by: string;
  command_ends_turn: boolean;
  command_next_index: number | null;
  command_round_over: false;
}

interface QueryResult {
  data: RoomActionRow[];
  error: { message: string } | null;
}

interface CappedReadControl {
  rows: RoomActionRow[];
  ascendingReads: number;
  queryCount: number;
  failQuery: number | null;
  failAscendingRead: number | null;
  pauseAscendingRead: number | null;
  paused: Promise<void>;
  releasePaused(): void;
}

interface CapturedRealtime {
  insert: ((payload: { new: RoomActionRow }) => void) | null;
  status: ((status: string) => void) | null;
  channelCount: number;
}

function actionRow(seq: number, action: NetworkAction): RoomActionRow {
  return {
    id: `row-${seq}`,
    room_id: 'room-123',
    seq,
    player_id: 'player-abc',
    action: {
      ...action,
      commandActor: { role: 'engine-seat', tankId: 'p1' },
    },
    created_at: '',
    command_version: 2,
    intent_id: `intent-${seq}`,
    expected_revision: seq,
    submitted_by: 'player-abc',
    command_ends_turn: action.type === 'fire' || action.type === 'use_shield',
    command_next_index: action.type === 'fire' || action.type === 'use_shield' ? 1 : null,
    command_round_over: false,
  };
}

function history(length: number, includeTerrainChange = true): RoomActionRow[] {
  return Array.from({ length }, (_, seq) => actionRow(
    seq,
    includeTerrainChange && seq === length - 1
      ? { type: 'fire', angle: 45, power: 50, weapon: 'baby_missile' }
      : { type: 'move', delta: seq % 2 === 0 ? 1 : -1 },
  ));
}

function referenceState(rows: RoomActionRow[]) {
  const engine = new GameEngine(OPTIONS);
  for (const row of rows) {
    replayNetworkAction(engine, row.action);
    let ticks = 0;
    while (
      (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING')
      && ticks < 10_000
    ) {
      engine.tick();
      ticks += 1;
    }
  }
  return engine.getState();
}

function expectCanonicalState(
  actual: ReturnType<GameEngine['getState']>,
  expected: ReturnType<GameEngine['getState']>,
): void {
  const { terrain: actualTerrain, ...actualState } = actual;
  const { terrain: expectedTerrain, ...expectedState } = expected;
  expect(actualState).toEqual(expectedState);
  expect(actualTerrain.length).toBe(expectedTerrain.length);
  expect(actualTerrain.every((value, index) => value === expectedTerrain[index])).toBe(true);
}

function makeCappedSupabase(initialRows: RoomActionRow[]): {
  supabase: SupabaseClient;
  control: CappedReadControl;
  realtime: CapturedRealtime;
} {
  let releasePaused!: () => void;
  let markPaused!: () => void;
  const control: CappedReadControl = {
    rows: [...initialRows],
    ascendingReads: 0,
    queryCount: 0,
    failQuery: null,
    failAscendingRead: null,
    pauseAscendingRead: null,
    paused: new Promise<void>((resolve) => { markPaused = resolve; }),
    releasePaused: () => releasePaused(),
  };
  let pause = new Promise<void>((resolve) => { releasePaused = resolve; });
  const realtime: CapturedRealtime = { insert: null, status: null, channelCount: 0 };

  const resetPause = () => {
    control.paused = new Promise<void>((resolve) => { markPaused = resolve; });
    pause = new Promise<void>((resolve) => { releasePaused = resolve; });
  };

  const supabase = {
    from: (table: string) => {
      if (table !== 'room_actions') throw new Error(`unexpected table ${table}`);
      let lowerBound = 0;
      let ascending = true;
      let signal: AbortSignal | undefined;
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.gte = (_column: string, value: number) => {
        lowerBound = value;
        return builder;
      };
      builder.order = (_column: string, options?: { ascending?: boolean }) => {
        ascending = options?.ascending !== false;
        return builder;
      };
      builder.abortSignal = (nextSignal: AbortSignal) => {
        signal = nextSignal;
        return builder;
      };
      builder.then = (
        resolve: (result: QueryResult) => unknown,
        reject: (error: unknown) => unknown,
      ) => {
        const queryNumber = ++control.queryCount;
        const readNumber = ascending ? ++control.ascendingReads : null;
        const run = async (): Promise<QueryResult> => {
          if (readNumber !== null && readNumber === control.pauseAscendingRead) {
            markPaused();
            await pause;
            resetPause();
          }
          if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
          if (queryNumber === control.failQuery) {
            return { data: [], error: { message: 'query failed' } };
          }
          if (readNumber !== null && readNumber === control.failAscendingRead) {
            return { data: [], error: { message: 'page failed' } };
          }
          const rows = control.rows
            .filter((row) => row.seq >= lowerBound)
            .sort((left, right) => ascending ? left.seq - right.seq : right.seq - left.seq)
            .slice(0, PAGE_SIZE);
          return { data: rows, error: null };
        };
        return run().then(resolve, reject);
      };
      return builder;
    },
    channel: () => {
      realtime.channelCount += 1;
      const channel: Record<string, unknown> = {};
      channel.on = (
        _event: unknown,
        filter: { table?: string },
        handler: (payload: { new: RoomActionRow }) => void,
      ) => {
        if (filter.table === 'room_actions') realtime.insert = handler;
        return channel;
      };
      channel.subscribe = (callback?: (status: string) => void) => {
        if (callback && !realtime.status) realtime.status = callback;
        return channel;
      };
      return channel;
    },
    removeChannel: vi.fn(),
  } as unknown as SupabaseClient;

  return { supabase, control, realtime };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('NetworkClient paged ordered history recovery', () => {
  it.each([0, PAGE_SIZE - 1, PAGE_SIZE, PAGE_SIZE + 1, PAGE_SIZE * 2 + 2])(
    'replays %i capped rows to the same real engine state and terrain as a complete log',
    async (length) => {
      const rows = history(length);
      const expected = referenceState(rows);
      const { supabase } = makeCappedSupabase(rows);
      const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS, undefined, 2);

      await client.initialize();

      expectCanonicalState(client.getState(), expected);
    },
  );

  it('rejects a failed second ascending page before replay or readiness', async () => {
    const { supabase, control, realtime } = makeCappedSupabase(history(PAGE_SIZE * 2 + 2));
    control.failAscendingRead = 2;
    const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS, undefined, 2);

    await expect(client.initialize()).rejects.toThrow('failed to fetch action log');

    expectCanonicalState(client.getState(), referenceState([]));
    expect(realtime.channelCount).toBe(0);
  });

  it('rejects a permanent sequence gap before replay or readiness', async () => {
    const rows = history(PAGE_SIZE * 2 + 2).filter((row) => row.seq !== PAGE_SIZE);
    const { supabase, realtime } = makeCappedSupabase(rows);
    const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS, undefined, 2);

    await expect(client.initialize()).rejects.toThrow('noncontiguous room action history');

    expectCanonicalState(client.getState(), referenceState([]));
    expect(realtime.channelCount).toBe(0);
  });

  it('rejects a duplicate sequence before replay or readiness', async () => {
    const rows = history(PAGE_SIZE * 2 + 2);
    rows.splice(PAGE_SIZE + 1, 0, { ...rows[PAGE_SIZE]!, id: 'duplicate-row' });
    const { supabase, realtime } = makeCappedSupabase(rows);
    const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS, undefined, 2);

    await expect(client.initialize()).rejects.toThrow('noncontiguous room action history');

    expectCanonicalState(client.getState(), referenceState([]));
    expect(realtime.channelCount).toBe(0);
  });

  it('cancels after a page read without applying stale rows or subscribing', async () => {
    const { supabase, control, realtime } = makeCappedSupabase(history(PAGE_SIZE * 2 + 2));
    control.pauseAscendingRead = 1;
    const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS, undefined, 2);

    const initializing = client.initialize();
    await control.paused;
    client.stop();
    control.releasePaused();
    await initializing;

    expectCanonicalState(client.getState(), referenceState([]));
    expect(realtime.channelCount).toBe(0);
  });

  it('retains a concurrent Realtime append and keeps repeated catch-up idempotent', async () => {
    const { supabase, control, realtime } = makeCappedSupabase([]);
    const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS, undefined, 2);
    const connections: ConnectionState[] = [];
    client.onConnectionChange((state) => connections.push(state));
    await client.initialize();

    const capturedRows = history(PAGE_SIZE + 1, false);
    const appended = actionRow(PAGE_SIZE + 1, { type: 'move', delta: 1 });
    control.rows = capturedRows;
    control.pauseAscendingRead = control.ascendingReads + 1;
    realtime.status?.('SUBSCRIBED');
    await control.paused;
    control.rows = [...capturedRows, appended];
    realtime.insert?.({ new: appended });
    control.releasePaused();
    await settle();

    const expected = referenceState([...capturedRows, appended]);
    expectCanonicalState(client.getState(), expected);

    realtime.status?.('CHANNEL_ERROR');
    realtime.status?.('SUBSCRIBED');
    await settle();

    expectCanonicalState(client.getState(), expected);
    expect(connections.at(-1)).toBe('connected');
  });

  it('accepts a captured target already surpassed by live drain without replaying rows', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);
    const { supabase, control, realtime } = makeCappedSupabase([]);
    const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS, 'seat-token', 2);
    const connections: ConnectionState[] = [];
    client.onConnectionChange((state) => connections.push(state));
    try {
      await client.initialize();

      const capturedRows = history(PAGE_SIZE + 1, false);
      const appended = actionRow(PAGE_SIZE + 1, { type: 'move', delta: 1 });
      control.rows = capturedRows;
      control.pauseAscendingRead = control.ascendingReads + 1;
      realtime.status?.('SUBSCRIBED');
      await control.paused;

      control.rows = [...capturedRows, appended];
      for (const row of [...capturedRows, appended]) realtime.insert?.({ new: row });
      const stateAfterLiveDrain = client.getState();
      expectCanonicalState(stateAfterLiveDrain, referenceState([...capturedRows, appended]));

      control.releasePaused();
      await settle();

      expect(connections.at(-1)).toBe('connected');
      expectCanonicalState(client.getState(), stateAfterLiveDrain);
      client.sendAction({ type: 'move', delta: 1 });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      client.stop();
      vi.unstubAllGlobals();
    }
  });

  it('keeps readiness blocked when a newer lifecycle recovery fails after superseding a paused read', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);
    const { supabase, control, realtime } = makeCappedSupabase([]);
    const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS, 'seat-token', 2);
    const connections: ConnectionState[] = [];
    client.onConnectionChange((state) => connections.push(state));
    try {
      await client.initialize();

      control.rows = history(PAGE_SIZE + 1, false);
      control.pauseAscendingRead = control.ascendingReads + 1;
      realtime.status?.('SUBSCRIBED');
      await control.paused;

      realtime.status?.('CHANNEL_ERROR');
      control.failQuery = control.queryCount + 1;
      realtime.status?.('SUBSCRIBED');
      await settle();
      expect(connections.at(-1)).toBe('reconnecting');

      control.releasePaused();
      await settle();

      expect(connections.at(-1)).toBe('reconnecting');
      client.sendAction({ type: 'move', delta: 1 });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      client.stop();
      vi.unstubAllGlobals();
    }
  });

  it('keeps readiness blocked when a command recovery finishes after a newer lifecycle failure', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);
    const { supabase, control, realtime } = makeCappedSupabase([]);
    const client = new NetworkClient(supabase, 'room-123', 'player-abc', OPTIONS, 'seat-token', 2);
    try {
      await client.initialize();

      control.rows = history(PAGE_SIZE + 1, false);
      control.pauseAscendingRead = control.ascendingReads + 1;
      const commandRecovery = (client as unknown as {
        resyncLog: () => Promise<boolean>;
      }).resyncLog();
      await control.paused;

      realtime.status?.('CHANNEL_ERROR');
      control.failQuery = control.queryCount + 1;
      realtime.status?.('SUBSCRIBED');
      await settle();

      control.releasePaused();
      await commandRecovery;
      await settle();

      client.sendAction({ type: 'move', delta: 1 });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      client.stop();
      vi.unstubAllGlobals();
    }
  });
});
