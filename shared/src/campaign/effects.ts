import type { CampaignWeaponDamageDefinition } from './combatProfiles.ts'

export const CAMPAIGN_EFFECT_LIMITS = Object.freeze({
  maxChainDepth: 8,
  maxQueuedEffects: 32,
} as const)

export type CampaignEffectFailureCode =
  | 'effect-depth-limit'
  | 'effect-queue-limit'
  | 'replay-limit'
  | 'zone-limit'

export interface CampaignEffectFailure {
  readonly outcome: 'failure'
  readonly reason: 'technical-failure'
  readonly code: CampaignEffectFailureCode
  readonly reward: false
}

export interface CampaignSupplyDrumEffect {
  readonly kind: 'supply-drum'
  readonly sourceObjectId: string
  readonly x: number
  readonly y: number
  readonly actorId: string
  readonly rootCommitmentId: number
  readonly depth: number
  readonly profile: CampaignWeaponDamageDefinition
}

export type CampaignEffect = CampaignSupplyDrumEffect

export interface CampaignEffectState {
  readonly activatedObjectIds: readonly string[]
  readonly pending: readonly CampaignEffect[]
  readonly resolved: readonly CampaignEffect[]
  readonly technicalFailure: CampaignEffectFailure | null
}

function ownEffect(effect: CampaignEffect): CampaignEffect {
  return Object.freeze({
    ...effect,
    profile: Object.freeze({ ...effect.profile }),
  })
}

function ownFailure(code: CampaignEffectFailureCode): CampaignEffectFailure {
  return Object.freeze({
    outcome: 'failure',
    reason: 'technical-failure',
    code,
    reward: false,
  })
}

function ownState(input: CampaignEffectState): CampaignEffectState {
  return Object.freeze({
    activatedObjectIds: Object.freeze([...input.activatedObjectIds]),
    pending: Object.freeze(input.pending.map(ownEffect)),
    resolved: Object.freeze(input.resolved.map(ownEffect)),
    technicalFailure: input.technicalFailure === null
      ? null
      : Object.freeze({ ...input.technicalFailure }),
  })
}

/** Create an empty immutable causal-effect ledger. */
export function createCampaignEffectState(): CampaignEffectState {
  return Object.freeze({
    activatedObjectIds: Object.freeze([]) as readonly string[],
    pending: Object.freeze([]) as readonly CampaignEffect[],
    resolved: Object.freeze([]) as readonly CampaignEffect[],
    technicalFailure: null,
  })
}

/** Give an engine clone wholly independent queue and ledger values. */
export function cloneCampaignEffectState(state: CampaignEffectState): CampaignEffectState {
  return ownState(state)
}

/** Record a deterministic fail-closed campaign refusal outside the object queue. */
export function failCampaignEffects(
  state: CampaignEffectState,
  code: CampaignEffectFailureCode,
): CampaignEffectState {
  if (state.technicalFailure !== null) return state
  return ownState({ ...state, pending: [], technicalFailure: ownFailure(code) })
}

/**
 * Append one simultaneous batch after sorting only that batch by stable source
 * identity. Existing FIFO work always remains ahead of newly discovered work.
 */
export function enqueueCampaignEffects(input: {
  readonly state: CampaignEffectState
  readonly effects: readonly CampaignEffect[]
}): Readonly<{ accepted: boolean; state: CampaignEffectState }> {
  if (input.state.technicalFailure !== null) {
    return Object.freeze({ accepted: false, state: input.state })
  }

  const batch = input.effects
    .map(ownEffect)
    .sort((left, right) => left.sourceObjectId < right.sourceObjectId
      ? -1
      : left.sourceObjectId > right.sourceObjectId ? 1 : 0)

  if (batch.some((effect) => !Number.isInteger(effect.depth) || effect.depth < 1
    || effect.depth > CAMPAIGN_EFFECT_LIMITS.maxChainDepth)) {
    return Object.freeze({
      accepted: false,
      state: Object.freeze({
        ...input.state,
        technicalFailure: ownFailure('effect-depth-limit'),
      }),
    })
  }

  if (input.state.pending.length + batch.length > CAMPAIGN_EFFECT_LIMITS.maxQueuedEffects) {
    return Object.freeze({
      accepted: false,
      state: Object.freeze({
        ...input.state,
        technicalFailure: ownFailure('effect-queue-limit'),
      }),
    })
  }

  return Object.freeze({
    accepted: true,
    state: Object.freeze({
      ...input.state,
      pending: Object.freeze([...input.state.pending, ...batch]),
    }),
  })
}

/**
 * Atomically mark a volatile object before attempting to enqueue its work. A
 * refusal retains the mark, making the failed activation permanently inert.
 */
export function activateCampaignSupplyDrum(input: {
  readonly state: CampaignEffectState
  readonly effect: CampaignSupplyDrumEffect
}): Readonly<{ activated: boolean; state: CampaignEffectState }> {
  if (input.state.activatedObjectIds.includes(input.effect.sourceObjectId)) {
    return Object.freeze({ activated: false, state: input.state })
  }

  const marked = Object.freeze({
    ...input.state,
    activatedObjectIds: Object.freeze([
      ...input.state.activatedObjectIds,
      input.effect.sourceObjectId,
    ].sort()),
  })
  const enqueued = enqueueCampaignEffects({ state: marked, effects: [input.effect] })
  return Object.freeze({ activated: enqueued.accepted, state: enqueued.state })
}

/** Move the current FIFO batch into the immutable resolved ledger. */
export function drainCampaignEffects(input: {
  readonly state: CampaignEffectState
}): Readonly<{ effects: readonly CampaignEffect[]; state: CampaignEffectState }> {
  if (input.state.pending.length === 0 || input.state.technicalFailure !== null) {
    return Object.freeze({ effects: Object.freeze([]), state: input.state })
  }
  const effects = Object.freeze([...input.state.pending])
  return Object.freeze({
    effects,
    state: Object.freeze({
      ...input.state,
      pending: Object.freeze([]),
      resolved: Object.freeze([...input.state.resolved, ...effects]),
    }),
  })
}
