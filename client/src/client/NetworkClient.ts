import { projectNetworkPlayers } from './modeConfig';
import type { SupabaseClient, RealtimeChannel, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js';
import type { GameClient, RematchInfo, ConnectionState, TurnWatch, QuickChatMessage } from './GameClient';
import type { BorrowedGameState, GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import {
  normalizeBattlefieldWorldId,
  normalizeWallMode,
  type GameOptions,
  type TeamId,
  type TerrainHazardMode,
  type WallMode,
} from '@shared/types/GameOptions';
import type { AiDifficulty } from '@shared/types/GameState';
import {
  type TankLoadout,
} from '@shared/types/TankLoadout';
import { GameEngine } from '@shared/engine/GameEngine';
import { normalizeTerrainHazardMode } from '@shared/engine/Terrain';
import { computeAiPlan, type AiPlan } from '@shared/engine/AI';
import type { AccessoryType, WeaponType } from '@shared/engine/WeaponSystem';
import { GRAVITY, MAX_WIND } from '@shared/engine/Physics';
import { replayNetworkAction, replayInChunks, type NetworkAction, type NetworkFireAction } from '@shared/net/replay';
import { postOnceWithRetry, settleWithDeadline } from './retry';
import { claimCompletedMatch } from './matchClaim';
import { fastForwardTicks } from './fastForward';
import { FrameClock } from './frameClock';
import { callFunction, edgeUrl, edgeHeaders } from '../lib/edgeFunctions';
import { clearSession } from '../lib/sessionDescriptor';
import { OrderedActionSession } from './OrderedActionSession';
import { CURRENT_NETWORK_RULESET_VERSION, normalizeNetworkRulesetVersion } from './networkRuleset';
import { isQuickChatKey, parseQuickChatPayload, type QuickChatKey } from './quickChat';
import {
  CURRENT_ROOM_COMMAND_VERSION,
  cpuRoomIntentId,
  type RoomCommandEnvelopeV2,
  type RoomCommandReceiptV2,
  type RoomCommandRowV2,
} from '@shared/net/roomCommand';

// The logged-action contract now lives in shared/ (one source of truth for the
// log→engine replay, exercised by both this client and the determinism harnesses).
// Re-exported here so any caller importing it from the client keeps working.
export type {
  NetworkAction,
  NetworkFireAction,
  NetworkShieldAction,
  NetworkBuyAction,
  NetworkNextRoundAction,
} from '@shared/net/replay';

// Shape of a row returned from room_actions
interface RoomActionRow extends RoomCommandRowV2<NetworkAction> {
  id:         string;
  room_id:    string;
  created_at: string;
}

interface PendingRoomCommand {
  generation: number;
  envelope: RoomCommandEnvelopeV2<NetworkAction>;
  body: string;
  actorTankId: string;
  humanTurnEnding: boolean;
  deliveryEpoch: number;
  state: 'delivering' | 'awaiting-echo' | 'recovering' | 'retryable';
  transportAbort: AbortController | null;
  onSettle?: (settlement: BotSubmitSettlement) => void;
}

// Extended player entry that includes the Supabase-assigned id for network mode.
// GameOptions.players only requires { name, color }, so we extend here for the
// playerIndexMap construction without touching shared/.
interface NetworkPlayerEntry {
  id:    string;
  name:  string;
  color: string;
  ai?:   AiDifficulty;
  team?: TeamId;
  loadout?: TankLoadout;
}

// GameOptions extended with the network-mode player id field.
interface NetworkGameOptions extends Omit<GameOptions, 'players'> {
  players?: NetworkPlayerEntry[];
}

interface BotActionAttempt {
  phaseKey: string;
  round: number;
  turn: number;
  tankId: string;
  action: NetworkAction;
  settlement: 'pending' | 'accepted' | 'conflict';
  sawCanonicalProgress: boolean;
}

interface BotPlanCache {
  generation: number;
  expectedRevision: number;
  round: number;
  turn: number;
  tankId: string;
  plan: AiPlan | null;
  weaponPreparationComplete: boolean;
  accessoryPreparationComplete: boolean;
}

type BotPreparation = {
  generation: number;
  expectedRevision: number;
  round: number;
  turn: number;
} & (
  | { key: string; tankId: string; kind: 'weapon'; weapon: WeaponType }
  | { key: string; tankId: string; kind: 'accessory'; accessory: AccessoryType; previousCount: number }
);

const ROOM_COMMAND_CONFLICT_STATUS: Readonly<Record<string, number>> = {
  revision_conflict: 409,
  intent_conflict: 409,
  not_your_turn: 403,
};

const ROOM_COMMAND_REFUSAL_STATUS: Readonly<Record<string, number>> = {
  invalid_command: 400,
  not_room_member: 403,
  invalid_seat_token: 403,
  actor_not_in_room: 403,
  cannot_proxy_human: 403,
  shop_actor_mismatch: 403,
  room_not_found: 404,
  room_not_active: 409,
  command_protocol_mismatch: 409,
  command_protocol_unavailable: 409,
  ruleset_mismatch: 409,
  ruleset_unavailable: 409,
};

function isMappedCommandResponse(
  error: string | undefined,
  status: number | undefined,
  statusByError: Readonly<Record<string, number>>,
): boolean {
  if (error === undefined) return false;
  const expectedStatus = statusByError[error];
  return expectedStatus !== undefined && (status === undefined || status === expectedStatus);
}

type BotSubmitSettlement = 'accepted' | 'conflict' | 'failed';

/** Match GameEngine's room-option normalization before passing the tier to the AI. */
function normalizeRoomArmsLevel(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(4, Math.max(0, Math.floor(value)))
    : 4;
}

function hasUsableWeapon(state: GameState, tankId: string, weapon: WeaponType): boolean {
  const ammo = state.tanks.find((tank) => tank.id === tankId)?.inventory[weapon];
  return !!ammo && (ammo.unlimited || ammo.count > 0);
}

function networkActionsEqual(left: NetworkAction, right: NetworkAction): boolean {
  if (left.type !== right.type) return false;
  switch (left.type) {
    case 'fire':
      return right.type === 'fire'
        && left.angle === right.angle
        && left.power === right.power
        && left.weapon === right.weapon;
    case 'use_shield':
      return right.type === 'use_shield'
        && (left.weapon ?? 'shield') === (right.weapon ?? 'shield');
    case 'buy':
      return right.type === 'buy'
        && left.weapon === right.weapon
        && left.accessory === right.accessory
        && left.tankId === right.tankId;
    case 'move':
      return right.type === 'move' && left.delta === right.delta;
    case 'next_round':
      return right.type === 'next_round';
  }
}

type StateChangeListener = (state: BorrowedGameState) => void;

// localStorage key under which a seat's SECRET token is persisted, keyed by the
// PUBLIC playerId (not roomId) — playerId is stable across a rematch (the server
// copies the token to the successor room under the same seat id), so this key
// keeps resolving to a valid token after migration. Guarded by try/catch
// everywhere: private-mode / disabled storage must not crash the game.
const SEAT_TOKEN_PREFIX = 'singedterra:seat:';

function seatTokenKey(playerId: string): string {
  return `${SEAT_TOKEN_PREFIX}${playerId}`;
}

/** Best-effort read of a persisted seat token; never throws. */
function readSeatToken(playerId: string): string | undefined {
  try {
    return localStorage.getItem(seatTokenKey(playerId)) ?? undefined;
  } catch {
    return undefined; // localStorage unavailable — nothing persisted
  }
}

/** Best-effort persist of a seat token; never throws. */
function writeSeatToken(playerId: string, token: string): void {
  try {
    localStorage.setItem(seatTokenKey(playerId), token);
  } catch {
    /* localStorage unavailable — token just isn't persisted across reloads */
  }
}

/**
 * NetworkClient implements GameClient for the Supabase deterministic lockstep
 * network layer (MVP2). Each player's browser runs an independent local
 * GameEngine seeded identically. The canonical game state is seed + ordered
 * action log. Only fire actions are persisted; all other input is local-only.
 *
 * Usage:
 *   const nc = new NetworkClient(supabase, roomId, playerId, options)
 *   await nc.initialize()   // replay log + subscribe Realtime
 *   nc.start()              // begin rAF loop
 */
export class NetworkClient implements GameClient {
  // ---- private fields ----
  private supabase:         SupabaseClient;
  private engine:           GameEngine;
  private readonly initialTerrain: Uint8Array;
  private roomId:           string;
  private playerId:         string;           // Supabase-assigned UUID for this client
  // Secret per-seat credential (ADR-0009 split-identity). Required on every
  // mutating POST (submit_action / restart_game / finish_game). Falls back to
  // whatever is persisted in localStorage under this playerId if the caller
  // didn't have one to pass in (e.g. a reload mid-room).
  private token:            string;
  private listeners:        Set<StateChangeListener>;
  private readonly frameClock = new FrameClock();
  private rafId:            number | null;
  private frameRunning = false;
  private frameGeneration = 0;
  private channel:          RealtimeChannel | null;   // room_actions INSERT subscription
  private roomsChannel:     RealtimeChannel | null;   // rooms UPDATE subscription (lobby)
  private quickChatChannel: RealtimeChannel | null;

  // Maps Supabase player UUID → engine tank ID ('p1'..'pN').
  // Derived once from the ordered players array at construction time.
  // players[0].id → 'p1', players[1].id → 'p2', etc.
  // Engine tank IDs are positional strings, not UUIDs; this is the single
  // source of truth for translating between them.
  private playerIndexMap:   Map<string, string>;

  // Sequence ordering buffer for out-of-order Realtime delivery.
  // Supabase Realtime does not guarantee delivery order; events with
  // seq > nextExpectedSeq are held here until the gap fills in.
  private orderedActions:   OrderedActionSession<RoomActionRow>;
  private get pendingActions(): ReadonlyMap<number, RoomActionRow> {
    return this.orderedActions.pendingActions;
  }
  private get nextExpectedSeq(): number { return this.orderedActions.nextExpectedSeq; }
  private _isFiring         = false;
  private _gameOverReported = false;
  private _fastForward      = false;   // local view pacing (review #7); never affects the log

  // --- Liveness / connection state (REVIEW_BACKLOG P1-6) ---
  // Realtime link state, surfaced to the UI so a dropped socket shows an overlay
  // instead of a silently frozen board. Supabase auto-reconnects the underlying
  // socket; on each (re)SUBSCRIBED we re-fetch any actions missed while down.
  private _connection:      ConnectionState = 'connecting';
  private _everSubscribed   = false;            // distinguishes first subscribe from a reconnect
  private _closing          = false;            // set in stop() so teardown isn't reported as a drop
  // Set true at the top of stop() and never cleared. Backstop for async work that
  // outlives teardown — the seq-conflict retry timeout, the handleRematch poll
  // loop, and any post-teardown failFire()/emitState() call — so a stale timer or
  // in-flight fetch can't POST to / notify listeners of a torn-down client
  // (reliability-003).
  private _disposed         = false;
  private connectionListeners = new Set<(s: ConnectionState) => void>();
  private fireFailedListeners = new Set<(msg: string) => void>();
  // One watchdog follows the pending command identity, including turn-neutral moves
  // and buys. Empty recovery is still uncertain, so the envelope is retained for an
  // explicit same-body retry while only its owned presentation lock is released.
  private commandWatchdog:  ReturnType<typeof setTimeout> | null = null;
  private fireLockOwner:    { pending: PendingRoomCommand; deliveryEpoch: number } | null = null;
  private static readonly FIRE_TIMEOUT_MS = 9000;
  // Both the command delivery (fetch plus response parsing) and recovery query are
  // raced against hard deadlines. Abort is only a best-effort resource cleanup; the
  // race guarantees settlement even for a non-cooperating promise.
  private static readonly RESYNC_TIMEOUT_MS = 8000;
  private static readonly COMMAND_DELIVERY_TIMEOUT_MS = 9000;
  private commandGeneration = 0;
  private pendingRoomCommand: PendingRoomCommand | null = null;
  private canonicalCommandFault = false;

  // --- Opponent-turn watchdog (P1-6b) --- When a REMOTE human holds the turn and
  // no action arrives, escalate a non-blocking banner: 'waiting' after WAIT_MS,
  // then 'stalled' (offer leave-to-lobby) after STALL_MS. Re-armed per opponent
  // turn; cleared on my/bot turns, between games, and while disconnected.
  private turnWatchListeners = new Set<(w: TurnWatch) => void>();
  private turnWaitTimer:    ReturnType<typeof setTimeout> | null = null;
  private turnStallTimer:   ReturnType<typeof setTimeout> | null = null;
  private turnWatchKey:     string | null = null;          // armed `${turn}:${activeTankId}`
  private _turnWatch:       TurnWatch = { state: 'clear' };
  private quickChatListeners = new Set<(message: QuickChatMessage) => void>();
  private accountProgressListeners = new Set<() => void>();
  private lastQuickChatAt = -Infinity;
  private static readonly QUICK_CHAT_COOLDOWN_MS = 800;
  private static readonly TURN_WAIT_MS  = 12000;
  private static readonly TURN_STALL_MS = 30000;

  // Rematch signaling. The old room's rematch_room_id flips from NULL to the
  // successor room id when either player clicks Restart; both clients observe it
  // on the rooms UPDATE stream and migrate. _rematchHandled makes that one-shot.
  private rematchListener:  ((info: RematchInfo) => void) | null = null;
  private _rematchHandled   = false;
  private static readonly REMATCH_POLL_ATTEMPTS = 20;
  private static readonly REMATCH_POLL_INTERVAL_MS = 150;

  // --- CPU-seat driving (client-driven, idempotent) ---
  // engine tank id ('p1'..) → CPU difficulty, for bot seats only.
  private botByTank:        Map<string, AiDifficulty>;
  // engine tank id → that seat's Supabase player UUID (to submit on its behalf).
  private supaIdByTank:     Map<string, string>;
  // Per-room gravity (for the AI's trajectory sim to match the engine).
  private gravity:          number;
  // Engine-normalized store tier, so the planner never proposes a buy replay will reject.
  private armsLevel:        number;
  // Guards one bot submission per (turn, bot) from THIS client; the seq-unique +
  // referee cursor make the cross-client race exactly-once regardless. `lastBotKey`
  // latches our accepted intent or an exact matching ordered row; a conflict waits
  // for its canonical row because the winning intent may differ. Weapon preparation
  // succeeds only when canonical replay proves usable inventory. `botSubmitPendingKey`
  // marks the phase whose POST is currently in
  // flight, so the ~60fps emitState cadence does not spam duplicate submits while one
  // is outstanding. A transient failure clears the pending mark WITHOUT latching, so
  // the next frame re-attempts instead of wedging the room (#119 / reliability-002).
  private lastBotKey:       string | null = null;
  private botSubmitPendingKey: string | null = null;
  private botActionAttempt: BotActionAttempt | null = null;
  private botPlanCache: BotPlanCache | null = null;
  private botPreparationFailedKey: string | null = null;
  private botAccessoryPreparationFailedKey: string | null = null;
  private botPreparationFailureMessage: string | null = null;
  private pendingBotPreparationNotice: string | null = null;

  // For computing the NEXT active seat after a turn-ending action (P0-3): the
  // room options (to build a throwaway engine) and the ordered log of actions
  // applied so far. The submitting client replays log + its pending action to
  // learn whose turn is next — its engine skips ELIMINATED seats, which the
  // server's raw modulo cursor cannot. The server stores that index, so the
  // referee tracks the engine's alive-only rotation in 3-4P games.
  private options:          NetworkGameOptions;
  private appliedLog:       NetworkAction[] = [];

  // ---- constructor ----
  constructor(
    supabase:  SupabaseClient,
    roomId:    string,
    playerId:  string,
    options:   NetworkGameOptions,
    token?:    string,
    commandProtocolVersion?: unknown,
  ) {
    if (commandProtocolVersion !== CURRENT_ROOM_COMMAND_VERSION) {
      throw new Error('NetworkClient: incompatible command protocol');
    }
    this.supabase         = supabase;
    this.roomId           = roomId;
    this.playerId         = playerId;
    // Prefer the token handed in (fresh from create_room/join_room); fall back to
    // whatever this seat previously persisted (e.g. a mid-room reload). Persist
    // whichever we end up with so it's available next time regardless of source.
    this.token             = token ?? readSeatToken(playerId) ?? '';
    if (this.token) writeSeatToken(playerId, this.token);
    this.options          = options;
    this.listeners        = new Set();
    this.rafId            = null;
    this.channel          = null;
    this.roomsChannel     = null;
    this.quickChatChannel = null;
    this.orderedActions   = new OrderedActionSession();

    // Build the Supabase UUID → engine tank ID mapping from the ordered players
    // array. players[0] → 'p1', players[1] → 'p2', etc. This must match the
    // order used by placeTanks() in the engine, which assigns IDs by array index.
    this.playerIndexMap = new Map(
      (options.players ?? []).map((p, i) => [p.id, `p${i + 1}`])
    );

    // CPU-seat maps: which engine tanks are bots (+ difficulty), and each seat's
    // Supabase id so this client can submit on a bot's behalf. Same ordering as
    // placeTanks (players[i] → 'p{i+1}'), so every client agrees on the seats.
    this.botByTank = new Map();
    this.supaIdByTank = new Map();
    (options.players ?? []).forEach((p, i) => {
      const tankId = `p${i + 1}`;
      this.supaIdByTank.set(tankId, p.id);
      if (p.ai) this.botByTank.set(tankId, p.ai);
    });
    this.gravity = options.gravity ?? GRAVITY;
    this.armsLevel = normalizeRoomArmsLevel(options.armsLevel);

    // Instantiate local engine. Cast to GameOptions — the engine reads
    // { name, color, ai } from each player entry, ignoring any extra fields.
    this.engine = new GameEngine(options as GameOptions);
    this.initialTerrain = this.engine.getState().terrain.slice();
  }

  // ---- GameClient interface ----

  /** Resolve local ownership in the engine's positional tank-id namespace. */
  ownsEnginePlayer(enginePlayerId: string): boolean {
    return this.playerIndexMap.get(this.playerId) === enginePlayerId;
  }

  /**
   * initialize() is NOT part of the GameClient interface but MUST be called
   * before start(). main.ts calls it via: await nc.initialize()
   *
   * After initialize() returns, all historical actions have been replayed and
   * the engine is in PLAYER_TURN (or GAME_OVER). start() may then be called.
   */
  async initialize(): Promise<void> {
    // 1. Replay existing action log in seq order.
    const { data: existingActions, error } = await this.supabase
      .from('room_actions')
      .select('*')
      .eq('room_id', this.roomId)
      .order('seq', { ascending: true });

    if (error) {
      throw new Error(`NetworkClient: failed to fetch action log: ${error.message}`);
    }

    // Number of rows to replay per event-loop turn. Keeps the tab responsive for
    // late joiners replaying a long action log. Named constant — playtest-tunable.
    const REPLAY_CHUNK_SIZE = 16;

    const rows = (existingActions ?? []) as RoomActionRow[];
    for (const [index, row] of rows.entries()) {
      if (row.seq !== index) {
        throw new Error(`NetworkClient: noncontiguous room action history at seq ${row.seq}`);
      }
      this.validateRoomActionRowShape(row);
    }
    this.orderedActions.beginReplay();
    await replayInChunks(
      rows,
      (row) => {
        this.applyRoomActionRow(row);
        this.tickToCompletion();
      },
      REPLAY_CHUNK_SIZE,
      () => new Promise<void>((r) => setTimeout(r, 0)),
    );
    this.orderedActions.finishReplay(rows.length);
    this.finishBotPlanReplay();
    this.clearStaleBotPreparationFailure();

    // 2. Subscribe to new room_actions rows via Realtime Postgres Changes.
    this.channel = this.supabase
      .channel(`room_actions:${this.roomId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'room_actions',
          filter: `room_id=eq.${this.roomId}`,
        },
        (payload: RealtimePostgresInsertPayload<RoomActionRow>) => {
          const row = payload.new as RoomActionRow;
          // Drop already-applied rows before buffering to prevent a slow memory
          // leak where stale keys below nextExpectedSeq accumulate indefinitely
          // (flushPendingActions only ever consumes the exact nextExpectedSeq key).
          if (!this.orderedActions.buffer(row.seq, row)) return;
          // Buffer the incoming action keyed by its seq number.
          // Do not apply immediately — Supabase Realtime does not guarantee
          // delivery order, so seq=6 may arrive before seq=5. Buffer and flush
          // in strict order.
          this.flushPendingActions();
          // Diagnostic (obs-008): a healthy stream buffers at most a small transient
          // burst before nextExpectedSeq fills the gap. If the buffer STILL holds more
          // than a few entries after a flush, a seq was likely LOST in Realtime delivery
          // and the engine is stalling on the gap — a state the turn-stall watchdog
          // reports to the user but which is otherwise indistinguishable in logs from a
          // legitimately idle opponent.
          if (this.orderedActions.pendingSize > 3) {
            console.warn('NetworkClient: pending-action gap — actions buffered behind a missing seq', {
              roomId: this.roomId,
              expected: this.orderedActions.nextExpectedSeq,
              buffered: this.orderedActions.pendingSequences,
            });
          }
        }
      )
      .subscribe((status) => {
        // Realtime link lifecycle. SUBSCRIBED = live; the error/closed states mean
        // the socket dropped (Supabase retries automatically and re-fires SUBSCRIBED
        // on recovery). Ignore CLOSED during our own teardown (stop()).
        if (status === 'SUBSCRIBED') {
          const firstSubscribe = !this._everSubscribed;
          const recovered = this._everSubscribed && this._connection !== 'connected';
          this.setConnection('connected');
          this._everSubscribed = true;
          // Re-fetch (from nextExpectedSeq) any actions we could not have received
          // live, and flush them in order. This idempotent catch-up covers two gaps:
          //   - recovered: turns committed during a socket outage (re-subscribe).
          //   - firstSubscribe: an action committed in the window between initialize()'s
          //     initial log fetch and THIS first SUBSCRIBED (#118 / reliability-001).
          //     The fetch snapshot missed it and the INSERT fired before the channel
          //     was live, so without this re-fetch that seq is never delivered — and
          //     flushPendingActions wedges on the hole forever.
          if (firstSubscribe || recovered) void this.resyncLog();
        } else if (
          !this._closing &&
          (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
        ) {
          this.setConnection('reconnecting');
        }
      });

    // 3. Subscribe to this room's UPDATE stream to detect a rematch. When either
    //    player requests one, restart_game sets rematch_room_id on THIS room;
    //    the broadcast (rooms is REPLICA IDENTITY FULL) carries the new id to
    //    both clients, which then migrate to the successor room together.
    this.roomsChannel = this.supabase
      .channel(`rooms:game:${this.roomId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'rooms',
          filter: `id=eq.${this.roomId}`,
        },
        (payload: RealtimePostgresUpdatePayload<{ rematch_room_id?: string | null }>) => {
          const next = (payload.new?.rematch_room_id ?? null) as string | null;
          if (next && !this._rematchHandled) {
            this._rematchHandled = true;
            void this.handleRematch(next);
          }
        }
      )
      .subscribe();

    this.quickChatChannel = this.supabase
      .channel(`quick_chat:${this.roomId}`)
      .on(
        'broadcast',
        { event: 'quick_chat' },
        (message: { payload?: unknown }) => {
          if (this._disposed) return;
          const parsed = parseQuickChatPayload(message?.payload);
          if (!parsed) return;
          const player = (this.options.players ?? []).find((candidate) => candidate.id === parsed.playerId);
          if (!player) return;
          const notification: QuickChatMessage = {
            ...parsed,
            playerName: player.name,
          };
          for (const listener of this.quickChatListeners) listener(notification);
        },
      )
      .subscribe();
  }

  sendQuickChat(key: QuickChatKey): boolean {
    const channel = this.quickChatChannel;
    const now = Date.now();
    if (!channel || !isQuickChatKey(key) || now - this.lastQuickChatAt < NetworkClient.QUICK_CHAT_COOLDOWN_MS) return false;
    this.lastQuickChatAt = now;
    void channel.send({
      type: 'broadcast',
      event: 'quick_chat',
      payload: { key, playerId: this.playerId },
    }).catch(() => undefined);
    return true;
  }

  onQuickChat(listener: (message: QuickChatMessage) => void): () => void {
    this.quickChatListeners.add(listener);
    return () => this.quickChatListeners.delete(listener);
  }

  /**
   * Begin the rAF loop. RAF timestamps produce fixed 60 Hz logical beats;
   * each beat advances complete engine ticks and emits one presentation state.
   *
   * NOTE: In LIVE play a fire echo is applied in flushPendingActions WITHOUT
   * ticking to completion (tickToCompletion runs only during initialize() replay).
   * The input lock and command watchdog are released only when the matching echo
   * applies, before this RAF loop animates the flight. A long shot's animation cannot
   * trip the watchdog. This RAF loop renders the flight tick-by-tick and,
   * when the engine leaves FIRING/RESOLVING, drains the next buffered action.
   */
  setFastForward(on: boolean): void {
    this._fastForward = on;
  }

  start(): void {
    if (this._disposed || this.frameRunning) return;
    this.frameRunning = true;
    const generation = ++this.frameGeneration;
    this.frameClock.reset(performance.now());
    const isCurrent = (): boolean => (
      !this._disposed && this.frameRunning && this.frameGeneration === generation
    );
    const schedule = (loop: FrameRequestCallback): void => {
      if (isCurrent()) this.rafId = requestAnimationFrame(loop);
    };
    const loop: FrameRequestCallback = (timestamp): void => {
      if (!isCurrent()) return;
      this.rafId = null;
      const logicalBeats = this.frameClock.advance(timestamp);
      for (let beat = 0; beat < logicalBeats; beat++) {
        if (!isCurrent()) return;
        // Fast-forward runs eight fixed ticks per logical beat while a shot is
        // busy. Ordered-action handoff remains limited to one drain per beat.
        const maxTicks = fastForwardTicks(this._fastForward, this.engine.getState().phase);
        for (let i = 0; i < maxTicks; i++) {
          const preTick = this.engine.getState().phase;
          const wasBusy = preTick === 'FIRING' || preTick === 'RESOLVING';
          this.engine.tick();
          const nowBusy = this.engine.getState().phase === 'FIRING' || this.engine.getState().phase === 'RESOLVING';
          // When the engine LEAVES the entire flight-resolution sequence (FIRING then
          // RESOLVING) and reaches an input-accepting phase (PLAYER_TURN/ROUND_OVER/
          // GAME_OVER), drain the NEXT buffered action. flushPendingActions stops once
          // the engine re-enters FIRING, so the next logical beat advances that shot.
          if (wasBusy && !nowBusy) {
            this.flushPendingActions();
            break;
          }
          if (!wasBusy) break;
        }
        if (!isCurrent()) return;
        this.emitState();
        if (!isCurrent()) return;
      }
      schedule(loop);
    };
    schedule(loop);
  }

  stop(): void {
    this.frameRunning = false;
    this.frameGeneration++;
    this._closing = true; // so removeChannel()'s CLOSED isn't reported as a drop
    this._disposed = true; // backstop for async work already in flight (see field doc)
    this.retirePendingCommands();
    this.orderedActions.dispose();
    this.clearCommandWatchdog();
    this.fireLockOwner = null;
    this.clearTurnWatchTimers();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.roomsChannel) {
      this.supabase.removeChannel(this.roomsChannel);
      this.roomsChannel = null;
    }
    if (this.quickChatChannel) {
      this.supabase.removeChannel(this.quickChatChannel);
      this.quickChatChannel = null;
    }
    this.quickChatListeners.clear();
    this.accountProgressListeners.clear();
    this.botActionAttempt = null;
    this.botPlanCache = null;
    this.botPreparationFailedKey = null;
    this.botAccessoryPreparationFailedKey = null;
    this.botPreparationFailureMessage = null;
    this.pendingBotPreparationNotice = null;
  }

  invalidatePendingCommands(): void {
    if (this._disposed) return;
    this.retirePendingCommands();
    this.setFiring(false);
    this.emitState();
  }

  /**
   * Submit a player input.
   *
   * Aim actions (set_angle, set_power, select_weapon) are applied locally only.
   * Canonical movement is submitted and applied from its ordered Realtime echo.
   *
   * Fire actions: read the committed aim state from the engine, then POST to the
   * submit_action Edge Function. The action is NOT applied locally here — the
   * Realtime INSERT callback applies it for all clients (including the firing
   * client) to guarantee identical sequencing. The round-trip latency means the
   * Fire button should be disabled with a "Sending..." state until the Realtime
   * echo arrives and flushPendingActions() emits the new state.
   */
  sendAction(action: PlayerAction): void {
    const engineTankId = this.playerIndexMap.get(this.playerId);
    if (!engineTankId) {
      // Log only a short prefix — playerId is a public seat identifier, not the
      // secret seat-token credential.
      console.error('NetworkClient.sendAction: no engine tank ID for playerId', this.playerId?.slice(0, 8));
      return;
    }

    const state = this.engine.getState();

    if (
      this.pendingRoomCommand
      && this.pendingRoomCommand.envelope.actorPlayerId === this.playerId
      && (action.type === 'set_angle' || action.type === 'set_power' || action.type === 'select_weapon')
    ) {
      this.notifyCommandFailure('Another action is still pending.');
      return;
    }

    // ROUND_OVER between-rounds shop (V1 match structure, networked). Turn ownership
    // does NOT apply here — every player may shop their own tank, and the round is
    // advanced by the staged opener. Both actions are LOGGED so all clients leave the
    // shop in the same seq slot (a local-only apply would desync). The `roundOver`
    // flag tells the referee to skip its turn gate for these.
    if (state.phase === 'ROUND_OVER') {
      if (action.type === 'buy') {
        // Always name the buyer's OWN tank: in ROUND_OVER the engine routes a buy by
        // tankId, and the referee only accepts a buy for your own seat. (We ignore any
        // tankId the HUD passed — a networked player can only spend their own credits.)
        this.submitAction({
          type: 'buy',
          ...(action.weapon ? { weapon: action.weapon } : {}),
          ...(action.accessory ? { accessory: action.accessory } : {}),
          tankId: engineTankId,
        }, true, undefined, 0, true);
        return;
      }
      if (action.type === 'next_round') {
        // Only the staged opener's client submits next_round, so the referee sees
        // exactly one (no double-advance). Every client agrees on the opener
        // (deterministic), and p1 — the room creator — is always a human, so the
        // shop can always be left. A stray duplicate replays as an engine no-op.
        if (state.activePlayerId !== engineTankId) return;
        this.submitAction({ type: 'next_round' }, true, undefined, 0, true);
        return;
      }
      return; // aim / fire / shield are ignored during the shop
    }

    // Outside the shop, next_round is meaningless.
    if (action.type === 'next_round') return;

    // Only process input when it is this player's turn.
    if (state.activePlayerId !== engineTankId) return;

    // buy is a turn-NEUTRAL COMMITTED action: logged (so all clients replay the
    // credit/inventory change) but it does not end the turn. During a normal turn the
    // engine buys for the ACTIVE tank (no tankId), so the referee turn-gates it.
    if (action.type === 'buy') {
      this.submitAction({
        type: 'buy',
        ...(action.weapon ? { weapon: action.weapon } : {}),
        ...(action.accessory ? { accessory: action.accessory } : {}),
      });
      return;
    }

    // Movement changes canonical tank position, so unlike aim it must be logged
    // and applied only from the ordered Realtime echo. It remains turn-neutral:
    // submitAction neither computes nor reports a next seat for `move`.
    if (action.type === 'move') {
      if (state.phase !== 'PLAYER_TURN') return;
      this.submitAction({ type: 'move', delta: action.delta });
      return;
    }

    // use_shield is a turn-ending COMMITTED action (like fire): it must be logged
    // so all clients replay it. Gate on shield ammo locally (the engine re-gates)
    // to avoid logging a no-op, then submit.
    if (action.type === 'use_shield') {
      const shielder = state.tanks.find(t => t.id === engineTankId);
      if (!shielder) return;
      const shieldWeapon = action.weapon ?? (shielder.selectedWeapon === 'heavy_shield' ? 'heavy_shield' : 'shield');
      const ammo = shielder.inventory[shieldWeapon];
      if (!ammo.unlimited && ammo.count <= 0) return;
      this.submitAction({ type: 'use_shield', weapon: shieldWeapon });
      return;
    }

    if (action.type !== 'fire') {
      // Aim actions (set_angle/set_power/select_weapon): apply locally only.
      // Canonical movement and turn-ending actions have already branched above.
      this.engine.applyAction(action);
      this.emitState();
      return;
    }

    // Fire action: read the committed aim state from the engine.

    const activeTank = state.tanks.find(t => t.id === engineTankId);
    if (!activeTank) {
      console.error('NetworkClient.sendAction: tank not found for engine ID', engineTankId);
      return;
    }

    const networkAction: NetworkFireAction = {
      type:   'fire',
      angle:  activeTank.angle,
      power:  activeTank.power,
      weapon: activeTank.selectedWeapon,
    };

    this.submitAction(networkAction);
  }

  getState(): BorrowedGameState {
    return this.engine.getState();
  }

  getInitialTerrain(): Uint8Array {
    return this.initialTerrain;
  }

  getEffectiveGravity(): number {
    return this.engine.getEffectiveGravity();
  }

  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get isFiring(): boolean { return this._isFiring; }

  onRematch(listener: (info: RematchInfo) => void): () => void {
    this.rematchListener = listener;
    return () => { if (this.rematchListener === listener) this.rematchListener = null; };
  }

  // ---- Liveness API (REVIEW_BACKLOG P1-6) ----

  /** Subscribe to connection-state changes; fires immediately with the current state. */
  onConnectionChange(listener: (state: ConnectionState) => void): () => void {
    this.connectionListeners.add(listener);
    listener(this._connection); // prime with current state
    return () => this.connectionListeners.delete(listener);
  }

  /** Subscribe to fire/shield submission failures (rejected or never echoed). */
  onFireFailed(listener: (message: string) => void): () => void {
    this.fireFailedListeners.add(listener);
    if (this.pendingBotPreparationNotice) {
      const message = this.pendingBotPreparationNotice;
      this.pendingBotPreparationNotice = null;
      listener(message);
    }
    return () => this.fireFailedListeners.delete(listener);
  }

  onAccountProgressChanged(listener: () => void): () => void {
    this.accountProgressListeners.add(listener);
    return () => this.accountProgressListeners.delete(listener);
  }

  /** Update + broadcast the connection state (no-op if unchanged). */
  private setConnection(state: ConnectionState): void {
    if (this._connection === state) return;
    this._connection = state;
    for (const l of this.connectionListeners) l(state);
  }

  private setFiring(value: boolean): void {
    this._isFiring = value;
  }

  private clearCommandWatchdog(): void {
    if (this.commandWatchdog === null) return;
    clearTimeout(this.commandWatchdog);
    this.commandWatchdog = null;
  }

  private armCommandWatchdog(pending: PendingRoomCommand, deliveryEpoch: number): void {
    this.clearCommandWatchdog();
    this.commandWatchdog = setTimeout(() => {
      this.commandWatchdog = null;
      if (!this.isCurrentDelivery(pending, deliveryEpoch)) return;
      void this.recoverRoomCommand(pending, deliveryEpoch, 'Action timed out — retry the same action.');
    }, NetworkClient.FIRE_TIMEOUT_MS);
  }

  private lockFiringFor(pending: PendingRoomCommand, deliveryEpoch: number): void {
    this.fireLockOwner = { pending, deliveryEpoch };
    this.setFiring(true);
  }

  private releaseFiringFor(pending: PendingRoomCommand, deliveryEpoch?: number): void {
    const owner = this.fireLockOwner;
    if (!owner || owner.pending !== pending) return;
    if (deliveryEpoch !== undefined && owner.deliveryEpoch !== deliveryEpoch) return;
    this.fireLockOwner = null;
    this.setFiring(false);
  }

  /** Release a stuck fire lock and notify the UI so the player can re-aim. */
  private failFire(message: string): void {
    if (this._disposed) return; // client torn down — no lock to release, no one to notify
    this.fireLockOwner = null;
    this.setFiring(false);
    this.emitState(); // re-render so the HUD drops "Sending…" immediately
    for (const l of this.fireFailedListeners) l(message);
  }

  private notifyCommandFailure(message: string): void {
    if (this._disposed) return;
    for (const listener of this.fireFailedListeners) listener(message);
  }

  /**
   * Re-fetch the action log from nextExpectedSeq onward and flush it. Called after
   * a Realtime RE-subscribe so any turns committed during an outage are applied in
   * order — the canonical log is the source of truth, so this is a safe, idempotent
   * catch-up (rows we already have are skipped by the seq gate in flushPendingActions).
   */
  private async resyncLog(
    commandGeneration = this.commandGeneration,
    stillCurrent: () => boolean = () => true,
  ): Promise<void> {
    if (commandGeneration !== this.commandGeneration || this._disposed || !stillCurrent()) return;
    const controller = new AbortController();
    const query = this.supabase
        .from('room_actions')
        .select('*')
        .eq('room_id', this.roomId)
        .gte('seq', this.orderedActions.nextExpectedSeq)
        .order('seq', { ascending: true })
        .abortSignal(controller.signal) as unknown as PromiseLike<{
          data: unknown;
          error: { message?: string } | null;
        }>;
    const settled = await settleWithDeadline(query, NetworkClient.RESYNC_TIMEOUT_MS, () => controller.abort());
    if (commandGeneration !== this.commandGeneration || this._disposed || !stillCurrent()) return;
    if (!settled.ok) {
      console.error('NetworkClient.resyncLog: log re-fetch deadline/failed:', (settled.error as Error)?.message ?? settled.error);
      return;
    }
    const { data, error } = settled.value;
    if (error) {
      console.error('NetworkClient.resyncLog: failed to re-fetch log:', error.message);
      return;
    }
    if (!this.orderedActions.acceptResync(
      ((data ?? []) as RoomActionRow[]).map((row) => ({ seq: row.seq, action: row })),
    )) return;
    this.flushPendingActions();
  }

  /**
   * Ask the server to start a rematch. POSTs restart_game, which atomically
   * allocates ONE successor room for the pair (idempotent under double-clicks /
   * races). This does NOT migrate directly — both players migrate via the rooms
   * UPDATE broadcast → onRematch, so there is a single symmetric code path.
   */
  async requestRematch(): Promise<{ ok: boolean; error?: string }> {
    try {
      const { ok, data } = await callFunction<{ ok?: boolean; error?: string }>('restart_game', {
        roomId: this.roomId,
        playerId: this.playerId,
        token: this.token,
      });
      if (!ok || !data?.ok) {
        return { ok: false, error: data?.error ?? 'Failed to start rematch' };
      }
      return { ok: true };
    } catch (err) {
      console.error('NetworkClient: restart_game error:', err);
      return { ok: false, error: 'Network error' };
    }
  }

  // ---- private helpers ----

  /**
   * Resolve a detected successor room id into a full RematchInfo and hand it to
   * the listener. The UPDATE broadcast only carries the pointer (it is the OLD
   * room's row), so re-fetch the successor row for its seed/options/roster.
   *
   * Race note: restart_game claims the pointer (firing this broadcast) BEFORE it
   * inserts the successor room — claim-first is what prevents orphan rooms. So a
   * peer can observe rematch_room_id before the successor INSERT has replicated
   * to its read path. The single UPDATE never repeats, so we cannot rely on a
   * "later broadcast" — instead we poll a few times for the row to appear.
   */
  private async handleRematch(newRoomId: string): Promise<void> {
    const listener = this.rematchListener;
    if (!listener) return;

    // Bounded poll: the successor row is written within one edge-function
    // invocation of the pointer claim, so short retries cover replication lag
    // without hanging the UI if something truly failed.
    let data: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < NetworkClient.REMATCH_POLL_ATTEMPTS; attempt++) {
      if (this._disposed) return; // client torn down mid-poll — don't fetch or notify
      const res = await this.supabase
        .from('rooms')
        .select('id, code, seed, options, players')
        .eq('id', newRoomId)
        .maybeSingle();
      if (this._disposed) return; // torn down while the fetch was in flight
      if (res.data) { data = res.data as Record<string, unknown>; break; }
      if (res.error) {
        console.warn(`NetworkClient.handleRematch: fetch attempt ${attempt + 1} failed`, res.error);
      }
      await new Promise(resolve => setTimeout(resolve, NetworkClient.REMATCH_POLL_INTERVAL_MS));
    }

    if (this._disposed) return; // torn down during the final wait
    if (!data) {
      console.error('NetworkClient.handleRematch: successor room never resolved', newRoomId);
      this._rematchHandled = false; // let a manual re-click re-drive the migration
      return;
    }

    const opts = (data.options ?? {}) as {
      maxPlayers?: number;
      maxWind?: number;
      gravity?: number;
      rulesetVersion?: unknown;
      commandProtocolVersion?: unknown;
      walls?: WallMode;
      battlefieldWorld?: string;
      hazards?: TerrainHazardMode;
      rounds?: number;
      interestRate?: number;
      suddenDeathTurn?: number;
      armsLevel?: number;
      teamMode?: boolean;
    };
    const players = (data.players ?? []) as Array<{
      id: string;
      name: string;
      color: string;
      ai?: AiDifficulty;
      team?: TeamId;
      loadout?: TankLoadout;
    }>;
    if (normalizeNetworkRulesetVersion(opts.rulesetVersion) !== CURRENT_NETWORK_RULESET_VERSION) {
      console.warn('NetworkClient.handleRematch: incompatible successor ruleset', newRoomId);
      this._rematchHandled = false;
      return;
    }
    if (opts.commandProtocolVersion !== CURRENT_ROOM_COMMAND_VERSION) {
      console.warn('NetworkClient.handleRematch: incompatible successor command protocol', newRoomId);
      this._rematchHandled = false;
      return;
    }
    listener({
      roomId:  data.id as string,
      code:    data.code as string,
      seed:    Number(data.seed),
      options: {
        maxPlayers: opts.maxPlayers ?? players.length,
        maxWind:    typeof opts.maxWind === 'number' ? opts.maxWind : MAX_WIND,
        gravity:    typeof opts.gravity === 'number' ? opts.gravity : GRAVITY,
        rulesetVersion: normalizeNetworkRulesetVersion(opts.rulesetVersion),
        commandProtocolVersion: CURRENT_ROOM_COMMAND_VERSION,
        walls:      normalizeWallMode(opts.walls),
        ...(normalizeBattlefieldWorldId(opts.battlefieldWorld) !== undefined
          ? { battlefieldWorld: normalizeBattlefieldWorldId(opts.battlefieldWorld) }
          : {}),
        hazards:    normalizeTerrainHazardMode(opts.hazards),
        // Carry best-of-N across a rematch so the successor match keeps the format.
        ...(typeof opts.rounds === 'number' ? { rounds: opts.rounds } : {}),
        ...(typeof opts.interestRate === 'number' ? { interestRate: opts.interestRate } : {}),
        ...(typeof opts.suddenDeathTurn === 'number' ? { suddenDeathTurn: opts.suddenDeathTurn } : {}),
        ...(typeof opts.armsLevel === 'number' ? { armsLevel: opts.armsLevel } : {}),
        ...(opts.teamMode === true ? { teamMode: true } : {}),
      },
      players: projectNetworkPlayers(players),
    });
  }

  /** Submit exactly one immutable command envelope for the current room revision. */
  private submitAction(
    networkAction: NetworkAction,
    _retryOnConflict = true,
    actingPlayerId?: string,
    _attempt = 0,
    roundOver = false,
    onSettle?: (settlement: BotSubmitSettlement) => void,
  ): boolean {
    if (this._disposed || this.canonicalCommandFault) return false;
    const actorPlayerId = actingPlayerId ?? this.playerId;
    const actorTankId = this.playerIndexMap.get(actorPlayerId);
    if (!actorTankId) return false;
    const existing = this.pendingRoomCommand;
    if (existing) {
      if (
        existing.state === 'retryable'
        && existing.envelope.expectedRevision === this.nextExpectedSeq
        && existing.envelope.actorPlayerId === actorPlayerId
        && networkActionsEqual(existing.envelope.action, networkAction)
      ) {
        this.beginRoomCommandDelivery(existing, onSettle);
        return true;
      } else if (!actingPlayerId) {
        this.notifyCommandFailure('Another action is still pending.');
      }
      return false;
    }
    const isTurnEnding = networkAction.type === 'fire' || networkAction.type === 'use_shield';
    let nextActiveIndex: number | undefined;
    let endsRound = roundOver; // ROUND_OVER buy / next_round pass this in directly
    if (isTurnEnding) {
      const seat = this.computeNextSeat(networkAction);
      nextActiveIndex = seat.index;
      endsRound = endsRound || seat.endsRound;
    }
    const expectedRevision = this.nextExpectedSeq;
    const kind = networkAction.type === 'buy' ? 'buy' : 'act';
    const intentId = actingPlayerId
      ? cpuRoomIntentId({ roomId: this.roomId, expectedRevision, actorPlayerId, kind })
      : crypto.randomUUID();
    const envelope: RoomCommandEnvelopeV2<NetworkAction> = {
      version: CURRENT_ROOM_COMMAND_VERSION,
      intentId,
      expectedRevision,
      actorPlayerId,
      action: networkAction,
      ...(typeof nextActiveIndex === 'number' ? { nextActiveIndex } : {}),
      ...(endsRound ? { roundOver: true } : {}),
    };
    const body = JSON.stringify({
      roomId: this.roomId,
      playerId: this.playerId,
      token: this.token,
      rulesetVersion: normalizeNetworkRulesetVersion(this.options.rulesetVersion),
      command: envelope,
    });
    const pending: PendingRoomCommand = {
      generation: this.commandGeneration,
      envelope,
      body,
      actorTankId,
      humanTurnEnding: !actingPlayerId && isTurnEnding,
      deliveryEpoch: 0,
      state: 'retryable',
      transportAbort: null,
      ...(onSettle ? { onSettle } : {}),
    };
    this.pendingRoomCommand = pending;
    this.beginRoomCommandDelivery(pending, onSettle);
    return true;
  }

  private beginRoomCommandDelivery(
    pending: PendingRoomCommand,
    onSettle?: (settlement: BotSubmitSettlement) => void,
  ): void {
    this.clearCommandWatchdog();
    pending.transportAbort?.abort();
    pending.deliveryEpoch += 1;
    pending.state = 'delivering';
    if (onSettle) pending.onSettle = onSettle;
    const deliveryEpoch = pending.deliveryEpoch;
    if (pending.humanTurnEnding) this.lockFiringFor(pending, deliveryEpoch);
    void this.deliverRoomCommand(pending, deliveryEpoch);
  }

  private async deliverRoomCommand(pending: PendingRoomCommand, deliveryEpoch: number): Promise<void> {
    const current = (): boolean => this.isCurrentDelivery(pending, deliveryEpoch);
    const controller = new AbortController();
    pending.transportAbort = controller;
    const attempts = postOnceWithRetry(
      async () => {
        const response = await fetch(edgeUrl('submit_action'), {
          method: 'POST', headers: edgeHeaders(), body: pending.body, signal: controller.signal,
        });
        const data = await response.json() as unknown;
        return {
          status: Number.isInteger(response.status) ? response.status : undefined,
          data,
        };
      },
      2,
      undefined,
      current,
    );
    const bounded = await settleWithDeadline(
      attempts,
      NetworkClient.COMMAND_DELIVERY_TIMEOUT_MS,
      () => controller.abort(),
    );
    if (!current()) return;
    pending.transportAbort = null;
    const result = bounded.ok ? bounded.value : bounded;
    if (!result.ok) {
      console.error('NetworkClient: submit_action transport uncertainty:', result.error);
      await this.recoverRoomCommand(
        pending,
        deliveryEpoch,
        'Connection problem — retry the same action.',
      );
      return;
    }
    const { data, status } = result.value;
    if (status !== undefined && status >= 500) {
      console.error('NetworkClient: submit_action server response is uncertain', { status });
      await this.recoverRoomCommand(
        pending,
        deliveryEpoch,
        'Server response uncertain — retry the same action.',
      );
      return;
    }
    if ((status === undefined || (status >= 200 && status < 300)) && this.isReceiptFor(pending, data)) {
      pending.onSettle?.('accepted');
      pending.state = 'awaiting-echo';
      await this.resyncLog(pending.generation, current);
      if (current()) this.armCommandWatchdog(pending, deliveryEpoch);
      return;
    }
    const error = typeof data === 'object' && data !== null && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : undefined;
    const mappedConflict = isMappedCommandResponse(error, status, ROOM_COMMAND_CONFLICT_STATUS);
    const legacyNotYourTurn = status === undefined && error === 'Not your turn';
    if (mappedConflict || legacyNotYourTurn) {
      if (error === 'not_your_turn' || legacyNotYourTurn) {
        console.warn('NetworkClient: submit_action "Not your turn" — possible desync', {
          roomId: this.roomId,
          localActivePlayerId: this.engine.getState().activePlayerId,
        });
      }
      pending.onSettle?.('conflict');
      pending.state = 'recovering';
      await this.resyncLog(pending.generation, current);
      if (!current()) return;
      this.releaseFiringFor(pending, deliveryEpoch);
      this.finishPendingCommand(pending);
      if (pending.humanTurnEnding) this.emitState();
      if (pending.envelope.actorPlayerId === this.playerId) {
        this.notifyCommandFailure('Turn changed — review the updated game and try again.');
      }
      return;
    }
    const mappedRefusal = isMappedCommandResponse(error, status, ROOM_COMMAND_REFUSAL_STATUS);
    const legacyRefusal = status === undefined && error !== undefined && error !== '';
    if (mappedRefusal || legacyRefusal) {
      console.error('NetworkClient: submit_action rejected:', error);
      pending.onSettle?.('failed');
      this.releaseFiringFor(pending, deliveryEpoch);
      this.finishPendingCommand(pending);
      if (pending.humanTurnEnding) this.emitState();
      if (pending.envelope.actorPlayerId === this.playerId) this.notifyCommandFailure('Action failed — try again.');
      return;
    }
    console.error('NetworkClient: submit_action returned an incompatible command receipt');
    pending.state = 'awaiting-echo';
    this.notifyCommandFailure('Command receipt mismatch — reload to continue.');
    this.armCommandWatchdog(pending, deliveryEpoch);
  }

  private async recoverRoomCommand(
    pending: PendingRoomCommand,
    deliveryEpoch: number,
    message: string,
  ): Promise<void> {
    if (!this.isCurrentDelivery(pending, deliveryEpoch)) return;
    pending.state = 'recovering';
    const current = (): boolean => this.isCurrentDelivery(pending, deliveryEpoch);
    await this.resyncLog(pending.generation, current);
    if (!current()) return;
    if (this.orderedActions.nextExpectedSeq > pending.envelope.expectedRevision) {
      const onSettle = pending.onSettle;
      const shouldDriveBot = onSettle !== undefined;
      this.releaseFiringFor(pending, deliveryEpoch);
      this.finishPendingCommand(pending);
      onSettle?.('failed');
      if (pending.humanTurnEnding || shouldDriveBot) this.emitState();
      if (pending.envelope.actorPlayerId === this.playerId) {
        this.notifyCommandFailure('Turn changed — review the updated game and try again.');
      }
      return;
    }
    pending.state = 'retryable';
    this.releaseFiringFor(pending, deliveryEpoch);
    pending.onSettle?.('failed');
    if (pending.humanTurnEnding) this.emitState();
    if (pending.envelope.actorPlayerId === this.playerId) this.notifyCommandFailure(message);
  }

  private isReceiptFor(pending: PendingRoomCommand, value: unknown): value is RoomCommandReceiptV2 {
    if (typeof value !== 'object' || value === null) return false;
    const receipt = value as Partial<RoomCommandReceiptV2>;
    return receipt.ok === true
      && receipt.protocolVersion === CURRENT_ROOM_COMMAND_VERSION
      && receipt.intentId === pending.envelope.intentId
      && receipt.seq === pending.envelope.expectedRevision
      && receipt.revision === pending.envelope.expectedRevision + 1
      && receipt.actorPlayerId === pending.envelope.actorPlayerId
      && receipt.actorTankId === pending.actorTankId;
  }

  private isCurrentCommand(pending: PendingRoomCommand): boolean {
    return !this._disposed
      && pending.generation === this.commandGeneration
      && this.pendingRoomCommand === pending;
  }

  private isCurrentDelivery(pending: PendingRoomCommand, deliveryEpoch: number): boolean {
    return this.isCurrentCommand(pending) && pending.deliveryEpoch === deliveryEpoch;
  }

  private finishPendingCommand(pending: PendingRoomCommand): void {
    if (this.pendingRoomCommand !== pending) return;
    this.clearCommandWatchdog();
    pending.transportAbort?.abort();
    pending.transportAbort = null;
    pending.deliveryEpoch += 1;
    this.pendingRoomCommand = null;
  }

  private retirePendingCommands(): void {
    const pending = this.pendingRoomCommand;
    this.clearCommandWatchdog();
    pending?.transportAbort?.abort();
    if (pending) pending.deliveryEpoch += 1;
    if (pending) this.releaseFiringFor(pending);
    this.commandGeneration += 1;
    this.pendingRoomCommand = null;
    this.botSubmitPendingKey = null;
    this.botActionAttempt = null;
    this.botPlanCache = null;
  }

  /**
   * Apply a logged network action to the local engine and RECORD it in the
   * applied log (used to compute the next active seat — see computeNextSeat).
   * Preparation recovery is derived here from canonical before/after state so
   * live observers, resyncs, and late-history replays reach the same decision.
   */
  private applyNetworkAction(action: NetworkAction, expectedRevision = this.nextExpectedSeq): void {
    const before = this.engine.getState();
    const context = {
      phase: before.phase,
      round: before.round,
      turn: before.turn,
      tankId: before.activePlayerId,
    };
    const preparation = this.describeBotPreparation(action, before, expectedRevision);
    replayNetworkAction(this.engine, action);
    this.appliedLog.push(action);
    if (preparation) this.reconcileBotPreparation(preparation);
    this.reconcileBotActionAttempt(action, context);
  }

  private applyRoomActionRow(row: RoomActionRow): (() => string | undefined) | null {
    this.validateRoomActionRowShape(row);
    const pending = this.pendingRoomCommand;
    if (pending && row.seq === pending.envelope.expectedRevision) {
      const matches = row.intent_id === pending.envelope.intentId
        && row.player_id === pending.envelope.actorPlayerId
        && networkActionsEqual(row.action, pending.envelope.action);
      this.applyNetworkAction(row.action, row.seq);
      if (matches) {
        return () => {
          this.releaseFiringFor(pending);
          this.finishPendingCommand(pending);
          return undefined;
        };
      } else if (!pending.onSettle) {
        return () => {
          this.releaseFiringFor(pending);
          this.finishPendingCommand(pending);
          return pending.humanTurnEnding
            ? 'Turn changed — review the updated game and try again.'
            : undefined;
        };
      }
      return null;
    }

    this.applyNetworkAction(row.action, row.seq);
    return null;
  }

  private validateRoomActionRowShape(row: RoomActionRow): void {
    const binding = row.action?.commandActor;
    const mappedTankId = this.playerIndexMap.get(row.player_id);
    if (
      row.command_version !== CURRENT_ROOM_COMMAND_VERSION
      || !row.intent_id
      || row.expected_revision !== row.seq
      || !binding
      || !mappedTankId
      || binding.tankId !== mappedTankId
    ) {
      throw new Error(`NetworkClient: incompatible command row at seq ${row.seq}`);
    }
  }

  /**
   * Compute, for a turn-ending action, the 0-based SEAT INDEX active AFTER it commits
   * AND whether it ends a round. Derives the post-turn seat from the LIVE engine (which
   * already reflects all of `appliedLog`) by cloning it, applying ONLY the pending action
   * to the clone, ticking to completion, and reading the resulting state. This is O(1)
   * per call — no throwaway `GameEngine` construction and no `appliedLog` replay loop.
   * Because the engine skips ELIMINATED tanks and re-seats the opener at a round
   * boundary, `index` is the death-aware/round-aware seat the server's raw modulo cursor
   * gets wrong (P0-3 + the round reset). `endsRound` is true iff the engine paused in the
   * ROUND_OVER shop — the server uses it to honor `index` unconditionally (the opener may
   * be the seat that just fired). Deterministic — every client computes the same values.
   */
  private computeNextSeat(pending: NetworkAction): { index: number; endsRound: boolean } {
    const tmp = this.engine.clone();
    replayNetworkAction(tmp, pending);
    this.tickEngineToCompletion(tmp);
    const st = tmp.getState();
    const idx = Number(st.activePlayerId.replace(/[^0-9]/g, '')) - 1;
    return {
      index:     Number.isFinite(idx) && idx >= 0 ? idx : 0,
      endsRound: st.phase === 'ROUND_OVER',
    };
  }

  /** Tick any engine until it leaves FIRING and RESOLVING (bounded). */
  private tickEngineToCompletion(engine: GameEngine): void {
    let t = 0;
    while ((engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') && t < 10_000) { engine.tick(); t++; }
  }

  /**
   * Tick the engine forward until the phase exits FIRING and RESOLVING (i.e.,
   * reaches PLAYER_TURN, ROUND_OVER, or GAME_OVER). Must be called after every
   * applyNetworkAction() for a fire/shield to ensure the engine completes both
   * the projectile-flight phase (FIRING) and the terrain-collapse settle phase
   * (RESOLVING) before the next action is accepted.
   *
   * Hard cap of 10,000 ticks prevents an infinite loop if game state is corrupt.
   * At 16ms/tick a full ballistic arc + settle is typically 100–800 ticks; 10,000 is safe.
   */
  private tickToCompletion(): void {
    const MAX_TICKS = 10_000;
    let ticks = 0;
    while (
      (this.engine.getState().phase === 'FIRING' || this.engine.getState().phase === 'RESOLVING') &&
      ticks < MAX_TICKS
    ) {
      this.engine.tick();
      ticks++;
    }
    if (ticks >= MAX_TICKS) {
      // Log with room context so a wedge is correlatable, not an anonymous line
      // (observability-001).
      console.error('NetworkClient.tickToCompletion: hit tick cap — possible corrupt engine state', {
        roomId: this.roomId,
        turn: this.engine.getState().turn,
        phase: this.engine.getState().phase,
        seq: this.orderedActions.nextExpectedSeq,
      });
      // Don't leave the client SILENTLY frozen (reliability-006). The engine is wedged
      // in FIRING/RESOLVING, so flushPendingActions will never drain again and the board
      // is dead. Surface a user-visible signal via the fire-failed channel (which also
      // drops any lingering "Sending…" lock) so the player reloads instead of staring at
      // a frozen game. We deliberately do NOT mutate engine state here — this client is
      // already desynced; a reload re-fetches + replays the canonical log cleanly.
      this.failFire('Game state error — please reload to continue.');
    }
  }

  private describeBotPreparation(
    action: NetworkAction,
    state: GameState,
    expectedRevision: number,
  ): BotPreparation | null {
    if (state.phase !== 'PLAYER_TURN' || action.type !== 'buy') return null;
    const tankId = state.activePlayerId;
    const difficulty = this.botByTank.get(tankId);
    if (!difficulty) return null;
    const plan = this.getBotPlan(state, tankId, difficulty, expectedRevision);
    if (!plan) return null;
    const cache = this.botPlanCache;
    if (!cache) return null;
    const context = {
      generation: cache.generation,
      expectedRevision: cache.expectedRevision,
      round: cache.round,
      turn: cache.turn,
    };
    if (action.weapon && plan.buy === action.weapon) {
      return {
        ...context,
        key: this.botPreparationKey(state, tankId, 'weapon', action.weapon),
        tankId,
        kind: 'weapon',
        weapon: action.weapon,
      };
    }
    if (action.accessory && plan.buyAccessory === action.accessory) {
      const previousCount = state.tanks.find((tank) => tank.id === tankId)?.accessories[action.accessory] ?? 0;
      return {
        ...context,
        key: this.botPreparationKey(state, tankId, 'accessory', action.accessory),
        tankId,
        kind: 'accessory',
        accessory: action.accessory,
        previousCount,
      };
    }
    return null;
  }

  /**
   * The ordered action and its before/after engine state are canonical. Every
   * same-build client therefore records the same bounded recovery even if it did
   * not submit the buy itself or is replaying it from history.
   */
  private reconcileBotPreparation(
    preparation: BotPreparation,
  ): void {
    const state = this.engine.getState();
    if (!this.advanceBotPlanPreparation(preparation, state)) this.botPlanCache = null;
    if (preparation.kind === 'accessory') {
      const currentCount = state.tanks.find((tank) => tank.id === preparation.tankId)
        ?.accessories[preparation.accessory] ?? 0;
      if (currentCount > preparation.previousCount) {
        if (this.botAccessoryPreparationFailedKey === preparation.key) {
          this.botAccessoryPreparationFailedKey = null;
        }
      } else {
        this.botAccessoryPreparationFailedKey = preparation.key;
      }
      return;
    }

    if (hasUsableWeapon(state, preparation.tankId, preparation.weapon)) {
      if (this.botPreparationFailedKey === preparation.key) {
        this.botPreparationFailedKey = null;
        this.botPreparationFailureMessage = null;
        this.pendingBotPreparationNotice = null;
      }
      return;
    }

    const message = hasUsableWeapon(state, preparation.tankId, 'baby_missile')
      ? 'CPU restock failed — using Baby Missile.'
      : 'CPU has no usable ammunition — reload to continue.';
    if (
      this.botPreparationFailedKey === preparation.key
      && this.botPreparationFailureMessage === message
    ) return;
    this.botPreparationFailedKey = preparation.key;
    this.botPreparationFailureMessage = message;
    if (this.fireFailedListeners.size === 0) {
      this.pendingBotPreparationNotice = message;
      return;
    }
    for (const listener of this.fireFailedListeners) listener(message);
  }

  private advanceBotPlanPreparation(preparation: BotPreparation, state: GameState): boolean {
    const cache = this.botPlanCache;
    if (
      !cache
      || !cache.plan
      || cache.generation !== preparation.generation
      || cache.generation !== this.commandGeneration
      || cache.expectedRevision !== preparation.expectedRevision
      || (!this.orderedActions.isReplaying && cache.expectedRevision !== this.nextExpectedSeq)
      || cache.round !== preparation.round
      || cache.turn !== preparation.turn
      || cache.tankId !== preparation.tankId
      || state.phase !== 'PLAYER_TURN'
      || state.round !== preparation.round
      || state.turn !== preparation.turn
      || state.activePlayerId !== preparation.tankId
    ) return false;

    if (preparation.kind === 'weapon') {
      if (cache.weaponPreparationComplete || cache.plan.buy !== preparation.weapon) return false;
      cache.weaponPreparationComplete = true;
    } else {
      if (cache.accessoryPreparationComplete || cache.plan.buyAccessory !== preparation.accessory) return false;
      cache.accessoryPreparationComplete = true;
    }
    // OrderedActions commits this exact row's cursor immediately after replay.
    // Retain the original choices while advancing the single cached plan to that
    // next canonical revision; unrelated progress cannot satisfy these checks.
    cache.expectedRevision = preparation.expectedRevision + 1;
    return true;
  }

  private finishBotPlanReplay(): void {
    const cache = this.botPlanCache;
    if (!cache) return;
    const state = this.engine.getState();
    if (
      cache.generation !== this.commandGeneration
      || cache.expectedRevision !== this.nextExpectedSeq
      || cache.round !== state.round
      || cache.turn !== state.turn
      || cache.tankId !== state.activePlayerId
      || state.phase !== 'PLAYER_TURN'
    ) this.botPlanCache = null;
  }

  private reconcileBotActionAttempt(
    action: NetworkAction,
    context: { phase: GameState['phase']; round: number; turn: number; tankId: string },
  ): void {
    const attempt = this.botActionAttempt;
    if (
      !attempt
      || context.phase !== 'PLAYER_TURN'
      || context.round !== attempt.round
      || context.turn !== attempt.turn
      || context.tankId !== attempt.tankId
    ) return;
    if (networkActionsEqual(action, attempt.action)) {
      this.lastBotKey = attempt.phaseKey;
      if (this.botSubmitPendingKey === attempt.phaseKey) this.botSubmitPendingKey = null;
      this.botActionAttempt = null;
      return;
    }

    // A different canonical row proves only that the log advanced, not that this
    // request settled. Keep an unresolved request owned so emitState cannot submit
    // the same phase again before its HTTP result arrives. If conflict arrived
    // first, this retained row is the winner that releases one deterministic replan.
    attempt.sawCanonicalProgress = true;
    if (attempt.settlement !== 'conflict') return;
    if (this.botSubmitPendingKey === attempt.phaseKey) this.botSubmitPendingKey = null;
    this.botActionAttempt = null;
  }

  private clearStaleBotPreparationFailure(): void {
    const state = this.engine.getState();
    const turnKey = `${state.round}:${state.turn}:${state.activePlayerId}:`;
    if (this.botPreparationFailedKey && !this.botPreparationFailedKey.startsWith(turnKey)) {
      this.botPreparationFailedKey = null;
      this.botPreparationFailureMessage = null;
      this.pendingBotPreparationNotice = null;
    }
    if (
      this.botAccessoryPreparationFailedKey
      && !this.botAccessoryPreparationFailedKey.startsWith(turnKey)
    ) {
      this.botAccessoryPreparationFailedKey = null;
    }
  }

  /**
   * Flush buffered Realtime events in strict seq order.
   * Called after every buffered insertion AND from the RAF loop when a shot
   * resolves. Applies contiguous buffered actions in seq order, but ONLY while
   * the engine can accept one (phase === PLAYER_TURN). A turn-ending action flips
   * the engine to FIRING and the loop STOPS — the RAF loop animates the flight and
   * re-invokes this once it resolves. This is the P0-2 fix: never advance
   * nextExpectedSeq past an action the engine would refuse (a fire applied while
   * FIRING is silently dropped by GameEngine.applyAction's phase guard, which used
   * to lose buffered back-to-back / out-of-order actions and desync this client).
   * A turn-NEUTRAL buy keeps the engine in PLAYER_TURN, so the loop continues to
   * the next buffered action in the same pass.
   *
   * ROUND_OVER (the between-rounds shop) is ALSO an input-accepting, non-flight phase:
   * buys land on named tanks and `next_round` flips it to PLAYER_TURN. So we drain in
   * ROUND_OVER too — otherwise shop actions and the round advance would sit buffered
   * forever and the client would freeze on the scoreboard.
   */
  private flushPendingActions(): void {
    if (this.canonicalCommandFault) return;
    let afterCommit: (() => string | undefined) | null = null;
    const feedback: string[] = [];
    try {
      this.orderedActions.drain(
        () => {
          const phase = this.engine.getState().phase;
          return phase === 'PLAYER_TURN' || phase === 'ROUND_OVER';
        },
        (row) => { afterCommit = this.applyRoomActionRow(row); },
        () => this.tickToCompletion(),
        () => {
          const effect = afterCommit;
          afterCommit = null;
          const message = effect?.();
          this.emitState();
          if (message) feedback.push(message);
        },
      );
    } catch (error) {
      this.canonicalCommandFault = true;
      console.error('NetworkClient: canonical command rejected before sequence commit', error);
      for (const listener of this.fireFailedListeners) {
        listener('Game state mismatch — reload to continue.');
      }
      return;
    }
    for (const message of feedback) this.notifyCommandFailure(message);
  }

  private emitState(): void {
    if (this._disposed) return; // client torn down — nothing left to notify
    const state = this.engine.getState();
    this.clearStaleBotPreparationFailure();
    if (state.phase === 'GAME_OVER' && !this._gameOverReported) {
      this._gameOverReported = true;
      clearSession(); // match ended — the rejoin session descriptor is no longer valid (AC-04)
      this.callFinishGame(state.winner);
    }
    for (const listener of this.listeners) {
      listener(state);
    }
    this.maybeDriveBot(state);
    this.updateTurnWatch(state);
  }

  // ---- Opponent-turn watchdog (P1-6b) ----

  /**
   * Subscribe to opponent-turn liveness. Fires immediately with the current state,
   * then on every transition. Returns an unsubscribe.
   */
  onTurnWatch(listener: (w: TurnWatch) => void): () => void {
    this.turnWatchListeners.add(listener);
    listener(this._turnWatch);
    return () => { this.turnWatchListeners.delete(listener); };
  }

  /** Emit a turn-watch transition (de-duped so the rAF cadence doesn't spam it). */
  private setTurnWatch(w: TurnWatch): void {
    const prev = this._turnWatch;
    const samePlayer = w.state !== 'clear' && prev.state !== 'clear' && w.playerName === prev.playerName;
    if (w.state === prev.state && (w.state === 'clear' || samePlayer)) return;
    this._turnWatch = w;
    for (const l of this.turnWatchListeners) l(w);
  }

  private clearTurnWatchTimers(): void {
    if (this.turnWaitTimer !== null)  { clearTimeout(this.turnWaitTimer);  this.turnWaitTimer = null; }
    if (this.turnStallTimer !== null) { clearTimeout(this.turnStallTimer); this.turnStallTimer = null; }
  }

  /**
   * Re-arm / clear the opponent-turn watchdog from the latest state. Called every
   * frame from emitState() but only re-arms when the watched (turn, seat) actually
   * changes — so the timers run uninterrupted across the rAF cadence. Only a REMOTE
   * HUMAN's turn is watched (my turn = I act; a bot drives itself fast); the watch
   * is also suppressed while the link is down (the connection banner covers that).
   */
  private updateTurnWatch(state: GameState): void {
    const myTankId = this.playerIndexMap.get(this.playerId);
    const activeId = state.activePlayerId;
    const watchable =
      state.phase === 'PLAYER_TURN' &&
      this._connection === 'connected' &&
      activeId !== myTankId &&
      !this.botByTank.has(activeId);

    if (!watchable) {
      if (this.turnWatchKey !== null) {
        this.turnWatchKey = null;
        this.clearTurnWatchTimers();
        this.setTurnWatch({ state: 'clear' });
      }
      return;
    }

    const key = `${state.turn}:${activeId}`;
    if (key === this.turnWatchKey) return; // already armed for this opponent turn

    // New opponent turn — reset to 'clear' and (re)arm both escalation stages.
    this.turnWatchKey = key;
    this.clearTurnWatchTimers();
    this.setTurnWatch({ state: 'clear' });
    const playerName = state.tanks.find((t) => t.id === activeId)?.playerName ?? 'opponent';
    this.turnWaitTimer = setTimeout(() => {
      this.setTurnWatch({ state: 'waiting', playerName });
    }, NetworkClient.TURN_WAIT_MS);
    this.turnStallTimer = setTimeout(() => {
      this.setTurnWatch({ state: 'stalled', playerName });
    }, NetworkClient.TURN_STALL_MS);
  }

  /**
   * Client-driven CPU seats. When a bot holds the turn, EVERY connected client
   * reaches this state (deterministic replay) and computes the IDENTICAL plan
   * (the AI is a pure function of state). They all submit it on the bot's behalf;
   * the seq-unique constraint + the referee's turn-cursor make it exactly-once —
   * the lowest-latency client wins, the rest are no-ops. We submit at most once
   * per (turn, bot) from this client, and never retry a bot seq-conflict (the
   * winning row is the same action, by determinism).
   */
  private maybeDriveBot(state: GameState): void {
    if (this.orderedActions.isReplaying) return;  // history replay drives itself
    if (state.phase !== 'PLAYER_TURN') return;
    if (this.botByTank.size === 0) return;        // no CPU seats in this room

    const tankId = state.activePlayerId;
    const difficulty = this.botByTank.get(tankId);
    if (!difficulty) return;                       // active seat is human

    const actingId = this.supaIdByTank.get(tankId);
    if (!actingId) return;

    // Command ownership is cheaper and stronger than planning. While R07 owns an
    // immutable CPU envelope, do not run the planner again. A retryable delivery is
    // re-driven from that exact envelope so its body/intent/revision stay unchanged.
    const pending = this.pendingRoomCommand;
    if (pending) {
      if (
        pending.generation === this.commandGeneration
        && pending.envelope.expectedRevision === this.nextExpectedSeq
        && pending.envelope.actorPlayerId === actingId
        && pending.actorTankId === tankId
        && pending.state === 'retryable'
        && !this.botActionAttempt
      ) {
        this.submitBotAction(state, tankId, actingId, pending.envelope.action, pending.envelope.expectedRevision);
      }
      return;
    }
    if (this.botActionAttempt || this.botSubmitPendingKey) return;

    // Use the engine's EFFECTIVE gravity (sudden death ramps it past the threshold) so the
    // bot aims for the arc the engine will actually fly — not a flat base-gravity arc that
    // lands short once sudden death kicks in. Deterministic: every client's engine is at the
    // same turn, so all compute the identical plan (lockstep preserved).
    const plan = this.getBotPlan(state, tankId, difficulty);
    if (!plan) return;                             // no target (shouldn't happen)
    const cache = this.botPlanCache;
    if (!cache) return;

    // Match the local driver's explicit order: weapon restock, optional accessory,
    // then attack. A canonical no-op is skipped for this turn/item even though its
    // row advances the revision; otherwise each new revision would repeat it forever.
    const weaponPreparationKey = plan.buy
      ? this.botPreparationKey(state, tankId, 'weapon', plan.buy)
      : null;
    const accessoryPreparationKey = plan.buyAccessory
      ? this.botPreparationKey(state, tankId, 'accessory', plan.buyAccessory)
      : null;
    const recoveringPreparation = weaponPreparationKey !== null
      && weaponPreparationKey === this.botPreparationFailedKey;
    const attackWeapon: WeaponType = recoveringPreparation ? 'baby_missile' : plan.weapon;
    const action: NetworkAction = plan.buy
      && !cache.weaponPreparationComplete
      && weaponPreparationKey !== this.botPreparationFailedKey
      ? { type: 'buy', weapon: plan.buy }
      : plan.buyAccessory
        && !cache.accessoryPreparationComplete
        && accessoryPreparationKey !== this.botAccessoryPreparationFailedKey
        ? { type: 'buy', accessory: plan.buyAccessory }
      : attackWeapon === 'shield'
        ? { type: 'use_shield' }
        : { type: 'fire', angle: plan.angle, power: plan.power, weapon: attackWeapon };
    if (recoveringPreparation && action.type !== 'buy' && !hasUsableWeapon(state, tankId, attackWeapon)) return;

    this.submitBotAction(state, tankId, actingId, action, this.nextExpectedSeq);
  }

  private getBotPlan(
    state: GameState,
    tankId: string,
    difficulty: AiDifficulty,
    expectedRevision = this.nextExpectedSeq,
  ): AiPlan | null {
    const generation = this.commandGeneration;
    const round = state.round;
    const turn = state.turn;
    const cached = this.botPlanCache;
    if (
      cached
      && cached.generation === generation
      && cached.expectedRevision === expectedRevision
      && cached.round === round
      && cached.turn === turn
      && cached.tankId === tankId
    ) return cached.plan;

    const plan = computeAiPlan(
      state,
      tankId,
      difficulty,
      this.engine.getEffectiveGravity(),
      this.armsLevel,
    );
    const current = this.engine.getState();
    if (
      this._disposed
      || generation !== this.commandGeneration
      || (!this.orderedActions.isReplaying && expectedRevision !== this.nextExpectedSeq)
      || current.phase !== 'PLAYER_TURN'
      || current.round !== round
      || current.turn !== turn
      || current.activePlayerId !== tankId
    ) return null;
    this.botPlanCache = {
      generation,
      expectedRevision,
      round,
      turn,
      tankId,
      plan,
      weaponPreparationComplete: false,
      accessoryPreparationComplete: false,
    };
    return plan;
  }

  private botPreparationKey(
    state: Pick<GameState, 'round' | 'turn'>,
    tankId: string,
    kind: 'weapon' | 'accessory',
    item: WeaponType | AccessoryType,
  ): string {
    return `${state.round}:${state.turn}:${tankId}:${kind}:${item}`;
  }

  private botPhaseKey(
    state: Pick<GameState, 'round' | 'turn'>,
    tankId: string,
    expectedRevision: number,
    action: NetworkAction,
  ): string {
    const phase = action.type === 'buy'
      ? action.weapon ? `buy:weapon:${action.weapon}` : `buy:accessory:${action.accessory ?? 'unknown'}`
      : `act:${action.type}`;
    return `${state.round}:${state.turn}:${tankId}:${expectedRevision}:${phase}`;
  }

  private submitBotAction(
    state: GameState,
    tankId: string,
    actingId: string,
    action: NetworkAction,
    expectedRevision: number,
  ): void {
    if (
      this._disposed
      || state.phase !== 'PLAYER_TURN'
      || state.round !== this.engine.getState().round
      || state.turn !== this.engine.getState().turn
      || this.engine.getState().activePlayerId !== tankId
      || expectedRevision !== this.nextExpectedSeq
    ) return;
    const key = this.botPhaseKey(state, tankId, expectedRevision, action);
    if (key === this.lastBotKey) return;
    if (key === this.botSubmitPendingKey) return;
    if (key === this.botActionAttempt?.phaseKey) return;

    // Mark this phase in flight BEFORE the POST so the per-frame emitState cadence
    // does not fire a second submit while this one is outstanding. The transport
    // result and ordered row jointly decide the phase's fate: acceptance latches our
    // intent, failure releases a retry, and conflict waits for canonical progress to
    // identify the winner before releasing a replan or latching an exact match.
    // This is the self-heal (#119): a dropped bot submit no longer wedges a single-
    // driver room. Determinism is untouched — the re-attempt is the SAME deterministic
    // action, and the referee's seq-unique + cursor keep it exactly-once.
    this.botSubmitPendingKey = key;
    const attempt: BotActionAttempt = {
      phaseKey: key,
      round: state.round,
      turn: state.turn,
      tankId,
      action,
      settlement: 'pending',
      sawCanonicalProgress: false,
    };
    this.botActionAttempt = attempt;
    const admitted = this.submitAction(action, /* retryOnConflict */ false, actingId, 0, false, (settlement) => {
      if (this.botActionAttempt !== attempt) return; // canonical row already resolved/superseded it
      if (this.botSubmitPendingKey === key) this.botSubmitPendingKey = null;
      if (settlement === 'accepted') {
        // A receipt proves the command was appended, but only its ordered row proves
        // this local cursor applied it. Keep the exact attempt owned through bounded
        // echo recovery so a missing echo can retry the same immutable envelope.
        attempt.settlement = 'accepted';
      } else if (settlement === 'failed') {
        this.botActionAttempt = null;
      } else {
        // A seq conflict says only that some row won. Canonical progress already
        // observed releases one replan; otherwise retain this intent until live
        // delivery or the existing bounded resync reveals the winning row.
        if (attempt.sawCanonicalProgress) {
          this.botActionAttempt = null;
          return;
        }
        attempt.settlement = 'conflict';
        void this.resyncLog();
      }
    });
    if (!admitted) {
      if (this.botSubmitPendingKey === key) this.botSubmitPendingKey = null;
      if (this.botActionAttempt === attempt) this.botActionAttempt = null;
    }
  }

  private callFinishGame(winnerId: string | null): void {
    // Final standings (Sprint 6 persistence). Replay-derived, so every client reports
    // the identical board; finish_game persists exactly one (UNIQUE(room_id)). Best
    // effort — a failure here never affects the (already-decided) game.
    const state = this.engine.getState();
    const scoreboard = state.tanks.map((t) => ({
      tankId:      t.id,
      playerName:  t.playerName,
      roundWins:   t.roundWins,
      kills:       t.kills,
      totalDamage: t.totalDamage,
    }));
    // playerId lets finish_game authorize the caller as a room member (P2-9).
    const payload = {
      roomId:   this.roomId,
      playerId: this.playerId,
      token:    this.token,
      winnerId,
      rounds:     state.totalRounds,
      scoreboard,
    };
    // Fire-and-forget with one retry on transient failure. The server's
    // UNIQUE(room_id) on match_scores makes a duplicate POST idempotent.
    // A non-ok HTTP response is treated as a transient failure (thrown inside
    // the fn) so the retry fires. On final failure we log and move on.
    void postOnceWithRetry(
      async () => {
        const { ok, status } = await callFunction('finish_game', payload);
        if (!ok) {
          throw new Error(`finish_game HTTP ${status}`);
        }
      },
      2,
    ).then((result) => {
      if (!result.ok) {
        console.error('NetworkClient: finish_game error:', result.error);
      }
      return postOnceWithRetry(
        () => claimCompletedMatch(this.supabase.auth, {
          roomId: this.roomId,
          playerId: this.playerId,
          token: this.token,
        }),
        2,
      );
    }).then((result) => {
      if (!result.ok) {
        console.error('NetworkClient: claim_match error');
      } else if (result.value === 'linked' && !this._disposed) {
        for (const listener of this.accountProgressListeners) listener();
      }
    });
  }
}
