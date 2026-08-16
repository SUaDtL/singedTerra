import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import { HUD } from './HUD';

function mount(): {
  hud: HUD;
  root: HTMLElement;
  overlay: HTMLElement;
  modal: HTMLElement;
  state: GameState;
} {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
  const hud = new HUD(root, overlay, modal, overlay);
  const state = new GameEngine({
    players: [{ name: 'Alice', color: '#e84d4d' }, { name: 'Bob', color: '#4d8ce8' }],
    maxPlayers: 2,
    seed: 1,
  }).getState();
  hud.update(state, false, true);
  return { hud, root, overlay, modal, state };
}

function armoryCard(root: HTMLElement, name: string): HTMLElement {
  return [...root.querySelectorAll<HTMLElement>('.st-hud__armory-card')]
    .find((card) => card.querySelector('.st-hud__armory-name')?.textContent === name)!;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD Armory commerce catalog', () => {
  it('places weapons and Supplies in Armory with no independent Store dialog', () => {
    const { root, modal } = mount();
    const catalog = root.querySelector<HTMLElement>('.st-hud__armory-catalog')!;

    expect(catalog.querySelector('.st-hud__armory-catalog-header h3')?.textContent).toBe('Weapons');
    expect(catalog.querySelector('.st-hud__armory-supplies h3')?.textContent).toBe('Supplies');
    expect(armoryCard(root, 'Missile').dataset['weapon']).toBe('missile');
    expect(armoryCard(root, 'Fuel Tank').dataset['accessory']).toBe('fuel_tank');
    expect(modal.querySelector('[aria-label="Store"]')).toBeNull();
  });

  it('updates credits, ammo, equip state, and purchase availability in place', () => {
    const { hud, root, state } = mount();
    const missile = armoryCard(root, 'Missile');
    const fuelTank = armoryCard(root, 'Fuel Tank');
    const purchases: unknown[] = [];
    hud.onBuy((purchase) => purchases.push(purchase));

    expect(root.querySelector('.st-hud__armory-credits')?.textContent).toBe('Credits: $8,000');
    expect(missile.querySelector('[data-armory-ammo]')?.textContent).toBe('Ammo 4');
    expect(missile.querySelector<HTMLButtonElement>('[data-action="buy"]')?.disabled).toBe(false);
    expect(missile.querySelector<HTMLButtonElement>('[data-action="equip"]')?.textContent).toBe('Equip');
    expect(fuelTank.querySelector<HTMLButtonElement>('[data-action="buy"]')?.disabled).toBe(true);

    state.tanks[0]!.credits = 30_000;
    state.tanks[0]!.inventory.missile = { count: 3, unlimited: false };
    state.tanks[0]!.selectedWeapon = 'missile';
    state.tanks[0]!.fuel = 175;
    hud.update(state, false, true);

    expect(root.querySelector('.st-hud__armory-credits')?.textContent).toBe('Credits: $30,000');
    expect(missile.querySelector('[data-armory-ammo]')?.textContent).toBe('Ammo 3');
    expect(missile.querySelector<HTMLButtonElement>('[data-action="equip"]')?.textContent).toBe('Current');
    expect(fuelTank.querySelector<HTMLButtonElement>('[data-action="buy"]')?.disabled).toBe(false);
    missile.querySelector<HTMLButtonElement>('[data-action="buy"]')!.click();
    fuelTank.querySelector<HTMLButtonElement>('[data-action="buy"]')!.click();
    expect(purchases).toEqual([{ weapon: 'missile' }, { accessory: 'fuel_tank' }]);
  });

  it('retains arms-level and turn-phase purchase gates without changing action authority', () => {
    const { hud, root, state } = mount();
    state.tanks[0]!.credits = 30_000;
    hud.setArmsLevel(0);
    hud.update(state, false, true);
    const missile = armoryCard(root, 'Missile');
    const heavyMissile = armoryCard(root, 'Heavy Missile');
    const battery = armoryCard(root, 'Battery');

    expect(heavyMissile.querySelector('.st-hud__armory-owned')?.textContent).toBe('🔒 Arms Lv 1');
    expect(heavyMissile.querySelector<HTMLButtonElement>('[data-action="buy"]')?.disabled).toBe(true);
    expect(battery.querySelector('.st-hud__armory-owned')?.textContent).toBe('🔒 Arms Lv 2');
    expect(battery.querySelector<HTMLButtonElement>('[data-action="buy"]')?.disabled).toBe(true);
    expect(missile.querySelector<HTMLButtonElement>('[data-action="buy"]')?.disabled).toBe(false);

    state.phase = 'FIRING';
    hud.update(state, false, true);
    expect(missile.querySelector<HTMLButtonElement>('[data-action="buy"]')?.disabled).toBe(true);
  });

  it('keeps between-round shop buy controls on their legacy sizing contract', () => {
    const { hud, modal, state } = mount();
    state.phase = 'ROUND_OVER';
    state.totalRounds = 3;
    state.round = 2;
    state.lastRoundWinnerId = state.tanks[0]!.id;
    hud.update(state, false, true);

    const roundShopBuy = modal.querySelector<HTMLElement>('.st-hud__roundshop-grid .st-hud__store-buy')!;
    const style = getComputedStyle(roundShopBuy);
    expect(style.minWidth).toBe('78px');
    expect(style.padding).toBe('5px 10px');
    expect(style.minHeight).toBe('auto');
  });

  it('hands an open Armory cleanly to the sole between-round commerce surface', () => {
    const { hud, root, overlay, modal, state } = mount();
    const purchases: Array<{ purchase: unknown; tankId?: string }> = [];
    hud.onBuy((purchase, tankId) => purchases.push({ purchase, tankId }));
    const trigger = root.querySelector<HTMLButtonElement>('.st-hud__arsenal-trigger')!;
    trigger.click();
    const armory = modal.querySelector<HTMLElement>('[data-ui="arsenal-drawer"]')!;
    expect(armory.getAttribute('role')).toBe('dialog');
    expect(overlay.inert).toBe(true);

    state.phase = 'ROUND_OVER';
    state.totalRounds = 3;
    state.round = 2;
    state.lastRoundWinnerId = state.tanks[0]!.id;
    hud.update(state, false, true);

    expect(armory.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(root.contains(armory)).toBe(true);
    expect(modal.contains(armory)).toBe(false);
    expect(armory.getAttribute('role')).toBeNull();
    expect(armory.getAttribute('aria-modal')).toBeNull();
    expect(overlay.inert).toBe(false);
    const roundOver = modal.querySelector<HTMLElement>('.st-hud__overlay:not(.st-hud__overlay--hidden)')!;
    expect(roundOver.querySelector('.st-hud__roundshop')).not.toBeNull();
    expect(document.activeElement).toBe(roundOver.querySelector('.st-hud__roundshop-sel'));
    expect(document.activeElement?.closest('[hidden], .st-hud__strip--collapsed')).toBeNull();

    const missileBuy = [...roundOver.querySelectorAll<HTMLButtonElement>('.st-hud__store-buy')]
      .find((button) => button.firstElementChild?.textContent === 'Missile')!;
    missileBuy.click();
    expect(purchases).toEqual([{
      purchase: { weapon: 'missile' },
      tankId: state.tanks[0]!.id,
    }]);
  });
});
