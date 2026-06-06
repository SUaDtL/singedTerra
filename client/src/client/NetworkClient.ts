import type { SupabaseClient, RealtimeChannel, RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import type { GameClient } from './GameClient';
import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import type { GameOptions } from '@shared/types/Events';
import { GameEngine } from '@shared/engine/GameEngine';

// MVP2-only: the only action type committed to the action log
export interface NetworkFireAction {
  type:   'fire';
  angle:  number;   // degrees
  power:  number;   // 0–100
  weapon: string;   // WeaponType value
}

// Shape of a row returned from room_actions
interface RoomActionRow {
  id:         string;
  room_id:    string;
  seq:        number;
  player_id:  string;
  action:     NetworkFireAction;
  created_at: string;
}

// Extended player entry that includes the Supabase-assigned id for network mode.
// GameOptions.players only requires { name, color }, so we extend here for the
// playerIndexMap construction without touching shared/.
interface NetworkPlayerEntry {
  id:    string;
  name:  string;
  color: string;
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
  private pendingActions:   Map<number, NetworkFireAction>;
  private nextExpectedSeq:  number;
  private isReplaying:      boolean;
  private _isFiring         = false;
  private _gameOverReported = false;

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

    // Instantiate local engine. Cast to GameOptions — the engine only reads
    // { name, color } from each player entry, ignoring any extra fields.
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
      this.applyNetworkFireAction(row.action);
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
          this.pendingActions.set(row.seq, row.action as NetworkFireAction);
          this.flushPendingActions();
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
      this.engine.tick();
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

    if (action.type !== 'fire') {
      // Non-fire actions: apply locally only.
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

  // ---- private helpers ----

  /**
   * POST the fire action to the submit_action Edge Function.
   * Fire-and-forget; errors are logged but not retried in MVP2 (see Appendix C item 3).
   */
  private submitAction(networkAction: NetworkFireAction, retryOnConflict = true): void {
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
        action:   networkAction,
      }),
    })
      .then(res => res.json())
      .then((data: { ok?: boolean; error?: string; seq?: number }) => {
        if (!data.ok) {
          if (data.error === 'Seq conflict, retry' && retryOnConflict) {
            // Retry once after 50ms on seq collision.
            setTimeout(() => this.submitAction(networkAction, false), 50);
          } else {
            console.error('NetworkClient: submit_action rejected:', data.error);
          }
        }
      })
      .catch(err => {
        console.error('NetworkClient: submit_action network error:', err);
      });
  }

  /**
   * Synthesize the three setup actions then the fire action, keeping the
   * shared/ engine interface unchanged.
   */
  private applyNetworkFireAction(action: NetworkFireAction): void {
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
   * Called after every buffered insertion. Applies all contiguous actions
   * starting from nextExpectedSeq, ticking to completion after each one.
   */
  private flushPendingActions(): void {
    while (this.pendingActions.has(this.nextExpectedSeq)) {
      const action = this.pendingActions.get(this.nextExpectedSeq)!;
      this.pendingActions.delete(this.nextExpectedSeq);
      this.nextExpectedSeq++;
      this._isFiring = false;
      this.applyNetworkFireAction(action);
      // During live play the RAF loop animates the flight; only tick to
      // completion synchronously during initialize() replay.
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
