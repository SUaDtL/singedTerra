import type { ProjectileState } from '@shared/types/GameState';

/**
 * ProjectileRenderer draws the in-flight projectile during the FIRING phase,
 * plus the expanding-circle explosion burst on impact (SPEC §7).
 */
export class ProjectileRenderer {
  draw(_ctx: CanvasRenderingContext2D, _projectile: ProjectileState): void {
    throw new Error('ProjectileRenderer.draw not implemented');
  }
}
