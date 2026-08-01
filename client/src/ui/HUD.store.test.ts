import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import { HUD } from './HUD';

function mount(): { hud: HUD; modal: HTMLElement; state: GameState } {
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
  return { hud, modal, state };
}

function storeRow(modal: HTMLElement, name: string): HTMLElement {
  return [...modal.querySelectorAll<HTMLElement>('.st-hud__store-row')]
    .find((row) => row.querySelector('.st-hud__store-name')?.textContent === name)!;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD store catalog', () => {
  it('renders the ordered catalog sections and presentation role copy', () => {
    const { modal } = mount();
    const sections = [...modal.querySelectorAll<HTMLElement>('.st-hud__store-section')];

    expect(sections.map((section) => section.querySelector('h2')?.textContent)).toEqual([
      'Impact',
      'Tactical',
      'Terrain & Fire',
      'Systems',
    ]);
    expect(sections.map((section) =>
      [...section.querySelectorAll('.st-hud__store-name')].map((name) => name.textContent),
    )).toEqual([
      ['Missile', 'Heavy Missile', 'Baby Nuke', 'Nuke'],
      ['Bouncing Betty', 'Funky Bomb', 'Cluster Bomb', 'MIRV', "Death's Head"],
      ['Dirt Bomb', 'Riot Bomb', 'Napalm', 'Hot Napalm', 'Sandhog'],
      ['Shield', 'Battery', 'Fuel Tank'],
    ]);
    expect([...modal.querySelectorAll('.st-hud__store-summary')].map((summary) => summary.textContent))
      .toEqual([
        'Reliable direct-hit blast.',
        'Heavy blast for fortified targets.',
        'Compact nuclear blast.',
        'Maximum-radius nuclear blast.',
        'Bounds through terrain with a blast at every hop.',
        'Splits into a wide mid-flight spread.',
        'Splits at the apex into a tight bomblet carpet.',
        'Splits at the apex into three heavy warheads.',
        'Splits at the apex into seven heavy warheads.',
        'Raises a mound instead of a crater.',
        'Carves a wide crater without blast damage.',
        'Spreads a lingering fire across the surface.',
        'A wider, hotter, longer-burning fire field.',
        'Drills underground before its endpoint blast.',
        'Absorbs incoming damage before it reaches your tank.',
        '+100 power cap.',
        '+100 movement fuel.',
      ]);
  });

  it('keeps the header, catalog, and footer separate while preserving buy behavior', () => {
    const { hud, modal, state } = mount();
    const panel = modal.querySelector<HTMLElement>('.st-hud__store-panel')!;
    const children = [...panel.children];
    const purchases: unknown[] = [];
    hud.onBuy((purchase) => purchases.push(purchase));

    expect(children.map((child) => child.className)).toEqual([
      'st-hud__store-header',
      'st-hud__store-catalog',
      'st-hud__store-footer',
    ]);
    expect(panel.querySelector('.st-hud__store-header .st-hud__store-credits')?.textContent)
      .toBe('Credits: $8,000');
    expect(panel.querySelector<HTMLButtonElement>('.st-hud__store-footer .st-hud__store-close')?.type)
      .toBe('button');

    const missile = storeRow(modal, 'Missile').querySelector<HTMLButtonElement>('.st-hud__store-buy')!;
    const fuelTank = storeRow(modal, 'Fuel Tank');
    const fuelBuy = fuelTank.querySelector<HTMLButtonElement>('.st-hud__store-buy')!;
    expect(missile.disabled).toBe(false);
    expect(fuelBuy.disabled).toBe(true);
    expect(fuelTank.querySelector('.st-hud__store-owned')?.textContent).toBe('Fuel 100');

    state.tanks[0]!.credits = 30_000;
    state.tanks[0]!.fuel = 175;
    hud.update(state, false, true);
    expect(fuelTank.querySelector('.st-hud__store-owned')?.textContent).toBe('Fuel 175');
    expect(fuelBuy.disabled).toBe(false);
    missile.click();
    fuelBuy.click();
    expect(purchases).toEqual([{ weapon: 'missile' }, { accessory: 'fuel_tank' }]);
  });

  it('locks above-level weapon and accessory cards while leaving affordable unlocked gear enabled', () => {
    const { hud, modal, state } = mount();
    state.tanks[0]!.credits = 30_000;
    hud.setArmsLevel(0);
    hud.update(state, false, true);

    const missile = storeRow(modal, 'Missile');
    const heavyMissile = storeRow(modal, 'Heavy Missile');
    const battery = storeRow(modal, 'Battery');

    expect(heavyMissile.querySelector('.st-hud__store-owned')?.textContent)
      .toBe('🔒 Arms Lv 1');
    expect(heavyMissile.querySelector<HTMLButtonElement>('.st-hud__store-buy')?.disabled)
      .toBe(true);
    expect(battery.querySelector('.st-hud__store-owned')?.textContent)
      .toBe('🔒 Arms Lv 2');
    expect(battery.querySelector<HTMLButtonElement>('.st-hud__store-buy')?.disabled)
      .toBe(true);
    expect(missile.querySelector<HTMLButtonElement>('.st-hud__store-buy')?.disabled)
      .toBe(false);
  });

  it('disables an affordable unlocked purchase outside PLAYER_TURN and re-enables it on return', () => {
    const { hud, modal, state } = mount();
    state.tanks[0]!.credits = 30_000;
    hud.setArmsLevel(1);
    hud.update(state, false, true);
    const heavyMissileBuy = storeRow(modal, 'Heavy Missile')
      .querySelector<HTMLButtonElement>('.st-hud__store-buy')!;

    expect(heavyMissileBuy.disabled).toBe(false);

    state.phase = 'FIRING';
    hud.update(state, false, true);
    expect(heavyMissileBuy.disabled).toBe(true);

    state.phase = 'PLAYER_TURN';
    hud.update(state, false, true);
    expect(heavyMissileBuy.disabled).toBe(false);
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
});
