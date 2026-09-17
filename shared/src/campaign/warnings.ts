import { CANVAS_WIDTH, surfaceAt } from '../engine/Terrain.ts'
import type { CampaignObjectState } from './objects.ts'

export const CAMPAIGN_STRIKE_PROFILE = Object.freeze({
  maxDamage: 35,
  damageReach: 55,
  craterRadius: 24,
} as const)

export type CampaignWarningStatus = 'pending' | 'due' | 'canceled' | 'fired'

export interface CampaignAnnouncedStrike {
  readonly id: string
  readonly kind: 'announced-strike'
  readonly sourceObjectId: string
  readonly sourceSpawnId: string
  readonly announcedAtHumanCommitment: number
  readonly dueHumanCommitment: number
  readonly targetX: number
  readonly visibleReach: number
  readonly maxDamage: number
  readonly damageReach: number
  readonly craterRadius: number
  readonly status: CampaignWarningStatus
  readonly fired: boolean
}

export type CampaignWarningResponse = Readonly<
  | { kind: 'move'; safe: true; destinationX: number; fuelCost: number }
  | { kind: 'shield'; safe: true }
  | { kind: 'destroy-source'; sourceObjectId: string; safe: true }
>

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64
    && /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(value)
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function createCampaignAnnouncedStrike(input: Readonly<{
  id: string
  sourceObjectId: string
  sourceSpawnId: string
  announcedAtHumanCommitment: number
  dueAfterHumanCommitment: number
  targetX: number
  maxDamage: number
  damageReach: number
  craterRadius: number
}>): CampaignAnnouncedStrike {
  if (!identifier(input.id) || !identifier(input.sourceObjectId)
    || !identifier(input.sourceSpawnId)
    || !Number.isSafeInteger(input.announcedAtHumanCommitment)
    || input.announcedAtHumanCommitment < 0
    || !Number.isSafeInteger(input.dueAfterHumanCommitment)
    || input.dueAfterHumanCommitment <= input.announcedAtHumanCommitment
    || !Number.isFinite(input.targetX) || input.targetX < 0 || input.targetX >= CANVAS_WIDTH
    || !finitePositive(input.maxDamage) || !finitePositive(input.damageReach)
    || !finitePositive(input.craterRadius)) {
    throw new Error('invalid campaign announced strike')
  }
  return Object.freeze({
    id: input.id,
    kind: 'announced-strike',
    sourceObjectId: input.sourceObjectId,
    sourceSpawnId: input.sourceSpawnId,
    announcedAtHumanCommitment: input.announcedAtHumanCommitment,
    dueHumanCommitment: input.dueAfterHumanCommitment,
    targetX: input.targetX,
    visibleReach: input.damageReach,
    maxDamage: input.maxDamage,
    damageReach: input.damageReach,
    craterRadius: input.craterRadius,
    status: 'pending',
    fired: false,
  })
}

export function resolveCampaignWarningBoundary(input: Readonly<{
  warning: CampaignAnnouncedStrike
  completedHumanCommitments: number
  sourceAlive: boolean
}>): CampaignAnnouncedStrike {
  if (!Number.isSafeInteger(input.completedHumanCommitments)
    || input.completedHumanCommitments < 0) {
    throw new Error('invalid campaign warning boundary')
  }
  if (input.warning.status !== 'pending') return input.warning
  if (!input.sourceAlive) {
    return Object.freeze({ ...input.warning, status: 'canceled', fired: false })
  }
  if (input.completedHumanCommitments >= input.warning.dueHumanCommitment) {
    return Object.freeze({ ...input.warning, status: 'due', fired: false })
  }
  return input.warning
}

export function markCampaignWarningFired(
  warning: CampaignAnnouncedStrike,
): CampaignAnnouncedStrike {
  if (warning.status !== 'due') throw new Error('campaign warning is not due')
  return Object.freeze({ ...warning, status: 'fired', fired: true })
}

export function resolveCampaignStrikeDamage(
  warning: CampaignAnnouncedStrike,
  x: number,
): number {
  if (!Number.isFinite(x)) throw new Error('invalid campaign strike sample')
  const distance = Math.abs(x - warning.targetX)
  if (distance >= warning.damageReach) return 0
  return warning.maxDamage * (1 - distance / warning.damageReach)
}

function movementDestination(input: Parameters<typeof findCampaignWarningResponses>[0], direction: -1 | 1) {
  let x = input.tank.x
  let y = input.tank.y
  const maxFuel = Math.max(0, Math.floor(input.tank.fuel))
  for (let spent = 1; spent <= maxFuel; spent += 1) {
    const candidateX = x + direction
    if (candidateX < input.tank.width / 2
      || candidateX > CANVAS_WIDTH - input.tank.width / 2) break
    const candidateY = surfaceAt(input.terrain, candidateX)
    if (Math.abs(candidateY - y) > 4) break
    const halfWidth = input.tank.width / 2
    const blocked = input.objects.some(({ alive, collisionBounds }) => alive
      && candidateX - halfWidth < collisionBounds.right
      && candidateX + halfWidth > collisionBounds.left
      && candidateY > collisionBounds.top)
    if (blocked) break
    x = candidateX
    y = candidateY
    const nearestBodyX = Math.abs(x - input.warning.targetX) - halfWidth
    if (nearestBodyX >= input.warning.damageReach) {
      return Object.freeze({ kind: 'move', safe: true, destinationX: x, fuelCost: spent } as const)
    }
  }
  return null
}

export function findCampaignWarningResponses(input: Readonly<{
  warning: CampaignAnnouncedStrike
  tank: Readonly<{ x: number; y: number; width: number; fuel: number }>
  terrain: Uint8Array
  objects: readonly CampaignObjectState[]
  guaranteedShieldCharges: number
  guaranteedSourceShot: boolean
}>): readonly CampaignWarningResponse[] {
  if (!(input.terrain instanceof Uint8Array) || !finitePositive(input.tank.width)
    || !Number.isFinite(input.tank.x) || !Number.isFinite(input.tank.y)
    || !Number.isFinite(input.tank.fuel) || input.tank.fuel < 0
    || !Number.isSafeInteger(input.guaranteedShieldCharges)
    || input.guaranteedShieldCharges < 0) throw new Error('invalid campaign warning response input')
  const responses: CampaignWarningResponse[] = []
  const left = movementDestination(input, -1)
  const right = movementDestination(input, 1)
  const move = [left, right].filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((a, b) => a.fuelCost - b.fuelCost || a.destinationX - b.destinationX)[0]
  if (move) responses.push(move)
  if (input.guaranteedShieldCharges > 0) responses.push(Object.freeze({ kind: 'shield', safe: true }))
  if (input.guaranteedSourceShot) responses.push(Object.freeze({
    kind: 'destroy-source', sourceObjectId: input.warning.sourceObjectId, safe: true,
  }))
  return Object.freeze(responses)
}
