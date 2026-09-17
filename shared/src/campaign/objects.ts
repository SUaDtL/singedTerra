import type {
  CampaignObjectDefinition,
  CampaignObjectKind,
} from './definitions.ts'
import {
  AIR_PIXEL,
  pixelAt,
  surfaceAt,
} from '../engine/Terrain.ts'

export interface CampaignObjectBounds {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

export interface CampaignObjectSupportSample {
  readonly x: number
  readonly y: number
}

/** Engine-owned, non-seat battlefield entity projected by campaign games. */
export interface CampaignObjectState {
  readonly id: string
  readonly kind: CampaignObjectKind
  readonly x: number
  readonly width: number
  readonly height: number
  readonly maxHealth: number
  readonly health: number
  readonly alive: boolean
  readonly collisionBounds: CampaignObjectBounds
  readonly supportSamples: readonly [
    CampaignObjectSupportSample,
    CampaignObjectSupportSample,
    CampaignObjectSupportSample,
  ]
}

export interface CampaignObjectBlast {
  readonly cx: number
  readonly cy: number
  /** Authoritative damage reach, independent of crater geometry. */
  readonly radius: number
  readonly maxDamage: number
  readonly falloffExponent?: number
}

export interface CampaignObjectBlastResult {
  readonly object: CampaignObjectState
  /** Effective health removed after clamping at zero. */
  readonly damage: number
}

function ownCampaignObject(object: CampaignObjectState): CampaignObjectState {
  return {
    ...object,
    collisionBounds: { ...object.collisionBounds },
    supportSamples: object.supportSamples.map((sample) => ({ ...sample })) as [
      CampaignObjectSupportSample,
      CampaignObjectSupportSample,
      CampaignObjectSupportSample,
    ],
  }
}

/** Build detached object state against the authored opening terrain. */
export function createCampaignObjectStates(
  definitions: readonly CampaignObjectDefinition[],
  terrain: Uint8Array,
): CampaignObjectState[] {
  return definitions.map((definition) => {
    const left = definition.x - definition.width / 2
    const right = definition.x + definition.width / 2
    const leftFootX = Math.ceil(left)
    const centerFootX = Math.floor(definition.x)
    const rightFootX = Math.floor(right)
    const bottom = surfaceAt(terrain, centerFootX)
    const top = bottom - definition.height
    const supportSamples = [
      { x: leftFootX, y: bottom },
      { x: centerFootX, y: bottom },
      { x: rightFootX, y: bottom },
    ] as const

    if (supportSamples.some((sample) =>
      pixelAt(terrain, sample.x, sample.y) <= AIR_PIXEL)) {
      throw new Error(`unsupported campaign object "${definition.id}"`)
    }
    for (let x = leftFootX; x <= rightFootX; x += 1) {
      for (let y = Math.ceil(top); y < bottom; y += 1) {
        if (pixelAt(terrain, x, y) > AIR_PIXEL) {
          throw new Error(`campaign terrain intersects object body for "${definition.id}"`)
        }
      }
    }

    return {
      id: definition.id,
      kind: definition.kind,
      x: definition.x,
      width: definition.width,
      height: definition.height,
      maxHealth: definition.health,
      health: definition.health,
      alive: true,
      collisionBounds: {
        left,
        right,
        top,
        bottom,
      },
      supportSamples,
    }
  })
}

/** Dead objects stay in the result ledger but no longer participate in physics. */
export function isLiveCampaignObject(object: CampaignObjectState): boolean {
  return object.alive && object.health > 0
}

function distanceFromPointToBounds(
  x: number,
  y: number,
  bounds: CampaignObjectBounds,
): number {
  const nearestX = Math.max(bounds.left, Math.min(x, bounds.right))
  const nearestY = Math.max(bounds.top, Math.min(y, bounds.bottom))
  return Math.hypot(x - nearestX, y - nearestY)
}

/** Apply one pure deterministic blast using point-to-AABB distance. */
export function applyCampaignObjectBlast(
  object: CampaignObjectState,
  blast: CampaignObjectBlast,
): CampaignObjectBlastResult {
  const owned = ownCampaignObject(object)
  if (!isLiveCampaignObject(object) || blast.radius <= 0 || blast.maxDamage <= 0) {
    return { object: owned, damage: 0 }
  }

  const distance = distanceFromPointToBounds(blast.cx, blast.cy, object.collisionBounds)
  const edgeEpsilon = 1e-9
  if (distance >= blast.radius - edgeEpsilon) return { object: owned, damage: 0 }

  const exponent = Number.isFinite(blast.falloffExponent)
    && (blast.falloffExponent ?? 0) > 0
    ? blast.falloffExponent!
    : 1
  const rawDamage = blast.maxDamage * (1 - (distance / blast.radius) ** exponent)
  const damage = Math.min(object.health, Math.max(0, rawDamage))
  const health = object.health - damage
  return {
    object: {
      ...owned,
      health,
      alive: health > 0,
    },
    damage,
  }
}
