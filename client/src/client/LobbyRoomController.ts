import { normalizeNetworkRulesetVersion, CURRENT_NETWORK_RULESET_VERSION } from './networkRuleset'
import { normalizeBattlefieldWorldId, normalizeWallMode } from '@shared/types/GameOptions'
import { normalizeTerrainHazardMode } from '@shared/engine/Terrain'
import { normalizeTankLoadout } from '@shared/types/TankLoadout'
import type {
  CreateRoomParams,
  JoinRoomParams,
  LobbyTransport,
  FetchedRoom,
  NetworkPlayer,
  RoomOptions,
} from './LobbyTransport'
import type { LobbySession, LobbyWaitingState } from './LobbySession'
import {
  clearSession,
  isLiveSession,
  readSession,
  writeSession,
  type SessionDescriptor,
} from '../lib/sessionDescriptor'

// The secret token stays separate from the public descriptor and follows the
// player id because that identity survives a room migration/rematch.
const SEAT_TOKEN_PREFIX = 'singedterra:seat:'

type RoomTransport = Pick<LobbyTransport, 'createRoom' | 'joinRoom' | 'fetchRoom' | 'leaveRoom'>
type RoomSession = Pick<
  LobbySession,
  'waiting' | 'replaceWaiting' | 'subscribeWaitingRoom' | 'stopBrowsePoll' | 'leaveRoom'
>

export type LobbyRoomIntent = 'waiting' | 'create'

export interface LobbyRoomProjection {
  readonly busy: boolean
  readonly error: string
  readonly leaving: boolean
  readonly waiting: Readonly<LobbyWaitingState>
  readonly rejoinCandidate: { descriptor: SessionDescriptor; room: FetchedRoom } | null
}

export interface LobbyRoomHandoff {
  readonly mode: 'network'
  readonly players: Array<Pick<NetworkPlayer, 'id' | 'name' | 'color' | 'loadout' | 'ai'>>
  readonly playerNames: string[]
  readonly roomCode: string
  readonly roomId: string
  readonly playerId: string
  readonly token: string
  readonly settings: {
    seed: number
    maxWind: number
    gravity: number
    walls?: ReturnType<typeof normalizeWallMode>
    battlefieldWorld?: NonNullable<ReturnType<typeof normalizeBattlefieldWorldId>>
    hazards?: Exclude<ReturnType<typeof normalizeTerrainHazardMode>, 'none'>
    rounds?: number
    interestRate?: number
    suddenDeathTurn?: number
    armsLevel?: number
    teamMode?: boolean
    rulesetVersion: ReturnType<typeof normalizeNetworkRulesetVersion>
  }
}

interface PersistencePort {
  writeSeatToken(playerId: string, token: string): void
  writeSession(descriptor: { roomId: string; roomCode: string; playerId: string }): void
  clearSession(): void
  readSession(): SessionDescriptor | null
  readSeatToken(playerId: string): string | undefined
}

const browserPersistence: PersistencePort = {
  writeSeatToken(playerId, token) {
    try { localStorage.setItem(`${SEAT_TOKEN_PREFIX}${playerId}`, token) } catch { /* best effort */ }
  },
  writeSession,
  clearSession,
  readSession,
  readSeatToken(playerId) {
    try { return localStorage.getItem(`${SEAT_TOKEN_PREFIX}${playerId}`) ?? undefined } catch { return undefined }
  },
}

export class LobbyRoomController {
  private busy = false
  private error = ''
  private leaving = false
  private lifecycleOpen = true
  private operationGeneration = 0
  /**
   * A rejoin affordance exists only after the stored public descriptor has
   * been checked against an active room that still contains its player id.
   */
  private rejoinCandidate: { descriptor: SessionDescriptor; room: FetchedRoom } | null = null

  constructor(
    private readonly transport: RoomTransport,
    private readonly session: RoomSession,
    private readonly onChanged: () => void,
    private readonly onIntent: (intent: LobbyRoomIntent) => void,
    private readonly onHandoff: (handoff: LobbyRoomHandoff) => void = () => undefined,
    private readonly persistence: PersistencePort = browserPersistence,
  ) {}

  get projection(): LobbyRoomProjection {
    return {
      busy: this.busy, error: this.error, leaving: this.leaving,
      waiting: this.session.waiting, rejoinCandidate: this.rejoinCandidate,
    }
  }

  setBusy(busy: boolean): void { this.busy = busy }
  setError(error: string): void { this.error = error }
  setRejoinCandidate(candidate: { descriptor: SessionDescriptor; room: FetchedRoom } | null): void {
    this.rejoinCandidate = candidate
  }

  activate(): void {
    this.operationGeneration += 1
    this.lifecycleOpen = true
    if (this.busy || this.leaving) this.error = ''
    this.busy = false
    this.leaving = false
  }

  accountIdentityChanged(): void {
    this.operationGeneration += 1
    this.busy = false
    this.leaving = false
    this.error = ''
    this.rejoinCandidate = null
  }

  /** Invalidate every pending continuation before Lobby releases its resources. */
  retire(): void {
    this.operationGeneration += 1
    this.lifecycleOpen = false
    this.busy = false
    this.leaving = false
    this.error = ''
    this.rejoinCandidate = null
  }

  async checkRejoinCandidate(): Promise<void> {
    const generation = this.beginOperation(false)
    if (generation === null) return
    const descriptor = this.persistence.readSession()
    if (!descriptor) {
      this.rejoinCandidate = null
      return
    }
    const room = await this.transport.fetchRoom(descriptor.roomId)
    if (!this.isCurrent(generation)) return
    if (isLiveSession(descriptor, room)) {
      this.rejoinCandidate = { descriptor, room: room! }
      this.onChanged()
      return
    }
    this.rejoinCandidate = null
    this.persistence.clearSession()
  }

  async rejoin(): Promise<void> {
    if (!this.rejoinCandidate) return
    const generation = this.beginOperation(false)
    if (generation === null) return
    const { descriptor } = this.rejoinCandidate
    const room = await this.transport.fetchRoom(descriptor.roomId)
    if (!this.isCurrent(generation)) return
    if (!isLiveSession(descriptor, room)) {
      this.rejectRejoin('That game is no longer available.')
      return
    }
    const liveRoom = room!
    if (normalizeNetworkRulesetVersion(liveRoom.options.rulesetVersion) !== CURRENT_NETWORK_RULESET_VERSION) {
      this.rejectRejoin('This room uses an older game build and cannot be resumed here.')
      return
    }
    this.onHandoff({
      mode: 'network',
      players: liveRoom.players.map((player) => ({
        id: player.id, name: player.name, color: player.color,
        loadout: normalizeTankLoadout(player.loadout),
        ...(player.ai ? { ai: player.ai } : {}),
      })),
      playerNames: liveRoom.players.map((player) => player.name),
      roomCode: liveRoom.code,
      roomId: liveRoom.id,
      playerId: descriptor.playerId,
      token: this.persistence.readSeatToken(descriptor.playerId) ?? '',
      settings: {
        seed: liveRoom.seed,
        maxWind: liveRoom.options.maxWind,
        gravity: liveRoom.options.gravity,
        ...(normalizeWallMode(liveRoom.options.walls) !== 'open'
          ? { walls: normalizeWallMode(liveRoom.options.walls) }
          : {}),
        ...(normalizeBattlefieldWorldId(liveRoom.options.battlefieldWorld) !== undefined
          ? { battlefieldWorld: normalizeBattlefieldWorldId(liveRoom.options.battlefieldWorld)! }
          : {}),
        ...(normalizeTerrainHazardMode(liveRoom.options.hazards) !== 'none'
          ? { hazards: normalizeTerrainHazardMode(liveRoom.options.hazards) as Exclude<ReturnType<typeof normalizeTerrainHazardMode>, 'none'> }
          : {}),
        ...(liveRoom.options.rounds !== undefined ? { rounds: liveRoom.options.rounds } : {}),
        ...(liveRoom.options.interestRate !== undefined ? { interestRate: liveRoom.options.interestRate } : {}),
        ...(liveRoom.options.suddenDeathTurn !== undefined ? { suddenDeathTurn: liveRoom.options.suddenDeathTurn } : {}),
        ...(liveRoom.options.armsLevel !== undefined ? { armsLevel: liveRoom.options.armsLevel } : {}),
        ...(liveRoom.options.teamMode === true ? { teamMode: true } : {}),
        rulesetVersion: normalizeNetworkRulesetVersion(liveRoom.options.rulesetVersion),
      },
    })
  }

  async create(params: CreateRoomParams, fallback: () => {
    readonly players: NetworkPlayer[]
    readonly seed: number
    readonly options: RoomOptions
  }): Promise<void> {
    const generation = this.beginOperation()
    if (generation === null) return
    try {
      const { ok, data } = await this.transport.createRoom(params)
      if (!this.isCurrent(generation)) {
        if (ok && !data?.error) await this.releaseStaleAdmission(data)
        return
      }
      if (!ok || data?.error) return this.fail(data?.error ?? 'Failed to create room.')
      // A structurally wrong 200 must not create an undefined room identity or
      // attempt a Realtime subscription that can never be cleaned up.
      if (!data?.roomId || !data.code || !data.playerId || !data.token) {
        return this.fail('Unexpected server response — please try again.')
      }
      // Preserve the established fallback timing: server-owned fields win, but
      // presentation fallback fields are read only after the request resolves.
      const currentFallback = fallback()
      this.adopt({
        roomId: data.roomId, roomCode: data.code, playerId: data.playerId, token: data.token,
        players: data.players ?? currentFallback.players.map((player) => player.id
          ? player
          : { ...player, id: data.playerId! }),
        seed: currentFallback.seed,
        options: this.options(data.options ?? currentFallback.options), thisPlayerReady: false,
      })
    } catch (error) {
      if (!this.isCurrent(generation)) return
      console.error('Lobby.createRoom: network error —', error)
      this.fail('Network error. Try again.')
    }
  }

  async join(params: JoinRoomParams, code: string, fallbackOptions: RoomOptions): Promise<void> {
    const generation = this.beginOperation()
    if (generation === null) return
    try {
      const { ok, data } = await this.transport.joinRoom(params)
      if (!this.isCurrent(generation)) {
        if (ok && !data?.error) await this.releaseStaleAdmission(data)
        return
      }
      if (!ok || data?.error) return this.fail(data?.error ?? 'Failed to join room.')
      if (!data?.roomId || !data.playerId || !data.token) {
        return this.fail('Unexpected server response — please try again.')
      }
      if (normalizeNetworkRulesetVersion(data.options?.rulesetVersion) !== CURRENT_NETWORK_RULESET_VERSION) {
        return this.fail('This room uses an older game build and cannot be joined here.')
      }
      this.session.stopBrowsePoll()
      this.adopt({
        roomId: data.roomId, roomCode: code, playerId: data.playerId, token: data.token,
        players: data.players ?? [], seed: data.seed ?? 0,
        options: this.options(data.options ?? fallbackOptions), thisPlayerReady: false,
      })
    } catch (error) {
      if (!this.isCurrent(generation)) return
      console.error('Lobby.joinRoom: network error —', error)
      this.fail('Network error. Try again.')
    }
  }

  async leave(): Promise<void> {
    if (this.leaving) return
    const generation = this.beginOperation()
    if (generation === null) return
    this.leaving = true
    this.onChanged()
    try {
      await this.session.leaveRoom()
    } catch (error) {
      if (!this.isCurrent(generation)) return
      console.debug('Lobby.leaveRoom: best-effort leave failed —', error)
    }
    if (!this.isCurrent(generation)) return
    this.persistence.clearSession()
    this.leaving = false
    this.busy = false
    this.error = ''
    this.onIntent('create')
    this.onChanged()
  }

  private beginOperation(showBusy = true): number | null {
    if (!this.lifecycleOpen) return null
    const generation = ++this.operationGeneration
    if (!showBusy) {
      const retiredForegroundOperation = this.busy || this.leaving
      this.busy = false
      this.leaving = false
      if (retiredForegroundOperation) this.error = ''
      if (retiredForegroundOperation) this.onChanged()
      return generation
    }
    this.leaving = false
    this.busy = true
    this.error = ''
    this.onChanged()
    return generation
  }

  private isCurrent(generation: number): boolean {
    return this.lifecycleOpen && generation === this.operationGeneration
  }

  private async releaseStaleAdmission(data: {
    roomId?: string
    playerId?: string
    token?: string
  } | null | undefined): Promise<void> {
    if (!data?.roomId || !data.playerId || !data.token) return
    const current = this.session.waiting
    if (current.roomId === data.roomId && current.playerId === data.playerId && current.token === data.token) return
    try {
      await this.transport.leaveRoom({ roomId: data.roomId, playerId: data.playerId, token: data.token })
    } catch (error) {
      console.debug('Lobby admission cleanup: best-effort leave failed —', error)
    }
  }

  private fail(message: string): void {
    this.error = message
    this.busy = false
    this.onChanged()
  }

  private rejectRejoin(message: string): void {
    this.persistence.clearSession()
    this.rejoinCandidate = null
    this.error = message
    this.onChanged()
  }

  private adopt(waiting: LobbyWaitingState): void {
    this.session.replaceWaiting(waiting)
    this.persistence.writeSeatToken(waiting.playerId, waiting.token)
    this.persistence.writeSession({
      roomId: waiting.roomId, roomCode: waiting.roomCode, playerId: waiting.playerId,
    })
    this.busy = false
    this.error = ''
    this.onIntent('waiting')
    this.onChanged()
    void this.session.subscribeWaitingRoom()
  }

  private options(options: RoomOptions): RoomOptions {
    return { ...options, rulesetVersion: normalizeNetworkRulesetVersion(options.rulesetVersion) }
  }
}
