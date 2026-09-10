import { projectNetworkPlayers } from './modeConfig';
import type { SupabaseClient, RealtimeChannel, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js';
import type { GameClient, RematchInfo, ConnectionState, TurnWatch, QuickChatMessage } from './GameClient';
import type { GameState } from '@shared/types/GameState';
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
import { computeAiPlan } from '@shared/engine/AI';
import type { WeaponType } from '@shared/engine/WeaponSystem';
import { GRAVITY, MAX_WIND } from '@shared/engine/Physics';
import { replayNetworkAction, replayInChunks, type NetworkAction, type NetworkFireAction } from '@shared/net/replay';
import { postOnceWithRetry } from './retry';
import { claimCompletedMatch } from './matchClaim';
import { fastForwardTicks } from './fastForward';
import { callFunction, edgeUrl, edgeHeaders } from '../lib/edgeFunctions';
import { clearSession } from '../lib/sessionDescriptor';
import { OrderedActionSession } from './OrderedActionSession';
import { CURRENT_NETWORK_RULESET_VERSION, normalizeNetworkRulesetVersion } from './networkRuleset';
import { isQuickChatKey, parseQuickChatPayload, type QuickChatKey } from './quickChat';

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
interface RoomActionRow {
  id:         string;
  room_id:    string;
  seq:        number;
  player_id:  string;
  action:     NetworkAction;
  created_at: string;
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
  settlement: 'pending' | 'conflict';
  sawCanonicalProgress: boolean;
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
      return right.type === 'use_shield' && left.weapon === right.weapon;
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

type StateChangeListener = (state: GameState) => void;

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
  private rafId:            number | null;
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
  private orderedActions:   OrderedActionSession<NetworkAction>;
  private get pendingActions(): ReadonlyMap<number, NetworkAction> {
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
  // Watchdog: if a submitted fire/shield never echoes back, clear the input lock so
  // the player isn't trapped in "Sending…" forever (lost submit, dropped echo, …).
  private fireWatchdog:     ReturnType<typeof setTimeout> | null = null;
  private static readonly FIRE_TIMEOUT_MS = 9000;
  // Hard bound on the fire-recovery log re-fetch. Without it a hung (black-holed,
  // not erroring) connection leaves resyncLog's await pending forever, so
  // recoverStuckFire never reaches its failFire() line and the player is trapped in
  // "Sending…" with no recovery but a reload (reliability-005 / #57). Aborting the
  // fetch after this deadline surfaces as an error resyncLog already handles.
  private static readonly RESYNC_TIMEOUT_MS = 8000;
  // Seq-collision retry (P2-10). Two humans firing near-simultaneously collide on
  // UNIQUE(room_id,seq); the loser gets a 409. Retry with bounded exponential
  // backoff (40,80,160,240,240ms) so the action lands instead of being dropped
  // after a single one-shot. UNIQUE remains the corruption guard; this is liveness.
  private static readonly MAX_SEQ_RETRIES = 5;
  private static readonly SEQ_BACKOFF_MS = 40;
  // Handle for the pending seq-conflict retry setTimeout, so stop() can cancel a
  // scheduled retry before it fires a POST against a torn-down room.
  private seqRetryTimer:    ReturnType<typeof setTimeout> | null = null;

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
  private botPreparationFailedKey: string | null = null;
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
  ) {
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
    this.orderedActions.beginReplay();
    await replayInChunks(
      rows,
      (row) => {
        this.applyNetworkAction(row.action);
        this.tickToCompletion();
      },
      REPLAY_CHUNK_SIZE,
      () => new Promise<void>((r) => setTimeout(r, 0)),
    );
    this.orderedActions.finishReplay((existingActions ?? []).length);
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
          if (!this.orderedActions.buffer(row.seq, row.action as NetworkAction)) return;
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
   * Begin the rAF loop. engine.tick() is called each frame (~60fps) and
   * state is emitted to listeners.
   *
   * NOTE: In LIVE play a fire echo is applied in flushPendingActions WITHOUT
   * ticking to completion (tickToCompletion runs only during initialize() replay).
   * The input lock + fire watchdog are released the moment the echo applies
   * (setFiring(false) in flushPendingActions) — BEFORE this RAF loop animates the
   * flight — so a long shot's animation can never trip the watchdog; it only guards
   * a submit that never commits. This RAF loop renders the flight tick-by-tick and,
   * when the engine leaves FIRING/RESOLVING, drains the next buffered action.
   */
  setFastForward(on: boolean): void {
    this._fastForward = on;
  }

  start(): void {
    const loop = () => {
      // Fast-forward (review #7) runs several fixed-step ticks per frame while a shot
      // is live — SAME tick count + outcome as 1/frame (deterministic), just fewer
      // frames drawn. The per-tick wasBusy/!nowBusy drain below is UNCHANGED and still
      // runs at most once per frame (we break on it), so the seq-ordered buffered-action
      // hand-off at the shot boundary is preserved exactly — fast-forward is pure local
      // view pacing and never touches the log or the lockstep drain.
      const maxTicks = fastForwardTicks(this._fastForward, this.engine.getState().phase);
      for (let i = 0; i < maxTicks; i++) {
        const preTick = this.engine.getState().phase;
        const wasBusy = preTick === 'FIRING' || preTick === 'RESOLVING';
        this.engine.tick();
        const nowBusy = this.engine.getState().phase === 'FIRING' || this.engine.getState().phase === 'RESOLVING';
        // When the engine LEAVES the entire flight-resolution sequence (FIRING then
        // RESOLVING) and reaches an input-accepting phase (PLAYER_TURN/ROUND_OVER/
        // GAME_OVER), drain the NEXT buffered action. flushPendingActions stops once
        // the engine re-enters FIRING, so the RAF loop advances the queue between
        // shots — this prevents a buffered N+1 from being dropped while N is still
        // in the settle phase (P0-2 + RESOLVING regression).
        if (wasBusy && !nowBusy) {
          this.flushPendingActions();
          break; // one drain per frame; next shot animates fresh next frame
        }
        if (!wasBusy) break; // input-accepting phase — tick() is a no-op, don't spin
      }
      this.emitState();
      if (this._disposed) return;
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this._closing = true; // so removeChannel()'s CLOSED isn't reported as a drop
    this._disposed = true; // backstop for async work already in flight (see field doc)
    this.orderedActions.dispose();
    if (this.fireWatchdog !== null) {
      clearTimeout(this.fireWatchdog);
      this.fireWatchdog = null;
    }
    if (this.seqRetryTimer !== null) {
      clearTimeout(this.seqRetryTimer);
      this.seqRetryTimer = null;
    }
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
    this.botPreparationFailedKey = null;
    this.botPreparationFailureMessage = null;
    this.pendingBotPreparationNotice = null;
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
      this.setFiring(true); // lock input until the Realtime echo applies it
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

    this.setFiring(true);
    this.submitAction(networkAction);
  }

  getState(): GameState {
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

  /**
   * Set the "firing" input lock. Arming it (true) starts a watchdog: if a submitted
   * shot has not echoed back within FIRE_TIMEOUT_MS, the watchdog first attempts a
   * RESYNC (re-fetch the canonical log) rather than failing outright — the submit may
   * have committed while the Realtime echo was slow or dropped, in which case the
   * resync applies our shot and self-heals. Only if the shot is STILL unresolved after
   * the resync (it genuinely never committed) do we release the lock and notify for a
   * retry — a clean retry that can no longer desync from a half-applied commit. The
   * echo path (flushPendingActions) calls this with false, which also disarms the watchdog.
   */
  private setFiring(value: boolean): void {
    this._isFiring = value;
    if (this.fireWatchdog !== null) {
      clearTimeout(this.fireWatchdog);
      this.fireWatchdog = null;
    }
    if (value) {
      this.fireWatchdog = setTimeout(() => {
        this.fireWatchdog = null;
        if (this._isFiring) void this.recoverStuckFire();
      }, NetworkClient.FIRE_TIMEOUT_MS);
    }
  }

  /**
   * Watchdog recovery: a fired shot has not echoed within FIRE_TIMEOUT_MS. Re-fetch
   * the canonical log first — if our action committed (slow / dropped Realtime echo),
   * resyncLog applies it and flushPendingActions clears the firing lock, so the shot
   * resolves and we self-heal. If the lock is STILL set afterward, the submit never
   * landed: release it and notify the player for a clean retry (no half-applied commit
   * to desync from). resyncLog swallows its own fetch errors, so a dead network simply
   * leaves the lock set and falls through to the retry notice.
   */
  private async recoverStuckFire(): Promise<void> {
    await this.resyncLog();
    if (this._isFiring) this.failFire('Shot timed out — try again.');
  }

  /** Release a stuck fire lock and notify the UI so the player can re-aim. */
  private failFire(message: string): void {
    if (this._disposed) return; // client torn down — no lock to release, no one to notify
    this.setFiring(false);
    this.emitState(); // re-render so the HUD drops "Sending…" immediately
    for (const l of this.fireFailedListeners) l(message);
  }

  /**
   * Re-fetch the action log from nextExpectedSeq onward and flush it. Called after
   * a Realtime RE-subscribe so any turns committed during an outage are applied in
   * order — the canonical log is the source of truth, so this is a safe, idempotent
   * catch-up (rows we already have are skipped by the seq gate in flushPendingActions).
   */
  private async resyncLog(): Promise<void> {
    // Bound the fetch with an AbortController so a hung connection can't leave this
    // await pending forever (which would trap the fire watchdog — #57). An abort
    // surfaces as a thrown error / an { error } result; both fall through to the
    // early return below, so recoverStuckFire() still reaches its failFire().
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NetworkClient.RESYNC_TIMEOUT_MS);
    let data: unknown, error: { message?: string } | null;
    try {
      ({ data, error } = await this.supabase
        .from('room_actions')
        .select('*')
        .eq('room_id', this.roomId)
        .gte('seq', this.orderedActions.nextExpectedSeq)
        .order('seq', { ascending: true })
        .abortSignal(controller.signal));
    } catch (e) {
      console.error('NetworkClient.resyncLog: log re-fetch aborted/failed:', (e as Error)?.message ?? e);
      return;
    } finally {
      clearTimeout(timeout);
    }
    if (error) {
      console.error('NetworkClient.resyncLog: failed to re-fetch log:', error.message);
      return;
    }
    if (!this.orderedActions.acceptResync(
      (data ?? []) as RoomActionRow[],
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
    listener({
      roomId:  data.id as string,
      code:    data.code as string,
      seed:    Number(data.seed),
      options: {
        maxPlayers: opts.maxPlayers ?? players.length,
        maxWind:    typeof opts.maxWind === 'number' ? opts.maxWind : MAX_WIND,
        gravity:    typeof opts.gravity === 'number' ? opts.gravity : GRAVITY,
        rulesetVersion: normalizeNetworkRulesetVersion(opts.rulesetVersion),
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

  /**
   * POST the fire action to the submit_action Edge Function.
   * Fire-and-forget; errors are logged but not retried in MVP2 (see Appendix C item 3).
   */
  private submitAction(
    networkAction: NetworkAction,
    retryOnConflict = true,
    actingPlayerId?: string,
    attempt = 0,
    roundOver = false,
    // Transport-outcome hook for the bot driver (#119). An accepted response proves
    // this exact intent committed. A conflict only proves that some action won the seq;
    // the ordered row must identify whether it matches before this intent is latched.
    // A failed response did not commit and is safe to re-attempt.
    onSettle?: (settlement: BotSubmitSettlement) => void,
  ): void {
    // For TURN-ENDING actions, tell the server which seat is active NEXT (this client's
    // engine skips eliminated tanks AND re-seats the opener at a round boundary; the
    // server's modulo cursor can't do either). We also detect whether this action ENDS
    // a round — if so the server must honor the reported seat unconditionally, because
    // a round resets to the opener (seat 0), which may be the very seat that just fired
    // (the modulo "you can't keep your own turn" guard would otherwise reject it).
    // Turn-neutral buys / move and next_round don't move the cursor, so they
    // report neither.
    const isTurnEnding = networkAction.type === 'fire' || networkAction.type === 'use_shield';
    let nextActiveIndex: number | undefined;
    let endsRound = roundOver; // ROUND_OVER buy / next_round pass this in directly
    if (isTurnEnding) {
      const seat = this.computeNextSeat(networkAction);
      nextActiveIndex = seat.index;
      endsRound = endsRound || seat.endsRound;
    }
    fetch(edgeUrl('submit_action'), {
      method:  'POST',
      headers: edgeHeaders(),
      body: JSON.stringify({
        roomId:   this.roomId,
        playerId: this.playerId,
        token:    this.token,
        rulesetVersion: normalizeNetworkRulesetVersion(this.options.rulesetVersion),
        ...(typeof nextActiveIndex === 'number' ? { nextActiveIndex } : {}),
        // roundOver: this action ends a round (the killing blow) or operates within the
        // between-rounds shop (buy / next_round). Tells the referee to skip the turn gate
        // (shop actions) or honor the reported opener seat unconditionally (killing blow).
        ...(endsRound ? { roundOver: true } : {}),
        // Present only when proxying a CPU seat — the seat the action is FOR.
        ...(actingPlayerId ? { actingPlayerId } : {}),
        action:   networkAction,
      }),
    })
      .then(res => res.json())
      .then((data: { ok?: boolean; error?: string; retry?: boolean; seq?: number }) => {
        if (this._disposed) return; // client torn down while this request was in flight
        if (!data.ok) {
          const isConflict = data.error === 'seq_conflict' || data.retry === true;
          if (isConflict && retryOnConflict && attempt < NetworkClient.MAX_SEQ_RETRIES) {
            // Seq collision (humans only — bots pass retryOnConflict=false, since the
            // winning row is the same bot action). Retry with bounded exponential
            // backoff + jitter so a near-simultaneous human submit lands instead of
            // being dropped after one shot (P2-10). Jitter decorrelates the racers.
            const delay = Math.min(NetworkClient.SEQ_BACKOFF_MS * 2 ** attempt, 240)
              + Math.floor(Math.random() * 25);
            this.seqRetryTimer = setTimeout(
              () => {
                this.seqRetryTimer = null;
                if (this._disposed) return; // stop() ran while the retry was scheduled
                this.submitAction(networkAction, true, actingPlayerId, attempt + 1, roundOver);
              },
              delay,
            );
          } else if (isConflict && retryOnConflict) {
            // Exhausted retries (a human action that kept colliding) — release the
            // input lock so the player can re-fire rather than stay stuck.
            console.error('NetworkClient: submit_action seq-conflict retries exhausted');
            if (!actingPlayerId) this.failFire('Shot kept colliding — try again.');
          } else if (!isConflict && data.error === 'Not your turn') {
            // The canonical local-vs-referee desync signature: our engine thought it
            // was our turn but the referee disagreed. Not an error (can be a benign
            // race), but log it at warn so a real desync is diagnosable (obs-006).
            console.warn('NetworkClient: submit_action "Not your turn" — possible desync', {
              roomId: this.roomId,
              localActivePlayerId: this.engine.getState().activePlayerId,
            });
            // For a bot proxy this means the turn already advanced (someone committed):
            // treat as committed so the driver latches instead of re-attempting.
            onSettle?.('accepted');
          } else if (!isConflict) {
            // A non-conflict rejection (e.g. a 5xx where the RPC errored) — the action
            // did NOT commit.
            console.error('NetworkClient: submit_action rejected:', data.error);
            // A genuine rejection of OUR OWN turn-ending action (not a bot proxy):
            // release the "Sending…" lock and tell the player, so a failed shot
            // doesn't trap them (P1-6). Bot proxies don't hold the lock.
            if (!actingPlayerId) this.failFire('Shot failed — try again.');
            // Transient for a bot proxy: clear the in-flight mark so the next frame retries.
            onSettle?.('failed');
          } else {
            // A bot lost this seq race. Do not assume the winning intent was identical:
            // wait for the ordered row to prove a match or release this intent.
            onSettle?.('conflict');
          }
        } else {
          // Accepted: our submit is the committed row for this phase.
          onSettle?.('accepted');
        }
      })
      .catch(err => {
        console.error('NetworkClient: submit_action network error:', err);
        if (!actingPlayerId) this.failFire('Connection problem — shot not sent. Try again.');
        // Network error: nothing committed — let the bot driver re-attempt next frame.
        onSettle?.('failed');
      });
  }

  /**
   * Apply a logged network action to the local engine and RECORD it in the
   * applied log (used to compute the next active seat — see computeNextSeat).
   * Preparation recovery is derived here from canonical before/after state so
   * live observers, resyncs, and late-history replays reach the same decision.
   */
  private applyNetworkAction(action: NetworkAction): void {
    const before = this.engine.getState();
    const context = {
      phase: before.phase,
      round: before.round,
      turn: before.turn,
      tankId: before.activePlayerId,
    };
    const preparation = this.describeBotPreparation(action, before);
    replayNetworkAction(this.engine, action);
    this.appliedLog.push(action);
    if (preparation) this.reconcileBotPreparation(preparation);
    this.reconcileBotActionAttempt(action, context);
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
  ): { outcomeKey: string; tankId: string; weapon: WeaponType } | null {
    if (state.phase !== 'PLAYER_TURN' || action.type !== 'buy' || !action.weapon) return null;
    const tankId = state.activePlayerId;
    const difficulty = this.botByTank.get(tankId);
    if (!difficulty) return null;
    const plan = computeAiPlan(
      state,
      tankId,
      difficulty,
      this.engine.getEffectiveGravity(),
      this.armsLevel,
    );
    if (!plan?.buy || plan.buy !== action.weapon) return null;
    return {
      outcomeKey: `${state.round}:${state.turn}:${tankId}:${plan.buy}`,
      tankId,
      weapon: plan.buy,
    };
  }

  /**
   * The ordered action and its before/after engine state are canonical. Every
   * same-build client therefore records the same bounded recovery even if it did
   * not submit the buy itself or is replaying it from history.
   */
  private reconcileBotPreparation(
    preparation: { outcomeKey: string; tankId: string; weapon: WeaponType },
  ): void {
    const state = this.engine.getState();
    if (hasUsableWeapon(state, preparation.tankId, preparation.weapon)) {
      if (this.botPreparationFailedKey === preparation.outcomeKey) {
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
      this.botPreparationFailedKey === preparation.outcomeKey
      && this.botPreparationFailureMessage === message
    ) return;
    this.botPreparationFailedKey = preparation.outcomeKey;
    this.botPreparationFailureMessage = message;
    if (this.fireFailedListeners.size === 0) {
      this.pendingBotPreparationNotice = message;
      return;
    }
    for (const listener of this.fireFailedListeners) listener(message);
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
    if (!this.botPreparationFailedKey) return;
    const state = this.engine.getState();
    const turnKey = `${state.round}:${state.turn}:${state.activePlayerId}:`;
    if (this.botPreparationFailedKey.startsWith(turnKey)) return;
    this.botPreparationFailedKey = null;
    this.botPreparationFailureMessage = null;
    this.pendingBotPreparationNotice = null;
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
    this.orderedActions.drain(
      () => {
        const phase = this.engine.getState().phase;
        return phase === 'PLAYER_TURN' || phase === 'ROUND_OVER';
      },
      (action) => {
        this.setFiring(false);
        this.applyNetworkAction(action);
      },
      () => this.tickToCompletion(),
      () => this.emitState(),
    );
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

    // Use the engine's EFFECTIVE gravity (sudden death ramps it past the threshold) so the
    // bot aims for the arc the engine will actually fly — not a flat base-gravity arc that
    // lands short once sudden death kicks in. Deterministic: every client's engine is at the
    // same turn, so all compute the identical plan (lockstep preserved).
    const plan = computeAiPlan(
      state,
      tankId,
      difficulty,
      this.engine.getEffectiveGravity(),
      this.armsLevel,
    );
    if (!plan) return;                             // no target (shouldn't happen)

    // Buy-to-restock (P1-7b) is a TWO-PHASE turn: a turn-neutral buy, then the
    // shot. HTTP acceptance only latches the transport phase; the ordered echo is
    // what proves the planned ammo became usable. One ineffective echo takes the
    // deterministic Baby Missile fallback instead of repeating the buy or firing
    // unavailable ammunition.
    const preparationOutcomeKey = plan.buy
      ? `${state.round}:${state.turn}:${tankId}:${plan.buy}`
      : null;
    const recoveringPreparation = preparationOutcomeKey !== null
      && preparationOutcomeKey === this.botPreparationFailedKey;
    const attackWeapon: WeaponType = recoveringPreparation ? 'baby_missile' : plan.weapon;
    if (recoveringPreparation && !hasUsableWeapon(state, tankId, attackWeapon)) return;
    const plannedBuy = recoveringPreparation ? undefined : plan.buy;
    const phase = plannedBuy ? 'buy' : 'act';
    const key = `${state.turn}:${tankId}:${phase}`;
    if (key === this.lastBotKey) return;           // already committed this phase
    if (key === this.botSubmitPendingKey) return;  // a submit for this phase is in flight
    if (key === this.botActionAttempt?.phaseKey) return; // conflict awaits its canonical row

    const actingId = this.supaIdByTank.get(tankId);
    if (!actingId) return;

    const action: NetworkAction = plannedBuy
      ? { type: 'buy', weapon: plannedBuy }
      : attackWeapon === 'shield'
        ? { type: 'use_shield' }
        : { type: 'fire', angle: plan.angle, power: plan.power, weapon: attackWeapon };

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
    this.submitAction(action, /* retryOnConflict */ false, actingId, 0, false, (settlement) => {
      if (this.botActionAttempt !== attempt) return; // canonical row already resolved/superseded it
      if (this.botSubmitPendingKey === key) this.botSubmitPendingKey = null;
      if (settlement === 'accepted') {
        this.lastBotKey = key;
        this.botActionAttempt = null;
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
