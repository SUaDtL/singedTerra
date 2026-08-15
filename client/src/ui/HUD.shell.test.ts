import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { HUD } from './HUD';
import type { GameState } from '@shared/types/GameState';

interface MountedShell {
  root: HTMLElement;
  rail: HTMLElement;
  modal: HTMLElement;
  hud: HUD;
  state: GameState;
}

function mountHarness(): MountedShell {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const rail = document.createElement('div');
  rail.id = 'battle-rail';
  const modal = document.createElement('div');
  document.body.append(root, overlay, rail, modal);
  const HUDWithRail = HUD as unknown as new (
    root: HTMLElement,
    overlay: HTMLElement,
    modal: HTMLElement,
    rail: HTMLElement,
  ) => HUD;
  const hud = new HUDWithRail(root, overlay, modal, rail);
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
  return { root, rail, modal, hud, state };
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
  it('mounts the active-turn command console in the explicit battle rail', () => {
    const { root, overlay, rail } = (() => {
      const root = document.createElement('div');
      const overlay = document.createElement('div');
      const rail = document.createElement('div');
      rail.id = 'battle-rail';
      const modal = document.createElement('div');
      document.body.append(root, overlay, rail, modal);
      const HUDWithRail = HUD as unknown as new (
        root: HTMLElement,
        overlay: HTMLElement,
        modal: HTMLElement,
        rail: HTMLElement,
      ) => HUD;
      const hud = new HUDWithRail(root, overlay, modal, rail);
      const engine = new GameEngine({
        players: [
          { name: 'Alice', color: '#e84d4d' },
          { name: 'Bob', color: '#4d8ce8' },
        ],
        maxPlayers: 2,
        seed: 1,
      });
      hud.update(engine.getState());
      return { root, overlay, rail };
    })();

    const console = rail.querySelector<HTMLElement>('.st-hud__command-console');

    expect(console).not.toBeNull();
    expect(console?.getAttribute('aria-label')).toBe('Turn command console');
    const context = console?.querySelector<HTMLElement>('.st-hud__console-context');
    const solution = console?.querySelector<HTMLElement>('.st-hud__console-solution');
    const commitment = console?.querySelector<HTMLElement>('.st-hud__console-commitment');
    expect(context?.querySelector('.st-hud__active-row')).not.toBeNull();
    expect(solution?.querySelector('.st-hud__instruments')).not.toBeNull();
    expect(solution?.querySelector('[data-ui="command-deck"]')).not.toBeNull();
    expect(commitment?.querySelectorAll('.st-hud__turn-actions .st-hud__primary-action')).toHaveLength(1);
    expect(commitment?.querySelector('.st-hud__store-btn')).toBeNull();
    expect(commitment?.dataset['commandMode']).toBe('decision');
    expect(commitment?.querySelector('.st-hud__console-state')?.textContent)
      .toContain('Fire ready');
    expect(root.querySelector('.st-hud__command-console')).toBeNull();
    expect(overlay.querySelector('.st-hud__command-console')).toBeNull();
  });

  it('marks one shell and applies the shared section rhythm to every rail region', () => {
    const root = mount();
    const rail = document.querySelector<HTMLElement>('#battle-rail')!;
    const commandConsole = rail.querySelector<HTMLElement>('.st-hud__command-console')!;

    expect(root.classList.contains('st-ui-shell')).toBe(true);
    expect(root.getAttribute('data-ui')).toBe('combat-rail');
    expect(root.querySelector('.st-hud__players')?.classList.contains('st-ui-section')).toBe(true);
    expect(rail.querySelector('.st-hud__instruments')?.classList.contains('st-ui-section')).toBe(true);
    expect(commandConsole.classList.contains('st-ui-section')).toBe(true);
    expect(commandConsole.parentElement?.id).toBe('battle-rail');
    expect(commandConsole.getAttribute('role')).toBe('region');
    expect(commandConsole.getAttribute('aria-label')).toBe('Turn command console');
    expect(commandConsole.querySelector('.st-hud__active-row')).not.toBeNull();
    expect(commandConsole.querySelector('.st-hud__aim')).not.toBeNull();
    expect(commandConsole.querySelector('.st-hud__turn-actions')).not.toBeNull();
    expect(rail.querySelector('.st-hud__primary-action')?.classList.contains('st-ui-action')).toBe(true);
    expect(root.querySelector('.st-hud__strip')?.classList.contains('st-ui-section')).toBe(true);
  });

  it('orders one current-turn decision console before secondary battle status', () => {
    const root = mount();
    const rail = document.querySelector<HTMLElement>('#battle-rail')!;
    const commandConsole = rail.querySelector<HTMLElement>('.st-hud__command-console')!;
    const context = commandConsole.querySelector<HTMLElement>('.st-hud__console-context')!;
    const solution = commandConsole.querySelector<HTMLElement>('.st-hud__console-solution')!;
    const commitment = commandConsole.querySelector<HTMLElement>('.st-hud__console-commitment')!;
    const instruments = solution.querySelector<HTMLElement>('.st-hud__instruments')!;
    const active = context.querySelector<HTMLElement>('.st-hud__active-row')!;
    const progress = commitment.querySelector<HTMLElement>('.st-hud__aim')!;
    const actions = commitment.querySelector<HTMLElement>('.st-hud__turn-actions')!;
    const roster = root.querySelector<HTMLElement>('.st-hud__players')!;

    expect([...commandConsole.children]).toEqual([
      context,
      solution,
      commitment,
    ]);
    expect(instruments.parentElement).toBe(solution);
    expect(active.parentElement).toBe(context);
    expect(progress.parentElement).toBe(commitment);
    expect(actions.parentElement).toBe(commitment);
    const persistentCombatRegions = [...root.children].filter(
      (child) => !child.classList.contains('st-hud__quick-chat'),
    );
    expect(persistentCombatRegions).toEqual([
      root.querySelector('.st-hud__menu'),
      root.querySelector('.st-hud__round'),
      roster,
      root.querySelector('.st-hud__strip'),
    ]);
    expect(commandConsole.closest('.st-ui-shell')).toBeNull();
    expect(roster.closest('.st-ui-shell')).toBe(root);
  });

  it('keeps the selected weapon glyph synchronized inside a stable tactical tile', () => {
    const { root, hud, state } = mountHarness();
    const tile = document.querySelector<HTMLElement>('#battle-rail .st-hud__weapon')!;
    const iconHost = tile.querySelector<HTMLElement>('.st-hud__weapon-icon')!;

    expect(iconHost.querySelector('.st-weapon-icon')?.getAttribute('data-weapon'))
      .toBe('baby_missile');
    expect(tile.querySelector('.st-hud__weapon-value')?.textContent).toBe('Baby Missile');

    state.tanks[0]!.selectedWeapon = 'bouncing_betty';
    hud.update(state, false, true);

    expect(document.querySelector('#battle-rail .st-hud__weapon')).toBe(tile);
    expect(document.querySelector('#battle-rail .st-hud__weapon-icon')).toBe(iconHost);
    expect(iconHost.querySelector('.st-weapon-icon')?.getAttribute('data-weapon'))
      .toBe('bouncing_betty');
    expect(tile.querySelector('.st-hud__weapon-value')?.textContent).toBe('Bouncing Betty');
  });

  it('changes the rail commitment from an armed shot to honest tracking state', () => {
    const { hud, state } = mountHarness();
    const commitment = document.querySelector<HTMLElement>(
      '#battle-rail .st-hud__console-commitment',
    )!;
    const stateLabel = commitment.querySelector<HTMLElement>('.st-hud__console-state')!;

    expect(commitment.dataset['commandMode']).toBe('decision');
    expect(stateLabel.textContent).toContain('Fire ready');

    state.phase = 'FIRING';
    hud.update(state, true, false);

    expect(commitment.dataset['commandMode']).toBe('tracking');
    expect(stateLabel.textContent).toContain('Tracking shot');
    expect(stateLabel.title).toBe('Shot in flight.');
  });

  it('uses exact decorative SVG icons while visible text keeps actions named', () => {
    const root = mount();
    const menu = root.querySelector<HTMLButtonElement>('.st-hud__menu')!;
    const arsenal = root.querySelector<HTMLElement>('.st-hud__strip-title')!;
    const fire = document.querySelector<HTMLButtonElement>('#battle-rail .st-hud__primary-action')!;
    const disclosure = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    const iconRoots = [menu, fire, arsenal, disclosure];
    const icons = iconRoots.flatMap((element) => [
      ...element.querySelectorAll<SVGSVGElement>('svg.st-ui-icon'),
    ]);
    const glyphs = iconRoots.flatMap((element) => [
      ...element.querySelectorAll<HTMLElement>('.st-ui-glyph'),
    ]);
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
    expect(arsenal.textContent).toContain('Arsenal');
    expect(iconNames).toEqual(['menu', 'fire', 'arsenal', 'disclosure']);
    expect(iconSymbols).toEqual([
      'menu',
      'target',
      'ordnance',
      'disclosure',
    ]);
    expect([...glyphs].map((glyph) => glyph.dataset['glyph'])).toEqual([
      'menu',
      'fire',
      'arsenal',
    ]);
    expect(iconPaths).toEqual({
      menu: ['M4 5h16', 'M4 12h16', 'M4 19h16'],
      fire: [],
      arsenal: [
        'M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95',
        'm22 2-1.5 1.5',
      ],
      disclosure: ['m6 9 6 6 6-6'],
    });
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
    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();
    modal.querySelector<HTMLButtonElement>('[data-command="open-store"]')!.click();
    expect(store.classList.contains('st-hud__store--hidden')).toBe(false);
    expect(strip.classList.contains('st-hud__strip--open')).toBe(true);
    modal.querySelector<HTMLButtonElement>('.st-hud__store-close')!.click();
    expect(store.classList.contains('st-hud__store--hidden')).toBe(true);
    expect(strip.classList.contains('st-hud__strip--open')).toBe(true);
    expect(missile.classList.contains('st-hud__weapon-btn--active')).toBe(true);
  });
});
