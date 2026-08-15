/** Integrated numerical firing-solution structure and live telemetry contract. */
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

describe('HUD firing solution', () => {
  it('builds one numerical Firing Solution instead of a second analog computer', () => {
    const { root } = mountHud();
    const solution = root.querySelector('.st-hud__console-solution')!;
    expect(root.querySelector('.st-hud__instruments')).toBeNull();
    expect(root.querySelector('.st-hud__gauge-row')).toBeNull();
    expect(solution.querySelectorAll('.st-hud__solution-adjustment')).toHaveLength(2);
    expect(solution.querySelectorAll('[data-value-owner="angle"]')).toHaveLength(1);
    expect(solution.querySelectorAll('[data-value-owner="power"]')).toHaveLength(1);
    expect(solution.querySelectorAll('[data-value-owner="wind"]')).toHaveLength(1);
    expect(solution.querySelector('.st-hud__solution-wind [data-ui="deterministic-aim-guide"]'))
      .toBeTruthy();
  });

  it('renders calm and signed wind as the one live solution value', () => {
    const { root, hud, engine } = mountHud();
    const state = engine.getState();
    const wind = root.querySelector<HTMLOutputElement>('.st-hud__solution-wind output')!;
    state.wind = 0;
    hud.update(state);
    expect(wind.textContent).toBe('Calm');
    state.wind = MAX_WIND;
    hud.update(state);
    expect(wind.textContent).toBe(`${MAX_WIND.toFixed(1)} right`);
    state.wind = -MAX_WIND;
    hud.update(state);
    expect(wind.textContent).toBe(`${MAX_WIND.toFixed(1)} left`);
  });

  it('updates the one numerical angle value for cardinal directions', () => {
    const { root, hud, engine } = mountHud();
    const state = engine.getState();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    const angle = root.querySelector<HTMLOutputElement>('[data-value-owner="angle"] output')!;
    expect(angle.textContent).toBe('45°');
    tank.angle = 90;
    hud.update(state);
    expect(angle.textContent).toBe('90°');
    tank.angle = 180;
    hud.update(state);
    expect(angle.textContent).toBe('0°');
  });

  it('updates the one numerical power value without a redundant dial', () => {
    const { root, hud, engine } = mountHud();
    const state = engine.getState();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    const power = root.querySelector<HTMLOutputElement>('[data-value-owner="power"] output')!;
    tank.power = 0;
    hud.update(state);
    expect(power.textContent).toBe('0');
    tank.power = 50;
    hud.update(state);
    expect(power.textContent).toBe('50');
    tank.power = 100;
    hud.update(state);
    expect(power.textContent).toBe('100');
  });
});
