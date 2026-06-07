import type { SupabaseClient, RealtimeChannel, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js';
import type { GameClient, RematchInfo, ConnectionState, TurnWatch } from './GameClient';
import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import type { GameOptions } from '@shared/types/GameOptions';
import type { AiDifficulty } from '@shared/types/GameState';
import { GameEngine } from '@shared/engine/GameEngine';
import { computeAiPlan } from '@shared/engine/AI';
import { GRAVITY } from '@shared/engine/Physics';

// Turn-ending actions committed to the action log. A fire carries its aim; a
// use_shield carries nothing (it just raises the active tank's field and ends the
// turn). Both must be LOGGED so every client replays them deterministically — a
// shield applied locally-only would desync the games (Sprint 4 Slice 3.2).
export interface NetworkFireAction {
  type:   'fire';
  angle:  number;   // degrees
  power:  number;   // 0–100
  weapon: string;   // WeaponType value
}
export interface NetworkShieldAction {
  type: 'use_shield';
}
// A store purchase. Turn-NEUTRAL (does not end the turn), but still LOGGED so
// every client replays the credit/inventory change identically.
export interface NetworkBuyAction {
  type: 'buy';
  weapon: string;
}
export type NetworkAction = NetworkFireAction | NetworkShieldAction | NetworkBuyAction;

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

    this.isReplaying = true;
    for (const row of (existingActions ?? []) as RoomActionRow[]) {
      this.applyNetworkAction(row.action);
      this.tickToCompletion();
    }
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
   * NOTE: After a fire action is applied via applyNetworkFireAction +
   * tickToCompletion (in the Realtime callback), the engine is already back in
   * PLAYER_TURN and the RAF tick() calls are no-ops until the next action. The
   * RAF loop is responsible for smooth rendering of projectile flight; ticking
   * to completion in the Realtime callback handles deterministic outcome
   * resolution.
   */
  start(): void {
    const loop = () => {
      const wasFiring = this.engine.getState().phase === 'FIRING';
      this.engine.tick();
      // When a shot's flight just RESOLVED (FIRING -> PLAYER_TURN/GAME_OVER), drain
      // the NEXT buffered action. flushPendingActions only applies one turn-ending
      // action at a time (it stops once the engine re-enters FIRING), so the RAF
      // loop is what advances the queue between shots — this is what prevents a
      // buffered N+1 from being dropped while N is still in flight (P0-2).
      if (wasFiring && this.engine.getState().phase !== 'FIRING') {
        this.flushPendingActions();
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
      console.error('NetworkClient.sendAction: no engine tank ID for playerId', this.playerId);
      return;
    }

    // Only process input when it is this player's turn.
    const state = this.engine.getState();
    if (state.activePlayerId !== engineTankId) return;

    // buy is a turn-NEUTRAL COMMITTED action: logged (so all clients replay the
    // credit/inventory change) but it does not end the turn. Submit it; the
    // engine applies on the Realtime echo. Affordability is re-gated by the engine.
    if (action.type === 'buy') {
      this.submitAction({ type: 'buy', weapon: action.weapon });
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
   * Set the "firing" input lock. Arming it (true) starts a watchdog so a submitted
   * shot that never echoes back (lost submit / dropped Realtime echo) eventually
   * releases the lock instead of trapping the player in "Sending…". The echo path
   * (flushPendingActions) calls this with false, which also disarms the watchdog.
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
        if (this._isFiring) this.failFire('Shot timed out — try again.');
      }, NetworkClient.FIRE_TIMEOUT_MS);
    }
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
    const { data, error } = await this.supabase
      .from('room_actions')
      .select('*')
      .eq('room_id', this.roomId)
      .gte('seq', this.nextExpectedSeq)
      .order('seq', { ascending: true });
    if (error) {
      console.error('NetworkClient.resyncLog: failed to re-fetch log:', error.message);
      return;
    }
    for (const row of (data ?? []) as RoomActionRow[]) {
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
        maxWind:    typeof opts.maxWind === 'number' ? opts.maxWind : 10,
        gravity:    typeof opts.gravity === 'number' ? opts.gravity : 0.15,
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
  ): void {
    // For turn-ending actions, tell the server which seat is active NEXT (this
    // client's engine skips eliminated tanks; the server's modulo cursor can't).
    // Omitted for turn-neutral buys (they don't change whose turn it is).
    const nextActiveIndex = networkAction.type === 'buy'
      ? undefined
      : this.computeNextActiveIndex(networkAction);
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
              () => this.submitAction(networkAction, true, actingPlayerId, attempt + 1),
              delay,
            );
          } else if (isConflict && retryOnConflict) {
            // Exhausted retries (a human action that kept colliding) — release the
            // input lock so the player can re-fire rather than stay stuck.
            console.error('NetworkClient: submit_action seq-conflict retries exhausted');
            if (!actingPlayerId) this.failFire('Shot kept colliding — try again.');
          } else if (!isConflict && data.error !== 'Not your turn') {
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
   * applied log (used to compute the next active seat — see computeNextActiveIndex).
   */
  private applyNetworkAction(action: NetworkAction): void {
    NetworkClient.replayInto(this.engine, action);
    this.appliedLog.push(action);
  }

  /**
   * Apply one network action to an arbitrary engine. A fire is synthesized as the
   * three setup actions then the fire; use_shield / buy are applied directly. Pure
   * w.r.t. the engine it is given — used both for the live engine and a throwaway
   * one when computing the next active seat.
   */
  private static replayInto(engine: GameEngine, action: NetworkAction): void {
    if (action.type === 'use_shield') {
      engine.applyAction({ type: 'use_shield' });
      return;
    }
    if (action.type === 'buy') {
      engine.applyAction({ type: 'buy', weapon: action.weapon as import('@shared/engine/WeaponSystem').WeaponType });
      return;
    }
    engine.applyAction({ type: 'set_angle',     angle:  action.angle });
    engine.applyAction({ type: 'set_power',     power:  action.power });
    engine.applyAction({ type: 'select_weapon', weapon: action.weapon as import('@shared/engine/WeaponSystem').WeaponType });
    engine.applyAction({ type: 'fire' });
  }

  /**
   * Compute the 0-based SEAT INDEX of the player whose turn it will be AFTER the
   * given turn-ending action commits. Replays the applied log + the pending action
   * through a throwaway engine and reads its activePlayerId ('p{i+1}'). Because the
   * engine skips ELIMINATED tanks, this is the death-aware rotation the server's
   * raw modulo cursor gets wrong in 3-4P games (P0-3). Deterministic — every
   * client computes the same value, so it is safe for the server to store.
   */
  private computeNextActiveIndex(pending: NetworkAction): number {
    const tmp = new GameEngine(this.options as GameOptions);
    for (const a of this.appliedLog) {
      NetworkClient.replayInto(tmp, a);
      this.tickEngineToCompletion(tmp);
    }
    NetworkClient.replayInto(tmp, pending);
    this.tickEngineToCompletion(tmp);
    const id = tmp.getState().activePlayerId; // 'p1'..'pN'
    const idx = Number(id.replace(/[^0-9]/g, '')) - 1;
    return Number.isFinite(idx) && idx >= 0 ? idx : 0;
  }

  /** Tick any engine until it leaves FIRING (bounded). */
  private tickEngineToCompletion(engine: GameEngine): void {
    let t = 0;
    while (engine.getState().phase === 'FIRING' && t < 10_000) { engine.tick(); t++; }
  }

  /**
   * Tick the engine forward until the phase exits FIRING (i.e., reaches
   * PLAYER_TURN, NEXT_TURN, RESOLVING, or GAME_OVER). Must be called after
   * every applyNetworkFireAction() to ensure the engine is ready for the next
   * action.
   *
   * Hard cap of 10,000 ticks prevents an infinite loop if game state is corrupt.
   * At 16ms/tick a full ballistic arc is typically 100–500 ticks; 10,000 is safe.
   */
  private tickToCompletion(): void {
    const MAX_TICKS = 10_000;
    let ticks = 0;
    while (
      this.engine.getState().phase === 'FIRING' &&
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
   */
  private flushPendingActions(): void {
    while (
      this.engine.getState().phase === 'PLAYER_TURN' &&
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

    const plan = computeAiPlan(state, tankId, difficulty, this.gravity);
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
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finish_game`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      // playerId lets finish_game authorize the caller as a room member (P2-9).
      body: JSON.stringify({ roomId: this.roomId, playerId: this.playerId, winnerId }),
    }).catch(err => {
      console.error('NetworkClient: finish_game error:', err);
    });
  }
}
