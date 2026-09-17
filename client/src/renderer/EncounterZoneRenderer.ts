import type { CampaignIncendiaryZone } from '@shared/campaign/zones'
import { projectCampaignZoneSurface } from '@shared/campaign/zones'

/** World-space, terrain-following campaign hazard presentation. No hit-test ownership. */
export class EncounterZoneRenderer {
  draw(
    ctx: CanvasRenderingContext2D,
    zones: readonly CampaignIncendiaryZone[],
    terrain: Uint8Array,
  ): void {
    for (const zone of zones) {
      const points = projectCampaignZoneSurface(zone, terrain, 4)
      if (points.length < 2) continue
      ctx.save()
      ctx.globalAlpha = 0.72
      ctx.strokeStyle = '#ff6a1f'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(points[0]!.x, points[0]!.y - 2)
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y - 2)
      ctx.stroke()
      ctx.globalAlpha = 0.48
      ctx.strokeStyle = '#ffd34d'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    }
  }
}
