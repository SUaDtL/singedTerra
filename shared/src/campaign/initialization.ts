import {
  getCampaignWeapon,
  resolveCampaignCombatProfile,
  type CampaignWeaponId,
  type ResolvedCampaignCombatProfile,
} from './combatProfiles.ts'
import {
  parseCampaignEncounterDefinition,
  type CampaignEncounterDefinition,
  type CampaignSpawnDefinition,
  type CampaignTerrainDefinition,
} from './definitions.ts'
import {
  GameEngine,
  type CampaignEngineConstruction,
} from '../engine/GameEngine.ts'
import { resolveTankMove } from '../engine/Movement.ts'
import {
  BARREL_LENGTH,
  BARREL_PIVOT_HEIGHT,
  TANK_HEIGHT,
  TANK_WIDTH,
  barrelTip,
  createTank,
} from '../engine/Tank.ts'
import {
  ARENA_FLOOR_Y,
  CANVAS_WIDTH,
  buildBitmap,
  pixelAt,
  surfaceAt,
} from '../engine/Terrain.ts'
import {
  WEAPONS,
  type WeaponType,
} from '../engine/WeaponSystem.ts'
import type { TankState } from '../types/GameState.ts'
import { createCampaignObjectStates } from './objects.ts'

export interface CreateCampaignGameEngineInput {
  readonly encounter: unknown
  readonly combatProfile: unknown
  readonly humanLoadout?: unknown
}

export interface CampaignHumanAmmunition {
  readonly weaponId: CampaignWeaponId
  readonly quantity: number | null
}

export interface CampaignHumanLoadout {
  readonly hull: number
  readonly ammunition: readonly CampaignHumanAmmunition[]
}

const CAMPAIGN_TANK_COLORS = Object.freeze([
  '#e84d4d',
  '#4d8ce8',
  '#4de87a',
  '#e8c84d',
] as const)

function requireCombatProfile(value: unknown): ResolvedCampaignCombatProfile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid campaign combat profile')
  }
  const candidate = value as Partial<ResolvedCampaignCombatProfile>
  const resolved = resolveCampaignCombatProfile({
    profileId: candidate.profileId,
    profileVersion: candidate.profileVersion,
  })
  if (resolved !== value) {
    throw new Error('campaign combat profile must be the resolved profile')
  }
  return resolved
}

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

/** Strict detached projection of the reducer-owned carried kit into engine input. */
export function parseCampaignHumanLoadout(
  value: unknown,
  profile: ResolvedCampaignCombatProfile,
): CampaignHumanLoadout | null {
  if (!record(value) || !exactKeys(value, ['hull', 'ammunition'])
    || typeof value.hull !== 'number' || !Number.isFinite(value.hull)
    || value.hull <= 0 || value.hull > 100 || !Array.isArray(value.ammunition)
    || value.ammunition.length !== 1 + profile.kit.offensiveSlots + profile.kit.defensiveSlots) {
    return null
  }
  const ammunition: CampaignHumanAmmunition[] = []
  for (const entry of value.ammunition) {
    if (!record(entry) || !exactKeys(entry, ['weaponId', 'quantity'])
      || typeof entry.weaponId !== 'string'
      || !profile.choices.includes(entry.weaponId as CampaignWeaponId)) return null
    const weapon = getCampaignWeapon(profile, entry.weaponId)
    if (weapon.startingAmmunition === null) {
      if (weapon.id !== profile.kit.basicWeaponId || entry.quantity !== null) return null
    } else if (typeof entry.quantity !== 'number' || !Number.isSafeInteger(entry.quantity)
      || entry.quantity < 0 || entry.quantity > weapon.startingAmmunition) return null
    ammunition.push(Object.freeze({
      weaponId: weapon.id,
      quantity: entry.quantity as number | null,
    }))
  }
  const ids = ammunition.map(({ weaponId }) => weaponId)
  if (new Set(ids).size !== ids.length
    || ids[0] !== profile.kit.basicWeaponId
    || ammunition.slice(1, 1 + profile.kit.offensiveSlots)
      .some(({ weaponId }) => getCampaignWeapon(profile, weaponId).slot !== 'offense')
    || ammunition.slice(1 + profile.kit.offensiveSlots)
      .some(({ weaponId }) => getCampaignWeapon(profile, weaponId).slot !== 'defense')) return null
  return Object.freeze({ hull: value.hull, ammunition: Object.freeze(ammunition) })
}

/** Rasterize the authored polyline once into the engine's canonical column model. */
function rasterizeTerrain(definition: CampaignTerrainDefinition): Uint16Array {
  const heights = new Uint16Array(definition.width)
  for (let index = 1; index < definition.points.length; index += 1) {
    const left = definition.points[index - 1]!
    const right = definition.points[index]!
    const width = right.x - left.x
    for (let x = left.x; x <= right.x; x += 1) {
      const progress = (x - left.x) / width
      heights[x] = Math.round(left.y + (right.y - left.y) * progress)
    }
  }
  return heights
}

function campaignInventory(
  profile: ResolvedCampaignCombatProfile,
  equipment: readonly string[],
  carried: CampaignHumanLoadout | null = null,
): TankState['inventory'] {
  const equipped = new Set<CampaignWeaponId>()
  for (const id of equipment) {
    equipped.add(getCampaignWeapon(profile, id).id)
  }

  return Object.fromEntries(
    (Object.keys(WEAPONS) as WeaponType[]).map((id) => {
      if (!equipped.has(id as CampaignWeaponId)) {
        return [id, { count: 0, unlimited: false }]
      }
      const ammunition = carried?.ammunition.find(({ weaponId }) => weaponId === id)?.quantity
        ?? getCampaignWeapon(profile, id).startingAmmunition
      return ammunition === null
        ? [id, { count: 0, unlimited: true }]
        : [id, { count: ammunition, unlimited: false }]
    }),
  ) as TankState['inventory']
}

function createCampaignTank(
  spawn: CampaignSpawnDefinition,
  index: number,
  heights: Uint16Array,
  profile: ResolvedCampaignCombatProfile,
  humanLoadout: CampaignHumanLoadout | null,
): TankState {
  const equipment = spawn.role === 'human' && humanLoadout
    ? humanLoadout.ammunition.map(({ weaponId }) => weaponId)
    : spawn.equipment
  const firstWeapon = getCampaignWeapon(profile, equipment[0]!).id
  const tank = createTank(
    spawn.id,
    spawn.role === 'human' ? 'Ranger' : spawn.role === 'siege-gun' ? 'Siege Gun' : 'Defender',
    spawn.x,
    Array.from(heights),
    CAMPAIGN_TANK_COLORS[index % CAMPAIGN_TANK_COLORS.length]!,
    spawn.role === 'human' ? null : 'hard',
  )
  tank.angle = spawn.role === 'human' ? 45 : 135
  tank.health = spawn.role === 'human' && humanLoadout ? humanLoadout.hull : spawn.hull
  tank.alive = tank.health > 0
  tank.inventory = campaignInventory(profile, equipment, spawn.role === 'human' ? humanLoadout : null)
  tank.selectedWeapon = firstWeapon
  return tank
}

function assertBodyAndSupport(tank: TankState, terrain: Uint8Array): void {
  const left = tank.x - TANK_WIDTH / 2
  const right = tank.x + TANK_WIDTH / 2
  const top = tank.y - TANK_HEIGHT
  if (left < 0 || right >= CANVAS_WIDTH || top < 0 || tank.y > ARENA_FLOOR_Y) {
    throw new Error(`illegal campaign spawn bounds for "${tank.id}"`)
  }

  for (let x = Math.ceil(left); x <= Math.floor(right); x += 1) {
    if (surfaceAt(terrain, x) !== tank.y) {
      throw new Error(`unsupported campaign spawn for "${tank.id}"`)
    }
    for (let y = Math.floor(top); y < tank.y; y += 1) {
      if (pixelAt(terrain, x, y) !== 0) {
        throw new Error(`campaign terrain intersects tank body for "${tank.id}"`)
      }
    }
  }
}

function assertBarrelClear(tank: TankState, terrain: Uint8Array): void {
  const pivot = { x: tank.x, y: tank.y - BARREL_PIVOT_HEIGHT }
  const tip = barrelTip(tank, BARREL_LENGTH)
  const samples = Math.ceil(BARREL_LENGTH * 2)
  for (let sample = 0; sample <= samples; sample += 1) {
    const progress = sample / samples
    const x = pivot.x + (tip.x - pivot.x) * progress
    const y = pivot.y + (tip.y - pivot.y) * progress
    if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= ARENA_FLOOR_Y
      || pixelAt(terrain, Math.floor(x), Math.floor(y)) !== 0) {
      throw new Error(`illegal campaign barrel clearance for "${tank.id}"`)
    }
  }
}

function canLeaveSpawn(tank: TankState, tanks: readonly TankState[], terrain: Uint8Array): boolean {
  return [-1, 1].some((delta) => {
    const copies = tanks.map((candidate) => ({ ...candidate }))
    const moving = copies.find((candidate) => candidate.id === tank.id)
    return moving !== undefined && resolveTankMove(moving, copies, terrain, delta) === 1
  })
}

function assertLegalSpawns(
  encounter: CampaignEncounterDefinition,
  tanks: readonly TankState[],
  terrain: Uint8Array,
): void {
  const human = encounter.spawns.find((spawn) => spawn.role === 'human')!
  if (encounter.spawns[0] !== human) {
    throw new Error('campaign human must be the opening spawn')
  }
  if (encounter.spawns.some((spawn) => spawn.role !== 'human' && spawn.x <= human.x)) {
    throw new Error('campaign defenders must spawn to the right of the human')
  }

  const sorted = [...tanks].sort((left, right) => left.x - right.x)
  if (sorted.some((tank, index) => index > 0
    && tank.x - sorted[index - 1]!.x <= TANK_WIDTH)) {
    throw new Error('campaign tank spawns overlap')
  }

  for (const [index, tank] of tanks.entries()) {
    assertBodyAndSupport(tank, terrain)
    assertBarrelClear(tank, terrain)
    if (encounter.spawns[index]!.role !== 'siege-gun'
      && !canLeaveSpawn(tank, tanks, terrain)) {
      throw new Error(`campaign spawn has no legal movement exit for "${tank.id}"`)
    }
  }
}

/**
 * Strict opt-in boundary from authored campaign data to the authoritative engine.
 * Neither parsed inputs nor the public borrowed GameState are mutated.
 */
export function createCampaignGameEngine(
  input: CreateCampaignGameEngineInput,
): GameEngine {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || (Reflect.ownKeys(input).length !== 2 && Reflect.ownKeys(input).length !== 3)
    || !Object.hasOwn(input, 'encounter') || !Object.hasOwn(input, 'combatProfile')
    || (Reflect.ownKeys(input).length === 3 && !Object.hasOwn(input, 'humanLoadout'))) {
    throw new Error('invalid campaign engine construction input')
  }
  const encounter = parseCampaignEncounterDefinition(input.encounter)
  if (!encounter) throw new Error('invalid campaign encounter')

  const combatProfile = requireCombatProfile(input.combatProfile)
  if (encounter.combatProfileId !== combatProfile.profileId
    || encounter.combatProfileVersion !== combatProfile.profileVersion) {
    throw new Error('campaign encounter and combat profile disagree')
  }
  const humanLoadout = Object.hasOwn(input, 'humanLoadout')
    ? parseCampaignHumanLoadout(input.humanLoadout, combatProfile)
    : null
  if (Object.hasOwn(input, 'humanLoadout') && !humanLoadout) {
    throw new Error('invalid campaign human loadout')
  }

  const heights = rasterizeTerrain(encounter.terrain)
  const terrain = buildBitmap(heights)
  const tanks = encounter.spawns.map((spawn, index) =>
    createCampaignTank(spawn, index, heights, combatProfile, humanLoadout))
  assertLegalSpawns(encounter, tanks, terrain)
  const objects = createCampaignObjectStates(encounter.objects, terrain)

  const construction: CampaignEngineConstruction = {
    kind: 'campaign-engine-construction',
    seed: encounter.seed,
    terrain,
    tanks,
    objects,
    combatProfile,
    campaign: Object.freeze({
      encounterId: encounter.encounterId,
      humanId: encounter.spawns.find(({ role }) => role === 'human')!.id,
      defenderIds: Object.freeze(encounter.spawns
        .filter(({ role }) => role !== 'human')
        .map(({ id }) => id)),
      objective: encounter.objective,
      warning: encounter.warning,
      zonePolicy: encounter.zonePolicy ?? null,
    }),
  }
  return GameEngine.fromCampaignConstruction(construction)
}
