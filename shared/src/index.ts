// Public surface of @singedterra/shared — engine + types.

// Types
export type {
  GameState,
  GamePhase,
  TankState,
  ProjectileState,
  ExplosionEvent,
  ExplosionStyle,
} from './types/GameState';
export type {
  PlayerAction,
  PlayerActionType,
  SetAngleAction,
  SetPowerAction,
  SelectWeaponAction,
  FireAction,
} from './types/PlayerAction';
export type { GameOptions } from './types/GameOptions';

// Engine
export { GameEngine } from './engine/GameEngine';
export {
  GRAVITY,
  WIND_FACTOR,
  WIND_DRIFT_STEP,
  MAX_WIND,
  MAX_DAMAGE,
  POWER_SCALE,
  launchVelocity,
  stepProjectile,
  collide,
  explosionResult,
  damage,
  explosionDamage,
} from './engine/Physics';
export type {
  CollisionResult,
  ExplosionResult,
  Velocity,
} from './engine/Physics';
export {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BITMAP_LEN,
  generate,
  buildBitmap,
  generateBitmap,
  pixelAt,
  deform,
  applyGravity,
  surfaceAt,
} from './engine/Terrain';
export {
  Tank,
  TANK_WIDTH,
  TANK_HEIGHT,
  BARREL_LENGTH,
  createTank,
  placeTwoTanks,
  placeTanks,
  barrelTip,
} from './engine/Tank';
export { clamp } from './engine/math';
export {
  WEAPONS,
  getWeapon,
} from './engine/WeaponSystem';
export type {
  WeaponType,
  WeaponDefinition,
  DetonationDef,
  BehaviorDef,
  AirburstDef,
} from './engine/WeaponSystem';
export { createRng } from './engine/Random';
