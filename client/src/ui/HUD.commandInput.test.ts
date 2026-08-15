import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { HUD } from './HUD';

interface MountedCommands {
  root: HTMLElement;
  overlay: HTMLElement;
  modal: HTMLElement;
  rail: HTMLElement;
  hud: HUD;
}

function mount(): MountedCommands {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  const rail = document.createElement('div');
  rail.id = 'battle-rail';
  document.body.append(root, overlay, modal, rail);
  const hud = new HUD(root, overlay, modal, rail);
  const state = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  }).getState();
  hud.update(state, false, true);
  return { root, overlay, modal, rail, hud };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD command input console', () => {
  it('builds one real firing solution with hints attached to their controls', () => {
    const { rail } = mount();
    const solution = rail.querySelector<HTMLElement>('[data-ui="firing-solution"]')!;
    const weaponBay = solution.querySelector<HTMLElement>('[data-ui="weapon-bay"]')!;
    const controls = [...solution.querySelectorAll<HTMLButtonElement>(
      '.st-hud__solution-control',
    )];
    const angle = solution.querySelector<HTMLElement>('[data-control="angle"]')!;
    const power = solution.querySelector<HTMLElement>('[data-control="power"]')!;
    const wind = solution.querySelector<HTMLElement>('[data-value-owner="wind"]')!;
    const guide = solution.querySelector<HTMLElement>('[data-ui="deterministic-aim-guide"]')!;

    expect(solution.getAttribute('aria-label')).toBe('Firing solution');
    expect(solution.querySelectorAll('[data-ui="weapon-bay"]')).toHaveLength(1);
    expect(weaponBay.getAttribute('aria-label')).toBe('Weapon and ammunition');
    expect(weaponBay.querySelector('.st-hud__weapon-value')?.textContent).toBe('Baby Missile');
    expect(weaponBay.querySelector('.st-hud__weapon-ammo')?.textContent).toBe('∞');
    expect(controls.map((button) => button.dataset['commandAction'])).toEqual([
      'weapon-next',
      'aim-left',
      'aim-right',
      'power-down',
      'power-up',
    ]);
    expect([...angle.querySelectorAll('kbd')].map((key) => key.textContent))
      .toEqual(['←', '→']);
    expect([...power.querySelectorAll('kbd')].map((key) => key.textContent))
      .toEqual(['↓', '↑']);
    expect(weaponBay.querySelector('[data-command-action="weapon-next"] kbd')?.textContent)
      .toBe('Q');
    expect(wind.textContent).toMatch(/Wind(?:Calm|\d+\.\d (?:left|right))/);
    expect(guide.textContent).toContain('Guide');
    expect(guide.querySelector('kbd')?.textContent).toBe('G');
    expect(solution.querySelector('[data-ui="command-deck"]')).toBeNull();
    expect(solution.querySelector('.st-hud__control-grid')).toBeNull();
    expect(solution.querySelector('[data-command-action^="fire-"]')).toBeNull();
    expect(solution.querySelector('[data-command-action^="move-"]')).toBeNull();
    expect(rail.querySelectorAll('.st-hud__primary-action')).toHaveLength(1);
  });

  it('routes every firing-solution control through the existing causal callbacks', () => {
    const { rail, hud } = mount();
    const angles = vi.fn();
    const powers = vi.fn();
    const weapons = vi.fn();
    hud.onTouchAngle(angles);
    hud.onTouchPower(powers);
    hud.onTouchWeapon(weapons);

    const solution = rail.querySelector<HTMLElement>('[data-ui="firing-solution"]')!;
    const buttons = [...solution.querySelectorAll<HTMLButtonElement>(
      '.st-hud__solution-control',
    )];

    expect(buttons.map((button) => button.dataset['commandAction'])).toEqual([
      'weapon-next',
      'aim-left',
      'aim-right',
      'power-down',
      'power-up',
    ]);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Select next weapon, current Baby Missile',
      'Aim barrel left',
      'Aim barrel right',
      'Decrease power',
      'Increase power',
    ]);

    for (const button of buttons) button.click();
    expect(angles.mock.calls).toEqual([[3], [-3]]);
    expect(powers.mock.calls).toEqual([[-3], [3]]);
    expect(weapons).toHaveBeenCalledTimes(1);
  });

  it('keeps firing-solution availability aligned with local action gates', () => {
    const { rail, hud } = mount();
    const engine = new GameEngine({
      players: [
        { name: 'Alice', color: '#e84d4d' },
        { name: 'Bob', color: '#4d8ce8' },
      ],
      maxPlayers: 2,
      seed: 1,
    });
    const state = engine.getState();
    const button = (action: string): HTMLButtonElement =>
      rail.querySelector<HTMLButtonElement>(
        `.st-hud__solution-control[data-command-action="${action}"]`,
      )!;

    hud.update(state, false, false);
    const controlled = [...rail.querySelectorAll<HTMLButtonElement>(
      '.st-hud__solution-control',
    )];
    expect(controlled).toHaveLength(5);
    expect(controlled.every((entry) => entry.disabled)).toBe(true);
    expect(controlled.every((entry) => entry.getAttribute('aria-disabled') === 'true'))
      .toBe(true);

    hud.update(state, false, true);
    expect(controlled.every((entry) => !entry.disabled)).toBe(true);
    expect(controlled.every((entry) => entry.getAttribute('aria-disabled') === 'false'))
      .toBe(true);

    state.tanks[0]!.alive = false;
    hud.update(state, false, true);
    expect(controlled.every((entry) => entry.disabled)).toBe(true);

    state.tanks[0]!.alive = true;
    state.phase = 'FIRING';
    hud.update(state, false, true);
    expect(controlled.every((entry) => entry.disabled)).toBe(true);

    state.phase = 'PLAYER_TURN';
    hud.update(state, true, true);
    expect(controlled.every((entry) => entry.disabled)).toBe(true);

    state.tanks[0]!.selectedWeapon = 'nuke';
    state.tanks[0]!.inventory.nuke.count = 0;
    hud.update(state, false, true);
    expect(button('weapon-next').disabled).toBe(false);
    expect(button('weapon-next').getAttribute('aria-label'))
      .toBe('Select next weapon, current Nuke');
  });

  it('isolates the firing controls and restores focus when the Arsenal closes', () => {
    const { rail } = mount();
    const controls = rail.querySelector<HTMLElement>('[data-ui="solution-adjustments"]')!;
    const toggle = rail.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    expect(controls.inert).toBe(false);
    expect(controls.getAttribute('aria-hidden')).toBeNull();
    toggle.click();
    const drawerClose = document.querySelector<HTMLButtonElement>('.st-hud__arsenal-drawer-close')!;
    expect(controls.inert).toBe(true);
    expect(controls.getAttribute('aria-hidden')).toBe('true');
    expect(toggle.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(drawerClose);
    drawerClose.click();
    expect(document.activeElement).toBe(toggle);
    expect(controls.inert).toBe(false);
    expect(controls.getAttribute('aria-hidden')).toBeNull();
  });

  it('keeps touch on the one semantic rail instead of building an overlay deck', () => {
    const { root, overlay, rail } = mount();
    const console = rail.querySelector<HTMLElement>('.st-hud__command-console')!;

    expect(document.querySelector('.st-hud__touch-strip')).toBeNull();
    expect(console).not.toBeNull();
    expect(console.querySelectorAll('.st-hud__solution-control')).toHaveLength(5);
    expect(console.querySelectorAll('.st-hud__move-btn')).toHaveLength(2);
    expect(console.querySelectorAll('.st-hud__primary-action')).toHaveLength(1);
    expect(root.querySelectorAll('.st-hud__primary-action')).toHaveLength(0);
  });

  it('routes touch activation through the same rail controls and causal callbacks', () => {
    const { rail, hud } = mount();
    const angles = vi.fn();
    const powers = vi.fn();
    const moves = vi.fn();
    const weapons = vi.fn();
    hud.onTouchAngle(angles);
    hud.onTouchPower(powers);
    hud.onMove(moves);
    hud.onTouchWeapon(weapons);

    const click = (selector: string): void => {
      rail.querySelector<HTMLButtonElement>(selector)!.click();
    };
    click('[data-command-action="aim-left"]');
    click('[data-command-action="aim-right"]');
    click('[data-command-action="power-down"]');
    click('[data-command-action="power-up"]');
    click('[data-move="-8"]');
    click('[data-move="8"]');
    click('[data-command-action="weapon-next"]');

    expect(angles.mock.calls).toEqual([[3], [-3]]);
    expect(powers.mock.calls).toEqual([[-3], [3]]);
    expect(moves.mock.calls).toEqual([[-8], [8]]);
    expect(weapons).toHaveBeenCalledTimes(1);
  });

  it('retains the shared disabled and aria-disabled state on every rail command', () => {
    const { rail, hud } = mount();
    const controlled = [...rail.querySelectorAll<HTMLButtonElement>(
      '.st-hud__solution-control, .st-hud__move-btn',
    )];
    const state = new GameEngine({
      players: [
        { name: 'Alice', color: '#e84d4d' },
        { name: 'Bob', color: '#4d8ce8' },
      ],
      maxPlayers: 2,
      seed: 1,
    }).getState();

    hud.update(state, false, false);
    expect(controlled.every((button) => button.disabled)).toBe(true);
    expect(controlled.every((button) => button.getAttribute('aria-disabled') === 'true')).toBe(true);

    hud.update(state, false, true);
    expect(controlled.every((button) => !button.disabled)).toBe(true);
    expect(controlled.every((button) => button.getAttribute('aria-disabled') === 'false')).toBe(true);
  });
});
