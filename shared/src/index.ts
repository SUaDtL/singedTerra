// Public surface of @singedterra/shared — engine + types.

// Types
export type {
  GameState,
  GamePhase,
  TankState,
  ProjectileState,
} from './types/GameState';
export type {
  PlayerAction,
  PlayerActionType,
  SetAngleAction,
  SetPowerAction,
  SelectWeaponAction,
  FireAction,
} from './types/PlayerAction';
export type {
  GameOptions,
  SocketEventName,
  JoinRoomPayload,
  CreateRoomPayload,
  PlayerActionPayload,
  RoomJoinedPayload,
  GameStartPayload,
  StateUpdatePayload,
  ProjectileTickPayload,
  GameOverPayload,
  ErrorPayload,
  ClientToServerEvents,
  ServerToClientEvents,
} from './types/Events';
export { SocketEvents } from './types/Events';

// Engine
export { GameEngine } from './engine/GameEngine';
export {
  GRAVITY,
  WIND_FACTOR,
  MAX_WIND,
  MAX_DAMAGE,
  step,
  collision,
  explosion,
} from './engine/Physics';
export type { CollisionResult } from './engine/Physics';
export {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  generate,
  deform,
  collapse,
  heightAt,
} from './engine/Terrain';
export { Tank, TANK_WIDTH, TANK_HEIGHT } from './engine/Tank';
export {
  WEAPONS,
  getWeapon,
} from './engine/WeaponSystem';
export type { WeaponType, WeaponDefinition } from './engine/WeaponSystem';
