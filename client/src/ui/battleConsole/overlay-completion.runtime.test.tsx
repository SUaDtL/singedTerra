// @vitest-environment jsdom
import { fireEvent, getByRole } from '@testing-library/dom';
import { render } from 'preact';
import { afterEach, expect, it, vi } from 'vitest';
import { BattleConsoleRoot } from './BattleConsoleRoot';
import { battleConsolePresentationStatesEqual } from './projectState';
import type { BattleConsolePresentationState } from './types';

const state: BattleConsolePresentationState = {
  commander: { id: 'p1', name: 'Player 1', health: 100, portrait: null },
  mobility: { fuel: 92, canMoveLeft: true, canMoveRight: true },
  weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
  armory: { open: true, submitting: false, items: [{
    key: 'missile', name: 'Missile', description: 'Reliable direct-hit blast.',
    purchase: { weapon: 'missile' }, price: 1875, bundleSize: 5, owned: 4,
    ammo: 4, equipped: false, canBuy: true, canEquip: true,
  }] },
  ballistics: { angle: 45, power: 50, wind: -1.3 },
  fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
  settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
  coach: { step: null, briefingOpen: false }, focusOwner: null,
};
const host = document.createElement('div');
afterEach(() => { render(null, host); host.remove(); });

it('AC04 shows the actual current credit balance and projects a changed balance', () => {
  const current = { ...state, armory: { ...state.armory, credits: 10_000 } };
  const purchased = { ...current, armory: { ...current.armory, credits: 8_125 } };
  render(<BattleConsoleRoot state={current} lifecycleStatus="ready" dispatch={vi.fn()} />, host);
  expect(host.querySelector('[data-battle-console-credits]')?.textContent).toBe('$10,000');
  expect(battleConsolePresentationStatesEqual(current, purchased)).toBe(false);
  render(<BattleConsoleRoot state={purchased} lifecycleStatus="ready" dispatch={vi.fn()} />, host);
  expect(host.querySelector('[data-battle-console-credits]')?.textContent).toBe('$8,125');
});

it('AC04 states inventory ownership and purchase price once while keeping bundle quantity available', () => {
  render(<BattleConsoleRoot state={state} lifecycleStatus="ready" dispatch={vi.fn()} />, host);
  const item = host.querySelector('[data-battle-console-armory-item]')!;
  expect(item.querySelector('dl')).toBeNull();
  expect(item.querySelector('[data-battle-console-owned]')?.textContent).toBe('4 ammo');
  expect(item.querySelector('[data-battle-console-bundle]')?.textContent).toBe('+5 per purchase');
});

it('AC06 installs Settings escape and initial focus as soon as an opened or reopened dialog is visible', () => {
  document.body.append(host);
  const dispatch = vi.fn();
  const closed = { ...state, armory: { ...state.armory, open: false } };
  const opened = { ...closed, settings: { ...state.settings, open: true } };
  for (let count = 0; count < 2; count++) {
    render(<BattleConsoleRoot state={opened} lifecycleStatus="ready" dispatch={dispatch} />, host);
    expect(document.activeElement).toBe(getByRole(host, 'switch', { name: 'Trajectory guide' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dispatch).toHaveBeenNthCalledWith(count + 1, { type: 'settings-close' });
    render(<BattleConsoleRoot state={closed} lifecycleStatus="ready" dispatch={dispatch} />, host);
  }
});

it('AC04/08 keeps keyboard focus in Armory while every inventory action remains reachable', async () => {
  document.body.append(host);
  const dispatch = vi.fn();
  render(<BattleConsoleRoot state={state} lifecycleStatus="ready" dispatch={dispatch} />, host);
  const close = getByRole(host, 'button', { name: 'Close Armory' });
  const buy = getByRole(host, 'button', { name: 'Buy $1,875' });
  await vi.waitFor(() => expect(document.activeElement).toBe(close));
  fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(buy);
  fireEvent.keyDown(window, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
  fireEvent.click(getByRole(host, 'button', { name: 'Equip' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'armory-equip', weapon: 'missile' });
  fireEvent.click(buy);
  expect(dispatch).toHaveBeenCalledWith({ type: 'armory-buy', purchase: { weapon: 'missile' }, tankId: 'p1' });
});

it('AC04 Armory can close by Escape immediately when mounted', () => {
  document.body.append(host);
  const dispatch = vi.fn();
  render(<BattleConsoleRoot state={state} lifecycleStatus="ready" dispatch={dispatch} />, host);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'armory-close' });
});
