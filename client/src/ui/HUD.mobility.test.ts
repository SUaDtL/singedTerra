import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import { HUD } from './HUD';

function mount(): {
  root: HTMLElement;
  modal: HTMLElement;
  hud: HUD;
  state: GameState;
  left: () => HTMLButtonElement;
  right: () => HTMLButtonElement;
  fuel: () => HTMLElement;
} {
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
  return {
    root,
    modal,
    hud,
    state,
    left: () => root.querySelector<HTMLButtonElement>('[data-move="-8"]')!,
    right: () => root.querySelector<HTMLButtonElement>('[data-move="8"]')!,
    fuel: () => root.querySelector<HTMLElement>('.st-hud__fuel-value')!,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD mobility rocker', () => {
  it('gives full-width identity priority over the tactical controls', () => {
    const { root, state, hud } = mount();
    state.tanks[0]!.playerName = 'Commander Longname X';
    hud.update(state, false, true);

    const activeRow = root.querySelector<HTMLElement>('.st-hud__active-row')!;
    const identity = activeRow.querySelector<HTMLElement>('.st-hud__turn-status')!;
    const lockup = activeRow.querySelector<HTMLElement>('.st-hud__identity-lockup')!;
    const tactical = activeRow.querySelector<HTMLElement>('.st-hud__tactical-row')!;
    const owner = identity.querySelector<HTMLElement>('.st-hud__turn-owner')!;

    expect(lockup.parentElement).toBe(activeRow);
    expect(identity.parentElement).toBe(lockup);
    expect(lockup.querySelector('.st-hud__tank-portrait')).not.toBeNull();
    expect(tactical.parentElement).toBe(activeRow);
    expect(tactical.querySelector('.st-hud__weapon')).not.toBeNull();
    expect(tactical.querySelector('.st-hud__mobility')).not.toBeNull();
    expect(owner.textContent).toBe('Commander Longname X');
    expect(owner.getAttribute('title')).toBe('Commander Longname X');
  });

  it('fits semantic left/fuel/right controls into the active-turn row', () => {
    const { root, left, right, fuel } = mount();
    const mobility = root.querySelector<HTMLElement>('.st-hud__mobility')!;
    const meter = root.querySelector<HTMLElement>('.st-hud__fuel-meter')!;
    const readout = root.querySelector<HTMLElement>('.st-hud__fuel-readout')!;
    const label = root.querySelector<HTMLElement>('.st-hud__fuel-label')!;

    expect(mobility).not.toBeNull();
    expect(mobility.getAttribute('role')).toBe('group');
    expect(mobility.getAttribute('aria-label')).toBe('Tank movement');
    expect(left().getAttribute('aria-label')).toBe('Move tank left, 8 fuel maximum');
    expect(right().getAttribute('aria-label')).toBe('Move tank right, 8 fuel maximum');
    expect(left().querySelector('.st-hud__move-direction')?.textContent).toBe('‹');
    expect(left().querySelector('kbd')?.textContent).toBe('A');
    expect(right().querySelector('.st-hud__move-direction')?.textContent).toBe('›');
    expect(right().querySelector('kbd')?.textContent).toBe('D');
    expect([...left().childNodes].every((node) => node.nodeType === Node.ELEMENT_NODE)).toBe(true);
    expect([...right().childNodes].every((node) => node.nodeType === Node.ELEMENT_NODE)).toBe(true);
    expect(fuel().textContent).toBe('100');
    expect(fuel().getAttribute('aria-label')).toBe('100 fuel remaining');
    expect(meter.classList.contains('st-hud__fuel-dial')).toBe(true);
    expect(meter.contains(readout)).toBe(true);
    expect(readout.children[0]).toBe(fuel());
    expect(readout.children[1]).toBe(label);
    expect(label.textContent).toBe('Fuel');
    expect(meter.getAttribute('role')).toBe('progressbar');
    expect(meter.getAttribute('aria-label')).toBe('Movement fuel');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-valuenow')).toBe('100');
    expect(meter.getAttribute('aria-valuetext')).toBe('100 fuel remaining');
    expect(meter.dataset['fuelBand']).toBe('normal');
    expect(meter.dataset['fuelTier']).toBe('0');
    expect(meter.dataset['fuelTone']).toBe('base');
    expect(document.querySelector('.st-hud__controls')?.textContent).toContain('Move');
  });

  it('dispatches exactly one signed step from each semantic button', () => {
    const { hud, left, right } = mount();
    const move = vi.fn();
    hud.onMove(move);

    left().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    left().click();
    right().click();

    expect(move.mock.calls).toEqual([[-8], [8]]);
  });

  it('updates authoritative fuel without rebuilding the control', () => {
    const { hud, state, fuel } = mount();
    const original = fuel();
    const meter = document.querySelector<HTMLElement>('.st-hud__fuel-meter')!;
    const originalMeter = meter;
    state.tanks[0]!.fuel = 37;

    hud.update(state, false, true);

    expect(fuel()).toBe(original);
    expect(document.querySelector('.st-hud__fuel-meter')).toBe(originalMeter);
    expect(fuel().textContent).toBe('37');
    expect(fuel().getAttribute('aria-label')).toBe('37 fuel remaining');
    expect(meter.getAttribute('aria-valuenow')).toBe('37');
    expect(meter.getAttribute('aria-valuetext')).toBe('37 fuel remaining');
    expect(meter.style.getPropertyValue('--st-fuel-level')).toBe('37%');
    expect(meter.dataset['fuelBand']).toBe('normal');
  });

  it('exposes redundant low and empty bands without replacing the exact number', () => {
    const { hud, state, fuel } = mount();
    const meter = document.querySelector<HTMLElement>('.st-hud__fuel-meter')!;

    state.tanks[0]!.fuel = 25;
    hud.update(state, false, true);
    expect(fuel().textContent).toBe('25');
    expect(meter.dataset['fuelBand']).toBe('low');

    state.tanks[0]!.fuel = 0;
    hud.update(state, false, true);
    expect(fuel().textContent).toBe('0');
    expect(meter.dataset['fuelBand']).toBe('empty');
    expect(meter.getAttribute('aria-valuetext')).toBe('0 fuel remaining');
  });

  it('wraps purchased reserve tanks in distinct exact 100-point tiers', () => {
    const { hud, state, fuel } = mount();
    const meter = document.querySelector<HTMLElement>('.st-hud__fuel-meter')!;
    state.tanks[0]!.fuel = 175;

    hud.update(state, false, true);

    expect(fuel().textContent).toBe('175');
    expect(meter.getAttribute('aria-valuemin')).toBe('100');
    expect(meter.getAttribute('aria-valuemax')).toBe('200');
    expect(meter.getAttribute('aria-valuenow')).toBe('175');
    expect(meter.getAttribute('aria-valuetext')).toBe('175 fuel remaining');
    expect(meter.style.getPropertyValue('--st-fuel-level')).toBe('75%');
    expect(meter.dataset['fuelBand']).toBe('reserve');
    expect(meter.dataset['fuelTier']).toBe('1');
    expect(meter.dataset['fuelTone']).toBe('reserve');

    state.tanks[0]!.fuel = 200;
    hud.update(state, false, true);
    expect(meter.getAttribute('aria-valuemin')).toBe('100');
    expect(meter.getAttribute('aria-valuemax')).toBe('200');
    expect(meter.getAttribute('aria-valuenow')).toBe('200');
    expect(meter.style.getPropertyValue('--st-fuel-level')).toBe('100%');
    expect(meter.dataset['fuelTier']).toBe('1');

    state.tanks[0]!.fuel = 275;
    hud.update(state, false, true);
    expect(fuel().textContent).toBe('275');
    expect(meter.getAttribute('aria-valuemin')).toBe('200');
    expect(meter.getAttribute('aria-valuemax')).toBe('300');
    expect(meter.getAttribute('aria-valuenow')).toBe('275');
    expect(meter.style.getPropertyValue('--st-fuel-level')).toBe('75%');
    expect(meter.dataset['fuelTier']).toBe('2');
    expect(meter.dataset['fuelTone']).toBe('deep-reserve');
  });

  it('disables movement without local control, fuel, life, or a playable turn', () => {
    const { root, hud, state, left, right } = mount();
    const tank = state.tanks[0]!;
    const touchMoves = () => [
      document.querySelector<HTMLButtonElement>('[data-command="move-left"]')!,
      document.querySelector<HTMLButtonElement>('[data-command="move-right"]')!,
    ];
    const expectMovementDisabled = (disabled: boolean): void => {
      for (const button of [left(), right(), ...touchMoves()]) {
        expect(button.disabled).toBe(disabled);
        expect(button.getAttribute('aria-disabled')).toBe(String(disabled));
      }
    };

    hud.update(state, false, false);
    expectMovementDisabled(true);

    tank.fuel = 0;
    hud.update(state, false, true);
    expectMovementDisabled(true);

    tank.fuel = 100;
    tank.buried = true;
    hud.update(state, false, true);
    expectMovementDisabled(true);

    tank.buried = false;
    tank.alive = false;
    hud.update(state, false, true);
    expectMovementDisabled(true);

    tank.alive = true;
    state.phase = 'FIRING';
    hud.update(state, false, true);
    expectMovementDisabled(true);

    state.phase = 'PLAYER_TURN';
    hud.update(state, true, true);
    expectMovementDisabled(true);

    hud.update(state, false, true);
    expectMovementDisabled(false);
    const dock = document.querySelector<HTMLElement>('.st-hud__touch-strip')!;
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();
    expect(dock.inert).toBe(true);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();
    expect(dock.inert).toBe(false);
    expectMovementDisabled(false);
  });

  it('keeps the active-row announcement focused on turn ownership', () => {
    const { root } = mount();
    expect(root.querySelector('.st-hud__turn-status')?.getAttribute('aria-label'))
      .toBe("Alice's turn. Weapon Baby Missile. 100 fuel remaining.");
  });

  it('offers the canonical Fuel Tank with a live fuel readout', () => {
    const { modal } = mount();
    const row = [...modal.querySelectorAll<HTMLElement>('.st-hud__store-row')]
      .find((candidate) =>
        candidate.querySelector('.st-hud__store-name')?.textContent === 'Fuel Tank');

    expect(row).toBeDefined();
    expect(row?.querySelector('.st-hud__store-owned')?.textContent).toBe('Fuel 100');
    expect(row?.querySelector('.st-hud__store-price')?.textContent).toBe('$10,000');
    expect(row?.querySelector('.st-hud__store-bundle')?.textContent)
      .toBe('+100 movement fuel');
  });
});
