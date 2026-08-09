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
  const hud = new HUD(root, overlay, modal);
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
  it('builds one semantic icon-led keyboard deck with compact exact key hints', () => {
    const { overlay } = mount();
    const deck = overlay.querySelector<HTMLElement>('.st-hud__controls')!;
    const items = [...deck.querySelectorAll<HTMLElement>('.st-hud__control-cell')];

    expect(deck.getAttribute('role')).toBe('region');
    expect(deck.getAttribute('aria-label')).toBe('Keyboard and mouse commands');
    expect(deck.dataset['ui']).toBe('command-deck');
    expect(deck.querySelector('.st-hud__controls-title')?.textContent).toBe('Command Deck');
    expect(deck.querySelector('.st-hud__controls-mode')?.textContent).toBe('Mouse + keys');
    expect(items.map((item) => item.dataset['command'])).toEqual([
      'aim',
      'power',
      'move',
      'weapon',
      'fire',
    ]);
    expect(items.map((item) => item.querySelector('.st-hud__control-label')?.textContent))
      .toEqual(['Aim', 'Power', 'Move', 'Weapon', 'Fire']);
    expect(items.map((item) => item.querySelector('.st-ui-glyph')?.getAttribute('data-glyph')))
      .toEqual(['aim', 'power', 'move', 'weapon', 'fire']);
    expect(
      items.map((item) =>
        [...item.querySelectorAll('kbd')].map((key) => key.textContent),
      ),
    ).toEqual([
      ['←', '→'],
      ['↑', '↓'],
      ['A', 'D'],
      ['Q'],
      ['Space', 'Enter'],
    ]);
    expect(items.at(-1)?.classList.contains('st-hud__control-cell--primary')).toBe(true);
  });

  it('routes every desktop keycap through the existing causal command callbacks', () => {
    const { overlay, hud } = mount();
    const angles = vi.fn();
    const powers = vi.fn();
    const moves = vi.fn();
    const weapons = vi.fn();
    const primaryActions = vi.fn();
    hud.onTouchAngle(angles);
    hud.onTouchPower(powers);
    hud.onMove(moves);
    hud.onTouchWeapon(weapons);
    hud.onPrimaryAction(primaryActions);

    const deck = overlay.querySelector<HTMLElement>('[data-ui="command-deck"]')!;
    const buttons = [...deck.querySelectorAll<HTMLButtonElement>(
      '.st-hud__command-key',
    )];

    expect(deck.getAttribute('aria-label')).toBe('Keyboard and mouse commands');
    expect(deck.querySelector('.st-hud__controls-mode')?.textContent).toBe('Mouse + keys');
    expect(buttons.map((button) => button.dataset['commandAction'])).toEqual([
      'aim-left',
      'aim-right',
      'power-up',
      'power-down',
      'move-left',
      'move-right',
      'weapon',
      'fire-space',
      'fire-enter',
    ]);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Aim barrel left',
      'Aim barrel right',
      'Increase power',
      'Decrease power',
      'Move tank left, 8 fuel maximum',
      'Move tank right, 8 fuel maximum',
      'Cycle weapon, current Baby Missile',
      'Fire Baby Missile with Space',
      'Fire Baby Missile with Enter',
    ]);

    for (const button of buttons) button.click();
    expect(angles.mock.calls).toEqual([[3], [-3]]);
    expect(powers.mock.calls).toEqual([[3], [-3]]);
    expect(moves.mock.calls).toEqual([[-8], [8]]);
    expect(weapons).toHaveBeenCalledTimes(1);
    expect(primaryActions).toHaveBeenCalledTimes(2);
  });

  it('keeps desktop command availability aligned with local action and movement gates', () => {
    const { overlay, hud } = mount();
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
      overlay.querySelector<HTMLButtonElement>(
        `.st-hud__command-key[data-command-action="${action}"]`,
      )!;

    hud.update(state, false, false);
    const controlled = [...overlay.querySelectorAll<HTMLButtonElement>(
      '.st-hud__command-key',
    )];
    expect(controlled).toHaveLength(9);
    expect(controlled.every((entry) => entry.disabled)).toBe(true);
    expect(controlled.every((entry) => entry.getAttribute('aria-disabled') === 'true'))
      .toBe(true);

    hud.update(state, false, true);
    expect(controlled.every((entry) => !entry.disabled)).toBe(true);
    expect(controlled.every((entry) => entry.getAttribute('aria-disabled') === 'false'))
      .toBe(true);

    state.tanks[0]!.fuel = 0;
    hud.update(state, false, true);
    expect(button('move-left').disabled).toBe(true);
    expect(button('move-right').disabled).toBe(true);
    expect(button('aim-left').disabled).toBe(false);
    expect(button('fire-space').disabled).toBe(false);

    state.tanks[0]!.fuel = 100;
    state.tanks[0]!.buried = true;
    hud.update(state, false, true);
    expect(button('move-left').disabled).toBe(true);
    expect(button('aim-left').disabled).toBe(false);

    state.tanks[0]!.buried = false;
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
    expect(button('fire-space').disabled).toBe(true);
    expect(button('weapon').disabled).toBe(false);
    expect(button('weapon').getAttribute('aria-label')).toBe('Cycle weapon, current Nuke');

    state.tanks[0]!.selectedWeapon = 'shield';
    state.tanks[0]!.inventory.shield.count = 1;
    hud.update(state, false, true);
    expect(button('fire-space').disabled).toBe(false);
    expect(button('fire-space').getAttribute('aria-label'))
      .toBe('Activate shield with Space');
    expect(button('fire-enter').getAttribute('aria-label'))
      .toBe('Activate shield with Enter');
  });

  it('isolates the desktop Command Deck while Arsenal owns interaction', () => {
    const { root, overlay } = mount();
    const deck = overlay.querySelector<HTMLElement>('[data-ui="command-deck"]')!;
    const grid = deck.querySelector<HTMLElement>('.st-hud__control-grid')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    expect(grid.inert).toBe(false);
    expect(deck.getAttribute('aria-hidden')).toBeNull();
    toggle.click();
    expect(grid.inert).toBe(true);
    expect(deck.getAttribute('aria-hidden')).toBe('true');
    toggle.click();
    expect(grid.inert).toBe(false);
    expect(deck.getAttribute('aria-hidden')).toBeNull();
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
