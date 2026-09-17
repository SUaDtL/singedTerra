import { describe, expect, it, vi } from 'vitest'
import { buildBitmap } from '@shared/engine/Terrain'
import { createCampaignAnnouncedStrike } from '@shared/campaign/warnings'
import { EncounterWarningRenderer } from './EncounterWarningRenderer'

describe('EncounterWarningRenderer', () => {
  it('draws the fixed visible reach from canonical warning state', () => {
    const context = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(),
      stroke: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
      setLineDash: vi.fn(), globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1,
    } as unknown as CanvasRenderingContext2D
    const warning = createCampaignAnnouncedStrike({
      id: 'warning-1', sourceObjectId: 'relay', sourceSpawnId: 'p2',
      announcedAtHumanCommitment: 0, dueAfterHumanCommitment: 1,
      targetX: 500, maxDamage: 35, damageReach: 55, craterRadius: 24,
    })
    new EncounterWarningRenderer().draw(
      context,
      warning,
      buildBitmap(new Uint16Array(1200).fill(300)),
    )
    expect(context.ellipse).toHaveBeenCalledWith(500, 300, 55, 12, 0, 0, Math.PI * 2)
    expect(context.setLineDash).toHaveBeenNthCalledWith(1, [6, 5])
    expect(context.restore).toHaveBeenCalledOnce()
  })
})
