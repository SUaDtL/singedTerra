import { CANVAS_WIDTH, surfaceAt } from '../engine/Terrain.ts'

export const CAMPAIGN_ZONE_MAX_LIVE = 4 as const
export const CAMPAIGN_ZONE_SURFACE_TOLERANCE = 4 as const

export interface CampaignIncendiaryZone {
  readonly id: string
  readonly kind: 'incendiary'
  readonly centerX: number
  readonly radius: number
  readonly damage: number
  readonly birthCommitmentId: number
  readonly expiryCommitmentId: number
  readonly actorId: string
  readonly rootCommitmentId: number
}

export interface CampaignZoneTankSample {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64
    && /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(value)
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function createCampaignIncendiaryZone(input: Readonly<{
  id: string
  centerX: number
  birthCommitmentId: number
  initialRosterSize: number
  actorId: string
  rootCommitmentId: number
  radius: number
  damage: number
}>): CampaignIncendiaryZone {
  if (!identifier(input.id) || !identifier(input.actorId)
    || !Number.isFinite(input.centerX) || input.centerX < 0 || input.centerX >= CANVAS_WIDTH
    || !positiveInteger(input.birthCommitmentId) || !positiveInteger(input.initialRosterSize)
    || input.initialRosterSize > 8 || !positiveInteger(input.rootCommitmentId)
    || !finitePositive(input.radius) || !finitePositive(input.damage)) {
    throw new Error('invalid campaign incendiary zone')
  }
  return Object.freeze({
    id: input.id,
    kind: 'incendiary',
    centerX: input.centerX,
    radius: input.radius,
    damage: input.damage,
    birthCommitmentId: input.birthCommitmentId,
    expiryCommitmentId: input.birthCommitmentId + 2 * input.initialRosterSize + 1,
    actorId: input.actorId,
    rootCommitmentId: input.rootCommitmentId,
  })
}

export function appendCampaignZone(
  zones: readonly CampaignIncendiaryZone[],
  zone: CampaignIncendiaryZone,
): readonly CampaignIncendiaryZone[] {
  if (zones.length >= CAMPAIGN_ZONE_MAX_LIVE) {
    throw new Error('campaign live zone limit exceeded')
  }
  if (zones.some(({ id }) => id === zone.id)) throw new Error('duplicate campaign zone id')
  return Object.freeze([...zones, zone])
}

function tankTouchesZone(
  zone: CampaignIncendiaryZone,
  tank: CampaignZoneTankSample,
  terrain: Uint8Array,
): boolean {
  if (!identifier(tank.id) || !Number.isFinite(tank.x) || !Number.isFinite(tank.y)
    || !finitePositive(tank.width) || !finitePositive(tank.height)) return false
  const tankLeft = tank.x - tank.width / 2
  const tankRight = tank.x + tank.width / 2
  const zoneLeft = zone.centerX - zone.radius
  const zoneRight = zone.centerX + zone.radius
  if (tankRight < zoneLeft || tankLeft > zoneRight) return false
  const sampleX = Math.max(0, Math.min(CANVAS_WIDTH - 1, Math.round(tank.x)))
  // TankState.y is the tread bottom / terrain contact, not the AABB top.
  const footY = tank.y
  return Math.abs(surfaceAt(terrain, sampleX) - footY) <= CAMPAIGN_ZONE_SURFACE_TOLERANCE
}

export function resolveCampaignZoneExposure(input: Readonly<{
  zones: readonly CampaignIncendiaryZone[]
  commitmentId: number
  actingTank: CampaignZoneTankSample
  terrain: Uint8Array
}>): Readonly<{
  damage: number
  sourceZoneId: string | null
  zones: readonly CampaignIncendiaryZone[]
}> {
  if (!positiveInteger(input.commitmentId) || !(input.terrain instanceof Uint8Array)) {
    throw new Error('invalid campaign zone exposure boundary')
  }
  const zones = Object.freeze(input.zones.filter(
    ({ expiryCommitmentId }) => expiryCommitmentId > input.commitmentId,
  ))
  const applicable = zones.filter((zone) =>
    zone.birthCommitmentId !== input.commitmentId
    && tankTouchesZone(zone, input.actingTank, input.terrain))
  const selected = [...applicable].sort((left, right) =>
    right.damage - left.damage || left.id.localeCompare(right.id))[0]
  return Object.freeze({
    damage: selected?.damage ?? 0,
    sourceZoneId: selected?.id ?? null,
    zones,
  })
}

export function applyCampaignZoneDamage(input: Readonly<{
  health: number
  shieldHp: number
  damage: number
}>): Readonly<{
  health: number
  shieldHp: number
  absorbed: number
  hullDamage: number
}> {
  if (![input.health, input.shieldHp, input.damage].every(
    (value) => Number.isFinite(value) && value >= 0,
  )) throw new Error('invalid campaign zone damage input')
  const absorbed = Math.min(input.shieldHp, input.damage)
  const hullDamage = Math.min(input.health, input.damage - absorbed)
  return Object.freeze({
    health: input.health - hullDamage,
    shieldHp: input.shieldHp - absorbed,
    absorbed,
    hullDamage,
  })
}

export function projectCampaignZoneSurface(
  zone: CampaignIncendiaryZone,
  terrain: Uint8Array,
  step = 4,
): readonly Readonly<{ x: number; y: number }>[] {
  if (!(terrain instanceof Uint8Array) || !positiveInteger(step)) {
    throw new Error('invalid campaign zone surface projection')
  }
  const left = Math.max(0, Math.round(zone.centerX - zone.radius))
  const right = Math.min(CANVAS_WIDTH - 1, Math.round(zone.centerX + zone.radius))
  const points: Array<Readonly<{ x: number; y: number }>> = []
  for (let x = left; x <= right; x += step) {
    points.push(Object.freeze({ x, y: surfaceAt(terrain, x) }))
  }
  if (points.at(-1)?.x !== right) points.push(Object.freeze({ x: right, y: surfaceAt(terrain, right) }))
  return Object.freeze(points)
}
