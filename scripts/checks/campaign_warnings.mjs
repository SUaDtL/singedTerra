import assert from 'node:assert/strict'
import { buildBitmap } from '../../shared/src/engine/Terrain.ts'
import {
  createCampaignAnnouncedStrike,
  findCampaignWarningResponses,
  resolveCampaignStrikeDamage,
  resolveCampaignWarningBoundary,
} from '../../shared/src/campaign/warnings.ts'

const warning = createCampaignAnnouncedStrike({
  id: 'warning-check', sourceObjectId: 'relay', sourceSpawnId: 'p2',
  announcedAtHumanCommitment: 1, dueAfterHumanCommitment: 2,
  targetX: 500, maxDamage: 35, damageReach: 55, craterRadius: 24,
})
assert.equal(warning.targetX, 500)
assert.equal(warning.visibleReach, warning.damageReach)
assert.equal(resolveCampaignWarningBoundary({
  warning, completedHumanCommitments: 2, sourceAlive: false,
}).status, 'canceled')
assert.equal(resolveCampaignStrikeDamage(warning, 556), 0)
assert.deepEqual(findCampaignWarningResponses({
  warning, tank: { x: 500, y: 300, width: 28, fuel: 0 },
  terrain: buildBitmap(new Uint16Array(1200).fill(300)), objects: [],
  guaranteedShieldCharges: 0, guaranteedSourceShot: false,
}), [])
console.log('campaign-warnings: PASS (fixed target, cancellation, actual reach, legal response)')
