import type { GameState } from './GameState';
import type { PlayerAction } from './PlayerAction';

/**
 * Socket.io event names + payload types (SPEC §5). These are fixed contracts
 * shared by client and server — define them once, here.
 */

/** Per-room game configuration set at room creation. */
export interface GameOptions {
  /** Number of players (2–4 for MVP1). */
  maxPlayers: number;
  /** Terrain RNG seed; same seed → same terrain. */
  seed?: number;
  /** Wind strength cap; defaults to MAX_WIND. */
  maxWind?: number;
  /** Gravity strength; defaults to GRAVITY. */
  gravity?: number;
}

/** Event name constants (use these instead of bare string literals). */
export const SocketEvents = {
  // Client → Server
  JOIN_ROOM: 'join_room',
  CREATE_ROOM: 'create_room',
  PLAYER_ACTION: 'player_action',
  // Server → Client
  ROOM_JOINED: 'room_joined',
  GAME_START: 'game_start',
  STATE_UPDATE: 'state_update',
  PROJECTILE_TICK: 'projectile_tick',
  GAME_OVER: 'game_over',
  ERROR: 'error',
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

// --- Client → Server payloads ---

export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
}

export interface CreateRoomPayload {
  playerName: string;
  options: GameOptions;
}

export type PlayerActionPayload = PlayerAction;

// --- Server → Client payloads ---

export interface RoomJoinedPayload {
  roomId: string;
  playerId: string;
}

export type GameStartPayload = GameState;

export type StateUpdatePayload = GameState;

export interface ProjectileTickPayload {
  x: number;
  y: number;
}

export interface GameOverPayload {
  winner: string;
}

export interface ErrorPayload {
  message: string;
}

/** Typed map of client → server events for socket.io generics. */
export interface ClientToServerEvents {
  join_room: (payload: JoinRoomPayload) => void;
  create_room: (payload: CreateRoomPayload) => void;
  player_action: (payload: PlayerActionPayload) => void;
}

/** Typed map of server → client events for socket.io generics. */
export interface ServerToClientEvents {
  room_joined: (payload: RoomJoinedPayload) => void;
  game_start: (payload: GameStartPayload) => void;
  state_update: (payload: StateUpdatePayload) => void;
  projectile_tick: (payload: ProjectileTickPayload) => void;
  game_over: (payload: GameOverPayload) => void;
  error: (payload: ErrorPayload) => void;
}
