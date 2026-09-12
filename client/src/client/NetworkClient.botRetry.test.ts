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
 * Determinism (ADR-0002) is untouched: every client derives recovery from the same
 * canonical before/after replay state. A seq conflict waits for the winning ordered
 * row before deciding whether this client's exact intent committed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NetworkClient } from './NetworkClient';
import type { NetworkAction } from '@shared/net/replay';
import type { GameEngine } from '@shared/engine/GameEngine';
import { cpuRoomIntentId } from '@shared/net/roomCommand';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';

const aiProbe = vi.hoisted(() => ({
  calls: 0,
  afterPlan: null as (() => void) | null,
  plans: [] as Array<{
    weapon: string;
    buy?: string;
    buyAccessory?: string;
  } | null>,
}));

vi.mock('@shared/engine/AI', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/engine/AI')>();
  return {
    ...actual,
    computeAiPlan: (...args: Parameters<typeof actual.computeAiPlan>) => {
      aiProbe.calls += 1;
      const plan = actual.computeAiPlan(...args);
      aiProbe.plans.push(plan);
      aiProbe.afterPlan?.();
      return plan;
    },
  };
});

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
type SubmitResult = { ok?: boolean; error?: string; retry?: boolean; seq?: number };

interface Captured {
  insertHandler: ((p: { new: unknown }) => void) | null;
  statusCb: ((s: string) => void) | null;
}

/** Minimal SupabaseClient stand-in (mirrors NetworkClient.lockstep.test.ts). */
function makeFakeSupabase(results: QueryResult[]): { supabase: SupabaseClient; captured: Captured } {
  const state = { idx: 0 };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'abortSignal']) builder[m] = () => builder;
  builder.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) => {
    const result = results[state.idx++] ?? { data: [], error: null };
    const normalized = Array.isArray(result.data)
      ? { ...result, data: result.data.map((entry) => v2Row(entry as Record<string, unknown>)) }
      : result;
    return Promise.resolve(normalized).then(resolve, reject);
  };

  const captured: Captured = { insertHandler: null, statusCb: null };
  const makeChannel = () => {
    const ch: Record<string, unknown> = {};
    ch.on = (_e: unknown, _f: unknown, handler: (p: { new: unknown }) => void) => {
      if (!captured.insertHandler) {
        captured.insertHandler = (payload) => handler({ new: v2Row(payload.new as Record<string, unknown>) });
      }
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

function v2Row(input: Record<string, unknown>): Record<string, unknown> {
  if (input.command_version === 2) return input;
  const seq = input.seq as number;
  const playerId = input.player_id as string;
  const actorTankId = playerId === 'player-abc' ? 'p1' : 'p2';
  const action = input.action as NetworkAction;
  return {
    ...input,
    action: { ...action, commandActor: { role: 'engine-seat', tankId: actorTankId } },
    command_version: 2,
    intent_id: playerId === 'bot-def'
      ? cpuRoomIntentId({ roomId: 'room-1', expectedRevision: seq, actorPlayerId: playerId, kind: action.type === 'buy' ? 'buy' : 'act' })
      : `human-history-${seq}`,
    expected_revision: seq,
    submitted_by: 'player-abc',
    command_ends_turn: action.type === 'fire' || action.type === 'use_shield',
    command_next_index: action.type === 'fire' || action.type === 'use_shield' ? (seq + 1) % 2 : null,
    command_round_over: false,
  };
}

function installV2Fetch(fetchMock: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const response = await (fetchMock as unknown as (
      url: string,
      init?: RequestInit,
    ) => Promise<{ ok: boolean; json(): Promise<SubmitResult> }>)(url, init);
    const data = await response.json();
    const body = JSON.parse(String(init?.body)) as { command?: {
      intentId: string; expectedRevision: number; actorPlayerId: string;
    } };
    if (!body.command) return response;
    if (data.ok) {
      return {
        ...response,
        json: async () => ({
          ok: true,
          protocolVersion: 2,
          intentId: body.command!.intentId,
          seq: body.command!.expectedRevision,
          revision: body.command!.expectedRevision + 1,
          actorPlayerId: body.command!.actorPlayerId,
          actorTankId: body.command!.actorPlayerId === 'player-abc' ? 'p1' : 'p2',
        }),
      };
    }
    return {
      ...response,
      json: async () => data.error === 'seq_conflict'
        ? { ...data, error: 'revision_conflict' }
        : data,
    };
  });
}

/** A committed fire by p1 (the opener) at seq 0 — after replay the turn is p2's (the bot). */
function p1FireRow() {
  return { new: { id: 'r0', room_id: 'room-1', seq: 0, player_id: 'player-abc', action: fire(), created_at: '' } };
}

/** Let queued microtasks + setTimeout(0) settle (so a fetch .then/.catch runs). */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function deferredSubmit() {
  let resolve!: (response: { ok: boolean; json: () => Promise<SubmitResult> }) => void;
  const promise = new Promise<{ ok: boolean; json: () => Promise<SubmitResult> }>((done) => {
    resolve = done;
  });
  return {
    promise,
    settle(result: SubmitResult) {
      resolve({ ok: result.ok === true, json: async () => result });
    },
  };
}

function neverSettles(): Promise<never> {
  return new Promise<never>(() => {});
}

describe('NetworkClient — client-driven bot submit self-heal (#119)', () => {
  let rafCb: FrameRequestCallback | null = null;
  let rafTimestamp = 0;

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
    // Capture the rAF loop callback so frames can be pumped one at a time.
    rafCb = null;
    rafTimestamp = 0;
    vi.spyOn(performance, 'now').mockReturnValue(0);
    aiProbe.calls = 0;
    aiProbe.afterPlan = null;
    aiProbe.plans.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafCb = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /** Run one rAF frame (emitState -> maybeDriveBot), then let async fetch handlers settle. */
  async function pumpFrame(): Promise<void> {
    rafTimestamp += 1_000 / 60;
    rafCb?.(rafTimestamp);
    await settle();
  }

  /** Build a client already at the bot's (p2) turn, with the rAF loop started. */
  async function botTurnClient(fetchMock: ReturnType<typeof vi.fn>) {
    installV2Fetch(fetchMock);
    // initialize() replays p1's committed fire and ticks to completion, handing the
    // turn to p2 (the bot). maybeDriveBot is suppressed during replay (isReplaying).
    const { supabase } = makeFakeSupabase([{ data: [p1FireRow().new], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS, undefined, 2);
    await client.initialize();
    expect(client.getState().activePlayerId).toBe('p2'); // bot holds the turn
    client.start();
    return client;
  }

  async function configuredBotTurnClient(
    fetchMock: ReturnType<typeof vi.fn>,
    armsLevel: number,
    start = true,
  ): Promise<{ client: NetworkClient; captured: Captured; engine: GameEngine }> {
    installV2Fetch(fetchMock);
    const human = OPTIONS.players[0];
    const bot = OPTIONS.players[1];
    if (!human || !bot) throw new Error('network bot fixture requires two players');
    const options = {
      ...OPTIONS,
      armsLevel,
      players: [human, { ...bot, ai: 'hard' as const }],
    };
    const { supabase, captured } = makeFakeSupabase([{ data: [p1FireRow().new], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', options, undefined, 2);
    await client.initialize();
    const engine = (client as unknown as { engine: GameEngine }).engine;
    expect(engine.getState().activePlayerId).toBe('p2');
    if (start) client.start();
    return { client, captured, engine };
  }

  async function historicalIneffectivePreparationClient(
    fetchMock: ReturnType<typeof vi.fn>,
    fallbackUsable = true,
  ): Promise<{ client: NetworkClient; engine: GameEngine }> {
    installV2Fetch(fetchMock);
    const human = OPTIONS.players[0];
    const bot = OPTIONS.players[1];
    if (!human || !bot) throw new Error('network bot fixture requires two players');
    const options = {
      ...OPTIONS,
      armsLevel: 1,
      players: [human, { ...bot, ai: 'hard' as const }],
    };
    const historicalBuy = {
      id: 'r1',
      room_id: 'room-1',
      seq: 1,
      player_id: 'bot-def',
      action: { type: 'buy', weapon: 'nuke' } satisfies NetworkAction,
      created_at: '',
    };
    const { supabase } = makeFakeSupabase([{
      data: [p1FireRow().new, historicalBuy],
      error: null,
    }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', options, undefined, 2);
    const engine = (client as unknown as { engine: GameEngine }).engine;
    setExhaustedRichBot(engine);
    const botTank = engine.getState().tanks[1];
    if (!botTank) throw new Error('network bot fixture requires a CPU tank');
    if (!fallbackUsable) {
      botTank.inventory.baby_missile.unlimited = false;
      botTank.inventory.baby_missile.count = 0;
    }
    const applyAction = engine.applyAction.bind(engine);
    vi.spyOn(engine, 'applyAction').mockImplementation((action) => (
      action.type === 'buy' && action.weapon === 'nuke'
        ? false
        : applyAction(action)
    ));
    await client.initialize();
    expect(engine.getState().activePlayerId).toBe('p2');
    expect(botTank.inventory.nuke.count).toBe(0);
    return { client, engine };
  }

  function setExhaustedRichBot(engine: GameEngine, credits = 20_000): void {
    const state = engine.getState();
    const bot = state.tanks[1];
    const target = state.tanks[0];
    if (!bot || !target) throw new Error('network bot fixture requires two tanks');
    for (const slot of Object.values(bot.inventory)) {
      if (!slot.unlimited) slot.count = 0;
    }
    bot.credits = credits;
    target.health = 100;
  }

  function setRiskyLedgeForBot(engine: GameEngine): void {
    const state = engine.getState();
    const bot = state.tanks[1];
    if (!bot) throw new Error('network bot fixture requires a CPU tank');
    state.terrain.fill(0);
    const ledgeX = Math.floor(bot.x);
    for (let x = 0; x < CANVAS_WIDTH; x += 1) {
      const surface = x < ledgeX ? 220 : 340;
      for (let y = surface; y < CANVAS_HEIGHT; y += 1) {
        state.terrain[y * CANVAS_WIDTH + x] = 1;
      }
    }
    bot.y = 220;
    bot.accessories.parachute = 0;
  }

  function submittedAction(fetchMock: ReturnType<typeof vi.fn>, call: number): NetworkAction {
    const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body)) as { command: { action: NetworkAction } };
    return body.command.action;
  }

  function tickToRest(engine: GameEngine): void {
    let ticks = 0;
    while (['FIRING', 'RESOLVING'].includes(engine.getState().phase) && ticks < 100_000) {
      engine.tick();
      ticks++;
    }
    expect(ticks).toBeLessThan(100_000);
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
    expect(aiProbe.calls).toBe(1);

    client.stop();
  });

  it('does not repeat real planner work or submissions while one unchanged POST is in flight — OB-3/AC-072', async () => {
    // A fetch that never resolves keeps the phase in flight. The per-frame emitState
    // cadence must not fire a second POST while the first is outstanding.
    const fetchMock = vi.fn().mockReturnValue(new Promise<never>(() => {}));
    const client = await botTurnClient(fetchMock);

    for (let frame = 0; frame < 60; frame += 1) await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(1); // in-flight guard blocks the second frame
    expect(aiProbe.calls).toBe(1);

    client.stop();
  });

  it('retains the full-tier real plan through weapon and accessory preparation in local order — AC-073/075', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 4);
    setExhaustedRichBot(engine, 36_000);
    setRiskyLedgeForBot(engine);
    const bot = engine.getState().tanks[1];
    if (!bot) throw new Error('network bot fixture requires a CPU tank');

    await pumpFrame();
    const weaponBuy = submittedAction(fetchMock, 0);
    expect(aiProbe.plans[0]).toMatchObject({
      weapon: 'deaths_head',
      buy: 'deaths_head',
      buyAccessory: 'parachute',
    });
    expect(weaponBuy).toEqual({ type: 'buy', weapon: 'deaths_head' });
    captured.insertHandler?.({
      new: { id: 'weapon-buy', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: weaponBuy, created_at: '' },
    });
    await settle();

    const accessoryBuy = submittedAction(fetchMock, 1);
    expect(accessoryBuy).toEqual({ type: 'buy', accessory: 'parachute' });
    captured.insertHandler?.({
      new: { id: 'accessory-buy', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: accessoryBuy, created_at: '' },
    });
    await settle();

    const attack = submittedAction(fetchMock, 2);
    expect(attack).toMatchObject({ type: 'fire', weapon: 'deaths_head' });
    captured.insertHandler?.({
      new: { id: 'attack', room_id: 'room-1', seq: 3, player_id: 'bot-def', action: attack, created_at: '' },
    });
    captured.insertHandler?.({
      new: { id: 'attack-duplicate', room_id: 'room-1', seq: 3, player_id: 'bot-def', action: attack, created_at: '' },
    });
    await settle();

    const appliedLog = (client as unknown as { appliedLog: NetworkAction[] }).appliedLog;
    expect(appliedLog.slice(1)).toEqual([
      expect.objectContaining(weaponBuy),
      expect.objectContaining(accessoryBuy),
      expect.objectContaining(attack),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(aiProbe.calls).toBe(1);
    expect(bot.credits).toBe(8_000);
    expect(bot.inventory.deaths_head.count).toBe(0);
    expect(bot.accessories.parachute).toBe(1);
    client.stop();
  });

  it('reconstructs the same remaining full-tier plan from public initialize history as live delivery — AC-073/075', async () => {
    const liveFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
    const { client: liveClient, captured, engine: liveEngine } = await configuredBotTurnClient(liveFetch, 4);
    setExhaustedRichBot(liveEngine, 36_000);
    setRiskyLedgeForBot(liveEngine);

    await pumpFrame();
    const weaponBuy = submittedAction(liveFetch, 0);
    expect(weaponBuy).toEqual({ type: 'buy', weapon: 'deaths_head' });
    captured.insertHandler?.({
      new: { id: 'live-weapon-buy', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: weaponBuy, created_at: '' },
    });
    await settle();
    const liveRemainingAction = submittedAction(liveFetch, 1);
    expect(liveRemainingAction).toEqual({ type: 'buy', accessory: 'parachute' });
    liveClient.stop();

    const historyFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 2 }) });
    installV2Fetch(historyFetch);
    const human = OPTIONS.players[0];
    const bot = OPTIONS.players[1];
    if (!human || !bot) throw new Error('network bot fixture requires two players');
    const options = {
      ...OPTIONS,
      armsLevel: 4,
      players: [human, { ...bot, ai: 'hard' as const }],
    };
    const historicalWeaponBuy = {
      id: 'historical-weapon-buy',
      room_id: 'room-1',
      seq: 1,
      player_id: 'bot-def',
      action: weaponBuy,
      created_at: '',
    };
    const { supabase } = makeFakeSupabase([{
      data: [p1FireRow().new, historicalWeaponBuy],
      error: null,
    }]);
    const historyClient = new NetworkClient(supabase, 'room-1', 'player-abc', options, undefined, 2);
    const historyInternals = historyClient as unknown as {
      engine: GameEngine;
      tickToCompletion(): void;
    };
    const tickToCompletion = historyInternals.tickToCompletion.bind(historyClient);
    let fixtureInstalled = false;
    vi.spyOn(historyInternals, 'tickToCompletion').mockImplementation(() => {
      tickToCompletion();
      if (fixtureInstalled || historyInternals.engine.getState().activePlayerId !== 'p2') return;
      fixtureInstalled = true;
      setExhaustedRichBot(historyInternals.engine, 36_000);
      setRiskyLedgeForBot(historyInternals.engine);
    });

    await historyClient.initialize();
    expect(fixtureInstalled).toBe(true);
    const historyBot = historyInternals.engine.getState().tanks[1];
    if (!historyBot) throw new Error('network bot fixture requires a CPU tank');
    expect(historyBot.credits).toBe(12_000);
    expect(historyBot.accessories.parachute).toBe(0);
    expect(historyFetch).not.toHaveBeenCalled(); // reconstruction never submits during replay

    historyClient.start();
    await pumpFrame();

    expect(submittedAction(historyFetch, 0)).toEqual(liveRemainingAction);
    expect(aiProbe.calls).toBe(2); // one original plan per equivalent client state
    historyClient.stop();
  });

  it('carries a canonical no-op skip across revisions and completes the remaining real plan — AC-073/074', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setExhaustedRichBot(engine);
    setRiskyLedgeForBot(engine);
    const bot = engine.getState().tanks[1];
    if (!bot) throw new Error('network bot fixture requires a CPU tank');
    const startingTurn = engine.getState().turn;

    await pumpFrame();
    const ineffectiveWeaponBuy = submittedAction(fetchMock, 0);
    expect(ineffectiveWeaponBuy).toEqual({ type: 'buy', weapon: 'nuke' });
    vi.spyOn(engine, 'applyAction').mockImplementationOnce(() => false);
    captured.insertHandler?.({
      new: { id: 'weapon-no-op', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: ineffectiveWeaponBuy, created_at: '' },
    });
    await settle();

    const accessoryBuy = submittedAction(fetchMock, 1);
    expect(accessoryBuy).toEqual({ type: 'buy', accessory: 'parachute' });
    captured.insertHandler?.({
      new: { id: 'accessory-buy', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: accessoryBuy, created_at: '' },
    });
    await settle();

    const fallback = submittedAction(fetchMock, 2);
    expect(fallback).toMatchObject({ type: 'fire', weapon: 'baby_missile' });
    expect(fetchMock.mock.calls.map((_call, index) => submittedAction(fetchMock, index)))
      .toEqual([ineffectiveWeaponBuy, accessoryBuy, fallback]);
    expect(aiProbe.calls).toBe(1);
    expect(bot.inventory.nuke.count).toBe(0);
    expect(bot.accessories.parachute).toBe(1);

    captured.insertHandler?.({
      new: { id: 'fallback', room_id: 'room-1', seq: 3, player_id: 'bot-def', action: fallback, created_at: '' },
    });
    tickToRest(engine);
    expect(engine.getState().turn).toBe(startingTurn + 1);
    client.stop();
  });

  it('skips a canonical accessory no-op across the next revision and attacks once — AC-073/074', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setRiskyLedgeForBot(engine);
    const bot = engine.getState().tanks[1];
    if (!bot) throw new Error('network bot fixture requires a CPU tank');

    await pumpFrame();
    const ineffectiveAccessoryBuy = submittedAction(fetchMock, 0);
    expect(ineffectiveAccessoryBuy).toEqual({ type: 'buy', accessory: 'parachute' });
    vi.spyOn(engine, 'applyAction').mockImplementationOnce(() => false);
    captured.insertHandler?.({
      new: { id: 'accessory-no-op', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: ineffectiveAccessoryBuy, created_at: '' },
    });
    await settle();

    const attack = submittedAction(fetchMock, 1);
    expect(attack.type === 'fire' || attack.type === 'use_shield').toBe(true);
    for (let frame = 0; frame < 10; frame += 1) await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(aiProbe.calls).toBe(1);
    expect(bot.accessories.parachute).toBe(0);
    expect(fetchMock.mock.calls.map((_call, index) => submittedAction(fetchMock, index)))
      .toEqual([ineffectiveAccessoryBuy, attack]);
    client.stop();
  });

  it('does not submit a plan whose command generation retired during real planning — AC-074', async () => {
    const fetchMock = vi.fn().mockReturnValue(neverSettles());
    const { client } = await configuredBotTurnClient(fetchMock, 1);
    let retired = false;
    aiProbe.afterPlan = () => {
      if (retired) return;
      retired = true;
      // Exercise the lifecycle primitive directly so retirement happens after the
      // real synchronous planner returns but before maybeDriveBot can submit it.
      (client as unknown as { retirePendingCommands(): void }).retirePendingCommands();
    };

    await pumpFrame();

    expect(aiProbe.calls).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
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
    // Transport uncertainty retries the same immutable CPU command before the
    // driver is allowed to derive any later phase command.
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    const client = await botTurnClient(fetchMock);

    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 210));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body)
      .toBe((fetchMock.mock.calls[0]?.[1] as RequestInit).body);

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

  it('uses the room arms level so the D01 restricted bot submits a legal fire echo that advances the turn — AC-065/066/068', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 0);
    setExhaustedRichBot(engine);
    const startingTurn = engine.getState().turn;

    await pumpFrame();
    const action = submittedAction(fetchMock, 0);
    expect(action).toMatchObject({ type: 'fire', weapon: 'baby_missile' });

    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action, created_at: '' },
    });
    expect(engine.getState().phase).toBe('FIRING');
    tickToRest(engine);
    expect(engine.getState().turn).toBe(startingTurn + 1);
    expect(engine.getState().activePlayerId).toBe('p1');

    client.stop();
  });

  it('waits for a legal preparation echo to create usable ammo before submitting the attack — AC-068', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setExhaustedRichBot(engine);
    const bot = engine.getState().tanks[1];
    if (!bot) throw new Error('network bot fixture requires a CPU tank');
    const startingTurn = engine.getState().turn;

    await pumpFrame();
    const buy = submittedAction(fetchMock, 0);
    expect(buy).toEqual({ type: 'buy', weapon: 'nuke' });
    expect(bot.inventory.nuke.count).toBe(0);
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();
    expect(bot.inventory.nuke.count).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const attack = submittedAction(fetchMock, 1);
    expect(attack).toMatchObject({ type: 'fire', weapon: 'nuke' });

    captured.insertHandler?.({
      new: { id: 'r2', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: attack, created_at: '' },
    });
    expect(engine.getState().phase).toBe('FIRING');
    tickToRest(engine);
    const settled = engine.getState();
    expect(['PLAYER_TURN', 'ROUND_OVER', 'GAME_OVER']).toContain(settled.phase);
    expect(settled.turn > startingTurn || settled.phase === 'ROUND_OVER' || settled.phase === 'GAME_OVER').toBe(true);

    client.stop();
  });

  it('falls back visibly and advances when the ordered preparation echo leaves ammo unusable — AC-065/068', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setExhaustedRichBot(engine);
    const bot = engine.getState().tanks[1];
    if (!bot) throw new Error('network bot fixture requires a CPU tank');
    const startingTurn = engine.getState().turn;
    const notice = vi.fn();
    client.onFireFailed(notice);

    await pumpFrame();
    const buy = submittedAction(fetchMock, 0);
    expect(buy).toEqual({ type: 'buy', weapon: 'nuke' });
    // Fault-inject exactly the ordered engine application. Transport still accepted
    // the row, while the production replay seam observes no usable inventory change.
    vi.spyOn(engine, 'applyAction').mockImplementationOnce(() => false);
    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();

    expect(bot.inventory.nuke.count).toBe(0);
    expect(notice).toHaveBeenCalledOnce();
    expect(notice).toHaveBeenCalledWith('CPU restock failed — using Baby Missile.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallback = submittedAction(fetchMock, 1);
    expect(fallback).toMatchObject({ type: 'fire', weapon: 'baby_missile' });
    expect(fetchMock.mock.calls.map((_call, index) => submittedAction(fetchMock, index)))
      .not.toContainEqual(expect.objectContaining({ type: 'fire', weapon: 'nuke' }));

    captured.insertHandler?.({
      new: { id: 'r2', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: fallback, created_at: '' },
    });
    expect(engine.getState().phase).toBe('FIRING');
    tickToRest(engine);
    const settled = engine.getState();
    expect(settled.turn).toBe(startingTurn + 1);
    expect(settled.activePlayerId).toBe('p1');

    client.stop();
  });

  it('stops visibly without another submit when ordered preparation and fallback ammo are unusable — AC-068', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setExhaustedRichBot(engine);
    const bot = engine.getState().tanks[1];
    if (!bot) throw new Error('network bot fixture requires a CPU tank');
    bot.inventory.baby_missile.unlimited = false;
    bot.inventory.baby_missile.count = 0;
    const notice = vi.fn();
    client.onFireFailed(notice);

    await pumpFrame();
    const buy = submittedAction(fetchMock, 0);
    vi.spyOn(engine, 'applyAction').mockImplementationOnce(() => false);
    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();
    await pumpFrame();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(engine.getState().phase).toBe('PLAYER_TURN');
    expect(engine.getState().activePlayerId).toBe('p2');
    expect(notice).toHaveBeenCalledOnce();
    expect(notice).toHaveBeenCalledWith('CPU has no usable ammunition — reload to continue.');

    client.stop();
  });

  it('derives the same fallback from one ineffective canonical buy on both live clients — AC-068', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
    const origin = await configuredBotTurnClient(fetchMock, 1);
    const observer = await configuredBotTurnClient(fetchMock, 1, false);
    setExhaustedRichBot(origin.engine);
    setExhaustedRichBot(observer.engine);
    const originNotice = vi.fn();
    const observerNotice = vi.fn();
    origin.client.onFireFailed(originNotice);
    observer.client.onFireFailed(observerNotice);

    await pumpFrame();
    const buy = submittedAction(fetchMock, 0);
    expect(buy).toEqual({ type: 'buy', weapon: 'nuke' });
    vi.spyOn(origin.engine, 'applyAction').mockImplementationOnce(() => false);
    vi.spyOn(observer.engine, 'applyAction').mockImplementationOnce(() => false);
    const row = {
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
    };
    origin.captured.insertHandler?.(row);
    observer.captured.insertHandler?.(row);
    await settle();

    const submissions = fetchMock.mock.calls.map((_call, index) => submittedAction(fetchMock, index));
    expect(submissions.filter((action) => action.type === 'buy')).toEqual([buy]);
    expect(submissions.slice(1)).toHaveLength(2);
    expect(submissions.slice(1)).toEqual([
      expect.objectContaining({ type: 'fire', weapon: 'baby_missile' }),
      expect.objectContaining({ type: 'fire', weapon: 'baby_missile' }),
    ]);
    expect(originNotice).toHaveBeenCalledWith('CPU restock failed — using Baby Missile.');
    expect(observerNotice).toHaveBeenCalledWith('CPU restock failed — using Baby Missile.');

    const fallback = submissions[1];
    if (!fallback) throw new Error('expected canonical fallback');
    const fallbackRow = {
      new: { id: 'r2', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: fallback, created_at: '' },
    };
    origin.captured.insertHandler?.(fallbackRow);
    observer.captured.insertHandler?.(fallbackRow);
    tickToRest(origin.engine);
    tickToRest(observer.engine);
    expect(origin.engine.getState().turn).toBe(observer.engine.getState().turn);
    expect(origin.engine.getState().activePlayerId).toBe(observer.engine.getState().activePlayerId);

    origin.client.stop();
    observer.client.stop();
  });

  it('replays an ineffective preparation from history and submits only the visible fallback — AC-068', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 2 }) });
    const { client } = await historicalIneffectivePreparationClient(fetchMock);
    const notice = vi.fn();
    client.onFireFailed(notice);
    client.start();
    await pumpFrame();

    expect(notice).toHaveBeenCalledOnce();
    expect(notice).toHaveBeenCalledWith('CPU restock failed — using Baby Missile.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(submittedAction(fetchMock, 0)).toMatchObject({ type: 'fire', weapon: 'baby_missile' });

    client.stop();
  });

  it('replays an ineffective preparation from history and stops visibly without fallback ammo — AC-068', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 2 }) });
    const { client, engine } = await historicalIneffectivePreparationClient(fetchMock, false);
    const notice = vi.fn();
    client.onFireFailed(notice);
    client.start();
    await pumpFrame();

    expect(notice).toHaveBeenCalledOnce();
    expect(notice).toHaveBeenCalledWith('CPU has no usable ammunition — reload to continue.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(engine.getState().phase).toBe('PLAYER_TURN');
    expect(engine.getState().activePlayerId).toBe('p2');

    client.stop();
  });

  it('derives ineffective preparation through the resync action path — AC-068', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 2 }) });
    installV2Fetch(fetchMock);
    const human = OPTIONS.players[0];
    const bot = OPTIONS.players[1];
    if (!human || !bot) throw new Error('network bot fixture requires two players');
    const options = {
      ...OPTIONS,
      armsLevel: 1,
      players: [human, { ...bot, ai: 'hard' as const }],
    };
    const buyRow = {
      id: 'r1',
      room_id: 'room-1',
      seq: 1,
      player_id: 'bot-def',
      action: { type: 'buy', weapon: 'nuke' } satisfies NetworkAction,
      created_at: '',
    };
    const { supabase, captured } = makeFakeSupabase([
      { data: [p1FireRow().new], error: null },
      { data: [buyRow], error: null },
    ]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', options, undefined, 2);
    await client.initialize();
    const engine = (client as unknown as { engine: GameEngine }).engine;
    setExhaustedRichBot(engine);
    const notice = vi.fn();
    client.onFireFailed(notice);
    vi.spyOn(engine, 'applyAction').mockImplementationOnce(() => false);

    captured.statusCb?.('SUBSCRIBED');
    await settle();

    expect(notice).toHaveBeenCalledOnce();
    expect(notice).toHaveBeenCalledWith('CPU restock failed — using Baby Missile.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(submittedAction(fetchMock, 0)).toMatchObject({ type: 'fire', weapon: 'baby_missile' });

    client.stop();
  });

  it('does not latch a fallback conflict until the ordered row proves the winning intent — AC-068', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, seq: 1 }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'seq_conflict', retry: true }) })
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 3 }) });
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setExhaustedRichBot(engine);

    await pumpFrame();
    const buy = submittedAction(fetchMock, 0);
    vi.spyOn(engine, 'applyAction').mockImplementationOnce(() => false);
    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(submittedAction(fetchMock, 1)).toMatchObject({ type: 'fire', weapon: 'baby_missile' });

    // The conflict's winning row is a different, still-ineffective preparation.
    // Its canonical outcome must release the fallback intent for one fresh submit.
    vi.spyOn(engine, 'applyAction').mockImplementationOnce(() => false);
    captured.insertHandler?.({
      new: { id: 'r2', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(submittedAction(fetchMock, 2)).toMatchObject({ type: 'fire', weapon: 'baby_missile' });

    client.stop();
  });

  it('keeps one successful-preparation attack pending across a duplicate canonical buy — AC-068', async () => {
    const attackResponse = deferredSubmit();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, seq: 1 }) })
      .mockReturnValue(attackResponse.promise);
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setExhaustedRichBot(engine);
    const bot = engine.getState().tanks[1];
    if (!bot) throw new Error('network bot fixture requires a CPU tank');

    await pumpFrame();
    const buy = submittedAction(fetchMock, 0);
    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();
    expect(bot.inventory.nuke.count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(submittedAction(fetchMock, 1)).toMatchObject({ type: 'fire', weapon: 'nuke' });

    captured.insertHandler?.({
      new: { id: 'r2', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();

    expect(bot.inventory.nuke.count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it('keeps one fallback attack pending when a duplicate canonical buy is idempotently ineffective — AC-068', async () => {
    const attackResponse = deferredSubmit();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, seq: 1 }) })
      .mockReturnValue(attackResponse.promise);
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setExhaustedRichBot(engine);
    const bot = engine.getState().tanks[1];
    if (!bot) throw new Error('network bot fixture requires a CPU tank');

    await pumpFrame();
    const buy = submittedAction(fetchMock, 0);
    vi.spyOn(engine, 'applyAction').mockImplementationOnce(() => false);
    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(submittedAction(fetchMock, 1)).toMatchObject({ type: 'fire', weapon: 'baby_missile' });

    // A competing restock made Nuke usable before its duplicate row arrived. The
    // engine now rejects that duplicate idempotently; it does not settle our pending fallback.
    bot.inventory.nuke.count = 1;
    captured.insertHandler?.({
      new: { id: 'r2', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();

    expect(bot.inventory.nuke.count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it.each([
    ['pending', null, 2],
    ['accepted', { ok: true, seq: 3 }, 2],
    ['failed', { ok: false, error: 'Failed to submit action' }, 3],
    ['conflict', { ok: false, error: 'seq_conflict', retry: true }, 3],
  ] as const)(
    'retains canonical progress when a different row precedes a %s transport settlement — AC-068',
    async (_label, settlement, expectedCalls) => {
      const attackResponse = deferredSubmit();
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, seq: 1 }) })
        .mockReturnValueOnce(attackResponse.promise)
        .mockReturnValue(neverSettles());
      const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
      setExhaustedRichBot(engine);

      await pumpFrame();
      const buy = submittedAction(fetchMock, 0);
      captured.insertHandler?.({
        new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
      });
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      captured.insertHandler?.({
        new: { id: 'r2', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: buy, created_at: '' },
      });
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      if (settlement) {
        attackResponse.settle(settlement);
        await settle();
        await pumpFrame();
        expect(fetchMock).toHaveBeenCalledTimes(expectedCalls);
        if (expectedCalls === 3) {
          expect(submittedAction(fetchMock, 2)).toEqual(submittedAction(fetchMock, 1));
        }
      }
      client.stop();
    },
  );

  it.each([
    ['accepted', { ok: true, seq: 1 }],
    ['failed', { ok: false, error: 'Failed to submit action' }],
    ['conflict', { ok: false, error: 'seq_conflict', retry: true }],
  ] as const)(
    'preserves the new attack when an exact buy row precedes its late %s response — AC-068',
    async (_label, settlement) => {
      const buyResponse = deferredSubmit();
      const fetchMock = vi.fn()
        .mockReturnValueOnce(buyResponse.promise)
        .mockReturnValue(neverSettles());
      const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
      setExhaustedRichBot(engine);

      await pumpFrame();
      const buy = submittedAction(fetchMock, 0);
      captured.insertHandler?.({
        new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
      });
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(submittedAction(fetchMock, 1)).toMatchObject({ type: 'fire', weapon: 'nuke' });

      buyResponse.settle(settlement);
      await settle();
      await pumpFrame();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      captured.insertHandler?.({
        new: { id: 'r2', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: buy, created_at: '' },
      });
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      client.stop();
    },
  );

  it('uses a different row already retained before conflict to replan exactly once — AC-068', async () => {
    const attackResponse = deferredSubmit();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, seq: 1 }) })
      .mockReturnValueOnce(attackResponse.promise)
      .mockReturnValue(neverSettles());
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setExhaustedRichBot(engine);

    await pumpFrame();
    const buy = submittedAction(fetchMock, 0);
    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();
    captured.insertHandler?.({
      new: { id: 'r2', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    attackResponse.settle({ ok: false, error: 'seq_conflict', retry: true });
    await settle();
    await pumpFrame();
    await pumpFrame();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(submittedAction(fetchMock, 2)).toEqual(submittedAction(fetchMock, 1));
    client.stop();
  });

  it('blocks after conflict until a different canonical row releases one replan — AC-068', async () => {
    const attackResponse = deferredSubmit();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, seq: 1 }) })
      .mockReturnValueOnce(attackResponse.promise)
      .mockReturnValue(neverSettles());
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setExhaustedRichBot(engine);

    await pumpFrame();
    const buy = submittedAction(fetchMock, 0);
    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();
    attackResponse.settle({ ok: false, error: 'seq_conflict', retry: true });
    await settle();
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    captured.insertHandler?.({
      new: { id: 'r2', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(submittedAction(fetchMock, 2)).toEqual(submittedAction(fetchMock, 1));
    client.stop();
  });

  it('latches when conflict is followed by the exact canonical row — AC-068', async () => {
    const buyResponse = deferredSubmit();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(buyResponse.promise)
      .mockReturnValue(neverSettles());
    const { client, captured, engine } = await configuredBotTurnClient(fetchMock, 1);
    setExhaustedRichBot(engine);

    await pumpFrame();
    const buy = submittedAction(fetchMock, 0);
    buyResponse.settle({ ok: false, error: 'seq_conflict', retry: true });
    await settle();
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
    });
    await settle();
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(submittedAction(fetchMock, 1)).toMatchObject({ type: 'fire', weapon: 'nuke' });
    client.stop();
  });

  it('ignores an old response after an exact row advances to a new actor attempt — AC-068', async () => {
    const oldResponse = deferredSubmit();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValue(neverSettles());
    installV2Fetch(fetchMock);
    const human = OPTIONS.players[0];
    const bot = OPTIONS.players[1];
    if (!human || !bot) throw new Error('network bot fixture requires two players');
    const bothBots = {
      ...OPTIONS,
      players: [{ ...human, ai: 'easy' as const }, bot],
    };
    const { supabase, captured } = makeFakeSupabase([{ data: [p1FireRow().new], error: null }]);
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', bothBots, undefined, 2);
    await client.initialize();
    const engine = (client as unknown as { engine: GameEngine }).engine;
    client.start();

    await pumpFrame();
    const p2Fire = submittedAction(fetchMock, 0);
    captured.insertHandler?.({
      new: { id: 'r1', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: p2Fire, created_at: '' },
    });
    tickToRest(engine);
    await pumpFrame();
    expect(engine.getState().activePlayerId).toBe('p1');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    oldResponse.settle({ ok: false, error: 'Failed to submit action' });
    await settle();
    await pumpFrame();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it('retires a timed-out CPU envelope whose exact revision was consumed before replanning — AC-068', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafCb = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    let client: NetworkClient | undefined;
    try {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, seq: 1 }) })
        .mockReturnValue(neverSettles());
      const configured = await configuredBotTurnClient(fetchMock, 1);
      client = configured.client;
      setExhaustedRichBot(configured.engine);

      rafTimestamp += 1_000 / 60;
      rafCb?.(rafTimestamp);
      await settleMicrotasks();
      const buy = submittedAction(fetchMock, 0);
      configured.captured.insertHandler?.({
        new: { id: 'buy', room_id: 'room-1', seq: 1, player_id: 'bot-def', action: buy, created_at: '' },
      });
      await settleMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(submittedAction(fetchMock, 1)).toMatchObject({ type: 'fire', weapon: 'nuke' });

      configured.captured.insertHandler?.({
        new: { id: 'different-buy', room_id: 'room-1', seq: 2, player_id: 'bot-def', action: buy, created_at: '' },
      });
      await settleMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(9_000);
      await settleMicrotasks();
      rafTimestamp += 1_000 / 60;
      rafCb?.(rafTimestamp);
      await settleMicrotasks();

      expect(fetchMock).toHaveBeenCalledTimes(3);
      const body = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body));
      expect(body.command.expectedRevision).toBe(3);
    } finally {
      client?.stop();
      vi.useRealTimers();
    }
  });

  it('retries the same accepted CPU envelope after bounded recovery finds no echo — AC-068', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafCb = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    let client: NetworkClient | undefined;
    try {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, seq: 1 }) });
      const configured = await configuredBotTurnClient(fetchMock, 1);
      client = configured.client;
      setExhaustedRichBot(configured.engine);

      rafTimestamp += 1_000 / 60;
      rafCb?.(rafTimestamp);
      await settleMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const firstBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;

      await vi.advanceTimersByTimeAsync(9_000);
      await settleMicrotasks();
      rafTimestamp += 1_000 / 60;
      rafCb?.(rafTimestamp);
      await settleMicrotasks();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(firstBody);
      expect(aiProbe.calls).toBe(1);
    } finally {
      client?.stop();
      vi.useRealTimers();
    }
  });
});
