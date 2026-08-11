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
import { WEAPON_INTEL } from './weaponIntel';
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

describe('HUD arsenal - weapon intel', () => {
  beforeEach(() => localStorage.clear());

  function intel(root: HTMLElement): HTMLElement {
    return root.querySelector<HTMLElement>('.st-hud__weapon-intel')!;
  }

  it('opens with accessible intel for the selected weapon and live ammunition', () => {
    const { root, hud, state } = mount();
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const panel = intel(root);
    const selected = btn(root, 'baby_missile')!;
    expect(panel).toBeTruthy();
    expect(panel.dataset['weapon']).toBe('baby_missile');
    expect(panel.querySelector('.st-hud__weapon-intel-name')?.textContent).toBe('Baby Missile');
    expect(panel.querySelector('[data-intel-field="role"] .st-hud__weapon-intel-value')?.textContent)
      .toBe(WEAPON_INTEL.baby_missile.role);
    expect(panel.querySelector('[data-intel-field="terrain"] .st-hud__weapon-intel-value')?.textContent)
      .toBe(WEAPON_INTEL.baby_missile.terrain);
    expect(panel.querySelector('[data-intel-field="damage"] .st-hud__weapon-intel-value')?.textContent)
      .toBe(WEAPON_INTEL.baby_missile.damage);
    expect(panel.querySelector('[data-intel-field="useCase"] .st-hud__weapon-intel-value')?.textContent)
      .toBe(WEAPON_INTEL.baby_missile.useCase);
    expect(panel.querySelector('.st-hud__weapon-intel-ammo')?.textContent).toContain('\u221e');
    expect(panel.getAttribute('role')).toBe('status');
    expect(panel.getAttribute('aria-live')).toBe('polite');
    expect(panel.tabIndex).toBe(0);
    const heading = panel.querySelector('h3');
    expect(heading?.textContent).toBe('Baby Missile');
    expect(heading?.id).toBeTruthy();
    expect(panel.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(root.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-controls'))
      .toBe(panel.parentElement?.id);
    expect(selected.getAttribute('aria-describedby')).toBe(panel.id);
    expect(panel.hidden).toBe(false);
  });

  it('previews focus and pointer without selecting, then restores the selected weapon', async () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.missile = { count: 4, unlimited: false };
    tank.inventory.dirt_bomb = { count: 2, unlimited: false };
    const selected = vi.fn();
    hud.onWeaponSelect(selected);
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const missile = btn(root, 'missile')!;
    const dirtBomb = btn(root, 'dirt_bomb')!;
    missile.focus();
    expect(intel(root).dataset['weapon']).toBe('missile');
    expect(selected).not.toHaveBeenCalled();

    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(intel(root).dataset['weapon']).toBe('missile');

    dirtBomb.dispatchEvent(new Event('pointerdown'));
    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');
    expect(intel(root).querySelector('[data-intel-field="terrain"]')?.textContent)
      .toContain('Raises a mound');
    expect(selected).not.toHaveBeenCalled();

    dirtBomb.dispatchEvent(new Event('pointerleave'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(intel(root).dataset['weapon']).toBe('missile');
    missile.blur();
    expect(intel(root).dataset['weapon']).toBe('baby_missile');
    expect(selected).not.toHaveBeenCalled();
  });

  it('returns the dossier to its heading whenever keyboard, pointer, or touch changes weapons', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.missile = { count: 4, unlimited: false };
    tank.inventory.dirt_bomb = { count: 2, unlimited: false };
    tank.inventory.tracer = { count: 3, unlimited: false };
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const panel = intel(root);
    panel.scrollTop = 37;
    btn(root, 'missile')!.focus();
    expect(panel.dataset['weapon']).toBe('missile');
    expect(panel.scrollTop).toBe(0);

    panel.scrollTop = 41;
    const dirtBomb = btn(root, 'dirt_bomb')!;
    dirtBomb.dispatchEvent(new Event('pointerdown'));
    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(panel.dataset['weapon']).toBe('dirt_bomb');
    expect(panel.scrollTop).toBe(0);

    btn(root, 'missile')!.blur();
    panel.scrollTop = 53;
    const tracer = btn(root, 'tracer')!;
    const touchDown = new Event('pointerdown');
    Object.defineProperty(touchDown, 'pointerType', { value: 'touch' });
    tracer.dispatchEvent(touchDown);
    tracer.click();
    expect(panel.dataset['weapon']).toBe('tracer');
    expect(panel.scrollTop).toBe(0);
  });

  it('restores selected intel after collapse instead of reopening a stale preview', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.dirt_bomb = { count: 2, unlimited: false };
    hud.update(state);
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    toggle.click();

    const dirtBomb = btn(root, 'dirt_bomb')!;
    dirtBomb.dispatchEvent(new Event('pointerdown'));
    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');

    toggle.click();
    toggle.click();
    expect(intel(root).dataset['weapon']).toBe('baby_missile');
  });

  it('drops a transient preview when the active loadout changes or the weapon is hidden', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.dirt_bomb = { count: 2, unlimited: false };
    tank.inventory.missile = { count: 4, unlimited: false };
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();
    const dirtBomb = btn(root, 'dirt_bomb')!;

    dirtBomb.dispatchEvent(new Event('pointerdown'));
    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');

    tank.selectedWeapon = 'missile';
    hud.update(state);
    expect(intel(root).dataset['weapon']).toBe('missile');

    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');
    tank.inventory.dirt_bomb.count = 0;
    hud.update(state);
    expect(intel(root).dataset['weapon']).toBe('missile');
  });

  it('does not mutate the polite live region for identical frame updates', async () => {
    const { root, hud, state } = mount();
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();
    const panel = intel(root);
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(panel, { attributes: true, characterData: true, childList: true, subtree: true });

    hud.update(state);
    hud.update(state);
    hud.update(state);
    await Promise.resolve();
    observer.disconnect();

    expect(mutations).toEqual([]);
  });

  it('keeps activated touch intel visible, updates ammo, and hides with the drawer', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.tracer = { count: 3, unlimited: false };
    hud.onWeaponSelect((weapon) => {
      tank.selectedWeapon = weapon;
    });
    hud.update(state);
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    toggle.click();

    btn(root, 'tracer')!.click();
    hud.update(state);
    expect(intel(root).dataset['weapon']).toBe('tracer');
    expect(intel(root).querySelector('.st-hud__weapon-intel-ammo')?.textContent).toContain('3');

    tank.inventory.tracer.count = 2;
    hud.update(state);
    expect(intel(root).querySelector('.st-hud__weapon-intel-ammo')?.textContent).toContain('2');

    toggle.click();
    expect(intel(root).hidden).toBe(true);
  });

  it('ignores touch pointer entry until the player activates a weapon', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.sandhog = { count: 1, unlimited: false };
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const touchMove = new Event('pointermove');
    Object.defineProperty(touchMove, 'pointerType', { value: 'touch' });
    btn(root, 'sandhog')!.dispatchEvent(touchMove);

    expect(intel(root).dataset['weapon']).toBe('baby_missile');
  });
});

describe('HUD arsenal — collapsible', () => {
  beforeEach(() => localStorage.clear());

  it('defaults a fresh combat shell to a closed drawer', () => {
    localStorage.removeItem('st_arsenal_collapsed');
    const { root, hud, state } = mount();
    hud.update(state);
    expect(root.querySelector('.st-hud__strip')?.classList.contains('st-hud__strip--collapsed'))
      .toBe(true);
    expect(root.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a saved expanded preference', () => {
    localStorage.setItem('st_arsenal_collapsed', '0');
    const { root, hud, state } = mount();
    hud.update(state);
    expect(root.querySelector('.st-hud__strip')?.classList.contains('st-hud__strip--collapsed'))
      .toBe(false);
  });

  it('keeps a saved collapsed preference', () => {
    localStorage.setItem('st_arsenal_collapsed', '1');
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('treats an invalid stored preference as closed', () => {
    localStorage.setItem('st_arsenal_collapsed', 'invalid');
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('uses the closed default after a storage read failure', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the manual drawer state when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    toggle.click();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles the collapsed state when the header control is clicked', () => {
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    expect(toggle).toBeTruthy();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);

    toggle.click();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    toggle.click();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
  });

  it('persists the expanded state across a fresh HUD (localStorage)', () => {
    const first = mount();
    first.hud.update(first.state);
    first.root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    // A brand-new HUD (e.g. a reload) should honor the player's open preference.
    const second = mount();
    second.hud.update(second.state);
    expect(second.root.querySelector('.st-hud__strip')!.classList.contains('st-hud__strip--collapsed')).toBe(false);
  });
});
