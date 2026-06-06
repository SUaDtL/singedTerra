import type { GameState } from '@shared/types/GameState';
import { TerrainRenderer } from './TerrainRenderer';
import { TankRenderer } from './TankRenderer';
import { ProjectileRenderer } from './ProjectileRenderer';
import { HUDRenderer } from './HUDRenderer';

/**
 * Renderer owns the Canvas 2D draw loop and orchestrates the sub-renderers.
 * Draw order (SPEC §7):
 *   1. Sky gradient (static / on resize)
 *   2. Terrain fill (when dirty)
 *   3. Tanks
 *   4. Projectile (during FIRING)
 *   5. Explosion effect
 *   6. HUD overlay (HTML/CSS — see ui/HUD.ts; canvas slot is a no-op)
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrain = new TerrainRenderer();
  private readonly tanks = new TankRenderer();
  private readonly projectile = new ProjectileRenderer();
  private readonly hud = new HUDRenderer();

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to acquire 2D rendering context');
    this.ctx = ctx;
  }

  /** Draw a single frame for the given state. */
  render(_state: GameState): void {
    throw new Error('Renderer.render not implemented');
  }

  private drawSky(): void {
    throw new Error('Renderer.drawSky not implemented');
  }
}
