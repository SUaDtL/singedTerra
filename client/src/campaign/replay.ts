import type { GameEngine } from '@shared/engine/GameEngine'
import type { PlayerAction } from '@shared/types/PlayerAction'
import { parseCampaignCheckpoint, type CampaignCheckpoint } from './checkpoint'
import {
  parseCampaignReplayCommands,
  parseCampaignRunState,
  replayCampaignCommandsFromCheckpoint,
  type CampaignRunState,
} from './runReducer'
import {
  CampaignStorageConflictError,
  type CampaignStorage,
  type CampaignStorageBinding,
  type CampaignStorageRecord,
} from './storage'

export const CAMPAIGN_REPLAY_PAYLOAD_VERSION = 1 as const

export interface CampaignReplayPayload {
  readonly kind: 'campaign-replay-payload'
  readonly replayVersion: typeof CAMPAIGN_REPLAY_PAYLOAD_VERSION
  readonly checkpoint: CampaignCheckpoint
  readonly runState: CampaignRunState
  readonly acceptedCommands: readonly PlayerAction[]
}

export type CampaignSaveStatus =
  | Readonly<{ status: 'saved'; revision: number; record: CampaignStorageRecord }>
  | Readonly<{ status: 'unsaved'; revision: number; error: unknown }>
  | Readonly<{ status: 'read-only'; revision: number }>

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function campaignStorageBindingFromRunState(value: unknown): CampaignStorageBinding {
  const state = parseCampaignRunState(value)
  if (!state) throw new Error('invalid campaign run state')
  return Object.freeze({
    episodeId: state.checkpoint.run.episodeId,
    episodeVersion: state.checkpoint.run.episodeVersion,
    episodeContentDigest: state.checkpoint.run.episodeContentDigest,
    profileId: state.checkpoint.profile.profileId,
    profileVersion: state.checkpoint.profile.profileVersion,
    profileContentDigest: state.checkpoint.profile.contentDigest,
  })
}

export function parseCampaignReplayPayload(value: unknown): CampaignReplayPayload | null {
  if (!record(value) || !exactKeys(value, [
    'kind', 'replayVersion', 'checkpoint', 'runState', 'acceptedCommands',
  ]) || value.kind !== 'campaign-replay-payload'
    || value.replayVersion !== CAMPAIGN_REPLAY_PAYLOAD_VERSION) return null
  const checkpoint = parseCampaignCheckpoint(value.checkpoint)
  const runState = parseCampaignRunState(value.runState)
  const acceptedCommands = parseCampaignReplayCommands(value.acceptedCommands)
  if (!checkpoint || !runState || !acceptedCommands
    || !sameValue(checkpoint, runState.checkpoint)) return null
  try {
    replayCampaignCommandsFromCheckpoint(
      checkpoint,
      acceptedCommands,
      runState.attemptCheckpoint.loadout,
    )
  } catch {
    return null
  }
  return Object.freeze({
    kind: 'campaign-replay-payload',
    replayVersion: CAMPAIGN_REPLAY_PAYLOAD_VERSION,
    checkpoint,
    runState,
    acceptedCommands,
  })
}

export function createCampaignReplayPayload(input: Readonly<{
  runState: CampaignRunState
  acceptedCommands: readonly PlayerAction[]
}>): CampaignReplayPayload {
  if (!record(input) || !exactKeys(input, ['runState', 'acceptedCommands'])) {
    throw new Error('invalid campaign replay payload input')
  }
  const payload = parseCampaignReplayPayload({
    kind: 'campaign-replay-payload',
    replayVersion: CAMPAIGN_REPLAY_PAYLOAD_VERSION,
    checkpoint: input.runState.checkpoint,
    runState: input.runState,
    acceptedCommands: input.acceptedCommands,
  })
  if (!payload) throw new Error('invalid campaign replay payload')
  return payload
}

/** Replays accepted commands to the next safe decision/terminal boundary. */
export async function replayCampaignPayload(value: unknown): Promise<Readonly<{
  payload: CampaignReplayPayload
  engine: GameEngine
}>> {
  const payload = parseCampaignReplayPayload(value)
  if (!payload) throw new Error('invalid campaign replay payload')
  const engine = replayCampaignCommandsFromCheckpoint(
    payload.checkpoint,
    payload.acceptedCommands,
    payload.runState.attemptCheckpoint.loadout,
  )
  return Object.freeze({ payload, engine })
}

/** One tab's revision cursor. A CAS conflict is sticky read-only until explicit reload. */
export class CampaignSaveSession {
  private revision = 0
  private readOnly = false

  constructor(
    private readonly storage: CampaignStorage,
    readonly slotId: string,
    readonly binding: CampaignStorageBinding,
  ) {}

  get currentRevision(): number { return this.revision }
  get isReadOnly(): boolean { return this.readOnly }

  async reload(): Promise<CampaignStorageRecord | null> {
    const current = await this.storage.load(this.slotId)
    if (current && !sameValue(current.binding, this.binding)) {
      throw new Error('campaign save session content binding mismatch')
    }
    this.revision = current?.revision ?? 0
    this.readOnly = false
    return current
  }

  async save(payloadValue: unknown): Promise<CampaignSaveStatus> {
    if (this.readOnly) return Object.freeze({ status: 'read-only', revision: this.revision })
    const payload = parseCampaignReplayPayload(payloadValue)
    if (!payload) throw new Error('invalid campaign replay payload')
    if (!sameValue(campaignStorageBindingFromRunState(payload.runState), this.binding)) {
      throw new Error('campaign replay payload content binding mismatch')
    }
    try {
      const saved = await this.storage.compareAndSwap({
        slotId: this.slotId,
        expectedRevision: this.revision,
        binding: this.binding,
        payload,
      })
      this.revision = saved.revision
      return Object.freeze({ status: 'saved', revision: this.revision, record: saved })
    } catch (error) {
      if (error instanceof CampaignStorageConflictError) {
        this.readOnly = true
        return Object.freeze({ status: 'read-only', revision: this.revision })
      }
      return Object.freeze({ status: 'unsaved', revision: this.revision, error })
    }
  }
}
