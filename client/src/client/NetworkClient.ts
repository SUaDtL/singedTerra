import type { SupabaseClient, RealtimeChannel, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js';
import type { GameClient, RematchInfo } from './GameClient';
import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import type { GameOptions } from '@shared/types/Events';
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
      .subscribe();

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
      this._isFiring = true; // lock input until the Realtime echo applies it
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

    this._isFiring = true;
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

    const opts = (data.options ?? {}) as { maxPlayers?: number; maxWind?: number; gravity?: number };
    const players = (data.players ?? []) as Array<{ id: string; name: string; color: string }>;
    listener({
      roomId:  data.id as string,
      code:    data.code as string,
      seed:    Number(data.seed),
      options: {
        maxPlayers: opts.maxPlayers ?? players.length,
        maxWind:    typeof opts.maxWind === 'number' ? opts.maxWind : 10,
        gravity:    typeof opts.gravity === 'number' ? opts.gravity : 0.15,
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
  ): void {
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
        // Present only when proxying a CPU seat — the seat the action is FOR.
        ...(actingPlayerId ? { actingPlayerId } : {}),
        action:   networkAction,
      }),
    })
      .then(res => res.json())
      .then((data: { ok?: boolean; error?: string; retry?: boolean; seq?: number }) => {
        if (!data.ok) {
          const isConflict = data.error === 'seq_conflict' || data.retry === true;
          if (isConflict && retryOnConflict) {
            // Retry once after 50ms on seq collision (humans only — bots pass
            // retryOnConflict=false, since the winning row is the same action).
            setTimeout(() => this.submitAction(networkAction, false, actingPlayerId), 50);
          } else if (!isConflict && data.error !== 'Not your turn') {
            // A bot's lost race shows up as a benign seq-conflict / turn-advanced
            // rejection — don't log those as errors.
            console.error('NetworkClient: submit_action rejected:', data.error);
          }
        }
      })
      .catch(err => {
        console.error('NetworkClient: submit_action network error:', err);
      });
  }

  /**
   * Apply a logged network action to the local engine. A fire is synthesized as
   * the three setup actions then the fire; a use_shield is applied directly.
   * Keeps the shared/ engine interface unchanged.
   */
  private applyNetworkAction(action: NetworkAction): void {
    if (action.type === 'use_shield') {
      this.engine.applyAction({ type: 'use_shield' });
      return;
    }
    if (action.type === 'buy') {
      this.engine.applyAction({ type: 'buy', weapon: action.weapon as import('@shared/engine/WeaponSystem').WeaponType });
      return;
    }
    this.engine.applyAction({ type: 'set_angle',     angle:  action.angle });
    this.engine.applyAction({ type: 'set_power',     power:  action.power });
    this.engine.applyAction({ type: 'select_weapon', weapon: action.weapon as import('@shared/engine/WeaponSystem').WeaponType });
    this.engine.applyAction({ type: 'fire' });
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
      this._isFiring = false;
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

    const key = `${state.turn}:${tankId}`;
    if (key === this.lastBotKey) return;           // already submitted this turn
    this.lastBotKey = key;

    const plan = computeAiPlan(state, tankId, difficulty, this.gravity);
    if (!plan) return;                             // no target (shouldn't happen)

    const actingId = this.supaIdByTank.get(tankId);
    if (!actingId) return;

    const action: NetworkAction = plan.weapon === 'shield'
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
      body: JSON.stringify({ roomId: this.roomId, winnerId }),
    }).catch(err => {
      console.error('NetworkClient: finish_game error:', err);
    });
  }
}
