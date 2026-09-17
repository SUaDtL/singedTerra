import { blastReachRadius } from '../engine/BlastGeometry.ts'
import {
  WEAPONS,
  type WeaponDefinition,
  type WeaponType,
} from '../engine/WeaponSystem.ts'

export const ASH_ROAD_COMBAT_PROFILE_REFERENCE = Object.freeze({
  profileId: 'ash-road-v1',
  profileVersion: 1,
} as const)

export type CampaignCombatProfileId = typeof ASH_ROAD_COMBAT_PROFILE_REFERENCE.profileId
export type CampaignCombatProfileVersion = typeof ASH_ROAD_COMBAT_PROFILE_REFERENCE.profileVersion
export type CampaignWeaponId =
  | 'baby_missile'
  | 'missile'
  | 'cluster_bomb'
  | 'sandhog'
  | 'napalm'
  | 'shield'
export type CampaignWeaponSlot = 'basic' | 'offense' | 'defense'

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T

export interface CampaignProfileReference {
  readonly profileId: CampaignCombatProfileId
  readonly profileVersion: CampaignCombatProfileVersion
}

export interface CampaignWeaponDamageDefinition {
  readonly maxDamage: number
  /** Authoritative hull/object reach. Deliberately independent of crater and art size. */
  readonly damageReach: number
  readonly craterRadius: number
  readonly falloffExponent: number
}

export interface ResolvedCampaignWeapon {
  readonly id: CampaignWeaponId
  readonly name: string
  readonly slot: CampaignWeaponSlot
  /** `null` is the explicitly unlimited basic shell; every equipped special is finite. */
  readonly startingAmmunition: number | null
  readonly damage: CampaignWeaponDamageDefinition
  readonly definition: DeepReadonly<WeaponDefinition>
}

export interface ResolvedCampaignCombatProfile {
  readonly kind: 'resolved-campaign-combat-profile'
  readonly profileId: CampaignCombatProfileId
  readonly profileVersion: CampaignCombatProfileVersion
  /** SHA-256 of the reviewed schema-v1 candidate artifact from which this profile was selected. */
  readonly contentDigest: string
  readonly choices: readonly CampaignWeaponId[]
  readonly kit: {
    readonly basicWeaponId: 'baby_missile'
    readonly offensiveSlots: 2
    readonly defensiveSlots: 1
  }
  readonly catalog: Readonly<Record<CampaignWeaponId, ResolvedCampaignWeapon>>
  readonly shield: {
    readonly candidates: readonly [60, 90, 120]
    readonly selectedCapacity: 90
  }
  readonly environmentEffects: {
    readonly supplyDrum: CampaignWeaponDamageDefinition
    readonly announcedStrike: CampaignWeaponDamageDefinition
  }
  readonly economy: {
    readonly battleShopping: false
    readonly damageIncome: 0
    readonly shotStipend: 0
    readonly startingSupplies: 2
  }
}

const CHOICES = [
  'baby_missile',
  'missile',
  'cluster_bomb',
  'sandhog',
  'napalm',
  'shield',
] as const satisfies readonly CampaignWeaponId[]

const STARTING_AMMUNITION = Object.freeze({
  baby_missile: null,
  missile: 3,
  cluster_bomb: 2,
  sandhog: 2,
  napalm: 2,
  shield: 1,
} as const satisfies Record<CampaignWeaponId, number | null>)

const SLOTS = Object.freeze({
  baby_missile: 'basic',
  missile: 'offense',
  cluster_bomb: 'offense',
  sandhog: 'offense',
  napalm: 'offense',
  shield: 'defense',
} as const satisfies Record<CampaignWeaponId, CampaignWeaponSlot>)

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    ) as T
  }
  return value
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item)
    Object.freeze(value)
  }
  return value as DeepReadonly<T>
}

function ownedWeaponDefinition(id: CampaignWeaponId): DeepReadonly<WeaponDefinition> {
  const definition = cloneValue(WEAPONS[id])
  if (id === 'shield') {
    definition.behavior = { ...definition.behavior, shield: { capacity: 90 } }
  }
  return deepFreeze(definition)
}

function explicitDamage(id: CampaignWeaponId, definition: DeepReadonly<WeaponDefinition>): CampaignWeaponDamageDefinition {
  if (id === 'napalm' || id === 'shield') {
    return { maxDamage: 0, damageReach: 0, craterRadius: 0, falloffExponent: 1 }
  }
  const { detonation } = definition
  return {
    maxDamage: detonation.maxDamage,
    damageReach: blastReachRadius(detonation.radius, detonation.style),
    craterRadius: detonation.radius,
    falloffExponent: detonation.falloffExponent ?? 1,
  }
}

function resolvedWeapon(id: CampaignWeaponId): ResolvedCampaignWeapon {
  const definition = ownedWeaponDefinition(id)
  return {
    id,
    name: definition.name,
    slot: SLOTS[id],
    startingAmmunition: STARTING_AMMUNITION[id],
    damage: explicitDamage(id, definition),
    definition,
  }
}

const catalog = Object.fromEntries(CHOICES.map((id) => [id, resolvedWeapon(id)])) as Record<
  CampaignWeaponId,
  ResolvedCampaignWeapon
>

const ASH_ROAD_COMBAT_PROFILE = deepFreeze({
  kind: 'resolved-campaign-combat-profile',
  profileId: ASH_ROAD_COMBAT_PROFILE_REFERENCE.profileId,
  profileVersion: ASH_ROAD_COMBAT_PROFILE_REFERENCE.profileVersion,
  contentDigest: '45b32aa02ea3d017d6bcce70eef4352e50ac762588caf5f608f7204156fb207b',
  choices: [...CHOICES],
  kit: { basicWeaponId: 'baby_missile', offensiveSlots: 2, defensiveSlots: 1 },
  catalog,
  shield: { candidates: [60, 90, 120] as const, selectedCapacity: 90 },
  environmentEffects: {
    supplyDrum: { maxDamage: 60, damageReach: 76, craterRadius: 32, falloffExponent: 1 },
    announcedStrike: { maxDamage: 35, damageReach: 55, craterRadius: 24, falloffExponent: 1 },
  },
  economy: { battleShopping: false, damageIncome: 0, shotStipend: 0, startingSupplies: 2 },
} satisfies ResolvedCampaignCombatProfile)

function isExactReference(value: unknown): value is CampaignProfileReference {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const reference = value as Record<string, unknown>
  return Object.keys(reference).length === 2
    && reference.profileId === ASH_ROAD_COMBAT_PROFILE_REFERENCE.profileId
    && reference.profileVersion === ASH_ROAD_COMBAT_PROFILE_REFERENCE.profileVersion
}

/** Resolve a reviewed campaign profile by exact versioned identity; skew fails closed. */
export function resolveCampaignCombatProfile(reference: unknown): ResolvedCampaignCombatProfile {
  if (!isExactReference(reference)) {
    throw new Error('unsupported campaign combat profile')
  }
  return ASH_ROAD_COMBAT_PROFILE
}

/** True only for the six public IDs in the resolved Ash Road catalog. */
export function isCampaignWeaponId(value: string): value is CampaignWeaponId {
  return Object.hasOwn(ASH_ROAD_COMBAT_PROFILE.catalog, value)
}

/** Weapon lookup that cannot silently fall back to the ordinary global catalog. */
export function getCampaignWeapon(
  profile: ResolvedCampaignCombatProfile,
  id: string,
): ResolvedCampaignWeapon {
  if (!isCampaignWeaponId(id) || profile !== ASH_ROAD_COMBAT_PROFILE) {
    throw new Error(`unsupported campaign weapon "${id}"`)
  }
  return profile.catalog[id]
}

// Compile-time proof that every campaign ID remains a real ordinary WeaponType.
const _weaponTypeCompatibility: readonly WeaponType[] = CHOICES
void _weaponTypeCompatibility
