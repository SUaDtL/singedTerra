import type { CampaignAnnouncedStrike } from '@shared/campaign/warnings'
import { surfaceAt } from '@shared/engine/Terrain'

/** Fixed world-space warning marker. Presentation never retargets from a moving tank. */
export class EncounterWarningRenderer {
  draw(
    ctx: CanvasRenderingContext2D,
    warning: CampaignAnnouncedStrike,
    terrain: Uint8Array,
  ): void {
    if (warning.status !== 'pending' && warning.status !== 'due') return
    const y = surfaceAt(terrain, warning.targetX)
    ctx.save()
    ctx.globalAlpha = warning.status === 'due' ? 0.9 : 0.68
    ctx.strokeStyle = '#ffcf4a'
    ctx.fillStyle = '#ffcf4a'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.ellipse(warning.targetX, y, warning.visibleReach, 12, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(warning.targetX, y - 34)
    ctx.lineTo(warning.targetX - 7, y - 46)
    ctx.lineTo(warning.targetX + 7, y - 46)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}
