import type { NetworkAction } from '@shared/net/replay'

// Matches the rooms table
export interface Room {
  id: string
  code: string
  seed: number
  status: 'waiting' | 'active' | 'finished'
  options: { maxPlayers: number; maxWind?: number; gravity?: number }
  players: RoomPlayer[]
  active_player_index: number
  turn: number
  winner: string | null
  created_at: string
}

export interface RoomPlayer {
  id: string
  name: string
  color: string
  ready: boolean
}

// Matches the room_actions table. `action` carries the full committed-action
// union (fire | use_shield | buy | next_round) — the log is not fire-only, so
// any consumer switching on `action.type` gets real exhaustiveness checking.
export interface RoomAction {
  id: string
  room_id: string
  seq: number
  player_id: string
  action: NetworkAction
  created_at: string
}

// Edge Function response types
export interface CreateRoomResponse { roomId: string; code: string; playerId: string }
export interface JoinRoomResponse { roomId: string; playerId: string }
export interface ReadyUpResponse { started: boolean }
export type SubmitActionResponse = { seq: number; ok: true } | { ok: false; error: string; retry?: boolean }
