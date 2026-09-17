import assert from 'node:assert/strict'
import {
  createCampaignIncendiaryZone,
  resolveCampaignZoneExposure,
} from '../../shared/src/campaign/zones.ts'
import { buildBitmap } from '../../shared/src/engine/Terrain.ts'

const terrain = buildBitmap(new Uint16Array(1200).fill(300))
const zone = createCampaignIncendiaryZone({
  id: 'zone-check', centerX: 500, birthCommitmentId: 3, initialRosterSize: 2,
  actorId: 'p2', rootCommitmentId: 3, radius: 48, damage: 12,
})
assert.equal(zone.expiryCommitmentId, 8)
assert.equal(resolveCampaignZoneExposure({
  zones: [zone], commitmentId: 3,
  actingTank: { id: 'p1', x: 500, y: 300, width: 28, height: 20 }, terrain,
}).damage, 0)
assert.equal(resolveCampaignZoneExposure({
  zones: [zone], commitmentId: 4,
  actingTank: { id: 'p1', x: 500, y: 300, width: 28, height: 20 }, terrain,
}).damage, 12)
assert.equal(resolveCampaignZoneExposure({
  zones: [zone], commitmentId: 8,
  actingTank: { id: 'p1', x: 500, y: 300, width: 28, height: 20 }, terrain,
}).zones.length, 0)
console.log('campaign-zones: PASS (birth skip, absolute expiry, one boundary exposure)')
