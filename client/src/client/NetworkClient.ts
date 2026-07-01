import type { SupabaseClient, RealtimeChannel, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js';
import type { GameClient, RematchInfo, ConnectionState, TurnWatch } from './GameClient';
import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import type { GameOptions } from '@shared/types/GameOptions';
import type { AiDifficulty } from '@shared/types/GameState';
import { GameEngine } from '@shared/engine/GameEngine';
import { computeAiPlan } from '@shared/engine/AI';
import { GRAVITY, MAX_WIND } from '@shared/engine/Physics';
import { replayNetworkAction, replayInChunks, type NetworkAction, type NetworkFireAction } from '@shared/net/replay';
import { shouldBufferSeq } from '@shared/net/seqGuard';
import { postOnceWithRetry } from './retry';
import { fastForwardTicks } from './fastForward';

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
}

// GameOptions extended with the network-mode player id field.
interface NetworkGameOptions extends Omit<GameOptions, 'players'> {
  players?: NetworkPlayerEntry[];
}

type StateChangeListener = (state: GameState) => void;

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
  private roomId:           string;
  private playerId:         string;           // Supabase-assigned UUID for this client
  private listeners:        Set<StateChangeListener>;
  private rafId:            number | null;
  private channel:          RealtimeChannel | null;   // room_actions INSERT subscription
  private roomsChannel:     RealtimeChannel | null;   // rooms UPDATE subscription (lobby)

  // Maps Supabase player UUID → engine tank ID ('p1'..'pN').
  // Derived once from the ordered players array at construction time.
  // players[0].id → 'p1', players[1].id → 'p2', etc.
  // Engine tank IDs are positional strings, not UUIDs; this is the single
  // source of truth for translating between them.
  private playerIndexMap:   Map<string, string>;

  // Sequence ordering buffer for out-of-order Realtime delivery.
  // Supabase Realtime does not guarantee delivery order; events with
  // seq > nextExpectedSeq are held here until the gap fills in.
  private pendingActions:   Map<number, NetworkAction>;
  private nextExpectedSeq:  number;
  private isReplaying:      boolean;
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

  // --- Opponent-turn watchdog (P1-6b) --- When a REMOTE human holds the turn and
  // no action arrives, escalate a non-blocking banner: 'waiting' after WAIT_MS,
  // then 'stalled' (offer leave-to-lobby) after STALL_MS. Re-armed per opponent
  // turn; cleared on my/bot turns, between games, and while disconnected.
  private turnWatchListeners = new Set<(w: TurnWatch) => void>();
  private turnWaitTimer:    ReturnType<typeof setTimeout> | null = null;
  private turnStallTimer:   ReturnType<typeof setTimeout> | null = null;
  private turnWatchKey:     string | null = null;          // armed `${turn}:${activeTankId}`
  private _turnWatch:       TurnWatch = { state: 'clear' };
  private static readonly TURN_WAIT_MS  = 12000;
  private static readonly TURN_STALL_MS = 30000;

  // Rematch signaling. The old room's rematch_room_id flips from NULL to the
  // successor room id when either player clicks Restart; both clients observe it
  // on the rooms UPDATE stream and migrate. _rematchHandled makes that one-shot.
  private rematchListener:  ((info: RematchInfo) => void) | null = null;
  private _rematchHandled   = false;

  // --- CPU-seat driving (client-driven, idempotent) ---
  // engine tank id ('p1'..) → CPU difficulty, for bot seats only.
  private botByTank:        Map<string, AiDifficulty>;
  // engine tank id → that seat's Supabase player UUID (to submit on its behalf).
  private supaIdByTank:     Map<string, string>;
  // Per-room gravity (for the AI's trajectory sim to match the engine).
  private gravity:          number;
  // Guards one bot submission per (turn, bot) from THIS client; the seq-unique +
  // referee cursor make the cross-client race exactly-once regardless.
  private lastBotKey:       string | null = null;

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
    options:   NetworkGameOptions
  ) {
    this.supabase         = supabase;
    this.roomId           = roomId;
    this.playerId         = playerId;
    this.options          = options;
    this.listeners        = new Set();
    this.rafId            = null;
    this.channel          = null;
    this.roomsChannel     = null;
    this.pendingActions   = new Map();
    this.nextExpectedSeq  = 0;
    this.isReplaying      = false;

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

    // Instantiate local engine. Cast to GameOptions — the engine reads
    // { name, color, ai } from each player entry, ignoring any extra fields.
    this.engine = new GameEngine(options as GameOptions);
  }

  // ---- GameClient interface ----

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
    this.isReplaying = true;
    await replayInChunks(
      rows,
      (row) => {
        this.applyNetworkAction(row.action);
        this.tickToCompletion();
      },
      REPLAY_CHUNK_SIZE,
      () => new Promise<void>((r) => setTimeout(r, 0)),
    );
    this.isReplaying = false;

    // nextExpectedSeq is now the count of replayed actions.
    this.nextExpectedSeq = (existingActions ?? []).length;

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
          if (!shouldBufferSeq(row.seq, this.nextExpectedSeq)) return;
          // Buffer the incoming action keyed by its seq number.
          // Do not apply immediately — Supabase Realtime does not guarantee
          // delivery order, so seq=6 may arrive before seq=5. Buffer and flush
          // in strict order.
          this.pendingActions.set(row.seq, row.action as NetworkAction);
          this.flushPendingActions();
        }
      )
      .subscribe((status) => {
        // Realtime link lifecycle. SUBSCRIBED = live; the error/closed states mean
        // the socket dropped (Supabase retries automatically and re-fires SUBSCRIBED
        // on recovery). Ignore CLOSED during our own teardown (stop()).
        if (status === 'SUBSCRIBED') {
          const recovered = this._everSubscribed && this._connection !== 'connected';
          this.setConnection('connected');
          // On a RE-subscribe, fetch any actions that committed while we were down
          // so we never miss a turn taken during the outage (deterministic catch-up).
          if (recovered) void this.resyncLog();
          this._everSubscribed = true;
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
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this._closing = true; // so removeChannel()'s CLOSED isn't reported as a drop
    if (this.fireWatchdog !== null) {
      clearTimeout(this.fireWatchdog);
      this.fireWatchdog = null;
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
  }

  /**
   * Submit a player input.
   *
   * Non-fire actions (set_angle, set_power, select_weapon): applied locally
   * only — the engine's phase guard silently drops them if phase !== 'PLAYER_TURN'.
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
      // Log only a short prefix — playerId is the de-facto identity token.
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

    // use_shield is a turn-ending COMMITTED action (like fire): it must be logged
    // so all clients replay it. Gate on shield ammo locally (the engine re-gates)
    // to avoid logging a no-op, then submit.
    if (action.type === 'use_shield') {
      const shielder = state.tanks.find(t => t.id === engineTankId);
      if (!shielder) return;
      const ammo = shielder.inventory.shield;
      if (!ammo.unlimited && ammo.count <= 0) return;
      this.setFiring(true); // lock input until the Realtime echo applies it
      this.submitAction({ type: 'use_shield' });
      return;
    }

    if (action.type !== 'fire') {
      // Aim actions (set_angle/set_power/select_weapon): apply locally only —
      // they are never logged; only turn-ending actions reach the log.
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
    return () => this.fireFailedListeners.delete(listener);
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
        .gte('seq', this.nextExpectedSeq)
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
    for (const row of (data ?? []) as RoomActionRow[]) {
      // nextExpectedSeq may have advanced between the .gte() fetch and now
      // (a Realtime event could have been applied in the interim). Guard here
      // to match the insertion-site policy and prevent stale key accumulation.
      if (!shouldBufferSeq(row.seq, this.nextExpectedSeq)) continue;
      this.pendingActions.set(row.seq, row.action as NetworkAction);
    }
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
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/restart_game`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({ roomId: this.roomId, playerId: this.playerId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error ?? 'Failed to start rematch' };
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
    // invocation of the pointer claim, so a handful of short retries comfortably
    // covers replication lag without hanging the UI if something truly failed.
    let data: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await this.supabase
        .from('rooms')
        .select('id, code, seed, options, players')
        .eq('id', newRoomId)
        .maybeSingle();
      if (res.data) { data = res.data as Record<string, unknown>; break; }
      if (res.error) {
        console.warn(`NetworkClient.handleRematch: fetch attempt ${attempt + 1} failed`, res.error);
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    if (!data) {
      console.error('NetworkClient.handleRematch: successor room never resolved', newRoomId);
      this._rematchHandled = false; // let a manual re-click re-drive the migration
      return;
    }

    const opts = (data.options ?? {}) as { maxPlayers?: number; maxWind?: number; gravity?: number; rounds?: number };
    const players = (data.players ?? []) as Array<{ id: string; name: string; color: string }>;
    listener({
      roomId:  data.id as string,
      code:    data.code as string,
      seed:    Number(data.seed),
      options: {
        maxPlayers: opts.maxPlayers ?? players.length,
        maxWind:    typeof opts.maxWind === 'number' ? opts.maxWind : MAX_WIND,
        gravity:    typeof opts.gravity === 'number' ? opts.gravity : GRAVITY,
        // Carry best-of-N across a rematch so the successor match keeps the format.
        ...(typeof opts.rounds === 'number' ? { rounds: opts.rounds } : {}),
      },
      players: players.map(p => ({ id: p.id, name: p.name, color: p.color })),
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
  ): void {
    // For TURN-ENDING actions, tell the server which seat is active NEXT (this client's
    // engine skips eliminated tanks AND re-seats the opener at a round boundary; the
    // server's modulo cursor can't do either). We also detect whether this action ENDS
    // a round — if so the server must honor the reported seat unconditionally, because
    // a round resets to the opener (seat 0), which may be the very seat that just fired
    // (the modulo "you can't keep your own turn" guard would otherwise reject it).
    // Turn-neutral buys / next_round don't move the cursor, so they report neither.
    const isTurnEnding = networkAction.type === 'fire' || networkAction.type === 'use_shield';
    let nextActiveIndex: number | undefined;
    let endsRound = roundOver; // ROUND_OVER buy / next_round pass this in directly
    if (isTurnEnding) {
      const seat = this.computeNextSeat(networkAction);
      nextActiveIndex = seat.index;
      endsRound = endsRound || seat.endsRound;
    }
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit_action`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({
        roomId:   this.roomId,
        playerId: this.playerId,
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
        if (!data.ok) {
          const isConflict = data.error === 'seq_conflict' || data.retry === true;
          if (isConflict && retryOnConflict && attempt < NetworkClient.MAX_SEQ_RETRIES) {
            // Seq collision (humans only — bots pass retryOnConflict=false, since the
            // winning row is the same bot action). Retry with bounded exponential
            // backoff + jitter so a near-simultaneous human submit lands instead of
            // being dropped after one shot (P2-10). Jitter decorrelates the racers.
            const delay = Math.min(NetworkClient.SEQ_BACKOFF_MS * 2 ** attempt, 240)
              + Math.floor(Math.random() * 25);
            setTimeout(
              () => this.submitAction(networkAction, true, actingPlayerId, attempt + 1, roundOver),
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
          } else if (!isConflict) {
            // A bot's lost race shows up as a benign seq-conflict / turn-advanced
            // rejection — don't log those as errors.
            console.error('NetworkClient: submit_action rejected:', data.error);
            // A genuine rejection of OUR OWN turn-ending action (not a bot proxy):
            // release the "Sending…" lock and tell the player, so a failed shot
            // doesn't trap them (P1-6). Bot proxies don't hold the lock.
            if (!actingPlayerId) this.failFire('Shot failed — try again.');
          }
        }
      })
      .catch(err => {
        console.error('NetworkClient: submit_action network error:', err);
        if (!actingPlayerId) this.failFire('Connection problem — shot not sent. Try again.');
      });
  }

  /**
   * Apply a logged network action to the local engine and RECORD it in the
   * applied log (used to compute the next active seat — see computeNextSeat).
   */
  private applyNetworkAction(action: NetworkAction): void {
    replayNetworkAction(this.engine, action);
    this.appliedLog.push(action);
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
      console.error('NetworkClient.tickToCompletion: hit tick cap — possible corrupt engine state');
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
    while (
      (this.engine.getState().phase === 'PLAYER_TURN' || this.engine.getState().phase === 'ROUND_OVER') &&
      this.pendingActions.has(this.nextExpectedSeq)
    ) {
      const action = this.pendingActions.get(this.nextExpectedSeq)!;
      this.pendingActions.delete(this.nextExpectedSeq);
      this.nextExpectedSeq++;
      this.setFiring(false); // our action (or any) echoed → release the input lock + watchdog
      this.applyNetworkAction(action);
      // During initialize() replay there is no RAF loop, so tick the flight to
      // completion synchronously to return to PLAYER_TURN for the next action.
      if (this.isReplaying) this.tickToCompletion();
      this.emitState();
    }
  }

  private emitState(): void {
    const state = this.engine.getState();
    if (state.phase === 'GAME_OVER' && !this._gameOverReported) {
      this._gameOverReported = true;
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
    if (this.isReplaying) return;                 // history replay drives itself
    if (state.phase !== 'PLAYER_TURN') return;
    if (this.botByTank.size === 0) return;        // no CPU seats in this room

    const tankId = state.activePlayerId;
    const difficulty = this.botByTank.get(tankId);
    if (!difficulty) return;                       // active seat is human

    // Use the engine's EFFECTIVE gravity (sudden death ramps it past the threshold) so the
    // bot aims for the arc the engine will actually fly — not a flat base-gravity arc that
    // lands short once sudden death kicks in. Deterministic: every client's engine is at the
    // same turn, so all compute the identical plan (lockstep preserved).
    const plan = computeAiPlan(state, tankId, difficulty, this.engine.getEffectiveGravity());
    if (!plan) return;                             // no target (shouldn't happen)

    // Buy-to-restock (P1-7b) is a TWO-PHASE turn: a turn-neutral buy, then the
    // shot. The buy does NOT advance the turn, so the guard is keyed on the PHASE
    // (buy vs act), not just (turn, tank). After the buy commits and replays, the
    // bot owns the weapon, so the recomputed plan has no `buy` and this driver
    // submits the fire on the next pass. Every client recomputes the same
    // transition deterministically, so buy and fire land as two ordered log rows.
    const phase = plan.buy ? 'buy' : 'act';
    const key = `${state.turn}:${tankId}:${phase}`;
    if (key === this.lastBotKey) return;           // already submitted this phase
    this.lastBotKey = key;

    const actingId = this.supaIdByTank.get(tankId);
    if (!actingId) return;

    const action: NetworkAction = plan.buy
      ? { type: 'buy', weapon: plan.buy }
      : plan.weapon === 'shield'
        ? { type: 'use_shield' }
        : { type: 'fire', angle: plan.angle, power: plan.power, weapon: plan.weapon };

    // No retry: a seq-conflict means another client already committed the (same)
    // bot action; the referee would reject a late retry anyway (turn advanced).
    this.submitAction(action, /* retryOnConflict */ false, actingId);
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
    const body = JSON.stringify({
      roomId:   this.roomId,
      playerId: this.playerId,
      winnerId,
      rounds:     state.totalRounds,
      scoreboard,
    });
    // Fire-and-forget with one retry on transient failure. The server's
    // UNIQUE(room_id) on match_scores makes a duplicate POST idempotent.
    // A non-ok HTTP response is treated as a transient failure (thrown inside
    // the fn) so the retry fires. On final failure we log and move on.
    void postOnceWithRetry(
      async () => {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finish_game`,
          {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            },
            // playerId lets finish_game authorize the caller as a room member (P2-9).
            body,
          },
        );
        if (!res.ok) {
          throw new Error(`finish_game HTTP ${res.status}`);
        }
        return res;
      },
      2,
    ).then((result) => {
      if (!result.ok) {
        console.error('NetworkClient: finish_game error:', result.error);
      }
    });
  }
}
