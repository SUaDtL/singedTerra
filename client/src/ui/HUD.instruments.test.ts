/** Fire-control console structure and live telemetry contract. */
import { describe, it, expect } from 'vitest';
import { HUD } from './HUD';
import { GameEngine } from '@shared/engine/GameEngine';
import { MAX_WIND } from '@shared/engine/Physics';

function mountHud(): { root: HTMLElement; hud: HUD; engine: GameEngine } {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
  const hud = new HUD(root, overlay, modal, overlay);
  // A deterministic 2-player game — seed fixed so tank angle/power are stable.
  const engine = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  });
  hud.update(engine.getState());
  return { root, hud, engine };
}

describe('HUD instrument cluster', () => {
  it('builds one semantic two-tier analog console without a numeric substitute', () => {
    const { root } = mountHud();

    expect(root.querySelector('.st-hud__instr-title')?.textContent)
      .toBe('Ballistic Computer');
    expect(root.querySelectorAll('.st-hud__gauge-label')).toHaveLength(3);
    expect(root.querySelector('.st-hud__gauge-nums')).toBeNull();
    expect(root.querySelector('.st-hud__gauge-cell--elevation')?.textContent)
      .toContain('Angle');
    expect(root.querySelector('.st-hud__gauge-cell--power')?.textContent)
      .toContain('Power');
    expect(root.querySelector('.st-hud__gauge-cell--wind')?.textContent)
      .toContain('Wind');
  });

  it('uses a full-width wind rail with exact signed, clamped marker travel', () => {
    const { root, hud, engine } = mountHud();
    const wind = root.querySelector<SVGSVGElement>(
      '.st-hud__gauge-cell--wind svg',
    );
    const marker = root.querySelector<SVGRectElement>(
      '.st-hud__gauge-needle-rect',
    );
    const label = wind?.querySelector('.st-hud__gauge-label');

    expect(wind?.getAttribute('viewBox')).toBe('0 0 144 52');
    expect(wind?.querySelector('.st-hud__gauge-track-rect')?.getAttribute('x'))
      .toBe('8');
    expect(wind?.querySelector('.st-hud__gauge-track-rect')?.getAttribute('width'))
      .toBe('128');
    expect(label?.getAttribute('x')).toBe('72');

    const state = engine.getState();
    state.wind = 0;
    hud.update(state);
    expect(marker?.getAttribute('x')).toBe('68');
    expect(marker?.getAttribute('transform')).toBe('rotate(45, 72, 22)');
    expect(label?.textContent).toBe('• 0.0');

    state.wind = MAX_WIND;
    hud.update(state);
    expect(marker?.getAttribute('x')).toBe('126');
    expect(marker?.getAttribute('transform')).toBe('rotate(45, 130, 22)');
    expect(label?.textContent).toBe(`→ ${MAX_WIND.toFixed(1)}`);

    state.wind = -MAX_WIND;
    hud.update(state);
    expect(marker?.getAttribute('x')).toBe('10');
    expect(marker?.getAttribute('transform')).toBe('rotate(45, 14, 22)');
    expect(label?.textContent).toBe(`← ${MAX_WIND.toFixed(1)}`);

    state.wind = MAX_WIND * 2;
    hud.update(state);
    expect(marker?.getAttribute('x')).toBe('126');
    expect(marker?.getAttribute('transform')).toBe('rotate(45, 130, 22)');
  });

  it('points the elevation needle toward cardinal and diagonal firing directions', () => {
    const { root, hud, engine } = mountHud();
    const needle = root.querySelector<SVGLineElement>('.st-hud__gauge-needle');
    const label = root.querySelector<SVGTextElement>(
      '.st-hud__gauge-cell--elevation .st-hud__gauge-label',
    );
    const state = engine.getState();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;

    // Player 1 starts at global angle 45°: up and to the RIGHT.
    expect(needle?.getAttribute('transform')).toBe('rotate(45, 36, 40)');
    expect(label?.textContent).toBe('45▶');
    expect(label?.getAttribute('aria-label')).toBe('45 degrees, right');

    tank.angle = 0;
    hud.update(state);
    expect(needle?.getAttribute('transform')).toBe('rotate(90, 36, 40)');
    expect(label?.textContent).toBe('0▶');

    tank.angle = 90;
    hud.update(state);
    expect(needle?.getAttribute('transform')).toBe('rotate(0, 36, 40)');
    expect(label?.textContent).toBe('90▲');

    tank.angle = 135;
    hud.update(state);
    expect(needle?.getAttribute('transform')).toBe('rotate(-45, 36, 40)');
    expect(label?.textContent).toBe('45◀');

    tank.angle = 180;
    hud.update(state);
    expect(needle?.getAttribute('transform')).toBe('rotate(-90, 36, 40)');
    expect(label?.textContent).toBe('0◀');
    expect(label?.getAttribute('aria-label')).toBe('0 degrees, left');
  });

  it('gives elevation and power matching dial geometry', () => {
    const { root } = mountHud();
    const elevation = root.querySelector<SVGSVGElement>(
      '.st-hud__gauge-cell--elevation svg',
    );
    const power = root.querySelector<SVGSVGElement>(
      '.st-hud__gauge-cell--power svg',
    );

    expect(power?.getAttribute('viewBox')).toBe(elevation?.getAttribute('viewBox'));
    expect(power?.querySelector('.st-hud__gauge-track')?.getAttribute('d'))
      .toBe(elevation?.querySelector('.st-hud__gauge-track')?.getAttribute('d'));
    expect(power?.querySelector('.st-hud__gauge-label')?.getAttribute('y'))
      .toBe(elevation?.querySelector('.st-hud__gauge-label')?.getAttribute('y'));
  });

  it('never hides the analog grid behind the compact-scale class', () => {
    mountHud();
    const css = document.getElementById('st-hud-style')?.textContent ?? '';

    expect(css).not.toMatch(
      /#app\.is-compact\s+\.st-hud__gauge-row\s*\{\s*display:\s*none/,
    );
    expect(css).toContain('grid-template-areas:');
  });

  it('aligns the power number with the elevation label baseline', () => {
    const { root } = mountHud();
    const pwrLabel = root.querySelector('.st-hud__gauge-label--lg');
    expect(pwrLabel?.getAttribute('y')).toBe('52');
  });

  it('fills the power arc from zero to the active tank cap and updates its label', () => {
    const { root, hud, engine } = mountHud();
    const arc = root.querySelector<SVGPathElement>('.st-hud__gauge-power-fill');
    const label = root.querySelector<SVGTextElement>('.st-hud__gauge-label--lg');
    const state = engine.getState();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;

    tank.powerCap = 100;
    tank.power = 0;
    hud.update(state);
    expect(arc?.getAttribute('stroke-dasharray')).toBe('0.00 94.25');
    expect(label?.textContent).toBe('0');

    tank.power = 50;
    hud.update(state);
    expect(arc?.getAttribute('stroke-dasharray')).toBe('47.12 47.12');
    expect(label?.textContent).toBe('50');

    tank.power = 100;
    hud.update(state);
    expect(arc?.getAttribute('stroke-dasharray')).toBe('94.25 0.00');
    expect(label?.textContent).toBe('100');

    tank.powerCap = 200;
    tank.power = 50;
    hud.update(state);
    expect(arc?.getAttribute('stroke-dasharray')).toBe('23.56 70.69');
    expect(label?.textContent).toBe('50');
  });
});
