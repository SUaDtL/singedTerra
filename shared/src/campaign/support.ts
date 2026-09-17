import type { CampaignObjectState } from './objects.ts'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../engine/Terrain.ts'

const SUPPORT_DEPTH = 4

function isSolidAt(terrain: Uint8Array, x: number, y: number): boolean {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  if (xi < 0 || xi >= CANVAS_WIDTH || yi < 0 || yi >= CANVAS_HEIGHT) return false
  return (terrain[yi * CANVAS_WIDTH + xi] ?? 0) > 0
}

/** Count missing opening feet without deriving new support from moved terrain. */
export function countCampaignObjectSupportLoss(
  object: CampaignObjectState,
  terrain: Uint8Array,
): number {
  if (!object.alive || object.health <= 0) return 0
  return object.supportSamples.reduce((lost, sample) => {
    for (let offset = 0; offset <= SUPPORT_DEPTH; offset += 1) {
      if (isSolidAt(terrain, sample.x, sample.y + offset)) return lost
    }
    return lost + 1
  }, 0)
}

/** Two missing opening feet destroy the object; one missing foot survives. */
export function settleCampaignObjectSupport(
  object: CampaignObjectState,
  terrain: Uint8Array,
): CampaignObjectState {
  if (!object.alive || object.health <= 0) return object
  if (countCampaignObjectSupportLoss(object, terrain) < 2) return object
  return {
    ...object,
    health: 0,
    alive: false,
    collisionBounds: { ...object.collisionBounds },
    supportSamples: object.supportSamples.map((sample) => ({ ...sample })) as [
      CampaignObjectState['supportSamples'][number],
      CampaignObjectState['supportSamples'][number],
      CampaignObjectState['supportSamples'][number],
    ],
  }
}
