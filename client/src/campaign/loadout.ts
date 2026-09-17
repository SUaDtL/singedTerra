import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  getCampaignWeapon,
  resolveCampaignCombatProfile,
  type CampaignWeaponId,
} from '@shared/campaign/combatProfiles'

export const CAMPAIGN_LOADOUT_VERSION = 1 as const
export const CAMPAIGN_MAX_HULL = 100 as const
export const CAMPAIGN_EMERGENCY_HULL_FLOOR = 60 as const
export const CAMPAIGN_REPAIR_COST = 2 as const
export const CAMPAIGN_REFILL_COST = 1 as const

export interface CampaignLoadoutProfileBinding {
  readonly profileId: 'ash-road-v1'
  readonly profileVersion: 1
  readonly contentDigest: string
}

export interface CampaignAmmunition {
  readonly weaponId: CampaignWeaponId
  /** `null` is the guaranteed unlimited basic weapon. */
  readonly quantity: number | null
}

export interface CampaignCarriedLoadout {
  readonly basicWeaponId: 'baby_missile'
  readonly offensiveWeaponIds: readonly [CampaignWeaponId, CampaignWeaponId]
  readonly defensiveWeaponId: CampaignWeaponId
  readonly ammunition: readonly CampaignAmmunition[]
}

/**
 * Ownership provenance is deliberately distinct from the carried kit. Optional
 * purchases/rewards may be saved later without implying that they are equipped.
 */
export interface CampaignOwnedInventory {
  readonly grantedWeaponIds: readonly CampaignWeaponId[]
  readonly purchasedWeaponIds: readonly CampaignWeaponId[]
  readonly rewardWeaponIds: readonly CampaignWeaponId[]
}

export interface CampaignLoadout {
  readonly kind: 'campaign-loadout'
  readonly loadoutVersion: typeof CAMPAIGN_LOADOUT_VERSION
  readonly profile: CampaignLoadoutProfileBinding
  readonly hull: number
  readonly carried: CampaignCarriedLoadout
  readonly owned: CampaignOwnedInventory
}

export interface CampaignLoadoutSelection {
  readonly offensiveWeaponIds: readonly [CampaignWeaponId, CampaignWeaponId]
  readonly defensiveWeaponId?: CampaignWeaponId
}

export type CampaignLoadoutDecision =
  | Readonly<{ kind: 'retain' }>
  | Readonly<{ kind: 'repair' }>
  | Readonly<{ kind: 'refill'; weaponId: CampaignWeaponId }>

export interface CampaignLoadoutDecisionResult {
  readonly loadout: CampaignLoadout
  readonly supplies: number
  readonly cost: number
}

const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)
const DEFAULT_OFFENSE = Object.freeze(['missile', 'napalm'] as const)
const DEFAULT_DEFENSE = 'shield' as const

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function hull(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    && value <= CAMPAIGN_MAX_HULL
}

function campaignWeapon(value: unknown): value is CampaignWeaponId {
  return typeof value === 'string' && profile.choices.includes(value as CampaignWeaponId)
}

function parseWeaponIds(value: unknown): readonly CampaignWeaponId[] | null {
  if (!Array.isArray(value) || !value.every(campaignWeapon)
    || new Set(value).size !== value.length) return null
  return Object.freeze([...value])
}

function binding(value: unknown): CampaignLoadoutProfileBinding | null {
  if (!record(value) || !exactKeys(value, ['profileId', 'profileVersion', 'contentDigest'])
    || value.profileId !== profile.profileId || value.profileVersion !== profile.profileVersion
    || value.contentDigest !== profile.contentDigest) return null
  return Object.freeze({
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    contentDigest: profile.contentDigest,
  })
}

function parseAmmunition(value: unknown): CampaignAmmunition | null {
  if (!record(value) || !exactKeys(value, ['weaponId', 'quantity'])
    || !campaignWeapon(value.weaponId)) return null
  const definition = getCampaignWeapon(profile, value.weaponId)
  if (definition.startingAmmunition === null) {
    if (value.weaponId !== profile.kit.basicWeaponId || value.quantity !== null) return null
  } else if (!safeInteger(value.quantity) || value.quantity > definition.startingAmmunition) {
    return null
  }
  return Object.freeze({ weaponId: value.weaponId, quantity: value.quantity as number | null })
}

function parseCarried(value: unknown): CampaignCarriedLoadout | null {
  if (!record(value) || !exactKeys(value, [
    'basicWeaponId', 'offensiveWeaponIds', 'defensiveWeaponId', 'ammunition',
  ]) || value.basicWeaponId !== profile.kit.basicWeaponId
    || !Array.isArray(value.offensiveWeaponIds)
    || value.offensiveWeaponIds.length !== profile.kit.offensiveSlots
    || !value.offensiveWeaponIds.every(campaignWeapon)
    || new Set(value.offensiveWeaponIds).size !== value.offensiveWeaponIds.length
    || value.offensiveWeaponIds.some((id) => getCampaignWeapon(profile, id).slot !== 'offense')
    || !campaignWeapon(value.defensiveWeaponId)
    || getCampaignWeapon(profile, value.defensiveWeaponId).slot !== 'defense'
    || !Array.isArray(value.ammunition)) return null

  const carriedIds = [
    value.basicWeaponId,
    ...value.offensiveWeaponIds,
    value.defensiveWeaponId,
  ] as CampaignWeaponId[]
  const ammunition = value.ammunition.map(parseAmmunition)
  if (ammunition.some((entry) => entry === null)
    || ammunition.length !== carriedIds.length
    || ammunition.some((entry, index) => entry!.weaponId !== carriedIds[index])) return null

  return Object.freeze({
    basicWeaponId: profile.kit.basicWeaponId,
    offensiveWeaponIds: Object.freeze([...value.offensiveWeaponIds]) as readonly [
      CampaignWeaponId,
      CampaignWeaponId,
    ],
    defensiveWeaponId: value.defensiveWeaponId,
    ammunition: Object.freeze(ammunition as CampaignAmmunition[]),
  })
}

function parseOwned(value: unknown, carried: CampaignCarriedLoadout): CampaignOwnedInventory | null {
  if (!record(value) || !exactKeys(value, [
    'grantedWeaponIds', 'purchasedWeaponIds', 'rewardWeaponIds',
  ])) return null
  const grantedWeaponIds = parseWeaponIds(value.grantedWeaponIds)
  const purchasedWeaponIds = parseWeaponIds(value.purchasedWeaponIds)
  const rewardWeaponIds = parseWeaponIds(value.rewardWeaponIds)
  if (!grantedWeaponIds || !purchasedWeaponIds || !rewardWeaponIds) return null
  const all = [...grantedWeaponIds, ...purchasedWeaponIds, ...rewardWeaponIds]
  const carriedIds = [
    carried.basicWeaponId,
    ...carried.offensiveWeaponIds,
    carried.defensiveWeaponId,
  ]
  if (new Set(all).size !== all.length
    || !grantedWeaponIds.includes(profile.kit.basicWeaponId)
    || carriedIds.some((id) => !all.includes(id))) return null
  return Object.freeze({ grantedWeaponIds, purchasedWeaponIds, rewardWeaponIds })
}

export function parseCampaignLoadout(value: unknown): CampaignLoadout | null {
  if (!record(value) || !exactKeys(value, [
    'kind', 'loadoutVersion', 'profile', 'hull', 'carried', 'owned',
  ]) || value.kind !== 'campaign-loadout' || value.loadoutVersion !== CAMPAIGN_LOADOUT_VERSION
    || !hull(value.hull)) return null
  const parsedBinding = binding(value.profile)
  const carried = parseCarried(value.carried)
  if (!parsedBinding || !carried) return null
  const owned = parseOwned(value.owned, carried)
  if (!owned) return null
  return Object.freeze({
    kind: 'campaign-loadout',
    loadoutVersion: CAMPAIGN_LOADOUT_VERSION,
    profile: parsedBinding,
    hull: value.hull,
    carried,
    owned,
  })
}

function startingAmmunition(weaponId: CampaignWeaponId): CampaignAmmunition {
  return Object.freeze({
    weaponId,
    quantity: getCampaignWeapon(profile, weaponId).startingAmmunition,
  })
}

export function createCampaignLoadout(
  selection: CampaignLoadoutSelection = { offensiveWeaponIds: DEFAULT_OFFENSE },
): CampaignLoadout {
  const offense = selection.offensiveWeaponIds
  const defense = selection.defensiveWeaponId ?? DEFAULT_DEFENSE
  if (offense.length !== profile.kit.offensiveSlots
    || new Set(offense).size !== offense.length
    || offense.some((id) => !profile.choices.includes(id)
      || getCampaignWeapon(profile, id).slot !== 'offense')
    || !profile.choices.includes(defense)
    || getCampaignWeapon(profile, defense).slot !== 'defense') {
    throw new Error('invalid campaign loadout selection')
  }
  const carriedIds = [profile.kit.basicWeaponId, ...offense, defense]
  const loadout = parseCampaignLoadout({
    kind: 'campaign-loadout',
    loadoutVersion: CAMPAIGN_LOADOUT_VERSION,
    profile: {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      contentDigest: profile.contentDigest,
    },
    hull: CAMPAIGN_MAX_HULL,
    carried: {
      basicWeaponId: profile.kit.basicWeaponId,
      offensiveWeaponIds: offense,
      defensiveWeaponId: defense,
      ammunition: carriedIds.map(startingAmmunition),
    },
    owned: {
      grantedWeaponIds: carriedIds,
      purchasedWeaponIds: [],
      rewardWeaponIds: [],
    },
  })
  if (!loadout) throw new Error('canonical campaign loadout is invalid')
  return loadout
}

function requireLoadout(value: unknown): CampaignLoadout {
  const parsed = parseCampaignLoadout(value)
  if (!parsed) throw new Error('invalid campaign loadout')
  return parsed
}

function preserveOwned(original: unknown, parsed: CampaignLoadout): CampaignLoadout {
  return typeof original === 'object' && original !== null && Object.isFrozen(original)
    ? original as CampaignLoadout
    : parsed
}

function replaceLoadout(
  loadout: CampaignLoadout,
  update: { readonly hull?: number; readonly ammunition?: readonly CampaignAmmunition[] },
): CampaignLoadout {
  const next = parseCampaignLoadout({
    ...loadout,
    hull: update.hull ?? loadout.hull,
    carried: {
      ...loadout.carried,
      ammunition: update.ammunition ?? loadout.carried.ammunition,
    },
  })
  if (!next) throw new Error('campaign loadout transition produced invalid state')
  return next
}

export function applyCampaignLoadoutDecision(
  loadoutValue: unknown,
  suppliesValue: number,
  decisionValue: unknown,
): CampaignLoadoutDecisionResult {
  const loadout = requireLoadout(loadoutValue)
  if (!safeInteger(suppliesValue) || !record(decisionValue) || typeof decisionValue.kind !== 'string') {
    throw new Error('invalid campaign loadout decision')
  }
  let cost = 0
  let next = loadout
  if (decisionValue.kind === 'retain' && exactKeys(decisionValue, ['kind'])) {
    // Explicitly keep the valid carried state without a supply cost.
  } else if (decisionValue.kind === 'repair' && exactKeys(decisionValue, ['kind'])) {
    if (loadout.hull >= CAMPAIGN_MAX_HULL) throw new Error('campaign hull does not need repair')
    cost = CAMPAIGN_REPAIR_COST
    next = replaceLoadout(loadout, { hull: CAMPAIGN_MAX_HULL })
  } else if (decisionValue.kind === 'refill'
    && exactKeys(decisionValue, ['kind', 'weaponId'])
    && campaignWeapon(decisionValue.weaponId)) {
    const index = loadout.carried.ammunition.findIndex(
      ({ weaponId }) => weaponId === decisionValue.weaponId,
    )
    const definition = getCampaignWeapon(profile, decisionValue.weaponId)
    if (index < 0) throw new Error('campaign refill requires a carried special weapon')
    if (definition.startingAmmunition === null) {
      throw new Error('campaign basic unlimited weapon cannot be refilled')
    }
    if (loadout.carried.ammunition[index]!.quantity === definition.startingAmmunition) {
      throw new Error('campaign special weapon does not need a refill')
    }
    cost = CAMPAIGN_REFILL_COST
    const ammunition = loadout.carried.ammunition.map((entry, entryIndex) =>
      entryIndex === index
        ? Object.freeze({ weaponId: entry.weaponId, quantity: definition.startingAmmunition })
        : entry)
    next = replaceLoadout(loadout, { ammunition })
  } else {
    throw new Error('invalid campaign loadout decision')
  }
  if (suppliesValue < cost) throw new Error('insufficient campaign supplies')
  return Object.freeze({
    loadout: cost === 0 ? preserveOwned(loadoutValue, loadout) : next,
    supplies: suppliesValue - cost,
    cost,
  })
}

export function applyEmergencyHullPatch(loadoutValue: unknown): CampaignLoadout {
  const loadout = requireLoadout(loadoutValue)
  if (loadout.hull >= CAMPAIGN_EMERGENCY_HULL_FLOOR) {
    return preserveOwned(loadoutValue, loadout)
  }
  return replaceLoadout(loadout, { hull: CAMPAIGN_EMERGENCY_HULL_FLOOR })
}

export function applyCampaignLoadoutSettlement(
  loadoutValue: unknown,
  settlementValue: unknown,
): CampaignLoadout {
  const loadout = requireLoadout(loadoutValue)
  if (!record(settlementValue) || !exactKeys(settlementValue, ['hull', 'ammunition'])
    || !hull(settlementValue.hull) || !Array.isArray(settlementValue.ammunition)) {
    throw new Error('invalid campaign loadout settlement')
  }
  const ammunition = settlementValue.ammunition.map(parseAmmunition)
  if (ammunition.some((entry) => entry === null)
    || ammunition.length !== loadout.carried.ammunition.length
    || ammunition.some((entry, index) =>
      entry!.weaponId !== loadout.carried.ammunition[index]!.weaponId)) {
    throw new Error('campaign loadout settlement does not match the carried kit')
  }
  return replaceLoadout(loadout, {
    hull: settlementValue.hull,
    ammunition: ammunition as CampaignAmmunition[],
  })
}
