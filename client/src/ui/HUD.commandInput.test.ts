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
    expect(deck.getAttribute('aria-label')).toBe('Keyboard commands');
    expect(deck.dataset['ui']).toBe('command-deck');
    expect(deck.querySelector('.st-hud__controls-title')?.textContent).toBe('Command Deck');
    expect(deck.querySelector('.st-hud__controls-mode')?.textContent).toBe('Keyboard');
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
    const pause = [...modal.querySelectorAll<HTMLElement>('.st-hud__overlay')]
      .find((element) => element.textContent?.includes('Paused'))!;

    overlay.querySelector<HTMLButtonElement>('[data-command="menu"]')!.click();
    expect(hud.isPaused()).toBe(true);
    expect(pause.classList.contains('st-hud__overlay--hidden')).toBe(false);

    [...pause.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Resume')!
      .click();
    expect(hud.isPaused()).toBe(false);
    expect(pause.classList.contains('st-hud__overlay--hidden')).toBe(true);
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
