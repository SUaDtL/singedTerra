/**
 * LobbyTransport — the single owner of the Lobby's seven Edge-Function calls
 * (create_room / join_room / list_rooms / heartbeat / ready_up / leave_room /
 * update_player). Mirrors the NetworkClient transport seam: it OWNS the request
 * body construction + the `callFunction(name, body)` POST + the response TYPES,
 * and returns the raw `EdgeResult` so the Lobby applies it to its own view/
 * session state.
 *
 * PURE TRANSPORT: no DOM, no `render`, no Lobby state. The Lobby keeps every
 * `waiting*`/`online*` field, all validation, busy/error handling, and render
 * calls; only the network call itself lives here. This is a transport seam, not
 * a session move — the session state stays in the Lobby (a later step).
 *
 * Body construction is moved verbatim from the Lobby's inline call sites: the
 * conditional spreads for maxWind/gravity/rounds/bots/economy, the
 * parseNumber/clamp usage, and the `...fields` spread all live here now, reusing
 * the pure helpers/constants already extracted into ../ui/lobbyValidation.
 */
import type { AiDifficulty } from '@shared/types/GameState';
import { clamp } from '@shared/engine/math';
import { callFunction, type EdgeResult } from '../lib/edgeFunctions';
import {
  WIND_MIN,
  WIND_MAX,
  GRAVITY_MIN,
  GRAVITY_MAX,
  parseNumber,
  parseOnlineRounds,
  parseOnlineEconomy,
} from '../ui/lobbyValidation';

/** Room visibility for created online rooms. */
export type RoomVisibility = 'public' | 'private';

/** Network room player as returned by the Edge Functions. */
export interface NetworkPlayer {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  /** CPU difficulty for bot seats; absent => human. */
  ai?: AiDifficulty;
}

/** Per-room engine options as stored on the room row / echoed by the Edge
 *  Functions. `rounds` (best-of-N) is optional for back-compat with rooms created
 *  before the match-structure feature; absent => single round. */
export type RoomOptions = {
  maxPlayers: number;
  maxWind: number;
  gravity: number;
  rounds?: number;
  interestRate?: number;
  suddenDeathTurn?: number;
  armsLevel?: number;
};

/** A public room as returned by the list_rooms Edge Function. */
export interface BrowseRoom {
  roomId: string;
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  /** Best-of-N match length (1 = single round). Defaulted server-side for legacy rooms. */
  rounds: number;
  /** Arms tier 0–4 (4 = full arsenal). Defaulted server-side for legacy rooms. */
  armsLevel: number;
  /** Count of CPU seats in the room's live roster. */
  botCount: number;
}

// ---- Response shapes (kept with the methods that parse them) ----

export interface CreateRoomResponse {
  roomId?: string;
  code?: string;
  playerId?: string;
  token?: string;
  players?: NetworkPlayer[];
  error?: string;
}

export interface JoinRoomResponse {
  roomId?: string;
  playerId?: string;
  token?: string;
  seed?: number;
  options?: RoomOptions;
  players?: NetworkPlayer[];
  error?: string;
}

export interface ListRoomsResponse {
  rooms?: BrowseRoom[];
  error?: string;
}

export interface ReadyUpResponse {
  started?: boolean;
  players?: NetworkPlayer[];
  error?: string;
}

export interface UpdatePlayerResponse {
  players?: NetworkPlayer[];
  error?: string;
}

// ---- Request params (raw form inputs; the transport builds the bodies) ----

/** Inputs for the create_room body. `bots` is pre-built by the Lobby (it owns the
 *  color palette); the advanced-settings fields arrive raw and are parsed here. */
export interface CreateRoomParams {
  playerName: string;
  color: string;
  bots: Array<{ name: string; color: string; ai: AiDifficulty }>;
  maxPlayers: number;
  visibility: RoomVisibility;
  /** Raw advanced-settings inputs, exactly as typed into the UI. */
  maxWind: string;
  gravity: string;
  rounds: string;
  interestRate: string;
  suddenDeath: string;
  armsLevel: string;
}

export interface JoinRoomParams {
  /** Room code, already trimmed + upper-cased by the caller. */
  code: string;
  playerName: string;
  color: string;
}

export interface SeatParams {
  roomId: string;
  playerId: string;
  token: string;
}

export interface UpdatePlayerParams extends SeatParams {
  fields: { name?: string; color?: string };
}

/**
 * LobbyTransport owns the seven Lobby Edge-Function calls. Each method builds the
 * exact request body the Lobby used to build inline, POSTs it via `callFunction`,
 * and returns the raw `EdgeResult` for the Lobby to apply.
 */
export class LobbyTransport {
  createRoom(params: CreateRoomParams): Promise<EdgeResult<CreateRoomResponse>> {
    const maxWind = parseNumber(params.maxWind);
    const gravity = parseNumber(params.gravity);
    const rounds = parseOnlineRounds(params.rounds);
    const economy = parseOnlineEconomy(params.interestRate, params.suddenDeath, params.armsLevel);

    const body: Record<string, unknown> = {
      playerName: params.playerName,
      color: params.color,
      ...(params.bots.length > 0 ? { bots: params.bots } : {}),
      options: {
        maxPlayers: params.maxPlayers,
        visibility: params.visibility,
        ...(maxWind !== undefined ? { maxWind: clamp(maxWind, WIND_MIN, WIND_MAX) } : {}),
        ...(gravity !== undefined ? { gravity: clamp(gravity, GRAVITY_MIN, GRAVITY_MAX) } : {}),
        ...(rounds !== undefined ? { rounds } : {}),
        ...economy,
      },
    };

    return callFunction<CreateRoomResponse>('create_room', body);
  }

  joinRoom(params: JoinRoomParams): Promise<EdgeResult<JoinRoomResponse>> {
    return callFunction<JoinRoomResponse>('join_room', {
      code: params.code,
      playerName: params.playerName,
      color: params.color,
    });
  }

  listRooms(): Promise<EdgeResult<ListRoomsResponse>> {
    return callFunction<ListRoomsResponse>('list_rooms', {});
  }

  heartbeat(params: SeatParams): Promise<EdgeResult<unknown>> {
    return callFunction('heartbeat', {
      roomId: params.roomId,
      playerId: params.playerId,
      token: params.token,
    });
  }

  readyUp(params: SeatParams): Promise<EdgeResult<ReadyUpResponse>> {
    return callFunction<ReadyUpResponse>('ready_up', {
      roomId: params.roomId,
      playerId: params.playerId,
      token: params.token,
    });
  }

  leaveRoom(params: SeatParams): Promise<EdgeResult<unknown>> {
    return callFunction('leave_room', {
      roomId: params.roomId,
      playerId: params.playerId,
      token: params.token,
    });
  }

  updatePlayer(params: UpdatePlayerParams): Promise<EdgeResult<UpdatePlayerResponse>> {
    return callFunction<UpdatePlayerResponse>('update_player', {
      roomId: params.roomId,
      playerId: params.playerId,
      token: params.token,
      ...params.fields,
    });
  }
}
