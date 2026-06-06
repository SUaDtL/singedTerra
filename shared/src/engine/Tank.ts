import type { TankState } from '../types/GameState';
import type { WeaponType } from './WeaponSystem';

/** Tank bounding-box dimensions (px) used for collision (SPEC §4.2). */
export const TANK_WIDTH = 20;
export const TANK_HEIGHT = 12;

/**
 * Tank entity helpers operating on the serializable `TankState`. Kept as plain
 * functions (rather than a stateful class) so state stays JSON-serializable for
 * GameState broadcast.
 */
export const Tank = {
  /** Create a fresh tank at full health. */
  create(params: {
    id: string;
    playerName: string;
    x: number;
    y: number;
    color: string;
    selectedWeapon?: WeaponType;
  }): TankState {
    void params;
    throw new Error('not implemented');
  },

  /** Apply damage, clamping health to [0, 100] and updating `alive`. */
  applyDamage(tank: TankState, amount: number): void {
    void tank;
    void amount;
    throw new Error('not implemented');
  },

  /** Axis-aligned bounding box for collision tests. */
  bounds(tank: TankState): { x: number; y: number; w: number; h: number } {
    void tank;
    throw new Error('not implemented');
  },
};
