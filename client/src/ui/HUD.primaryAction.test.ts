import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import { HUD } from './HUD';

function mount(): {
  root: HTMLElement;
  hud: HUD;
  state: GameState;
  action: () => HTMLButtonElement;
} {
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
  const state = engine.getState();
  hud.update(state, false, true);
  return {
    root,
    hud,
    state,
    action: () => root.querySelector<HTMLButtonElement>('.st-hud__primary-action')!,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD unified primary action', () => {
  it('renders one named rail action and removes the duplicate touch-only Fire control', () => {
    const { root, action } = mount();

    expect(root.querySelectorAll('.st-hud__primary-action')).toHaveLength(1);
    expect(root.querySelector('.st-hud__touch-fire')).toBeNull();
    expect(action().querySelector('svg')?.dataset['icon']).toBe('fire');
    expect(action().textContent).toContain('Fire');
    expect(action().getAttribute('aria-label')).toBe('Fire Baby Missile');
    expect(action().disabled).toBe(false);
  });

  it('adapts the action to Shield and dispatches exactly once per activation', () => {
    const { hud, state, action } = mount();
    const onAction = vi.fn();
    hud.onPrimaryAction(onAction);
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.selectedWeapon = 'shield';

    hud.update(state, false, true);
    expect(action().textContent).toContain('Activate shield');
    expect(action().getAttribute('aria-label')).toBe('Activate shield');

    action().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    action().click();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('uses the shield activation affordance for Heavy Shield', () => {
    const { hud, state, action } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.selectedWeapon = 'heavy_shield';

    hud.update(state, false, true);
    expect(action().textContent).toContain('Activate shield');
    expect(action().getAttribute('aria-label')).toBe('Activate shield');
  });

  it('disables a selected finite action at zero ammo and re-enables it when stocked', () => {
    const { hud, state, action } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.selectedWeapon = 'shield';
    tank.inventory.shield = { count: 0, unlimited: false };

    hud.update(state, false, true);
    expect(action().textContent).toContain('Activate shield');
    expect(action().disabled).toBe(true);

    tank.inventory.shield.count = 1;
    hud.update(state, false, true);
    expect(action().disabled).toBe(false);
  });

  it('removes the action when control is unavailable, a shot is pending, or the phase cannot act', () => {
    const { root, hud, state, action } = mount();
    const selected = vi.fn();
    hud.onWeaponSelect(selected);

    hud.update(state, false, false);
    expect(root.querySelector('.st-hud__primary-action')).toBeNull();
    const weapon = document.querySelector<HTMLButtonElement>(
      '.st-hud__weapon-btn[data-weapon="baby_missile"]',
    )!;
    expect(weapon.disabled).toBe(true);
    weapon.click();
    expect(selected).not.toHaveBeenCalled();

    hud.update(state, false, true);
    expect(action().disabled).toBe(false);

    hud.update(state, true, true);
    expect(root.querySelector('.st-hud__primary-action')).toBeNull();

    state.phase = 'RESOLVING';
    hud.update(state, false, true);
    expect(root.querySelector('.st-hud__primary-action')).toBeNull();
  });
});
