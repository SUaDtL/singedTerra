import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('keeps the side rail as a persistent match ledger, not a second fire console', () => {
    const { root, rail, hud, state } = mountHarness();

    expect(root.dataset['ui']).toBe('match-ledger');
    expect(root.getAttribute('role')).toBe('complementary');
    expect(root.getAttribute('aria-label')).toBe('Match ledger');
    expect(root.querySelector('[data-ui="match-mode"]')?.textContent).toBe('Free-for-all');
    expect(root.querySelector('.st-hud__round')).not.toBeNull();
    expect(root.querySelector('.st-hud__players')?.tagName).toBe('OL');
    expect(root.querySelector('.st-hud__players')?.getAttribute('aria-label')).toBe('Turn order');
    expect(
      [...root.querySelectorAll<HTMLElement>('.st-hud__player')]
        .map((row) => row.dataset['turnOrder']),
    ).toEqual(['1', '2']);
    expect(root.querySelector('.st-hud__conn')?.textContent).toContain('Ready');

    const forbidden = [
      '[data-ui="weapon-bay"]',
      '[data-control="angle"]',
      '[data-control="power"]',
      '[data-ui="arsenal-drawer"]',
      '.st-hud__store-btn',
      '.st-hud__primary-action',
      '.st-hud__trajectory-guide',
    ];
    for (const selector of forbidden) expect(root.querySelector(selector)).toBeNull();
    expect(root.textContent).not.toMatch(/Fire Control/i);
    expect(root.querySelector('.st-hud__quick-chat')).toBeNull();
    expect(rail.querySelector('.st-hud__conn')).toBeNull();

    hud.setConnection('connected');
    expect(root.querySelector('[data-ui="match-mode"]')?.textContent).toBe('Free-for-all');
    expect(root.querySelector('.st-hud__conn')?.textContent).toContain('Ready');

    hud.setLiveMatchDiagnostics(() => undefined);
    expect(root.querySelector('[data-ui="live-match-diagnostics"]')).toBeNull();
    expect(root.querySelectorAll(':scope > button')).toHaveLength(1);

    state.tanks[0]!.team = 1;
    state.tanks[1]!.team = 1;
    hud.update(state);
    expect(root.querySelector('[data-ui="match-mode"]')?.textContent).toBe('Team battle');
  });

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
    expect(solution?.dataset['ui']).toBe('firing-solution');
    expect(solution?.querySelector('.st-hud__instruments')).not.toBeNull();
    expect(solution?.querySelectorAll('[data-ui="weapon-bay"]')).toHaveLength(1);
    expect(solution?.querySelector('[data-ui="arsenal-drawer"]')).not.toBeNull();
    expect(solution?.querySelector('[data-ui="deterministic-aim-guide"]')).not.toBeNull();
    expect(solution?.querySelectorAll('[data-control="angle"]')).toHaveLength(1);
    expect(solution?.querySelectorAll('[data-control="power"]')).toHaveLength(1);
    expect(solution?.querySelector('.st-hud__gauge-cell--wind')).not.toBeNull();
    expect(solution?.querySelector('[data-ui="command-deck"]')).toBeNull();
    expect(solution?.querySelector('.st-hud__control-grid')).toBeNull();
    expect(solution?.querySelector('[data-command-action^="fire-"]')).toBeNull();
    expect(commitment?.querySelectorAll('.st-hud__turn-actions .st-hud__primary-action')).toHaveLength(1);
    expect(commitment?.querySelector('.st-hud__store-btn')).toBeNull();
    expect(commitment?.dataset['commandMode']).toBe('decision');
    expect(commitment?.querySelector('.st-hud__console-state')?.textContent)
      .toContain('Fire ready');
    const readback = commitment?.querySelector<HTMLElement>('[data-ui="shot-readback"]');
    expect(readback?.hidden).toBe(false);
    expect(readback?.getAttribute('aria-label')).toBe('Current firing solution');
    expect(readback?.textContent).toContain('Baby Missile');
    expect(readback?.textContent).toContain('45°');
    expect(readback?.textContent).toContain('Power 50');
    expect(readback?.textContent).toMatch(/Wind (?:Calm|\d+\.\d (?:left|right))/);
    expect(root.querySelector('.st-hud__command-console')).toBeNull();
    expect(root.querySelector('.st-hud__strip')).toBeNull();
    expect(root.querySelector('.st-hud__weapon')).toBeNull();
    expect(overlay.querySelector('.st-hud__command-console')).toBeNull();
  });

  it('marks one shell and applies the shared section rhythm to every rail region', () => {
    const root = mount();
    const rail = document.querySelector<HTMLElement>('#battle-rail')!;
    const commandConsole = rail.querySelector<HTMLElement>('.st-hud__command-console')!;

    expect(root.classList.contains('st-ui-shell')).toBe(true);
    expect(root.getAttribute('data-ui')).toBe('match-ledger');
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
    expect(rail.querySelector('.st-hud__strip')?.classList.contains('st-ui-section')).toBe(true);
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
    const persistentLedgerRegions = [...root.children];
    expect(persistentLedgerRegions).toEqual([
      root.querySelector('.st-hud__menu'),
      root.querySelector('[data-ui="match-mode"]'),
      root.querySelector('.st-hud__round'),
      roster,
      root.querySelector('.st-hud__conn'),
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
    expect(tile.querySelector('.st-hud__weapon-ammo')?.textContent).toBe('∞');

    state.tanks[0]!.selectedWeapon = 'bouncing_betty';
    hud.update(state, false, true);

    expect(document.querySelector('#battle-rail .st-hud__weapon')).toBe(tile);
    expect(document.querySelector('#battle-rail .st-hud__weapon-icon')).toBe(iconHost);
    expect(iconHost.querySelector('.st-weapon-icon')?.getAttribute('data-weapon'))
      .toBe('bouncing_betty');
    expect(tile.querySelector('.st-hud__weapon-value')?.textContent).toBe('Bouncing Betty');
    expect(tile.querySelector('.st-hud__weapon-ammo')?.textContent).toBe('2');
  });

  it('replaces the focused Fire commitment through submit, flight, resolution, and handoff', () => {
    const { hud, state } = mountHarness();
    const commandConsole = document.querySelector<HTMLElement>(
      '#battle-rail .st-hud__command-console',
    )!;
    const commitment = document.querySelector<HTMLElement>(
      '#battle-rail .st-hud__console-commitment',
    )!;
    const stateLabel = commitment.querySelector<HTMLElement>('.st-hud__console-state')!;
    const fire = commitment.querySelector<HTMLButtonElement>('.st-hud__primary-action')!;
    let fired = 0;
    hud.onPrimaryAction(() => {
      fired += 1;
      hud.update(state, true, false);
    });

    expect(commitment.dataset['commandMode']).toBe('decision');
    expect(stateLabel.textContent).toContain('Fire ready');
    expect(commitment.querySelector<HTMLElement>('[data-ui="shot-readback"]')?.hidden).toBe(false);
    fire.focus();
    fire.click();

    expect(fired).toBe(1);
    expect(commitment.dataset['commandMode']).toBe('submitting');
    expect(stateLabel.textContent).toContain('Submitting shot');
    expect(stateLabel.textContent?.trim()).not.toBe('');
    expect(fire.isConnected).toBe(false);
    expect(commitment.querySelector('.st-hud__primary-action')).toBeNull();
    expect(commitment.querySelector<HTMLElement>('[data-ui="shot-readback"]')?.hidden).toBe(true);
    expect(commandConsole.contains(document.activeElement)).toBe(true);

    state.phase = 'FIRING';
    hud.update(state, true, false);

    expect(commitment.dataset['commandMode']).toBe('tracking');
    expect(stateLabel.textContent).toContain('Tracking shot');
    expect(stateLabel.title).toBe('Shot in flight.');
    expect(commitment.querySelector('button')).toBeNull();

    state.phase = 'RESOLVING';
    hud.update(state, false, false);

    expect(commitment.dataset['commandMode']).toBe('resolving');
    expect(stateLabel.textContent).toContain('Resolving impact');
    expect(commitment.textContent).toContain('Resolving terrain and damage.');
    expect(commitment.querySelector('button')).toBeNull();

    state.phase = 'PLAYER_TURN';
    state.activePlayerId = state.tanks[1]!.id;
    hud.update(state, false, false, false);

    expect(commitment.dataset['commandMode']).toBe('handoff');
    expect(stateLabel.textContent).toContain('Awaiting remote action');
    expect(commitment.textContent).toContain('Another commander controls this turn.');
    expect(commitment.querySelector('button')).toBeNull();
    expect(commandConsole.contains(document.activeElement)).toBe(true);
    expect(fired).toBe(1);
  });

  it('keeps retry recovery in the report without adding a terminal console action', () => {
    const { rail, modal, hud, state } = mountHarness();
    const retry = vi.fn();
    hud.onVerifiedRetry(retry);
    hud.setVerifiedDeployment({
      status: 'retryable',
      humanSalvos: 6,
      cpuSalvos: 6,
      humanLimit: 6,
      cpuLimit: 6,
      deadline: {
        remainingMs: 30_000,
        warning: 'one-minute',
        acceptsInput: false,
        canComplete: true,
      },
    });
    state.phase = 'GAME_OVER';
    state.winner = state.tanks[0]!.id;

    hud.update(state, false, false);

    const commitment = rail.querySelector<HTMLElement>('.st-hud__console-commitment')!;
    const reportRetry = modal.querySelector<HTMLButtonElement>(
      '.st-hud__victory-verified-retry',
    )!;
    expect(commitment.dataset['commandMode']).toBe('recovery');
    expect(commitment.textContent).toContain('Retry verification in report');
    expect(commitment.querySelectorAll('button')).toHaveLength(0);
    expect(reportRetry.isConnected).toBe(true);
    expect(reportRetry.textContent).toBe('Retry verification');
    expect(reportRetry.disabled).toBe(false);
  });

  it('uses exact decorative SVG icons while visible text keeps actions named', () => {
    const root = mount();
    const menu = root.querySelector<HTMLButtonElement>('.st-hud__menu')!;
    const arsenal = document.querySelector<HTMLButtonElement>(
      '#battle-rail .st-hud__strip-toggle',
    )!;
    const fire = document.querySelector<HTMLButtonElement>('#battle-rail .st-hud__primary-action')!;
    const iconRoots = [menu, fire, arsenal];
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
    expect(arsenal.querySelector('[data-icon="arsenal"] circle')?.getAttribute('r')).toBe('9');
    expect(
      arsenal.querySelector('[data-icon="disclosure"]')?.closest('.st-ui-glyph'),
    ).toBeNull();
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.getAttribute('focusable')).toBe('false');
    }
  });

  it('exposes the arsenal as a controlled in-rail drawer', () => {
    mount();
    const rail = document.querySelector<HTMLElement>('#battle-rail')!;
    const strip = rail.querySelector<HTMLElement>('.st-hud__strip')!;
    const toggle = rail.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    const body = rail.querySelector<HTMLElement>('.st-hud__strip-body')!;
    const grid = rail.querySelector<HTMLElement>('.st-hud__strip-grid')!;
    const intel = rail.querySelector<HTMLElement>('.st-hud__weapon-intel')!;

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
    expect(rail.querySelector<HTMLElement>('[data-ui="solution-adjustments"]')?.inert)
      .toBe(true);
    expect(rail.querySelector<HTMLElement>('.st-hud__console-commitment')?.inert)
      .toBe(true);

    const firstWeapon = grid.querySelector<HTMLButtonElement>('.st-hud__weapon-btn')!;
    firstWeapon.focus();
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(rail.querySelector<HTMLElement>('[data-ui="solution-adjustments"]')?.inert)
      .toBe(false);
    expect(rail.querySelector<HTMLElement>('.st-hud__console-commitment')?.inert)
      .toBe(false);

    toggle.click();
    toggle.click();
    expect(toggle.getAttribute('aria-label')).toBe('Expand arsenal');
    expect(toggle.textContent).toContain('Expand');
  });

  it('keeps each drawer control relationship unique across HUD instances', () => {
    mount();
    mount();
    const rails = [...document.querySelectorAll<HTMLElement>('#battle-rail')];
    expect(rails).toHaveLength(2);
    const first = rails[0]!;
    const second = rails[1]!;
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
    const { root, rail, modal, hud, state } = mountHarness();
    const selected: string[] = [];
    hud.onWeaponSelect((weapon) => selected.push(weapon));
    rail.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const missile = rail.querySelector<HTMLButtonElement>(
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
      rail.querySelector<HTMLButtonElement>(
        '.st-hud__weapon-btn[data-weapon="baby_missile"]',
      )!.getAttribute('aria-pressed'),
    ).toBe('false');

    const strip = rail.querySelector('.st-hud__strip')!;
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
