import {
  parseCampaignRun,
  parseCampaignResult,
  type CampaignResult,
} from '@shared/campaign/definitions'
import { createCampaignGameEngine } from '@shared/campaign/initialization'
import { GameEngine } from '@shared/engine/GameEngine'
import {
  WEAPONS,
  type AccessoryType,
  type WeaponType,
} from '@shared/engine/WeaponSystem'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  getCampaignWeapon,
  resolveCampaignCombatProfile,
  type CampaignWeaponId,
} from '@shared/campaign/combatProfiles'
import type { PlayerAction } from '@shared/types/PlayerAction'
import {
  campaignDescriptorFromCheckpoint,
  createCampaignCheckpoint,
  parseCampaignCheckpoint,
  type CampaignCheckpoint,
} from './checkpoint'
import { ASH_ROAD_EPISODE } from './content/episode'
import {
  applyCampaignLoadoutDecision,
  applyCampaignLoadoutSettlement,
  applyEmergencyHullPatch,
  createCampaignLoadout,
  parseCampaignLoadout,
  type CampaignAmmunition,
  type CampaignLoadout,
  type CampaignLoadoutDecision,
} from './loadout'

export const CAMPAIGN_RUN_STATE_VERSION = 1 as const
export const CAMPAIGN_RESULT_RECEIPT_VERSION = 1 as const
export const CAMPAIGN_RETRY_VERSION = 1 as const
export const CAMPAIGN_ROUTE_CHOICE_VERSION = 1 as const
export const CAMPAIGN_CHECKPOINT_DECISION_VERSION = 1 as const
export const CAMPAIGN_EMERGENCY_PATCH_VERSION = 1 as const
export const CAMPAIGN_ADVANCE_VERSION = 1 as const
export const CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT = 256 as const
export const FUEL_STOP_SUPPLY_REWARD = Object.freeze({
  base: 2,
  perIntactDrum: 1,
} as const)

const AUTHORITATIVE_RECEIPTS = new WeakSet<object>()
const AUTHORITATIVE_MISSION_SETTLEMENTS = new WeakMap<object, CampaignMissionSettlement>()
const combatProfile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)

export interface CampaignResultReceipt {
  readonly kind: 'campaign-result-receipt'
  readonly receiptVersion: typeof CAMPAIGN_RESULT_RECEIPT_VERSION
  readonly result: CampaignResult
  readonly intactSupplyDrumIds: readonly string[]
}

export interface AppliedCampaignResult extends CampaignResultReceipt {
  readonly suppliesAwarded: number
}

interface CampaignMissionSettlement {
  readonly hull: number
  readonly ammunition: readonly CampaignAmmunition[]
}

export interface CampaignAttemptCheckpoint {
  readonly supplies: number
  readonly loadout: CampaignLoadout
}

export interface PendingCampaignCheckpointDecision {
  readonly resultAttempt: number
}

export interface AppliedCampaignCheckpointDecision {
  readonly resultAttempt: number
  readonly choice: CampaignLoadoutDecision
  readonly cost: number
}

export interface CampaignRunState {
  readonly kind: 'campaign-run-state'
  readonly stateVersion: typeof CAMPAIGN_RUN_STATE_VERSION
  readonly checkpoint: CampaignCheckpoint
  readonly attempt: number
  readonly supplies: number
  readonly selectedRouteId: string | null
  readonly loadout: CampaignLoadout
  readonly missionLoadout: CampaignLoadout | null
  readonly attemptCheckpoint: CampaignAttemptCheckpoint
  readonly pendingCheckpointDecision: PendingCampaignCheckpointDecision | null
  readonly checkpointDecisions: readonly AppliedCampaignCheckpointDecision[]
  readonly emergencyPatchAttempts: readonly number[]
  readonly appliedResults: readonly AppliedCampaignResult[]
  readonly retryFromAttempts: readonly number[]
}

export interface CampaignRetryCommand {
  readonly kind: 'campaign-retry'
  readonly retryVersion: typeof CAMPAIGN_RETRY_VERSION
  readonly fromAttempt: number
}

export interface CampaignRouteChoiceCommand {
  readonly kind: 'campaign-route-choice'
  readonly routeChoiceVersion: typeof CAMPAIGN_ROUTE_CHOICE_VERSION
  readonly routeId: string
}

export interface CampaignCheckpointDecisionCommand {
  readonly kind: 'campaign-checkpoint-decision'
  readonly checkpointDecisionVersion: typeof CAMPAIGN_CHECKPOINT_DECISION_VERSION
  readonly resultAttempt: number
  readonly choice: CampaignLoadoutDecision
}

export interface CampaignEmergencyPatchCommand {
  readonly kind: 'campaign-emergency-patch'
  readonly emergencyPatchVersion: typeof CAMPAIGN_EMERGENCY_PATCH_VERSION
  readonly resultAttempt: number
}

export interface CampaignAdvanceCommand {
  readonly kind: 'campaign-advance'
  readonly advanceVersion: typeof CAMPAIGN_ADVANCE_VERSION
  readonly fromEncounterId: string
}

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(value)
    && value.length <= 64
}

function weapon(value: unknown): value is WeaponType {
  return typeof value === 'string' && Object.hasOwn(WEAPONS, value)
}

function accessory(value: unknown): value is AccessoryType {
  return value === 'battery' || value === 'fuel_tank' || value === 'parachute'
}

function authoredRouteId(value: unknown): value is string {
  return typeof value === 'string' && ASH_ROAD_EPISODE.routes.some(({ id }) => id === value)
}

function ownLoadoutChoice(value: unknown): CampaignLoadoutDecision | null {
  if (!record(value) || typeof value.kind !== 'string') return null
  if (value.kind === 'retain' && exactKeys(value, ['kind'])) {
    return Object.freeze({ kind: 'retain' })
  }
  if (value.kind === 'repair' && exactKeys(value, ['kind'])) {
    return Object.freeze({ kind: 'repair' })
  }
  if (value.kind === 'refill' && exactKeys(value, ['kind', 'weaponId'])
    && typeof value.weaponId === 'string'
    && combatProfile.choices.includes(value.weaponId as CampaignWeaponId)) {
    return Object.freeze({ kind: 'refill', weaponId: value.weaponId as CampaignWeaponId })
  }
  return null
}

function sameChoice(left: CampaignLoadoutDecision, right: CampaignLoadoutDecision): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function ownReplayCommand(value: unknown): PlayerAction | null {
  if (!record(value) || typeof value.type !== 'string') return null
  if (value.type === 'set_angle' && exactKeys(value, ['type', 'angle'])
    && typeof value.angle === 'number' && Number.isFinite(value.angle)) {
    return Object.freeze({ type: 'set_angle', angle: value.angle })
  }
  if (value.type === 'set_power' && exactKeys(value, ['type', 'power'])
    && typeof value.power === 'number' && Number.isFinite(value.power)) {
    return Object.freeze({ type: 'set_power', power: value.power })
  }
  if (value.type === 'move' && exactKeys(value, ['type', 'delta'])
    && typeof value.delta === 'number' && Number.isFinite(value.delta)) {
    return Object.freeze({ type: 'move', delta: value.delta })
  }
  if (value.type === 'select_weapon' && exactKeys(value, ['type', 'weapon'])
    && weapon(value.weapon)) {
    return Object.freeze({ type: 'select_weapon', weapon: value.weapon })
  }
  if (value.type === 'fire' && exactKeys(value, ['type'])) {
    return Object.freeze({ type: 'fire' })
  }
  if (value.type === 'use_shield'
    && (exactKeys(value, ['type']) || exactKeys(value, ['type', 'weapon']))
    && (value.weapon === undefined || value.weapon === 'shield' || value.weapon === 'heavy_shield')) {
    return Object.freeze(value.weapon === undefined
      ? { type: 'use_shield' }
      : { type: 'use_shield', weapon: value.weapon })
  }
  if (value.type === 'buy') {
    const keys = Reflect.ownKeys(value)
    if (keys.some((key) => typeof key !== 'string'
      || !['type', 'weapon', 'accessory', 'tankId'].includes(key))) return null
    const hasWeapon = Object.hasOwn(value, 'weapon')
    const hasAccessory = Object.hasOwn(value, 'accessory')
    if (hasWeapon === hasAccessory || (hasWeapon && !weapon(value.weapon))
      || (hasAccessory && !accessory(value.accessory))
      || (Object.hasOwn(value, 'tankId') && !identifier(value.tankId))) return null
    return Object.freeze({
      type: 'buy',
      ...(hasWeapon ? { weapon: value.weapon as WeaponType } : {}),
      ...(hasAccessory ? { accessory: value.accessory as AccessoryType } : {}),
      ...(Object.hasOwn(value, 'tankId') ? { tankId: value.tankId as string } : {}),
    })
  }
  if (value.type === 'next_round' && exactKeys(value, ['type'])) {
    return Object.freeze({ type: 'next_round' })
  }
  return null
}

/**
 * Only ordered outcome-relevant committed commands are canonical. Accepted
 * preview inputs that are state-preserving or overwritten before commitment
 * need not appear in this bounded replay sequence.
 */
export function parseCampaignReplayCommands(value: unknown): readonly PlayerAction[] | null {
  if (!Array.isArray(value) || value.length > CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT) return null
  const commands = value.map(ownReplayCommand)
  if (commands.some((command) => command === null)) return null
  return Object.freeze(commands as PlayerAction[])
}

function settleReplay(engine: GameEngine): void {
  let ticks = 0
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    if (ticks >= 2_000) throw new Error('campaign receipt replay exceeded its settlement bound')
    engine.tick()
    ticks += 1
  }
}

export function replayCampaignCommandsFromCheckpoint(
  checkpoint: CampaignCheckpoint,
  commands: readonly PlayerAction[],
  loadout: CampaignLoadout,
): GameEngine {
  const replay = createCampaignGameEngine(campaignDescriptorFromCheckpoint(checkpoint, loadout))
  for (const command of commands) {
    if (command.type === 'select_weapon') {
      const state = replay.getState()
      const active = state.tanks.find(({ id }) => id === state.activePlayerId)
      const ammunition = active?.inventory[command.weapon]
      if (!ammunition || (!ammunition.unlimited && ammunition.count <= 0)) {
        throw new Error('campaign receipt replay selects an unavailable weapon')
      }
    }
    if (!replay.applyAction(command)) {
      throw new Error('campaign receipt replay contains a command the engine rejected')
    }
    if (command.type === 'fire' || command.type === 'use_shield') settleReplay(replay)
  }
  return replay
}

function equalEngineState(left: GameEngine, right: GameEngine): boolean {
  const leftState = left.getState()
  const rightState = right.getState()
  if (leftState.terrain.length !== rightState.terrain.length) return false
  for (let index = 0; index < leftState.terrain.length; index += 1) {
    if (leftState.terrain[index] !== rightState.terrain[index]) return false
  }
  return JSON.stringify({ ...leftState, terrain: undefined })
    === JSON.stringify({ ...rightState, terrain: undefined })
}

function missionSettlement(
  state: CampaignRunState,
  engine: GameEngine,
): CampaignMissionSettlement {
  const humanId = state.checkpoint.encounter.spawns.find(({ role }) => role === 'human')?.id
  const human = engine.getState().tanks.find(({ id }) => id === humanId)
  if (!human || !Number.isFinite(human.health) || human.health < 0 || human.health > 100) {
    throw new Error('campaign result is missing a valid human settlement')
  }
  const ammunition = state.loadout.carried.ammunition.map(({ weaponId }) => {
    const inventory = human.inventory[weaponId]
    const starting = getCampaignWeapon(combatProfile, weaponId).startingAmmunition
    if (!inventory || (starting === null && !inventory.unlimited)
      || (starting !== null && (inventory.unlimited || !integer(inventory.count, 0, starting)))) {
      throw new Error('campaign result ammunition does not match the carried loadout')
    }
    return Object.freeze({
      weaponId,
      quantity: starting === null ? null : inventory.count,
    })
  })
  const settlement = Object.freeze({
    hull: human.health,
    ammunition: Object.freeze(ammunition),
  })
  // Validate against the source-owned profile and carried slots before branding.
  applyCampaignLoadoutSettlement(state.loadout, settlement)
  return settlement
}

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true
  if (!Object.isFrozen(value)) return false
  return Object.values(value).every(isDeepFrozen)
}

function sameReceipt(left: CampaignResultReceipt, right: CampaignResultReceipt): boolean {
  return JSON.stringify({
    kind: left.kind,
    receiptVersion: left.receiptVersion,
    result: left.result,
    intactSupplyDrumIds: left.intactSupplyDrumIds,
  }) === JSON.stringify({
    kind: right.kind,
    receiptVersion: right.receiptVersion,
    result: right.result,
    intactSupplyDrumIds: right.intactSupplyDrumIds,
  })
}

function receiptAward(receipt: CampaignResultReceipt): number {
  if (receipt.result.outcome !== 'success') return 0
  if (receipt.result.encounterId === 'relay-ridge') return 0
  return FUEL_STOP_SUPPLY_REWARD.base
      + receipt.intactSupplyDrumIds.length * FUEL_STOP_SUPPLY_REWARD.perIntactDrum
}

function validateReceiptForCheckpoint(
  receipt: CampaignResultReceipt,
  checkpoint: CampaignCheckpoint,
): boolean {
  const { result } = receipt
  if (result.runId !== checkpoint.run.runId
    || result.encounterId !== checkpoint.encounter.encounterId
    || result.encounterVersion !== checkpoint.encounter.encounterVersion
    || result.encounterContentDigest !== checkpoint.encounter.contentDigest) return false
  const drumIds = new Set(checkpoint.encounter.objects
    .filter(({ kind }) => kind === 'supply-drum')
    .map(({ id }) => id))
  return receipt.intactSupplyDrumIds.every((id) => drumIds.has(id))
}

export function parseCampaignResultReceipt(value: unknown): CampaignResultReceipt | null {
  if (!record(value) || !exactKeys(value, [
    'kind', 'receiptVersion', 'result', 'intactSupplyDrumIds',
  ]) || value.kind !== 'campaign-result-receipt'
    || value.receiptVersion !== CAMPAIGN_RESULT_RECEIPT_VERSION
    || !Array.isArray(value.intactSupplyDrumIds)
    || !value.intactSupplyDrumIds.every(identifier)
    || new Set(value.intactSupplyDrumIds).size !== value.intactSupplyDrumIds.length) return null
  const result = parseCampaignResult(value.result)
  if (!result) return null
  return Object.freeze({
    kind: 'campaign-result-receipt',
    receiptVersion: CAMPAIGN_RESULT_RECEIPT_VERSION,
    result,
    intactSupplyDrumIds: Object.freeze([...value.intactSupplyDrumIds]),
  })
}

export function createCampaignResultReceipt(input: {
  readonly runState: CampaignRunState
  readonly engine: GameEngine
  readonly replayCommands: readonly PlayerAction[]
}): CampaignResultReceipt {
  if (!record(input) || !(input.engine instanceof GameEngine)) {
    throw new Error('campaign result receipt requires a concrete GameEngine')
  }
  if (!exactKeys(input, ['runState', 'engine', 'replayCommands'])) {
    throw new Error('campaign result receipt requires committed replay commands')
  }
  const state = requireRunState(input.runState)
  const replayCommands = parseCampaignReplayCommands(input.replayCommands)
  if (!replayCommands) throw new Error('invalid or over-limit campaign receipt replay commands')
  const replay = replayCampaignCommandsFromCheckpoint(
    state.checkpoint,
    replayCommands,
    state.attemptCheckpoint.loadout,
  )
  if (!equalEngineState(input.engine, replay)) {
    throw new Error('campaign engine state does not match its committed command replay')
  }
  const gameState = input.engine.getState()
  const campaign = gameState.campaign
  if (gameState.phase !== 'GAME_OVER'
    || !Array.isArray(gameState.projectiles) || gameState.projectiles.length !== 0
    || gameState.projectile !== null
    || !Array.isArray(gameState.fire) || gameState.fire.length !== 0
    || !campaign || campaign.activeCommitment !== null || campaign.result === null
    || !integer(campaign.commitmentCount, 0, 256)
    || campaign.result.commitmentId !== campaign.commitmentCount
    || !campaign.objects || !campaign.effects || campaign.effects.pending.length !== 0) {
    throw new Error('campaign result receipt requires a settled authoritative campaign state')
  }

  const engineResult = campaign.result
  if (engineResult.outcome === 'success') {
    if ((engineResult.reason !== 'objective' && engineResult.reason !== 'limit')
      || campaign.effects.technicalFailure !== null
      || campaign.settledOutcome?.commitmentId !== engineResult.commitmentId) {
      throw new Error('campaign success is not a settled authoritative result')
    }
  } else if (engineResult.outcome === 'failure') {
    if ((engineResult.reason !== 'protected-object' && engineResult.reason !== 'player'
      && engineResult.reason !== 'limit')
      || campaign.effects.technicalFailure !== null
      || campaign.settledOutcome?.commitmentId !== engineResult.commitmentId) {
      throw new Error('campaign failure is not a settled authoritative result')
    }
  } else if (engineResult.reason !== 'technical-failure' || engineResult.reward !== false
    || campaign.effects.technicalFailure?.code !== engineResult.code) {
    throw new Error('campaign technical failure is not a settled authoritative result')
  }

  if (campaign.objects.length !== state.checkpoint.encounter.objects.length
    || new Set(campaign.objects.map(({ id }) => id)).size !== campaign.objects.length) {
    throw new Error('campaign result objects do not match the bound encounter')
  }
  const objectById = new Map(campaign.objects.map((object) => [object.id, object]))
  for (const definition of state.checkpoint.encounter.objects) {
    const object = objectById.get(definition.id)
    if (!object || object.kind !== definition.kind || object.x !== definition.x
      || object.width !== definition.width || object.height !== definition.height
      || object.maxHealth !== definition.health || !Number.isFinite(object.health)
      || object.health < 0 || object.health > object.maxHealth
      || object.alive !== (object.health > 0)) {
      throw new Error('campaign result objects do not match the bound encounter')
    }
  }

  const intactSupplyDrumIds = state.checkpoint.encounter.objects
    .filter(({ id, kind }) => {
      const object = objectById.get(id)!
      return kind === 'supply-drum' && object.alive && object.health > 0
    })
    .map(({ id }) => id)
  const receipt = parseCampaignResultReceipt({
    kind: 'campaign-result-receipt',
    receiptVersion: CAMPAIGN_RESULT_RECEIPT_VERSION,
    result: {
      kind: 'campaign-result',
      resultVersion: 1,
      runId: state.checkpoint.run.runId,
      encounterId: state.checkpoint.encounter.encounterId,
      encounterVersion: state.checkpoint.encounter.encounterVersion,
      encounterContentDigest: state.checkpoint.encounter.contentDigest,
      attempt: state.attempt,
      outcome: engineResult.outcome,
      commitments: campaign.commitmentCount,
    },
    intactSupplyDrumIds,
  })
  if (!receipt) throw new Error('invalid campaign result receipt')
  const settlement = missionSettlement(state, input.engine)
  AUTHORITATIVE_RECEIPTS.add(receipt)
  AUTHORITATIVE_MISSION_SETTLEMENTS.set(receipt, settlement)
  return receipt
}

function parseAppliedResult(
  value: unknown,
  checkpoint: CampaignCheckpoint,
): AppliedCampaignResult | null {
  if (!record(value) || !exactKeys(value, [
    'kind', 'receiptVersion', 'result', 'intactSupplyDrumIds', 'suppliesAwarded',
  ]) || !integer(value.suppliesAwarded, 0, Number.MAX_SAFE_INTEGER)) return null
  const receipt = parseCampaignResultReceipt({
    kind: value.kind,
    receiptVersion: value.receiptVersion,
    result: value.result,
    intactSupplyDrumIds: value.intactSupplyDrumIds,
  })
  if (!receipt || !validateReceiptForCheckpoint(receipt, checkpoint)
    || value.suppliesAwarded !== receiptAward(receipt)) return null
  return Object.freeze({ ...receipt, suppliesAwarded: value.suppliesAwarded })
}

function parseAttemptCheckpoint(value: unknown): CampaignAttemptCheckpoint | null {
  if (!record(value) || !exactKeys(value, ['supplies', 'loadout'])
    || !integer(value.supplies, 0, Number.MAX_SAFE_INTEGER)) return null
  const loadout = parseCampaignLoadout(value.loadout)
  return loadout ? Object.freeze({ supplies: value.supplies, loadout }) : null
}

function parsePendingDecision(value: unknown): PendingCampaignCheckpointDecision | null | false {
  if (value === null) return null
  if (!record(value) || !exactKeys(value, ['resultAttempt'])
    || !integer(value.resultAttempt, 1, 0xffff_ffff)) return false
  return Object.freeze({ resultAttempt: value.resultAttempt })
}

function parseCheckpointDecision(value: unknown): AppliedCampaignCheckpointDecision | null {
  if (!record(value) || !exactKeys(value, ['resultAttempt', 'choice', 'cost'])
    || !integer(value.resultAttempt, 1, 0xffff_ffff)
    || !integer(value.cost, 0, 2)) return null
  const choice = ownLoadoutChoice(value.choice)
  if (!choice) return null
  const expectedCost = choice.kind === 'repair' ? 2 : choice.kind === 'refill' ? 1 : 0
  return value.cost === expectedCost
    ? Object.freeze({ resultAttempt: value.resultAttempt, choice, cost: value.cost })
    : null
}

/**
 * Device-local persistence is player-editable: parsing proves structural integrity,
 * compatibility, and supply recomputation, not honest-play authority. First application
 * instead requires a concrete in-process engine matching its bounded command replay above.
 */
export function parseCampaignRunState(value: unknown): CampaignRunState | null {
  if (!record(value) || !exactKeys(value, [
    'kind', 'stateVersion', 'checkpoint', 'attempt', 'supplies',
    'selectedRouteId', 'loadout', 'missionLoadout', 'attemptCheckpoint',
    'pendingCheckpointDecision', 'checkpointDecisions', 'emergencyPatchAttempts',
    'appliedResults', 'retryFromAttempts',
  ]) || value.kind !== 'campaign-run-state'
    || value.stateVersion !== CAMPAIGN_RUN_STATE_VERSION
    || !integer(value.attempt, 1, 0xffff_ffff)
    || !integer(value.supplies, 0, Number.MAX_SAFE_INTEGER)
    || (value.selectedRouteId !== null && !authoredRouteId(value.selectedRouteId))
    || !Array.isArray(value.checkpointDecisions)
    || value.checkpointDecisions.length > 1
    || !Array.isArray(value.emergencyPatchAttempts)
    || value.emergencyPatchAttempts.length > 1
    || !Array.isArray(value.appliedResults)
    || value.appliedResults.length > CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT
    || !Array.isArray(value.retryFromAttempts)) return null
  const checkpoint = parseCampaignCheckpoint(value.checkpoint)
  const loadout = parseCampaignLoadout(value.loadout)
  const missionLoadout = value.missionLoadout === null
    ? null
    : parseCampaignLoadout(value.missionLoadout)
  const attemptCheckpoint = parseAttemptCheckpoint(value.attemptCheckpoint)
  const pendingCheckpointDecision = parsePendingDecision(value.pendingCheckpointDecision)
  if (!checkpoint || !loadout || (value.missionLoadout !== null && !missionLoadout)
    || !attemptCheckpoint || pendingCheckpointDecision === false
    || value.attempt < checkpoint.attempt
    || attemptCheckpoint.supplies !== checkpoint.supplies) return null
  const activeAttempt = value.attempt

  const retryFromAttempts = value.retryFromAttempts
  if (!retryFromAttempts.every((attempt) => integer(attempt, checkpoint.attempt, 0xffff_fffe))
    || new Set(retryFromAttempts).size !== retryFromAttempts.length
    || retryFromAttempts.length !== activeAttempt - checkpoint.attempt
    || retryFromAttempts.some((attempt, index) => attempt !== checkpoint.attempt + index)) return null

  const appliedResults = value.appliedResults
    .map((entry) => parseAppliedResult(entry, checkpoint))
  if (appliedResults.some((entry) => entry === null)) return null
  const applied = appliedResults as AppliedCampaignResult[]
  if (new Set(applied.map(({ result }) => result.attempt)).size !== applied.length
    || applied.some(({ result }) => result.attempt < checkpoint.attempt
      || result.attempt > activeAttempt)
    || retryFromAttempts.some((attempt) => {
      const result = applied.find((entry) => entry.result.attempt === attempt)?.result
      return !result || result.outcome === 'success'
    })) return null

  const current = applied.find(({ result }) => result.attempt === activeAttempt)
  const checkpointDecisions = value.checkpointDecisions.map(parseCheckpointDecision)
  if (checkpointDecisions.some((entry) => entry === null)) return null
  const decisions = checkpointDecisions as AppliedCampaignCheckpointDecision[]
  if (new Set(decisions.map(({ resultAttempt }) => resultAttempt)).size !== decisions.length
    || decisions.some(({ resultAttempt }) => resultAttempt !== activeAttempt)) return null
  const currentDecision = decisions.find(({ resultAttempt }) => resultAttempt === activeAttempt)

  const emergencyPatchAttempts = value.emergencyPatchAttempts
  if (!emergencyPatchAttempts.every((attempt) => integer(attempt, 1, 0xffff_ffff))
    || new Set(emergencyPatchAttempts).size !== emergencyPatchAttempts.length
    || emergencyPatchAttempts.some((attempt) => attempt !== activeAttempt)) return null

  if (current?.result.outcome === 'success') {
    if (pendingCheckpointDecision?.resultAttempt !== activeAttempt && !currentDecision) return null
    if (pendingCheckpointDecision !== null && currentDecision) return null
  } else if (pendingCheckpointDecision !== null || currentDecision
    || emergencyPatchAttempts.length > 0) return null

  const reward = current?.result.outcome === 'success' ? current.suppliesAwarded : 0
  const cost = currentDecision?.cost ?? 0
  if (attemptCheckpoint.supplies > Number.MAX_SAFE_INTEGER - reward) return null
  const expectedSupplies = attemptCheckpoint.supplies + reward - cost
  if (expectedSupplies < 0 || value.supplies !== expectedSupplies) return null
  if (!current) {
    if (missionLoadout !== null
      || JSON.stringify(loadout) !== JSON.stringify(attemptCheckpoint.loadout)) return null
  } else if (current.result.outcome !== 'success' && missionLoadout === null) {
    // A non-success can be retried without carrying its terminal battle damage.
    // This exact compatibility form still requires the immutable attempt snapshot;
    // successful progression always requires an explicit settled loadout.
    if (JSON.stringify(loadout) !== JSON.stringify(attemptCheckpoint.loadout)) return null
  } else {
    if (!missionLoadout) return null
    let expectedLoadout = missionLoadout
    if (emergencyPatchAttempts.includes(activeAttempt)) {
      const patched = applyEmergencyHullPatch(expectedLoadout)
      if (patched === expectedLoadout) return null
      expectedLoadout = patched
    }
    if (currentDecision) {
      try {
        const appliedDecision = applyCampaignLoadoutDecision(
          expectedLoadout,
          attemptCheckpoint.supplies + reward,
          currentDecision.choice,
        )
        if (appliedDecision.cost !== currentDecision.cost) return null
        expectedLoadout = appliedDecision.loadout
      } catch {
        return null
      }
    }
    if (JSON.stringify(loadout) !== JSON.stringify(expectedLoadout)) return null
  }

  return Object.freeze({
    kind: 'campaign-run-state',
    stateVersion: CAMPAIGN_RUN_STATE_VERSION,
    checkpoint,
    attempt: activeAttempt,
    supplies: value.supplies,
    selectedRouteId: value.selectedRouteId as string | null,
    loadout,
    missionLoadout,
    attemptCheckpoint,
    pendingCheckpointDecision,
    checkpointDecisions: Object.freeze(decisions),
    emergencyPatchAttempts: Object.freeze([...emergencyPatchAttempts]) as readonly number[],
    appliedResults: Object.freeze(applied),
    retryFromAttempts: Object.freeze([...retryFromAttempts]) as readonly number[],
  })
}

function requireRunState(value: unknown): CampaignRunState {
  const state = parseCampaignRunState(value)
  if (!state) throw new Error('invalid campaign run state')
  return state
}

function preserveOwnedState(original: unknown, parsed: CampaignRunState): CampaignRunState {
  return isDeepFrozen(original) ? original as CampaignRunState : parsed
}

export function createCampaignRunState(
  checkpointValue: unknown,
  loadoutValue: unknown = createCampaignLoadout(),
): CampaignRunState {
  const checkpoint = parseCampaignCheckpoint(checkpointValue)
  if (!checkpoint) throw new Error('invalid campaign checkpoint')
  const loadout = parseCampaignLoadout(loadoutValue)
  if (!loadout) throw new Error('invalid initial campaign loadout')
  const state = parseCampaignRunState({
    kind: 'campaign-run-state',
    stateVersion: CAMPAIGN_RUN_STATE_VERSION,
    checkpoint,
    attempt: checkpoint.attempt,
    supplies: checkpoint.supplies,
    selectedRouteId: null,
    loadout,
    missionLoadout: null,
    attemptCheckpoint: { supplies: checkpoint.supplies, loadout },
    pendingCheckpointDecision: null,
    checkpointDecisions: [],
    emergencyPatchAttempts: [],
    appliedResults: Object.freeze([]) as readonly AppliedCampaignResult[],
    retryFromAttempts: Object.freeze([]) as readonly number[],
  })
  if (!state) throw new Error('canonical campaign run state is invalid')
  return state
}

export function applyCampaignResult(
  stateValue: CampaignRunState,
  receiptValue: unknown,
): CampaignRunState {
  const state = requireRunState(stateValue)
  const authoritative = record(receiptValue) && AUTHORITATIVE_RECEIPTS.has(receiptValue)
  const receipt = parseCampaignResultReceipt(receiptValue)
  if (!receipt || !validateReceiptForCheckpoint(receipt, state.checkpoint)) {
    throw new Error('invalid or unbound campaign result receipt')
  }

  const existing = state.appliedResults.find(({ result }) => result.attempt === receipt.result.attempt)
  if (existing) {
    if (!sameReceipt(existing, receipt)) {
      throw new Error('conflicting campaign result for an already applied attempt')
    }
    return preserveOwnedState(stateValue, state)
  }
  if (receipt.result.attempt !== state.attempt) {
    throw new Error('campaign result does not belong to the active attempt')
  }
  if (!authoritative) {
    throw new Error('new campaign result requires an authoritative settled-state receipt')
  }

  const suppliesAwarded = receiptAward(receipt)
  if (state.supplies > Number.MAX_SAFE_INTEGER - suppliesAwarded) {
    throw new Error('campaign supplies overflow')
  }
  const settlement = AUTHORITATIVE_MISSION_SETTLEMENTS.get(receiptValue as object)
  if (!settlement) throw new Error('campaign result is missing its authoritative settlement')
  const loadout = applyCampaignLoadoutSettlement(state.loadout, settlement)
  const next = parseCampaignRunState({
    ...state,
    supplies: state.supplies + suppliesAwarded,
    loadout,
    missionLoadout: loadout,
    pendingCheckpointDecision: receipt.result.outcome === 'success'
      ? { resultAttempt: state.attempt }
      : null,
    appliedResults: [...state.appliedResults, { ...receipt, suppliesAwarded }],
  })
  if (!next) throw new Error('campaign result produced an invalid run state')
  return next
}

export function chooseCampaignRoute(
  stateValue: CampaignRunState,
  commandValue: CampaignRouteChoiceCommand,
): CampaignRunState {
  const state = requireRunState(stateValue)
  if (!record(commandValue) || !exactKeys(commandValue, [
    'kind', 'routeChoiceVersion', 'routeId',
  ]) || commandValue.kind !== 'campaign-route-choice'
    || commandValue.routeChoiceVersion !== CAMPAIGN_ROUTE_CHOICE_VERSION
    || !authoredRouteId(commandValue.routeId)) {
    throw new Error('invalid or unknown campaign route choice')
  }
  if (state.selectedRouteId !== null) {
    if (state.selectedRouteId === commandValue.routeId) return preserveOwnedState(stateValue, state)
    throw new Error('campaign route choice conflicts with the selected route')
  }
  const next = parseCampaignRunState({ ...state, selectedRouteId: commandValue.routeId })
  if (!next) throw new Error('campaign route choice produced an invalid run state')
  return next
}

export function applyCampaignCheckpointDecision(
  stateValue: CampaignRunState,
  commandValue: CampaignCheckpointDecisionCommand,
): CampaignRunState {
  const state = requireRunState(stateValue)
  if (!record(commandValue) || !exactKeys(commandValue, [
    'kind', 'checkpointDecisionVersion', 'resultAttempt', 'choice',
  ]) || commandValue.kind !== 'campaign-checkpoint-decision'
    || commandValue.checkpointDecisionVersion !== CAMPAIGN_CHECKPOINT_DECISION_VERSION
    || !integer(commandValue.resultAttempt, 1, 0xffff_ffff)) {
    throw new Error('invalid campaign checkpoint decision')
  }
  const choice = ownLoadoutChoice(commandValue.choice)
  if (!choice) throw new Error('invalid campaign checkpoint decision choice')
  const existing = state.checkpointDecisions.find(
    ({ resultAttempt }) => resultAttempt === commandValue.resultAttempt,
  )
  if (existing) {
    if (sameChoice(existing.choice, choice)) return preserveOwnedState(stateValue, state)
    throw new Error('conflicting campaign checkpoint decision already applied')
  }
  if (state.pendingCheckpointDecision?.resultAttempt !== commandValue.resultAttempt
    || commandValue.resultAttempt !== state.attempt) {
    throw new Error('campaign checkpoint decision does not match the pending result')
  }
  const decision = applyCampaignLoadoutDecision(state.loadout, state.supplies, choice)
  const next = parseCampaignRunState({
    ...state,
    supplies: decision.supplies,
    loadout: decision.loadout,
    pendingCheckpointDecision: null,
    checkpointDecisions: [...state.checkpointDecisions, {
      resultAttempt: commandValue.resultAttempt,
      choice,
      cost: decision.cost,
    }],
  })
  if (!next) throw new Error('campaign checkpoint decision produced an invalid run state')
  return next
}

/** Advance one successful, decided encounter onto the selected authored route. */
export function advanceCampaignEncounter(
  stateValue: CampaignRunState,
  commandValue: CampaignAdvanceCommand,
): CampaignRunState {
  const state = requireRunState(stateValue)
  if (!record(commandValue) || !exactKeys(commandValue, [
    'kind', 'advanceVersion', 'fromEncounterId',
  ]) || commandValue.kind !== 'campaign-advance'
    || commandValue.advanceVersion !== CAMPAIGN_ADVANCE_VERSION
    || !identifier(commandValue.fromEncounterId)
    || commandValue.fromEncounterId !== state.checkpoint.encounter.encounterId) {
    throw new Error('invalid campaign advance command')
  }
  const current = state.appliedResults.find(({ result }) => result.attempt === state.attempt)
  if (current?.result.outcome !== 'success' || state.pendingCheckpointDecision !== null
    || !state.checkpointDecisions.some(({ resultAttempt }) => resultAttempt === state.attempt)) {
    throw new Error('campaign advance requires a successful decided checkpoint')
  }
  if (state.selectedRouteId === null) throw new Error('campaign advance requires a selected route')
  const route = ASH_ROAD_EPISODE.routes.find(({ id }) => id === state.selectedRouteId)
  if (!route) throw new Error('campaign advance route is unavailable')
  const currentIndex = route.encounterIds.indexOf(state.checkpoint.encounter.encounterId)
  if (currentIndex < 0 || currentIndex >= route.encounterIds.length - 1) {
    throw new Error('campaign is already at its final encounter')
  }
  const nextIndex = currentIndex + 1
  const nextEncounter = ASH_ROAD_EPISODE.encounters.find(
    ({ encounterId }) => encounterId === route.encounterIds[nextIndex],
  )
  if (!nextEncounter) throw new Error('campaign next encounter is unavailable')
  const run = parseCampaignRun({
    ...state.checkpoint.run,
    routeId: route.id,
    encounterIds: route.encounterIds,
    currentEncounterIndex: nextIndex,
  })
  if (!run) throw new Error('campaign next run binding is invalid')
  const checkpoint = createCampaignCheckpoint({
    run,
    encounter: nextEncounter,
    combatProfile,
    attempt: 1,
    supplies: state.supplies,
  })
  const next = parseCampaignRunState({
    kind: 'campaign-run-state',
    stateVersion: CAMPAIGN_RUN_STATE_VERSION,
    checkpoint,
    attempt: 1,
    supplies: state.supplies,
    selectedRouteId: route.id,
    loadout: state.loadout,
    missionLoadout: null,
    attemptCheckpoint: { supplies: state.supplies, loadout: state.loadout },
    pendingCheckpointDecision: null,
    checkpointDecisions: [],
    emergencyPatchAttempts: [],
    appliedResults: [],
    retryFromAttempts: [],
  })
  if (!next) throw new Error('campaign advance produced an invalid run state')
  return next
}

export function applyCampaignEmergencyPatch(
  stateValue: CampaignRunState,
  commandValue: CampaignEmergencyPatchCommand,
): CampaignRunState {
  const state = requireRunState(stateValue)
  if (!record(commandValue) || !exactKeys(commandValue, [
    'kind', 'emergencyPatchVersion', 'resultAttempt',
  ]) || commandValue.kind !== 'campaign-emergency-patch'
    || commandValue.emergencyPatchVersion !== CAMPAIGN_EMERGENCY_PATCH_VERSION
    || !integer(commandValue.resultAttempt, 1, 0xffff_ffff)) {
    throw new Error('invalid campaign emergency patch command')
  }
  if (state.emergencyPatchAttempts.includes(commandValue.resultAttempt)) {
    return preserveOwnedState(stateValue, state)
  }
  const result = state.appliedResults.find(
    (entry) => entry.result.attempt === commandValue.resultAttempt,
  )
  if (commandValue.resultAttempt !== state.attempt || result?.result.outcome !== 'success') {
    throw new Error('campaign emergency patch requires the active successful result')
  }
  const loadout = applyEmergencyHullPatch(state.loadout)
  if (loadout === state.loadout) throw new Error('campaign emergency patch is not needed')
  const next = parseCampaignRunState({
    ...state,
    loadout,
    emergencyPatchAttempts: [...state.emergencyPatchAttempts, commandValue.resultAttempt],
  })
  if (!next) throw new Error('campaign emergency patch produced an invalid run state')
  return next
}

export function retryCampaignRun(
  stateValue: CampaignRunState,
  commandValue: CampaignRetryCommand,
): CampaignRunState {
  const state = requireRunState(stateValue)
  if (!record(commandValue) || !exactKeys(commandValue, ['kind', 'retryVersion', 'fromAttempt'])
    || commandValue.kind !== 'campaign-retry'
    || commandValue.retryVersion !== CAMPAIGN_RETRY_VERSION
    || !integer(commandValue.fromAttempt, 1, 0xffff_fffe)) {
    throw new Error('invalid campaign retry command')
  }
  if (state.retryFromAttempts.includes(commandValue.fromAttempt)) {
    return preserveOwnedState(stateValue, state)
  }
  if (commandValue.fromAttempt !== state.attempt) {
    throw new Error('campaign retry does not belong to the active attempt')
  }
  const currentResult = state.appliedResults.find(({ result }) => result.attempt === state.attempt)
  if (!currentResult) {
    throw new Error('cannot retry before the active attempt has a terminal result')
  }
  if (currentResult?.result.outcome === 'success') {
    throw new Error('cannot retry a successful campaign attempt')
  }

  const next = parseCampaignRunState({
    ...state,
    attempt: state.attempt + 1,
    supplies: state.attemptCheckpoint.supplies,
    loadout: state.attemptCheckpoint.loadout,
    missionLoadout: null,
    pendingCheckpointDecision: null,
    retryFromAttempts: [...state.retryFromAttempts, state.attempt],
  })
  if (!next) throw new Error('campaign retry produced an invalid run state')
  return next
}
