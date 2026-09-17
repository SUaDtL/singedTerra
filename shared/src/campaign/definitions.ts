export const CAMPAIGN_CONTRACT_LIMITS = Object.freeze({
  encounters: 4,
  routes: 2,
  routeLength: 3,
  objectsPerEncounter: 8,
  spawnsPerEncounter: 4,
  profileChoices: 6,
  minimumSpawnEdge: 16,
  minimumSpawnSeparation: 32,
  heightControlPoints: 64,
  arenaWidth: 1200,
  bitmapHeight: 600,
  floorY: 400,
} as const)

export interface CampaignTerrainPoint { readonly x: number; readonly y: number }
export interface CampaignTerrainDefinition {
  readonly kind: 'height-control-points'; readonly version: 1; readonly width: number
  readonly bitmapHeight: number; readonly floorY: number; readonly points: readonly CampaignTerrainPoint[]
}
export type CampaignSpawnRole = 'human' | 'defender' | 'siege-gun'
export interface CampaignSpawnDefinition {
  readonly id: string; readonly role: CampaignSpawnRole; readonly x: number; readonly hull: number
  readonly equipment: readonly string[]
}
export type CampaignObjectKind = 'protected' | 'supply-drum' | 'cache' | 'relay'
export interface CampaignObjectDefinition {
  readonly id: string; readonly kind: CampaignObjectKind; readonly x: number; readonly width: number
  readonly height: number; readonly health: number
}
export interface CampaignEliminateObjective {
  readonly kind: 'eliminate'; readonly protectedObjectIds: readonly string[]
}
export interface CampaignSurviveObjective {
  readonly kind: 'survive-or-eliminate'; readonly protectedObjectIds: readonly string[]
  readonly humanCommitments: number
}
export type CampaignObjective = CampaignEliminateObjective | CampaignSurviveObjective
export interface CampaignWarningDefinition {
  readonly kind: 'announced-strike'; readonly sourceObjectId: string; readonly sourceSpawnId: string
}
export interface CampaignZonePolicy {
  readonly kind: 'incendiary'; readonly radius: number; readonly damage: number; readonly maxLive: number
}
export interface CampaignEncounterDefinition {
  readonly kind: 'campaign-encounter'; readonly episodeVersion: 1; readonly encounterVersion: 1
  readonly encounterId: string; readonly combatProfileId: string; readonly combatProfileVersion: 1
  readonly contentDigest: string; readonly seed: number; readonly terrain: CampaignTerrainDefinition
  readonly spawns: readonly CampaignSpawnDefinition[]; readonly objects: readonly CampaignObjectDefinition[]
  readonly objective: CampaignObjective; readonly warning: CampaignWarningDefinition | null
  readonly zonePolicy?: CampaignZonePolicy | null
}
export interface CampaignRouteDefinition {
  readonly id: string; readonly encounterIds: readonly [string, string, string]
}
export interface CampaignEpisodeDefinition {
  readonly kind: 'campaign-episode'; readonly episodeVersion: 1; readonly episodeId: string
  readonly contentDigest: string; readonly entryEncounterId: string
  readonly encounters: readonly CampaignEncounterDefinition[]; readonly routes: readonly CampaignRouteDefinition[]
}
export interface CampaignProfileChoice {
  readonly id: string; readonly slot: 'offense' | 'defense'; readonly ammunition: number
}
export interface CampaignCombatProfile {
  readonly kind: 'campaign-combat-profile'; readonly profileVersion: 1; readonly profileId: string
  readonly contentDigest: string; readonly choices: readonly CampaignProfileChoice[]
}
export interface CampaignRun {
  readonly kind: 'campaign-run'; readonly runVersion: 1; readonly runId: string; readonly episodeId: string
  readonly episodeVersion: 1; readonly episodeContentDigest: string; readonly combatProfileId: string
  readonly combatProfileVersion: 1; readonly combatProfileContentDigest: string; readonly routeId: string
  readonly encounterIds: readonly [string, string, string]; readonly currentEncounterIndex: number
}
export type CampaignResultOutcome = 'success' | 'failure' | 'technical-failure'
export interface CampaignResult {
  readonly kind: 'campaign-result'; readonly resultVersion: 1; readonly runId: string
  readonly encounterId: string; readonly encounterVersion: 1; readonly encounterContentDigest: string
  readonly attempt: number; readonly outcome: CampaignResultOutcome; readonly commitments: number
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
}
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/
const DIGEST = /^[0-9a-f]{64}$/
function identifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value) && value.length <= 64
}
function digest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value) }
function unique(values: readonly string[]): boolean { return new Set(values).size === values.length }

function parseTerrain(value: unknown): CampaignTerrainDefinition | null {
  if (!record(value) || !exactKeys(value, ['kind', 'version', 'width', 'bitmapHeight', 'floorY', 'points'])
    || value.kind !== 'height-control-points' || value.version !== 1
    || value.width !== CAMPAIGN_CONTRACT_LIMITS.arenaWidth
    || value.bitmapHeight !== CAMPAIGN_CONTRACT_LIMITS.bitmapHeight
    || value.floorY !== CAMPAIGN_CONTRACT_LIMITS.floorY
    || !Array.isArray(value.points) || value.points.length < 2
    || value.points.length > CAMPAIGN_CONTRACT_LIMITS.heightControlPoints) return null
  const points: CampaignTerrainPoint[] = []
  for (const point of value.points) {
    if (!record(point) || !exactKeys(point, ['x', 'y']) || !integer(point.x, 0, value.width - 1)
      || !integer(point.y, 0, value.floorY) || (points.length > 0 && point.x <= points.at(-1)!.x)) return null
    points.push(Object.freeze({ x: point.x, y: point.y }))
  }
  if (points[0]!.x !== 0 || points.at(-1)!.x !== value.width - 1) return null
  return Object.freeze({ kind: 'height-control-points', version: 1, width: value.width,
    bitmapHeight: value.bitmapHeight, floorY: value.floorY, points: Object.freeze(points) })
}

function parseSpawn(value: unknown, width: number): CampaignSpawnDefinition | null {
  if (!record(value) || !exactKeys(value, ['id', 'role', 'x', 'hull', 'equipment']) || !identifier(value.id)
    || (value.role !== 'human' && value.role !== 'defender' && value.role !== 'siege-gun')
    || !integer(value.x, CAMPAIGN_CONTRACT_LIMITS.minimumSpawnEdge,
      width - CAMPAIGN_CONTRACT_LIMITS.minimumSpawnEdge)
    || !integer(value.hull, 1, 100) || !Array.isArray(value.equipment) || value.equipment.length < 1
    || value.equipment.length > CAMPAIGN_CONTRACT_LIMITS.profileChoices
    || !value.equipment.every(identifier) || !unique(value.equipment)) return null
  return Object.freeze({ id: value.id, role: value.role, x: value.x, hull: value.hull,
    equipment: Object.freeze([...value.equipment]) })
}

function parseObject(value: unknown, width: number, floorY: number): CampaignObjectDefinition | null {
  if (!record(value) || !exactKeys(value, ['id', 'kind', 'x', 'width', 'height', 'health'])
    || !identifier(value.id) || (value.kind !== 'protected' && value.kind !== 'supply-drum'
      && value.kind !== 'cache' && value.kind !== 'relay')
    || !integer(value.width, 1, 128) || !integer(value.height, 1, Math.min(128, floorY))
    || !integer(value.health, 1, 100) || !integer(value.x, 0, width - 1)
    || value.x - value.width / 2 < 0 || value.x + value.width / 2 > width) return null
  return Object.freeze({ id: value.id, kind: value.kind, x: value.x, width: value.width,
    height: value.height, health: value.health })
}

function parseReferences(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every(identifier) || !unique(value)) return null
  return Object.freeze([...value])
}
function parseObjective(value: unknown): CampaignObjective | null {
  if (!record(value)) return null
  const protectedObjectIds = parseReferences(value.protectedObjectIds)
  if (!protectedObjectIds) return null
  if (value.kind === 'eliminate' && exactKeys(value, ['kind', 'protectedObjectIds']))
    return Object.freeze({ kind: 'eliminate', protectedObjectIds })
  if (value.kind === 'survive-or-eliminate'
    && exactKeys(value, ['kind', 'protectedObjectIds', 'humanCommitments'])
    && integer(value.humanCommitments, 1, 32))
    return Object.freeze({ kind: 'survive-or-eliminate', protectedObjectIds,
      humanCommitments: value.humanCommitments })
  return null
}
function parseWarning(value: unknown): CampaignWarningDefinition | null | undefined {
  if (value === null) return null
  if (!record(value) || !exactKeys(value, ['kind', 'sourceObjectId', 'sourceSpawnId'])
    || value.kind !== 'announced-strike' || !identifier(value.sourceObjectId)
    || !identifier(value.sourceSpawnId)) return undefined
  return Object.freeze({ kind: 'announced-strike', sourceObjectId: value.sourceObjectId,
    sourceSpawnId: value.sourceSpawnId })
}
function parseZonePolicy(value: unknown): CampaignZonePolicy | null | undefined {
  if (value === null || value === undefined) return null
  if (!record(value) || !exactKeys(value, ['kind', 'radius', 'damage', 'maxLive'])
    || value.kind !== 'incendiary' || !integer(value.radius, 1, 128)
    || !integer(value.damage, 1, 100) || !integer(value.maxLive, 1, 4)) return undefined
  return Object.freeze({ kind: 'incendiary', radius: value.radius,
    damage: value.damage, maxLive: value.maxLive })
}

export function parseCampaignEncounterDefinition(value: unknown): CampaignEncounterDefinition | null {
  const baseKeys = ['kind', 'episodeVersion', 'encounterVersion', 'encounterId',
    'combatProfileId', 'combatProfileVersion', 'contentDigest', 'seed', 'terrain', 'spawns', 'objects',
    'objective', 'warning'] as const
  if (!record(value) || (!exactKeys(value, baseKeys) && !exactKeys(value, [...baseKeys, 'zonePolicy']))
    || value.kind !== 'campaign-encounter' || value.episodeVersion !== 1
    || value.encounterVersion !== 1 || value.combatProfileVersion !== 1 || !identifier(value.encounterId)
    || !identifier(value.combatProfileId) || !digest(value.contentDigest)
    || !integer(value.seed, 0, 0xffff_ffff)) return null
  const terrain = parseTerrain(value.terrain)
  if (!terrain || !Array.isArray(value.spawns) || value.spawns.length < 2
    || value.spawns.length > CAMPAIGN_CONTRACT_LIMITS.spawnsPerEncounter || !Array.isArray(value.objects)
    || value.objects.length > CAMPAIGN_CONTRACT_LIMITS.objectsPerEncounter) return null
  const spawns = value.spawns.map((spawn) => parseSpawn(spawn, terrain.width))
  const objects = value.objects.map((object) => parseObject(object, terrain.width, terrain.floorY))
  const objective = parseObjective(value.objective)
  const warning = parseWarning(value.warning)
  const zonePolicy = parseZonePolicy(value.zonePolicy)
  if (spawns.some((spawn) => !spawn) || objects.some((object) => !object) || !objective
    || warning === undefined || zonePolicy === undefined) return null
  const parsedSpawns = spawns as CampaignSpawnDefinition[]
  const parsedObjects = objects as CampaignObjectDefinition[]
  if (!unique(parsedSpawns.map(({ id }) => id)) || !unique(parsedObjects.map(({ id }) => id))
    || parsedSpawns.filter(({ role }) => role === 'human').length !== 1) return null
  const sortedSpawns = [...parsedSpawns].sort((left, right) => left.x - right.x)
  if (sortedSpawns.some((spawn, index) => index > 0
    && spawn.x - sortedSpawns[index - 1]!.x < CAMPAIGN_CONTRACT_LIMITS.minimumSpawnSeparation)) return null
  const objectIds = new Set(parsedObjects.map(({ id }) => id))
  const spawnIds = new Set(parsedSpawns.map(({ id }) => id))
  const objectsOverlap = parsedObjects.some((left, index) => parsedObjects.slice(index + 1).some((right) =>
    Math.abs(left.x - right.x) < (left.width + right.width) / 2))
  const spawnOverlapsObject = parsedSpawns.some((spawn) => parsedObjects.some((object) =>
    Math.abs(spawn.x - object.x) < CAMPAIGN_CONTRACT_LIMITS.minimumSpawnEdge + object.width / 2))
  if (objective.protectedObjectIds.some((id) => !objectIds.has(id))
    || objectsOverlap || spawnOverlapsObject
    || (warning !== null && (!objectIds.has(warning.sourceObjectId) || !spawnIds.has(warning.sourceSpawnId)))) return null
  return Object.freeze({ kind: 'campaign-encounter', episodeVersion: 1, encounterVersion: 1,
    encounterId: value.encounterId, combatProfileId: value.combatProfileId, combatProfileVersion: 1,
    contentDigest: value.contentDigest, seed: value.seed, terrain, spawns: Object.freeze(parsedSpawns),
    objects: Object.freeze(parsedObjects), objective, warning,
    ...(Object.hasOwn(value, 'zonePolicy') ? { zonePolicy } : {}) })
}

function parseRoute(value: unknown): CampaignRouteDefinition | null {
  if (!record(value) || !exactKeys(value, ['id', 'encounterIds']) || !identifier(value.id)
    || !Array.isArray(value.encounterIds) || value.encounterIds.length !== CAMPAIGN_CONTRACT_LIMITS.routeLength
    || !value.encounterIds.every(identifier) || !unique(value.encounterIds)) return null
  return Object.freeze({ id: value.id,
    encounterIds: Object.freeze([...value.encounterIds]) as readonly [string, string, string] })
}

export function parseCampaignEpisodeDefinition(value: unknown): CampaignEpisodeDefinition | null {
  if (!record(value) || !exactKeys(value, ['kind', 'episodeVersion', 'episodeId', 'contentDigest',
    'entryEncounterId', 'encounters', 'routes']) || value.kind !== 'campaign-episode'
    || value.episodeVersion !== 1 || !identifier(value.episodeId) || !digest(value.contentDigest)
    || !identifier(value.entryEncounterId) || !Array.isArray(value.encounters)
    || value.encounters.length !== CAMPAIGN_CONTRACT_LIMITS.encounters || !Array.isArray(value.routes)
    || value.routes.length !== CAMPAIGN_CONTRACT_LIMITS.routes) return null
  const encounters = value.encounters.map(parseCampaignEncounterDefinition)
  const routes = value.routes.map(parseRoute)
  if (encounters.some((encounter) => !encounter) || routes.some((route) => !route)) return null
  const parsedEncounters = encounters as CampaignEncounterDefinition[]
  const parsedRoutes = routes as CampaignRouteDefinition[]
  const encounterIds = parsedEncounters.map(({ encounterId }) => encounterId)
  const [first, second] = parsedRoutes
  if (!first || !second || !unique(encounterIds) || !unique(parsedRoutes.map(({ id }) => id))
    || !encounterIds.includes(value.entryEncounterId) || first.encounterIds[0] !== value.entryEncounterId
    || second.encounterIds[0] !== value.entryEncounterId || first.encounterIds[2] !== second.encounterIds[2]
    || first.encounterIds[1] === second.encounterIds[1]
    || parsedRoutes.some(({ encounterIds: route }) => route.some((id) => !encounterIds.includes(id)))
    || !encounterIds.every((id) => parsedRoutes.some(({ encounterIds: route }) => route.includes(id)))) return null
  return Object.freeze({ kind: 'campaign-episode', episodeVersion: 1, episodeId: value.episodeId,
    contentDigest: value.contentDigest, entryEncounterId: value.entryEncounterId,
    encounters: Object.freeze(parsedEncounters), routes: Object.freeze(parsedRoutes) })
}

function parseProfileChoice(value: unknown): CampaignProfileChoice | null {
  if (!record(value) || !exactKeys(value, ['id', 'slot', 'ammunition']) || !identifier(value.id)
    || (value.slot !== 'offense' && value.slot !== 'defense') || !integer(value.ammunition, 1, 999)) return null
  return Object.freeze({ id: value.id, slot: value.slot, ammunition: value.ammunition })
}
export function parseCampaignCombatProfile(value: unknown): CampaignCombatProfile | null {
  if (!record(value) || !exactKeys(value, ['kind', 'profileVersion', 'profileId', 'contentDigest', 'choices'])
    || value.kind !== 'campaign-combat-profile' || value.profileVersion !== 1 || !identifier(value.profileId)
    || !digest(value.contentDigest) || !Array.isArray(value.choices) || value.choices.length < 1
    || value.choices.length > CAMPAIGN_CONTRACT_LIMITS.profileChoices) return null
  const choices = value.choices.map(parseProfileChoice)
  if (choices.some((choice) => !choice)) return null
  const parsedChoices = choices as CampaignProfileChoice[]
  if (!unique(parsedChoices.map(({ id }) => id))) return null
  return Object.freeze({ kind: 'campaign-combat-profile', profileVersion: 1, profileId: value.profileId,
    contentDigest: value.contentDigest, choices: Object.freeze(parsedChoices) })
}

export function parseCampaignRun(value: unknown): CampaignRun | null {
  if (!record(value) || !exactKeys(value, ['kind', 'runVersion', 'runId', 'episodeId', 'episodeVersion',
    'episodeContentDigest', 'combatProfileId', 'combatProfileVersion', 'combatProfileContentDigest',
    'routeId', 'encounterIds', 'currentEncounterIndex']) || value.kind !== 'campaign-run'
    || value.runVersion !== 1 || value.episodeVersion !== 1 || value.combatProfileVersion !== 1
    || !identifier(value.runId) || !identifier(value.episodeId) || !digest(value.episodeContentDigest)
    || !identifier(value.combatProfileId) || !digest(value.combatProfileContentDigest)
    || !identifier(value.routeId) || !Array.isArray(value.encounterIds)
    || value.encounterIds.length !== CAMPAIGN_CONTRACT_LIMITS.routeLength
    || !value.encounterIds.every(identifier) || !unique(value.encounterIds)
    || !integer(value.currentEncounterIndex, 0, CAMPAIGN_CONTRACT_LIMITS.routeLength - 1)) return null
  return Object.freeze({ kind: 'campaign-run', runVersion: 1, runId: value.runId, episodeId: value.episodeId,
    episodeVersion: 1, episodeContentDigest: value.episodeContentDigest, combatProfileId: value.combatProfileId,
    combatProfileVersion: 1, combatProfileContentDigest: value.combatProfileContentDigest, routeId: value.routeId,
    encounterIds: Object.freeze([...value.encounterIds]) as readonly [string, string, string],
    currentEncounterIndex: value.currentEncounterIndex })
}

export function parseCampaignResult(value: unknown): CampaignResult | null {
  if (!record(value) || !exactKeys(value, ['kind', 'resultVersion', 'runId', 'encounterId',
    'encounterVersion', 'encounterContentDigest', 'attempt', 'outcome', 'commitments'])
    || value.kind !== 'campaign-result' || value.resultVersion !== 1 || value.encounterVersion !== 1
    || !identifier(value.runId) || !identifier(value.encounterId) || !digest(value.encounterContentDigest)
    || !integer(value.attempt, 1, 0xffff_ffff) || !integer(value.commitments, 0, 256)
    || (value.outcome !== 'success' && value.outcome !== 'failure' && value.outcome !== 'technical-failure')) return null
  return Object.freeze({ kind: 'campaign-result', resultVersion: 1, runId: value.runId,
    encounterId: value.encounterId, encounterVersion: 1, encounterContentDigest: value.encounterContentDigest,
    attempt: value.attempt, outcome: value.outcome, commitments: value.commitments })
}
