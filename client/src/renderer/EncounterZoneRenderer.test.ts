import { describe, expect, it, vi } from 'vitest'
import { buildBitmap } from '@shared/engine/Terrain'
import { createCampaignIncendiaryZone } from '@shared/campaign/zones'
import { EncounterZoneRenderer } from './EncounterZoneRenderer'

describe('EncounterZoneRenderer', () => {
  it('draws a terrain-following world-space strip without owning interaction', () => {
    const context = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), stroke: vi.fn(), globalAlpha: 1, strokeStyle: '',
      lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    } as unknown as CanvasRenderingContext2D
    const terrain = buildBitmap(new Uint16Array(1200).fill(300))
    new EncounterZoneRenderer().draw(context, [createCampaignIncendiaryZone({
      id: 'zone-1', centerX: 500, birthCommitmentId: 1, initialRosterSize: 2,
      actorId: 'p1', rootCommitmentId: 1, radius: 48, damage: 12,
    })], terrain)
    expect(context.moveTo).toHaveBeenCalledWith(452, 298)
    expect(context.lineTo).toHaveBeenCalledWith(548, 298)
    expect(context.stroke).toHaveBeenCalledTimes(2)
    expect(context.restore).toHaveBeenCalledOnce()
  })
})
