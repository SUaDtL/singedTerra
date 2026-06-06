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
  winner: string | null;
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
