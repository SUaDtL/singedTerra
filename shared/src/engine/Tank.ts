import type { TankState, AmmoEntry, AiDifficulty } from '../types/GameState';
import type { GameOptions } from '../types/GameOptions';
import type { WeaponType } from './WeaponSystem';
import { STARTING_CREDITS } from './WeaponSystem';
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

/**
 * Per-weapon STARTING loadout (SPEC §9 economy). A tank opens with unlimited Baby
 * Missile plus a small mid-tier kit; the premium NUKE tier (baby_nuke, nuke) and
 * extra rounds must be BOUGHT from the store with credits earned per damage dealt.
 * This is what makes the credits/buy/earn loop actually change decisions — see
 * REVIEW_BACKLOG.md task P0-1. Deterministic: pure literals. Tune in playtesting;
 * the AI's chooseWeapon() only picks weapons it actually has, so it degrades
 * gracefully (heavy_missile -> missile -> baby_missile) as stock runs down.
 */
const START_AMMO: Record<Exclude<WeaponType, 'baby_missile'>, number> = {
  missile:         4,
  heavy_missile:   1,
  cluster_bomb:    2,
  bouncing_betty:  2,
  funky_bomb:      1,
  napalm:          1,
  dirt_bomb:       1,
  shield:          1,
  baby_nuke:       0, // premium — buy from the store
  nuke:            0, // premium — buy from the store
};

/** Horizontal placement fractions for the two MVP0 tanks. */
const LEFT_TANK_FRACTION = 0.15;
const RIGHT_TANK_FRACTION = 0.85;

/** Distinct default colors for the two MVP0 tanks. */
const TANK_COLORS = ['#e84d4d', '#4d8ce8'] as const;

/**
 * Default color palette for multi-player (2–4) placement. The first two entries
 * match the MVP0 two-tank colors so a 2-player game looks identical whether it
 * goes through placeTwoTanks or placeTanks with default colors.
 */
const MULTI_TANK_COLORS = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'] as const;

/** Inclusive horizontal spread band (canvas fractions) for N evenly-spaced tanks. */
const SPREAD_MIN_FRACTION = 0.1;
const SPREAD_MAX_FRACTION = 0.9;

/**
 * Default loadout (Sprint 4, generous sandbox): baby_missile is unlimited; every
 * other weapon starts with DEFAULT_AMMO rounds. No Infinity sentinel — the
 * `unlimited` flag carries that meaning so inventory JSON round-trips cleanly.
 * Deterministic: a pure literal, no clock/random.
 */
function defaultInventory(): Record<WeaponType, AmmoEntry> {
  const limited = (count: number): AmmoEntry => ({ count, unlimited: false });
  return {
    baby_missile: { count: 0, unlimited: true },
    missile: limited(START_AMMO.missile),
    heavy_missile: limited(START_AMMO.heavy_missile),
    baby_nuke: limited(START_AMMO.baby_nuke),
    nuke: limited(START_AMMO.nuke),
    dirt_bomb: limited(START_AMMO.dirt_bomb),
    bouncing_betty: limited(START_AMMO.bouncing_betty),
    funky_bomb: limited(START_AMMO.funky_bomb),
    napalm: limited(START_AMMO.napalm),
    cluster_bomb: limited(START_AMMO.cluster_bomb),
    shield: limited(START_AMMO.shield),
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
  ai: AiDifficulty | null = null,
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
    shieldHp: 0, // no shield until activated
    credits: STARTING_CREDITS,
    ai, // null => human; a difficulty => CPU-controlled
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
 * Place N (2–4) tanks spread evenly across the canvas in the inclusive band
 * [SPREAD_MIN_FRACTION, SPREAD_MAX_FRACTION], each resting on the terrain
 * surface, using each player's name + color. Ids are 'p1'..'pN'. Deterministic:
 * placement depends only on N and the terrain, never on a random source.
 *
 * For N=2 this yields x at 0.1 and 0.9 — intentionally NOT the same as
 * placeTwoTanks (0.15 / 0.85): callers wanting the exact MVP0 two-tank layout
 * must use placeTwoTanks. Colors default to MULTI_TANK_COLORS when a player
 * omits one.
 */
export function placeTanks(
  terrain: number[],
  players: Array<{ name: string; color: string; ai?: AiDifficulty }>,
  opts?: GameOptions,
): TankState[] {
  void opts;
  const n = players.length;
  const tanks: TankState[] = [];
  for (let i = 0; i < n; i++) {
    // Evenly distribute across the band. With n===1 place at the band start.
    const frac =
      n <= 1
        ? SPREAD_MIN_FRACTION
        : SPREAD_MIN_FRACTION +
          (SPREAD_MAX_FRACTION - SPREAD_MIN_FRACTION) * (i / (n - 1));
    const x = Math.round(CANVAS_WIDTH * frac);
    const player = players[i];
    const color = player.color ?? MULTI_TANK_COLORS[i % MULTI_TANK_COLORS.length];
    tanks.push(createTank(`p${i + 1}`, player.name, x, terrain, color, player.ai ?? null));
  }
  return tanks;
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
      shieldHp: 0, // no shield until activated
      credits: STARTING_CREDITS,
      ai: null, // Tank.create is used for human/default tanks
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
