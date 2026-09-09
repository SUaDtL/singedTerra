import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import {
  normalizeTankLoadout,
  type TankLoadout,
} from '@shared/types/TankLoadout'
import {
  LobbyTransport,
  type NetworkPlayer,
  type RoomOptions,
} from './LobbyTransport'

export interface LobbyWaitingState {
  roomId: string
  roomCode: string
  playerId: string
  token: string
  players: NetworkPlayer[]
  seed: number
  options: RoomOptions
  thisPlayerReady: boolean
}

export type LobbySessionEvent =
  | { type: 'changed' }
  | {
      type: 'ready'
      source: 'direct' | 'realtime'
      room: { players: NetworkPlayer[]; seed: number; options: RoomOptions }
    }
  | { type: 'gone'; message: string }

export interface LobbySessionStaleOutcome {
  readonly stale: true
}

type SessionTransport = Pick<
  LobbyTransport,
  'heartbeat' | 'readyUp' | 'updatePlayer' | 'leaveRoom'
>

type SessionSupabase = Pick<SupabaseClient, 'channel' | 'removeChannel'>
type SupabaseLoader = () => Promise<SessionSupabase>

const EMPTY_WAITING: LobbyWaitingState = {
  roomId: '',
  roomCode: '',
  playerId: '',
  token: '',
  players: [],
  seed: 0,
  options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
  thisPlayerReady: false,
}

const loadDefaultSupabase: SupabaseLoader = async () => {
  const { supabase } = await import('../lib/supabase')
  return supabase
}

export class LobbySession {
  private state: LobbyWaitingState = { ...EMPTY_WAITING, players: [] }
  private supabaseClient: SessionSupabase | null = null
  private supabaseLoadPromise: Promise<SessionSupabase> | null = null
  private waitingChannel: RealtimeChannel | null = null
  private waitingHeartbeatId: ReturnType<typeof setInterval> | null = null
  private browsePollId: ReturnType<typeof setInterval> | null = null
  private lastWaitingSig = ''
  private terminalReadyRoomId: string | null = null
  private subscriptionGeneration = 0
  private operationGeneration = 0
  private actionLifecycleOpen = false

  constructor(
    private readonly transport: SessionTransport,
    private readonly onEvent: (event: LobbySessionEvent) => void,
    private readonly loadSupabase: SupabaseLoader = loadDefaultSupabase,
  ) {}

  get waiting(): Readonly<LobbyWaitingState> {
    return this.state
  }

  replaceWaiting(next: LobbyWaitingState): void {
    const identityChanged =
      next.roomId !== this.state.roomId
      || next.playerId !== this.state.playerId
      || next.token !== this.state.token
    if (identityChanged) {
      this.terminalReadyRoomId = null
      this.operationGeneration += 1
    }
    if (!next.roomId || !next.playerId || !next.token) {
      this.actionLifecycleOpen = false
    } else if (identityChanged) {
      this.actionLifecycleOpen = true
    }
    this.state = { ...next, players: [...next.players] }
  }

  async subscribeWaitingRoom(): Promise<void> {
    if (!this.actionLifecycleOpen) return
    this.cleanupWaitingChannel()
    const generation = this.subscriptionGeneration
    const roomId = this.state.roomId
    const supabase = await this.getSupabase()
    if (!this.isCurrentSubscription(generation, roomId)) return
    this.waitingChannel = supabase
      .channel(`rooms:${roomId}`)
      .on('postgres_changes' as Parameters<ReturnType<typeof supabase.channel>['on']>[0], {
        event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
      }, (payload) => {
        if (!this.isCurrentSubscription(generation, roomId)) return
        this.applyRoomUpdate(payload.new as Record<string, unknown>)
      })
      .on('postgres_changes' as Parameters<ReturnType<typeof supabase.channel>['on']>[0], {
        event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
      }, () => {
        if (!this.isCurrentSubscription(generation, roomId)) return
        this.handleRoomGone('This room is no longer available.')
      })
      .subscribe()
    this.startHeartbeat()
  }

  cleanupWaitingChannel(): void {
    this.subscriptionGeneration += 1
    this.operationGeneration += 1
    this.stopHeartbeat()
    this.lastWaitingSig = ''
    if (this.waitingChannel) {
      void this.supabaseClient?.removeChannel(this.waitingChannel)
      this.waitingChannel = null
    }
  }

  startHeartbeat(): void {
    this.stopHeartbeat()
    this.waitingHeartbeatId = setInterval(() => {
      void this.transport.heartbeat(this.seat()).catch(() => {})
    }, 10_000)
  }

  stopHeartbeat(): void {
    if (this.waitingHeartbeatId !== null) {
      clearInterval(this.waitingHeartbeatId)
      this.waitingHeartbeatId = null
    }
  }

  startBrowsePoll(tick: () => void): void {
    this.stopBrowsePoll()
    this.browsePollId = setInterval(tick, 3_000)
  }

  stopBrowsePoll(): void {
    if (this.browsePollId !== null) {
      clearInterval(this.browsePollId)
      this.browsePollId = null
    }
  }

  async readyUp(): Promise<
    Awaited<ReturnType<SessionTransport['readyUp']>> | LobbySessionStaleOutcome
  > {
    if (!this.actionLifecycleOpen) return { stale: true }
    const seat = this.seat()
    const generation = this.operationGeneration
    let result: Awaited<ReturnType<SessionTransport['readyUp']>>
    try {
      result = await this.transport.readyUp(seat)
    } catch (error) {
      if (!this.isCurrentOperation(generation, seat.roomId)) return { stale: true }
      throw error
    }
    if (!this.isCurrentOperation(generation, seat.roomId)) {
      return { stale: true }
    }
    if (result.ok && !result.data?.error) {
      if (Array.isArray(result.data?.players)) {
        this.state = { ...this.state, players: result.data.players, thisPlayerReady: true }
      } else {
        this.state = { ...this.state, thisPlayerReady: true }
      }
      if (result.data?.started) {
        this.emitReady('direct')
      }
    }
    return result
  }

  async updatePlayer(fields: {
    name?: string
    color?: string
    loadout?: TankLoadout
  }): Promise<
    Awaited<ReturnType<SessionTransport['updatePlayer']>> | LobbySessionStaleOutcome
  > {
    if (!this.actionLifecycleOpen) return { stale: true }
    const seat = this.seat()
    const generation = this.operationGeneration
    let result: Awaited<ReturnType<SessionTransport['updatePlayer']>>
    try {
      result = await this.transport.updatePlayer({ ...seat, fields })
    } catch (error) {
      if (!this.isCurrentOperation(generation, seat.roomId)) return { stale: true }
      throw error
    }
    if (!this.isCurrentOperation(generation, seat.roomId)) {
      return { stale: true }
    }
    if (result.ok && !result.data?.error && Array.isArray(result.data?.players)) {
      this.state = { ...this.state, players: result.data.players }
    }
    return result
  }

  async leaveRoom(): Promise<void> {
    if (!this.actionLifecycleOpen) return
    const seat = this.seat()
    this.actionLifecycleOpen = false
    this.cleanupWaitingChannel()
    const retirementGeneration = this.operationGeneration
    try {
      const result = await this.transport.leaveRoom(seat)
      if (!result.ok) throw new Error(`Room leave failed (${result.status}).`)
    } catch (error) {
      if (retirementGeneration === this.operationGeneration && seat.roomId === this.state.roomId) {
        this.actionLifecycleOpen = true
      }
      throw error
    }
  }

  private async getSupabase(): Promise<SessionSupabase> {
    if (this.supabaseClient) return this.supabaseClient
    if (!this.supabaseLoadPromise) this.supabaseLoadPromise = this.loadSupabase()
    try {
      this.supabaseClient = await this.supabaseLoadPromise
      return this.supabaseClient
    } catch (error) {
      this.supabaseLoadPromise = null
      throw error
    }
  }

  private isCurrentSubscription(generation: number, roomId: string): boolean {
    return generation === this.subscriptionGeneration && roomId === this.state.roomId
  }

  private isCurrentOperation(generation: number, roomId: string): boolean {
    return this.actionLifecycleOpen
      && generation === this.operationGeneration
      && roomId === this.state.roomId
  }

  private applyRoomUpdate(row: Record<string, unknown>): void {
    if (Array.isArray(row.players)) this.state = { ...this.state, players: row.players as NetworkPlayer[] }
    if (row.seed !== undefined) this.state = { ...this.state, seed: row.seed as number }
    if (row.options !== undefined) this.state = { ...this.state, options: row.options as RoomOptions }

    if (row.status === 'active') {
      this.emitReady('realtime')
      return
    }

    if (Array.isArray(row.players) && !this.state.players.some((player) => player.id === this.state.playerId)) {
      this.handleRoomGone('You are no longer in this room.')
      return
    }

    const sig = this.waitingSignature(this.state.players, typeof row.status === 'string' ? row.status : undefined)
    if (sig !== this.lastWaitingSig) {
      this.lastWaitingSig = sig
      this.onEvent({ type: 'changed' })
    }
  }

  private handleRoomGone(message: string): void {
    if (!this.state.roomId) return
    this.actionLifecycleOpen = false
    this.cleanupWaitingChannel()
    this.state = {
      ...this.state,
      roomId: '',
      roomCode: '',
      playerId: '',
      token: '',
      players: [],
      thisPlayerReady: false,
    }
    this.terminalReadyRoomId = null
    this.onEvent({ type: 'gone', message })
  }

  private emitReady(source: 'direct' | 'realtime'): void {
    if (this.terminalReadyRoomId === this.state.roomId) return
    this.terminalReadyRoomId = this.state.roomId
    this.actionLifecycleOpen = false
    this.cleanupWaitingChannel()
    this.onEvent({ type: 'ready', source, room: this.readyRoom() })
  }

  private readyRoom(): { players: NetworkPlayer[]; seed: number; options: RoomOptions } {
    return { players: this.state.players, seed: this.state.seed, options: this.state.options }
  }

  private seat(): { roomId: string; playerId: string; token: string } {
    const { roomId, playerId, token } = this.state
    return { roomId, playerId, token }
  }

  private waitingSignature(players: NetworkPlayer[], status?: string): string {
    return `${players.map((player) => {
      const loadout = normalizeTankLoadout(player.loadout)
      return [
        player.id,
        player.name,
        player.color,
        player.ready,
        loadout.treads,
        loadout.hull,
        loadout.turret,
        loadout.barrel,
      ].join('|')
    }).join(',')}|${status ?? ''}`
  }
}
