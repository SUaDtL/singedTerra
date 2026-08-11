import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { HUD } from './HUD';
import type { GameState } from '@shared/types/GameState';

interface MountedShell {
  root: HTMLElement;
  modal: HTMLElement;
  hud: HUD;
  state: GameState;
}

function mountHarness(): MountedShell {
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
  const state = engine.getState();
  hud.update(state);
  return { root, modal, hud, state };
}

function mount(): HTMLElement {
  return mountHarness().root;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD single-screen combat shell', () => {
  it('marks one shell and applies the shared section rhythm to every rail region', () => {
    const root = mount();
    const commandConsole = root.querySelector<HTMLElement>('.st-hud__command-console')!;

    expect(root.classList.contains('st-ui-shell')).toBe(true);
    expect(root.getAttribute('data-ui')).toBe('combat-rail');
    expect(root.querySelector('.st-hud__players')?.classList.contains('st-ui-section')).toBe(true);
    expect(root.querySelector('.st-hud__instruments')?.classList.contains('st-ui-section')).toBe(true);
    expect(commandConsole.classList.contains('st-ui-section')).toBe(true);
    expect(commandConsole.parentElement).toBe(root);
    expect(commandConsole.getAttribute('role')).toBe('region');
    expect(commandConsole.getAttribute('aria-label')).toBe('Turn command console');
    expect(commandConsole.querySelector('.st-hud__active-row')).not.toBeNull();
    expect(commandConsole.querySelector('.st-hud__aim')).not.toBeNull();
    expect(commandConsole.querySelector('.st-hud__turn-actions')).not.toBeNull();
    expect(root.querySelector('.st-hud__store-btn')?.classList.contains('st-ui-action')).toBe(true);
    expect(root.querySelector('.st-hud__primary-action')?.classList.contains('st-ui-action')).toBe(true);
    expect(root.querySelector('.st-hud__strip')?.classList.contains('st-ui-section')).toBe(true);
  });

  it('orders one current-turn decision console before secondary battle status', () => {
    const root = mount();
    const commandConsole = root.querySelector<HTMLElement>('.st-hud__command-console')!;
    const instruments = root.querySelector<HTMLElement>('.st-hud__instruments')!;
    const active = root.querySelector<HTMLElement>('.st-hud__active-row')!;
    const progress = root.querySelector<HTMLElement>('.st-hud__aim')!;
    const actions = root.querySelector<HTMLElement>('.st-hud__turn-actions')!;
    const roster = root.querySelector<HTMLElement>('.st-hud__players')!;

    expect([...commandConsole.children]).toEqual([
      active,
      instruments,
      progress,
      actions,
    ]);
    expect(instruments.parentElement).toBe(commandConsole);
    const persistentCombatRegions = [...root.children].filter(
      (child) => !child.classList.contains('st-hud__quick-chat'),
    );
    expect(persistentCombatRegions).toEqual([
      root.querySelector('.st-hud__menu'),
      root.querySelector('.st-hud__round'),
      commandConsole,
      roster,
      root.querySelector('.st-hud__strip'),
    ]);
    expect(commandConsole.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);
  });

  it('keeps the selected weapon glyph synchronized inside a stable tactical tile', () => {
    const { root, hud, state } = mountHarness();
    const tile = root.querySelector<HTMLElement>('.st-hud__weapon')!;
    const iconHost = tile.querySelector<HTMLElement>('.st-hud__weapon-icon')!;

    expect(iconHost.querySelector('.st-weapon-icon')?.getAttribute('data-weapon'))
      .toBe('baby_missile');
    expect(tile.querySelector('.st-hud__weapon-value')?.textContent).toBe('Baby Missile');

    state.tanks[0]!.selectedWeapon = 'bouncing_betty';
    hud.update(state, false, true);

    expect(root.querySelector('.st-hud__weapon')).toBe(tile);
    expect(root.querySelector('.st-hud__weapon-icon')).toBe(iconHost);
    expect(iconHost.querySelector('.st-weapon-icon')?.getAttribute('data-weapon'))
      .toBe('bouncing_betty');
    expect(tile.querySelector('.st-hud__weapon-value')?.textContent).toBe('Bouncing Betty');
  });

  it('uses exact decorative SVG icons while visible text keeps actions named', () => {
    const root = mount();
    const menu = root.querySelector<HTMLButtonElement>('.st-hud__menu')!;
    const store = root.querySelector<HTMLButtonElement>('.st-hud__store-btn')!;
    const arsenal = root.querySelector<HTMLElement>('.st-hud__strip-title')!;
    const icons = root.querySelectorAll<SVGSVGElement>('svg.st-ui-icon');
    const glyphs = root.querySelectorAll<HTMLElement>('.st-ui-glyph');
    const iconNames = [...icons].map((icon) => icon.dataset['icon']);
    const iconSymbols = [...icons].map((icon) => icon.dataset['symbol']);
    const iconPaths = Object.fromEntries(
      [...icons].map((icon) => [
        icon.dataset['icon'],
        [...icon.querySelectorAll('path')].map((path) => path.getAttribute('d')),
      ]),
    );

    expect(menu.getAttribute('aria-label')).toBe('Menu');
    expect(menu.textContent).toContain('Menu');
    expect(store.getAttribute('aria-label')).toMatch(/Store/);
    expect(store.textContent).toContain('Store');
    expect(arsenal.textContent).toContain('Arsenal');
    expect(iconNames).toEqual(['menu', 'store', 'fire', 'arsenal', 'disclosure']);
    expect(iconSymbols).toEqual([
      'menu',
      'credits',
      'target',
      'ordnance',
      'disclosure',
    ]);
    expect([...glyphs].map((glyph) => glyph.dataset['glyph'])).toEqual([
      'menu',
      'store',
      'fire',
      'arsenal',
    ]);
    expect(iconPaths).toEqual({
      menu: ['M4 5h16', 'M4 12h16', 'M4 19h16'],
      store: [
        'M13.744 17.736a6 6 0 1 1-7.48-7.48',
        'M15 6h1v4',
        'm6.134 14.768.866-.5 2 3.464',
      ],
      fire: [],
      arsenal: [
        'M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95',
        'm22 2-1.5 1.5',
      ],
      disclosure: ['m6 9 6 6 6-6'],
    });
    expect(root.querySelector('[data-icon="store"] circle')?.getAttribute('r')).toBe('6');
    expect(root.querySelector('[data-icon="arsenal"] circle')?.getAttribute('r')).toBe('9');
    expect(
      root.querySelector('[data-icon="disclosure"]')?.closest('.st-ui-glyph'),
    ).toBeNull();
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.getAttribute('focusable')).toBe('false');
    }
  });

  it('exposes the arsenal as a controlled in-rail drawer', () => {
    const root = mount();
    const strip = root.querySelector<HTMLElement>('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    const body = root.querySelector<HTMLElement>('.st-hud__strip-body')!;
    const grid = root.querySelector<HTMLElement>('.st-hud__strip-grid')!;
    const intel = root.querySelector<HTMLElement>('.st-hud__weapon-intel')!;

    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(strip.getAttribute('data-ui')).toBe('arsenal-drawer');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Expand arsenal');
    expect(toggle.textContent).toContain('Expand');
    expect(toggle.getAttribute('aria-controls')).toBe(body.id);
    expect(body.contains(grid)).toBe(true);
    expect(body.contains(intel)).toBe(true);
    expect(grid.id).not.toBe('');
    expect(grid.getAttribute('role')).toBe('region');
    expect(grid.getAttribute('aria-label')).toBe('Weapon arsenal');

    toggle.click();
    expect(strip.classList.contains('st-hud__strip--open')).toBe(true);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Collapse arsenal');
    expect(toggle.textContent).toContain('Close');
    for (const sibling of [...root.children]) {
      if (sibling !== strip) expect((sibling as HTMLElement).inert).toBe(true);
    }

    const firstWeapon = grid.querySelector<HTMLButtonElement>('.st-hud__weapon-btn')!;
    firstWeapon.focus();
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    for (const sibling of [...root.children]) {
      if (sibling !== strip) expect((sibling as HTMLElement).inert).toBe(false);
    }

    toggle.click();
    toggle.click();
    expect(toggle.getAttribute('aria-label')).toBe('Expand arsenal');
    expect(toggle.textContent).toContain('Expand');
  });

  it('keeps each drawer control relationship unique across HUD instances', () => {
    const first = mount();
    const second = mount();
    const firstBody = first.querySelector<HTMLElement>('.st-hud__strip-body')!;
    const secondBody = second.querySelector<HTMLElement>('.st-hud__strip-body')!;
    const firstGrid = first.querySelector<HTMLElement>('.st-hud__strip-grid')!;
    const secondGrid = second.querySelector<HTMLElement>('.st-hud__strip-grid')!;

    expect(firstBody.id).not.toBe(secondBody.id);
    expect(firstGrid.id).not.toBe(secondGrid.id);
    expect(first.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-controls'))
      .toBe(firstBody.id);
    expect(second.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-controls'))
      .toBe(secondBody.id);
  });

  it('preserves weapon selection and store behavior through the shell controls', () => {
    const { root, modal, hud, state } = mountHarness();
    const selected: string[] = [];
    hud.onWeaponSelect((weapon) => selected.push(weapon));
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const missile = root.querySelector<HTMLButtonElement>(
      '.st-hud__weapon-btn[data-weapon="missile"]',
    )!;
    missile.click();
    expect(selected).toEqual(['missile']);
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.selectedWeapon = 'missile';
    hud.update(state);
    expect(missile.classList.contains('st-hud__weapon-btn--active')).toBe(true);
    expect(missile.getAttribute('aria-pressed')).toBe('true');
    expect(
      root.querySelector<HTMLButtonElement>(
        '.st-hud__weapon-btn[data-weapon="baby_missile"]',
      )!.getAttribute('aria-pressed'),
    ).toBe('false');

    const strip = root.querySelector('.st-hud__strip')!;
    const store = modal.querySelector('.st-hud__store')!;
    root.querySelector<HTMLButtonElement>('.st-hud__store-btn')!.click();
    expect(store.classList.contains('st-hud__store--hidden')).toBe(false);
    expect(strip.classList.contains('st-hud__strip--open')).toBe(true);
    modal.querySelector<HTMLButtonElement>('.st-hud__store-close')!.click();
    expect(store.classList.contains('st-hud__store--hidden')).toBe(true);
    expect(strip.classList.contains('st-hud__strip--open')).toBe(true);
    expect(missile.classList.contains('st-hud__weapon-btn--active')).toBe(true);
  });
});
