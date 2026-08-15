import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { HUD } from './HUD';

interface MountedCommands {
  root: HTMLElement;
  overlay: HTMLElement;
  modal: HTMLElement;
  hud: HUD;
}

function mount(): MountedCommands {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
  const hud = new HUD(root, overlay, modal, overlay);
  const state = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  }).getState();
  hud.update(state, false, true);
  return { root, overlay, modal, hud };
}

function pointerEvent(type: string, pointerId = 1): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
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
    const { root } = mount();
    const solution = root.querySelector<HTMLElement>('[data-ui="firing-solution"]')!;
    const weaponBay = solution.querySelector<HTMLElement>('[data-ui="weapon-bay"]')!;
    const controls = [...solution.querySelectorAll<HTMLButtonElement>(
      '.st-hud__solution-control',
    )];
    const angle = solution.querySelector<HTMLElement>('[data-control="angle"]')!;
    const power = solution.querySelector<HTMLElement>('[data-control="power"]')!;
    const wind = solution.querySelector<HTMLElement>('.st-hud__gauge-cell--wind')!;
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
    expect(wind.querySelector('.st-hud__gauge-label')?.textContent).toMatch(/^[←→•] \d+\.\d$/);
    expect(guide.textContent).toContain('Trajectory guide');
    expect(guide.querySelector('kbd')?.textContent).toBe('G');
    expect(solution.querySelector('[data-ui="command-deck"]')).toBeNull();
    expect(solution.querySelector('.st-hud__control-grid')).toBeNull();
    expect(solution.querySelector('[data-command-action^="fire-"]')).toBeNull();
    expect(solution.querySelector('[data-command-action^="move-"]')).toBeNull();
    expect(root.querySelectorAll('.st-hud__primary-action')).toHaveLength(1);
  });

  it('routes every firing-solution control through the existing causal callbacks', () => {
    const { root, hud } = mount();
    const angles = vi.fn();
    const powers = vi.fn();
    const weapons = vi.fn();
    hud.onTouchAngle(angles);
    hud.onTouchPower(powers);
    hud.onTouchWeapon(weapons);

    const solution = root.querySelector<HTMLElement>('[data-ui="firing-solution"]')!;
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
    const { root, hud } = mount();
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
      root.querySelector<HTMLButtonElement>(
        `.st-hud__solution-control[data-command-action="${action}"]`,
      )!;

    hud.update(state, false, false);
    const controlled = [...root.querySelectorAll<HTMLButtonElement>(
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
    const { root } = mount();
    const controls = root.querySelector<HTMLElement>('[data-ui="solution-adjustments"]')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    expect(controls.inert).toBe(false);
    expect(controls.getAttribute('aria-hidden')).toBeNull();
    toggle.click();
    expect(controls.inert).toBe(true);
    expect(controls.getAttribute('aria-hidden')).toBe('true');
    toggle.click();
    expect(document.activeElement).toBe(toggle);
    expect(controls.inert).toBe(false);
    expect(controls.getAttribute('aria-hidden')).toBeNull();
  });

  it('builds one grouped Touch Command Deck with bounded directional icons', () => {
    const { root, overlay } = mount();
    const dock = overlay.querySelector<HTMLElement>('.st-hud__touch-strip')!;
    const buttons = [...dock.querySelectorAll<HTMLButtonElement>('.st-hud__touch-btn')];
    const groups = [...dock.querySelectorAll<HTMLElement>('.st-hud__touch-group')];

    expect(dock.parentElement).toBe(overlay);
    expect(root.querySelector('.st-hud__touch-strip')).toBeNull();
    expect(dock.getAttribute('role')).toBe('toolbar');
    expect(dock.getAttribute('aria-label')).toBe('Touch commands');
    expect(dock.querySelector('.st-hud__touch-title')?.textContent).toBe('Command Deck');
    expect(dock.querySelector('.st-hud__touch-mode')?.textContent).toBe('Touch');
    expect(groups.map((group) => group.getAttribute('role'))).toEqual([
      'group',
      'group',
      'group',
    ]);
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Aim',
      'Power',
      'Drive',
    ]);
    expect(groups.map((group) => group.querySelector('.st-hud__touch-group-title')?.textContent))
      .toEqual(['Aim', 'Power', 'Drive']);
    expect(groups.map((group) => [...group.querySelectorAll('.st-hud__touch-label')]
      .map((label) => label.textContent))).toEqual([
      ['Left', 'Right'],
      ['Less', 'More'],
      ['Left', 'Right'],
    ]);
    expect(buttons.map((button) => button.dataset['command'])).toEqual([
      'aim-left',
      'aim-right',
      'power-down',
      'power-up',
      'move-left',
      'move-right',
      'weapon',
      'menu',
    ]);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Aim barrel left',
      'Aim barrel right',
      'Decrease power',
      'Increase power',
      'Move tank left, 8 fuel maximum',
      'Move tank right, 8 fuel maximum',
      'Cycle weapon, current Baby Missile',
      'Open menu',
    ]);
    expect(buttons.map((button) => button.querySelector('.st-hud__touch-label')?.textContent))
      .toEqual(['Left', 'Right', 'Less', 'More', 'Left', 'Right', 'Baby Missile', 'Menu']);
    expect(buttons.map((button) => button.querySelector('.st-ui-icon')?.getAttribute('data-icon')))
      .toEqual(['left', 'right', 'decrease', 'increase', 'left', 'right', 'weapon', 'menu']);
    expect(groups.flatMap((group) => [...group.querySelectorAll<HTMLButtonElement>('button')]
      .map((button) => button.dataset['firstSalvoTarget'] ?? null))).toEqual([
      'aim',
      'aim',
      'power-and-wind',
      'power-and-wind',
      null,
      null,
    ]);
    expect(
      buttons.at(-1)?.querySelector('.st-ui-glyph')?.getAttribute('data-glyph'),
    ).toBe('menu');
    expect(dock.querySelectorAll('[data-command="fire"]')).toHaveLength(0);
    expect(root.querySelectorAll('.st-hud__primary-action')).toHaveLength(1);
  });

  it('retains disabled and aria-disabled states after regrouping', () => {
    const { overlay, hud } = mount();
    const controlled = [...overlay.querySelectorAll<HTMLButtonElement>(
      '.st-hud__touch-btn:not([data-command="menu"])',
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

  it('routes the touch Menu through the existing non-destructive pause surface', () => {
    const { overlay, modal, hud } = mount();
    const pauseChanges = vi.fn<(paused: boolean) => void>();
    hud.onPauseChange(pauseChanges);
    const pause = modal.querySelector<HTMLElement>('[data-ui="command-menu"]')!;

    overlay.querySelector<HTMLButtonElement>('[data-command="menu"]')!.click();
    expect(hud.isPaused()).toBe(true);
    expect(pause.classList.contains('st-hud__overlay--hidden')).toBe(false);

    [...pause.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Resume')!
      .click();
    expect(hud.isPaused()).toBe(false);
    expect(pause.classList.contains('st-hud__overlay--hidden')).toBe(true);
    expect(pauseChanges.mock.calls).toEqual([[true], [false]]);
  });

  it('maps visible touch directions to causal signed deltas and preserves repeat cadence', () => {
    vi.useFakeTimers();
    const { overlay, hud } = mount();
    const angles = vi.fn();
    const powers = vi.fn();
    const moves = vi.fn();
    const weapons = vi.fn();
    hud.onTouchAngle(angles);
    hud.onTouchPower(powers);
    hud.onMove(moves);
    hud.onTouchWeapon(weapons);

    const button = (command: string): HTMLButtonElement => {
      const target = overlay.querySelector<HTMLButtonElement>(
        `.st-hud__touch-btn[data-command="${command}"]`,
      )!;
      target.setPointerCapture = vi.fn();
      return target;
    };
    const left = button('aim-left');
    const right = button('aim-right');
    const powerDown = button('power-down');
    const powerUp = button('power-up');

    left.dispatchEvent(pointerEvent('pointerdown'));
    expect(angles).toHaveBeenLastCalledWith(3);
    expect(angles).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(479);
    expect(angles).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(angles).toHaveBeenCalledTimes(2);
    left.dispatchEvent(pointerEvent('pointerup'));
    vi.advanceTimersByTime(160);
    expect(angles).toHaveBeenCalledTimes(2);

    right.dispatchEvent(pointerEvent('pointerdown', 2));
    expect(angles).toHaveBeenLastCalledWith(-3);
    right.dispatchEvent(pointerEvent('pointerup', 2));
    powerDown.dispatchEvent(pointerEvent('pointerdown', 3));
    expect(powers).toHaveBeenLastCalledWith(-3);
    powerDown.dispatchEvent(pointerEvent('pointerup', 3));
    powerUp.dispatchEvent(pointerEvent('pointerdown', 4));
    expect(powers).toHaveBeenLastCalledWith(3);
    powerUp.dispatchEvent(pointerEvent('pointerup', 4));

    button('move-left').click();
    expect(moves).toHaveBeenLastCalledWith(-8);
    button('move-right').click();
    expect(moves).toHaveBeenLastCalledWith(8);
    button('weapon').click();
    expect(weapons).toHaveBeenCalledTimes(1);

    left.click();
    expect(angles).toHaveBeenLastCalledWith(3);
    expect(angles).toHaveBeenCalledTimes(4);
  });

  it('keeps one hold owner per stepper and never leaves a multi-touch repeat running', () => {
    vi.useFakeTimers();
    const { overlay, hud } = mount();
    const angles = vi.fn();
    hud.onTouchAngle(angles);
    const left = overlay.querySelector<HTMLButtonElement>(
      '.st-hud__touch-btn[data-command="aim-left"]',
    )!;
    left.setPointerCapture = vi.fn();

    left.dispatchEvent(pointerEvent('pointerdown', 1));
    vi.advanceTimersByTime(200);
    left.dispatchEvent(pointerEvent('pointerdown', 2));
    expect(angles).toHaveBeenCalledTimes(1);

    left.dispatchEvent(pointerEvent('pointerup', 1));
    vi.advanceTimersByTime(800);
    expect(angles).toHaveBeenCalledTimes(1);
  });
});
