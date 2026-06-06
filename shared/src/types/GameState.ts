import type { WeaponType } from '../engine/WeaponSystem';

/** Turn-system phases (SPEC §4.3 / §6). */
export type GamePhase =
  | 'LOBBY'
  | 'PLAYER_TURN'
  | 'FIRING'
  | 'RESOLVING'
  | 'GAME_OVER';

/**
 * Serializable snapshot of the full game state (SPEC §6). Broadcast by the
 * authoritative server after each RESOLVING phase, and used directly by the
 * hot-seat engine in the browser.
 */
export interface GameState {
  phase: GamePhase;
  turn: number;
  activePlayerId: string;
  /** Current wind value, range [-MAX_WIND, +MAX_WIND]. */
  wind: number;
  /** Height map, serialized from a Uint16Array (one y-height per x-column). */
  terrain: number[];
  tanks: TankState[];
  projectile: ProjectileState | null;
  /**
   * Most recent authoritative explosion, or `null` if none has occurred yet.
   *
   * Lifecycle / contract (so the client never replays a burst forever): the
   * engine sets this on impact to a NEW event whose `id` strictly increases
   * (monotonic counter). It is otherwise left untouched across ticks — it is
   * NOT cleared the next tick. The client keeps the last `id` it has animated;
   * on each `getState()` it compares `lastExplosion?.id`: if it is greater than
   * the id it last saw, it spawns a fresh particle burst and records the new id.
   * Equal id => already playing / already played => render nothing new. Because
   * ids are unique and monotonic, a given explosion triggers exactly one burst.
   */
  lastExplosion: ExplosionEvent | null;
  winner: string | null;
}

/**
 * Authoritative explosion record surfaced in {@link GameState.lastExplosion}.
 * Position/radius are engine-authoritative; the client turns this into the
 * ~500ms expanding-circles animation (client-only visual state, not in shared/).
 */
export interface ExplosionEvent {
  /** Monotonically increasing id; the client dedupes bursts by this. */
  id: number;
  /** Blast center x (canvas px). */
  cx: number;
  /** Blast center y (canvas px). */
  cy: number;
  /** Blast radius (px). */
  radius: number;
}

export interface TankState {
  id: string;
  playerName: string;
  x: number;
  y: number;
  /** Degrees, 0 = right, 90 = up. */
  angle: number;
  /** 0–100. */
  power: number;
  /** 0–100. */
  health: number;
  /** V1 movement fuel. */
  fuel: number;
  selectedWeapon: WeaponType;
  /** V1 weapon inventory: count remaining per weapon type. */
  inventory: Record<WeaponType, number>;
  /** CSS color string. */
  color: string;
  alive: boolean;
}

export interface ProjectileState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  weaponType: WeaponType;
}
