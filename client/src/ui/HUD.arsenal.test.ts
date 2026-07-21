/**
 * HUD.arsenal.test.ts — the owned-only + collapsible arsenal contract (#③).
 *
 * The strip used to render every implemented weapon and grey out the ones with
 * no ammo, which ate a lot of vertical space (worse on mobile, worse still as
 * weapons are added). Now it shows only weapons the active tank OWNS
 * (unlimited, or count > 0) plus whatever is currently selected, and the whole
 * grid can be collapsed behind its header.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD } from './HUD';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';

function mount(): { root: HTMLElement; hud: HUD; state: GameState; engine: GameEngine } {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
  const hud = new HUD(root, overlay, modal);
  const engine = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  });
  return { root, hud, state: engine.getState(), engine };
}

function btn(root: HTMLElement, weapon: string): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(`.st-hud__weapon-btn[data-weapon="${weapon}"]`);
}
function isHidden(el: Element | null): boolean {
  return !!el?.classList.contains('st-hud__weapon-btn--hidden');
}

interface MediaController {
  dispatch(matches: boolean): void;
}

function installCompactTouchMedia(initial = false): MediaController {
  let current = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    media: '(pointer: coarse) and (max-height: 700px)',
    get matches() { return current; },
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  return {
    dispatch(matches) {
      current = matches;
      const event = { matches, media: media.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('HUD arsenal — owned-only', () => {
  beforeEach(() => localStorage.clear());

  it('hides finite weapons the active tank does not own, keeps owned + unlimited', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((t) => t.id === state.activePlayerId)!;
    tank.inventory.missile = { count: 0, unlimited: false }; // spent → not owned
    tank.inventory.nuke = { count: 2, unlimited: false };    // owned
    hud.update(state);

    expect(isHidden(btn(root, 'missile'))).toBe(true);
    expect(isHidden(btn(root, 'nuke'))).toBe(false);
    expect(isHidden(btn(root, 'baby_missile'))).toBe(false); // unlimited, always shown
  });

  it('never hides the currently selected weapon, even at zero ammo', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((t) => t.id === state.activePlayerId)!;
    tank.inventory.nuke = { count: 0, unlimited: false };
    tank.selectedWeapon = 'nuke';
    hud.update(state);

    expect(isHidden(btn(root, 'nuke'))).toBe(false);
  });

  it('reveals a weapon once it is (re)acquired', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((t) => t.id === state.activePlayerId)!;
    tank.inventory.napalm = { count: 0, unlimited: false };
    hud.update(state);
    expect(isHidden(btn(root, 'napalm'))).toBe(true);

    tank.inventory.napalm = { count: 3, unlimited: false }; // bought
    hud.update(state);
    expect(isHidden(btn(root, 'napalm'))).toBe(false);
  });
});

describe('HUD arsenal — collapsible', () => {
  beforeEach(() => localStorage.clear());

  it('defaults compact touch to collapsed when storage has no preference', () => {
    localStorage.removeItem('st_arsenal_collapsed');
    installCompactTouchMedia(true);
    const { root, hud, state } = mount();
    hud.update(state);
    expect(root.querySelector('.st-hud__strip')?.classList.contains('st-hud__strip--collapsed'))
      .toBe(true);
    expect(root.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a saved expanded preference on compact touch', () => {
    localStorage.setItem('st_arsenal_collapsed', '0');
    installCompactTouchMedia(true);
    const { root, hud, state } = mount();
    hud.update(state);
    expect(root.querySelector('.st-hud__strip')?.classList.contains('st-hud__strip--collapsed'))
      .toBe(false);
  });

  it('keeps a saved collapsed preference across compact-touch media changes', () => {
    localStorage.setItem('st_arsenal_collapsed', '1');
    const media = installCompactTouchMedia(true);
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    media.dispatch(false);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    media.dispatch(true);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('treats an invalid stored preference as implicit across media changes', () => {
    localStorage.setItem('st_arsenal_collapsed', 'invalid');
    const media = installCompactTouchMedia(false);
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    media.dispatch(true);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    media.dispatch(false);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('uses the compact-touch default after a storage read failure and keeps following media', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const media = installCompactTouchMedia(true);
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    media.dispatch(false);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    media.dispatch(true);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a manual toggle explicit when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const media = installCompactTouchMedia(true);
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    toggle.click();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    media.dispatch(false);
    media.dispatch(true);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('follows media changes until the player toggles explicitly', () => {
    localStorage.removeItem('st_arsenal_collapsed');
    const media = installCompactTouchMedia(false);
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    media.dispatch(true);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    media.dispatch(false);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    media.dispatch(true);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    toggle.click();
    media.dispatch(false);
    media.dispatch(true);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
  });

  it('toggles the collapsed state when the header control is clicked', () => {
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    expect(toggle).toBeTruthy();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);

    toggle.click();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    toggle.click();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
  });

  it('persists the collapsed state across a fresh HUD (localStorage)', () => {
    const first = mount();
    first.hud.update(first.state);
    first.root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    // A brand-new HUD (e.g. a reload) should open already collapsed.
    const second = mount();
    second.hud.update(second.state);
    expect(second.root.querySelector('.st-hud__strip')!.classList.contains('st-hud__strip--collapsed')).toBe(true);
  });
});
