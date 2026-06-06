import type { TankState } from '../types/GameState';
import type { GameOptions } from '../types/Events';
import type { WeaponType } from './WeaponSystem';
import { CANVAS_WIDTH } from './Terrain';

/** Tank bounding-box dimensions (px) used for collision (SPEC §4.2). */
export const TANK_WIDTH = 20;
export const TANK_HEIGHT = 12;

/** MVP0 default aiming/loadout values. */
const DEFAULT_ANGLE = 45;
const DEFAULT_POWER = 50;
const DEFAULT_HEALTH = 100;
const DEFAULT_FUEL = 0;
const DEFAULT_WEAPON: WeaponType = 'baby_missile';

/** Horizontal placement fractions for the two MVP0 tanks. */
const LEFT_TANK_FRACTION = 0.15;
const RIGHT_TANK_FRACTION = 0.85;

/** Distinct default colors for the two MVP0 tanks. */
const TANK_COLORS = ['#e84d4d', '#4d8ce8'] as const;

/**
 * Minimal MVP0 inventory: only the baby missile, with effectively unlimited
 * ammo. Other weapon types are present (keys must be exhaustive for the
 * `Record<WeaponType, number>` type) but start at 0.
 */
function defaultInventory(): Record<WeaponType, number> {
  return {
    baby_missile: Infinity,
    missile: 0,
    heavy_missile: 0,
    baby_nuke: 0,
    nuke: 0,
    dirt_bomb: 0,
    bouncing_betty: 0,
    funky_bomb: 0,
    napalm: 0,
    shield: 0,
  };
}

/** Snap an x-position to a surface y-height from the terrain height map. */
function surfaceY(x: number, terrain: number[]): number {
  const col = Math.min(Math.max(Math.round(x), 0), terrain.length - 1);
  return terrain[col];
}

/**
 * Create a fresh tank snapped onto the terrain surface at column `x`, with
 * MVP0 default aiming and loadout. Deterministic (no clock / random reads).
 */
export function createTank(
  id: string,
  playerName: string,
  x: number,
  terrain: number[],
  color: string,
): TankState {
  return {
    id,
    playerName,
    x,
    y: surfaceY(x, terrain),
    angle: DEFAULT_ANGLE,
    power: DEFAULT_POWER,
    health: DEFAULT_HEALTH,
    fuel: DEFAULT_FUEL,
    selectedWeapon: DEFAULT_WEAPON,
    inventory: defaultInventory(),
    color: color,
    alive: true,
  };
}

/**
 * Place exactly two tanks at ~15% and ~85% of CANVAS_WIDTH, each resting on the
 * terrain surface, with distinct colors. Deterministic — the optional
 * `GameOptions` is accepted for signature parity but placement does not depend
 * on any random source.
 */
export function placeTwoTanks(
  terrain: number[],
  opts?: GameOptions,
): TankState[] {
  void opts;
  const leftX = Math.round(CANVAS_WIDTH * LEFT_TANK_FRACTION);
  const rightX = Math.round(CANVAS_WIDTH * RIGHT_TANK_FRACTION);
  return [
    createTank('p1', 'Player 1', leftX, terrain, TANK_COLORS[0]),
    createTank('p2', 'Player 2', rightX, terrain, TANK_COLORS[1]),
  ];
}

/**
 * Barrel-end point (projectile spawn) along the tank's aim vector.
 *
 * Angle convention (SPEC §6): degrees, 0 = right (+x), 90 = up (screen −y).
 * tip = (tank.x + len*cosθ, tank.y − len*sinθ).
 */
export function barrelTip(tank: TankState, length: number): { x: number; y: number } {
  const rad = (tank.angle * Math.PI) / 180;
  return {
    x: tank.x + length * Math.cos(rad),
    y: tank.y - length * Math.sin(rad),
  };
}

/**
 * Tank entity helpers operating on the serializable `TankState`. Kept as plain
 * functions (rather than a stateful class) so state stays JSON-serializable for
 * GameState broadcast.
 */
export const Tank = {
  /** Create a fresh tank at full health at an explicit (x, y). */
  create(params: {
    id: string;
    playerName: string;
    x: number;
    y: number;
    color: string;
    selectedWeapon?: WeaponType;
  }): TankState {
    return {
      id: params.id,
      playerName: params.playerName,
      x: params.x,
      y: params.y,
      angle: DEFAULT_ANGLE,
      power: DEFAULT_POWER,
      health: DEFAULT_HEALTH,
      fuel: DEFAULT_FUEL,
      selectedWeapon: params.selectedWeapon ?? DEFAULT_WEAPON,
      inventory: defaultInventory(),
      color: params.color,
      alive: true,
    };
  },

  /** Apply damage, clamping health to [0, 100] and updating `alive`. */
  applyDamage(tank: TankState, amount: number): void {
    tank.health = Math.min(100, Math.max(0, tank.health - amount));
    tank.alive = tank.health > 0;
  },

  /** Axis-aligned bounding box for collision tests. */
  bounds(tank: TankState): { x: number; y: number; w: number; h: number } {
    return {
      x: tank.x - TANK_WIDTH / 2,
      y: tank.y - TANK_HEIGHT,
      w: TANK_WIDTH,
      h: TANK_HEIGHT,
    };
  },
};
