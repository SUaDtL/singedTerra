import {
  BARREL_LENGTH,
  BARREL_PIVOT_HEIGHT,
  barrelTip,
} from '@shared/engine/Tank';
import type { TankState } from '@shared/types/GameState';
import {
  TANK_KIT_IDS,
  TANK_PART_SLOTS,
  type TankKitId,
  type TankLoadout,
  type TankPartSlot,
} from '@shared/types/TankLoadout';

export { TANK_KIT_IDS, TANK_PART_SLOTS };
export type { TankKitId, TankPartSlot };

export const TANK_PART_ATLAS_ASSET = 'art/tank-parts.webp';
export const TANK_PART_ATLAS_WIDTH = 1024;
export const TANK_PART_ATLAS_HEIGHT = 512;
export const TANK_PART_CELL_WIDTH = 256;
export const TANK_PART_CELL_HEIGHT = 128;

export interface TankPartSource {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TankPartDefinition {
  readonly source: TankPartSource;
  /** Gameplay-scale destination box relative to the tank surface anchor. */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  /** Barrel-only rendered-part-local logical coordinates; zero for static parts. */
  readonly pivotX: number;
  readonly muzzleX: number;
}

export interface TankPartSet {
  readonly id: TankKitId;
  readonly parts: Record<TankPartSlot, TankPartDefinition>;
}

const source = (
  column: number,
  row: number,
  x: number,
  y: number,
  width: number,
  height: number,
): TankPartSource => ({
  x: column * TANK_PART_CELL_WIDTH + x,
  y: row * TANK_PART_CELL_HEIGHT + y,
  width,
  height,
});

/**
 * Tight alpha bounds measured from the authored atlas. Cropping transparent
 * cell padding before scaling preserves the component proportions and keeps
 * neighboring-cell bleed out of the gameplay-sized variants.
 */
const part = (
  sourceBox: TankPartSource,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  pivotX = 0,
  muzzleX = 0,
): TankPartDefinition => ({
  source: sourceBox,
  offsetX,
  offsetY,
  width,
  height,
  pivotX,
  muzzleX,
});

const barrel = (
  sourceBox: TankPartSource,
  height: number,
): TankPartDefinition => part(
  sourceBox,
  -4,
  -Math.floor(height / 2),
  26,
  height,
  4,
  4 + BARREL_LENGTH,
);

export const TANK_PART_SETS: Readonly<Record<TankKitId, TankPartSet>> = {
  foundry: {
    id: 'foundry',
    parts: {
      treads: part(source(0, 0, 17, 49, 239, 68), -17, -10, 34, 10),
      hull: part(source(1, 0, 32, 52, 224, 58), -16, -17, 32, 10),
      turret: part(source(2, 0, 51, 54, 156, 46), -9, -24, 18, 8),
      barrel: barrel(source(3, 0, 20, 43, 226, 40), 6),
    },
  },
  ranger: {
    id: 'ranger',
    parts: {
      treads: part(source(0, 1, 9, 27, 233, 85), -18, -15, 36, 15),
      hull: part(source(1, 1, 32, 25, 223, 62), -16, -20, 32, 9),
      turret: part(source(2, 1, 84, 33, 92, 55), -7, -26, 15, 9),
      barrel: barrel(source(3, 1, 33, 46, 214, 36), 5),
    },
  },
  bulwark: {
    id: 'bulwark',
    parts: {
      treads: part(source(0, 2, 10, 32, 232, 57), -18, -9, 36, 9),
      hull: part(source(1, 2, 11, 22, 245, 65), -17, -17, 34, 10),
      turret: part(source(2, 2, 57, 32, 152, 43), -10, -24, 20, 7),
      barrel: barrel(source(3, 2, 15, 39, 234, 49), 6),
    },
  },
  jackal: {
    id: 'jackal',
    parts: {
      treads: part(source(0, 3, 13, 27, 230, 90), -18, -14, 36, 14),
      hull: part(source(1, 3, 12, 41, 232, 76), -17, -20, 34, 11),
      turret: part(source(2, 3, 72, 43, 111, 74), -8, -27, 17, 10),
      barrel: barrel(source(3, 3, 37, 37, 211, 56), 7),
    },
  },
};

export const DEFAULT_TANK_PART_SET = TANK_PART_SETS.foundry;

/** Resolve one slot independently so mixed-kit loadouts remain data-driven. */
export function tankPartDefinition(
  loadout: Readonly<TankLoadout>,
  slot: TankPartSlot,
): TankPartDefinition {
  return TANK_PART_SETS[loadout[slot]].parts[slot];
}

export interface TankBarrelMount {
  readonly pivot: { readonly x: number; readonly y: number };
  readonly muzzle: { readonly x: number; readonly y: number };
  readonly radians: number;
}

/** Shared render mount derived entirely from the deterministic engine contract. */
export function tankBarrelMount(
  tank: Readonly<TankState>,
): TankBarrelMount {
  return {
    pivot: {
      x: tank.x,
      y: tank.y - BARREL_PIVOT_HEIGHT,
    },
    muzzle: barrelTip(tank as TankState, BARREL_LENGTH),
    radians: -tank.angle * Math.PI / 180,
  };
}
