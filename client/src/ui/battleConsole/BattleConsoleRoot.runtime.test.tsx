// @vitest-environment jsdom

import { fireEvent, getByRole, queryAllByRole } from '@testing-library/dom';
import { render } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { BattleConsoleRoot } from './BattleConsoleRoot';
import layers from '../../../../.codearbiter/contracts/battle-console/ownership/layers.json';
import projections from '../../../../.codearbiter/contracts/battle-console/topology/projections.json';
import type { BattleConsolePresentationState } from './types';

const state: BattleConsolePresentationState = {
  commander: {
    id: 'p1',
    name: 'Player 1',
    portrait: {
      color: '#e84d4d',
      loadout: { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' },
    },
    health: 100,
  },
  mobility: { fuel: 100, canMoveLeft: true, canMoveRight: true },
  weapon: { type: 'baby_missile', name: 'Baby Missile', ammo: null, canCycle: true },
  armory: { open: false, submitting: false, items: [] },
  ballistics: { angle: 45, power: 50, wind: -1.3 },
  fireControl: { status: 'Fire ready', guidance: '', ready: true, submitting: false },
  settings: { open: false, soundEnabled: true, guideEnabled: true, returnFocusKey: null },
  coach: { step: null, briefingOpen: false },
  focusOwner: null,
};

describe('P-05 semantic runtime owner', () => {
  // AC-02/03 successor: live values always use DOM ink; canonical snapshots remain historical.
  it.each([100, 92, 9, 0])('keeps all live values in the same DOM treatment with %i fuel', (fuel) => {
    const host = document.createElement('div');
    render(<BattleConsoleRoot state={{ ...state, mobility: { ...state.mobility, fuel } }} lifecycleStatus="ready" dispatch={vi.fn()} />, host);
    for (const id of ['player-name', 'health-value', 'fuel-label', 'fuel-value', 'weapon-name', 'angle-value', 'power-value', 'wind-value', 'fire-ready-text']) {
      expect(host.querySelector(`[data-battle-console-semantic-ink="${id}"]`)).toBeNull();
    }
    expect(host.querySelector('[data-semantic-key="node:span:100 fuel remaining:19"]')?.textContent).toBe(String(fuel));
    expect(host.querySelector('[data-battle-console-fuel-well]')).not.toBeNull();
    expect(host.querySelector('[data-semantic-key="node:span:FUEL:18"]')?.textContent).toBe('FUEL');
  });

  it('renders one named console region and dispatches one typed fire intent', async () => {
    const host = document.createElement('div');
    const dispatch = vi.fn();
    render(<BattleConsoleRoot state={state} lifecycleStatus="ready" dispatch={dispatch} />, host);

    expect(queryAllByRole(host, 'region', { name: 'Turn command console' })).toHaveLength(1);
    expect(host.querySelector('[data-battle-console-portrait]')).toMatchObject({
      tagName: 'CANVAS',
    });
    await vi.waitFor(() => {
    expect(host.querySelector<HTMLCanvasElement>('[data-battle-console-portrait]')?.dataset)
        .toMatchObject({
          tankPreviewSignature: 'tactical|#e84d4d|foundry|foundry|foundry|foundry',
      });
    expect(host.querySelector('[data-battle-console-weapon-icon] svg')?.getAttribute('data-weapon')).toBe('baby_missile');
    expect(
      getByRole(host, 'button', { name: 'Move tank left, 8 fuel maximum' }).closest('[inert]'),
    ).toBeNull();
    });
    expect(host.querySelector('[data-semantic-key="node:output:Angle:43"]')?.textContent).toBe('45°');
    expect(host.querySelector('[data-semantic-key="node:output:Power:52"]')?.textContent).toBe('50');
    expect(host.querySelector('[data-semantic-key="node:output:Wind:58"]')?.textContent).toBe('← 1.3');
    expect(getByRole(host, 'button', { name: 'Move tank left, 8 fuel maximum' }).textContent).toBe('‹');
    expect(host.querySelector('[data-battle-console-text-key="commander.health"]')?.textContent).toBe('100 HP');
    expect(host.querySelectorAll('[data-battle-console-target-key]')).toHaveLength(projections.compactTargets.length);
    expect(host.querySelectorAll('[data-battle-console-assembly-key]')).toHaveLength(projections.assemblies.length);
    expect(host.querySelectorAll('[data-battle-console-socket-key]')).toHaveLength(projections.transformedSockets.length);
    expect(host.querySelectorAll('[data-battle-console-landmark-key]')).toHaveLength(projections.transformedLandmarks.length);
    expect(host.querySelectorAll('[data-battle-console-layer-key]')).toHaveLength(layers.records.length);
    expect(host.querySelector('[data-battle-console-semantic-ink="player-name"]')).toBeNull();
    expect(host.querySelector('[data-battle-console-semantic-ink="angle-value"]')).toBeNull();
    expect(host.querySelector('[data-battle-console-semantic-ink="wind-value"]')).toBeNull();
    expect(
      (host.querySelector('[data-battle-console-semantic-ink="commander-title"]') as HTMLElement).style.backgroundImage,
    ).toContain('/art/battle-console-integrated/canonical-semantic-atlas.png');
    expect([
      ...host.querySelectorAll<HTMLImageElement>('[data-battle-console-semantic-preload]'),
    ].map((image) => image.getAttribute('src'))).toEqual([
      '/art/battle-console-integrated/canonical-semantic-atlas.png',
      '/art/battle-console-integrated/canonical-semantic-atlas-standard.png',
      '/art/battle-console-integrated/canonical-semantic-atlas-compact.png',
    ]);
    const matchFramePreload = host.querySelector<HTMLImageElement>(
      '[data-battle-console-match-frame-preload]',
    );
    expect(matchFramePreload).not.toBeNull();
    expect(matchFramePreload?.getAttribute('src')).toContain('battle-match-frame-v2.webp');
    fireEvent.click(getByRole(host, 'button', { name: 'Fire Baby Missile' }));
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'fire' });

    render(
      <BattleConsoleRoot
        state={{
          ...state,
          commander: { ...state.commander, name: 'Player 2', health: 73 },
          mobility: { ...state.mobility, fuel: 61 },
          ballistics: { angle: 135, power: 70, wind: 2 },
        }}
        lifecycleStatus="ready"
        dispatch={dispatch}
      />,
      host,
    );
    expect(getByRole(host, 'status', {
      name: "Player 2's turn. 73 health. Weapon Baby Missile. 61 fuel remaining.",
    })).toBeTruthy();
    expect(getByRole(host, 'status', {
      name: 'Fire ready. Baby Missile · 135° · Power 70 · Wind 2.0 right.',
    })).toBeTruthy();
    expect(host.querySelector('[data-battle-console-semantic-ink="player-name"]')).toBeNull();
    expect(host.querySelector('[data-battle-console-semantic-ink="angle-value"]')).toBeNull();
    expect(host.querySelector('[data-battle-console-semantic-ink="fuel-label"]')).toBeNull();
    expect(host.querySelector('[data-battle-console-semantic-ink="fuel-value"]')).toBeNull();
  });

  it('presents the wind face as a read-only instrument without action dispatch', () => {
    const host = document.createElement('div');
    const dispatch = vi.fn();
    render(<BattleConsoleRoot state={state} lifecycleStatus="ready" dispatch={dispatch} />, host);
    const label = host.querySelector('[data-battle-console-wind-label]');
    expect(label?.textContent).toBe('WIND');
    expect(host.textContent).not.toContain('READ ONLY');
    fireEvent.click(label!);
    expect(dispatch).not.toHaveBeenCalled();
    expect(getByRole(host, 'status', { name: 'Wind 1.3 left' }).textContent).toBe('← 1.3');
  });

  it.each(['remote', 'submitting'] as const)('disables desktop aim and power during %s input lock', (lock) => {
    const host = document.createElement('div');
    const dispatch = vi.fn();
    render(<BattleConsoleRoot state={{
      ...state,
      weapon: { ...state.weapon, canCycle: lock !== 'remote' },
      fireControl: { ...state.fireControl, submitting: lock === 'submitting' },
    }} lifecycleStatus="ready" dispatch={dispatch} />, host);
    for (const name of ['Aim barrel left', 'Aim barrel right', 'Decrease power', 'Increase power']) {
      expect((getByRole(host, 'button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('shows the actual firing status while resolution locks input', () => {
    const host = document.createElement('div');
    render(<BattleConsoleRoot state={{ ...state, fireControl: { ...state.fireControl, ready: false, status: 'Resolving' } }} lifecycleStatus="ready" dispatch={vi.fn()} />, host);
    expect(host.querySelector('[data-semantic-key="node:span:Fire ready:67"]')?.textContent).toBe('Resolving');
    expect((getByRole(host, 'button', { name: 'Fire Baby Missile' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('rounds fractional Commander health consistently for visible and accessible output', () => {
    const host = document.createElement('div');
    render(
      <BattleConsoleRoot
        state={{
          ...state,
          commander: { ...state.commander, health: 41.1999999999976 },
        }}
        lifecycleStatus="ready"
        dispatch={vi.fn()}
      />,
      host,
    );

    const health = host.querySelector('[data-battle-console-text-key="commander.health"]');
    expect(health?.textContent).toBe('41 HP');
    expect(health?.getAttribute('aria-label')).toBe('41 health remaining');
    expect(getByRole(host, 'status', {
      name: "Player 1's turn. 41 health. Weapon Baby Missile. 100 fuel remaining.",
    })).toBeTruthy();
  });

  it('mounts the frozen settings semantic tree in its portal', async () => {
    const host = document.createElement('div');
    const settingsHost = document.createElement('div');
    document.body.append(host, settingsHost);
    const dispatch = vi.fn();
    render(
      <BattleConsoleRoot
        state={{
          ...state,
          settings: {
            ...state.settings,
            open: true,
            returnFocusKey: 'command-console-host::settings-trigger',
          },
        }}
        lifecycleStatus="ready"
        dispatch={dispatch}
        portalHosts={{ settings: settingsHost, armory: null, coach: null }}
      />,
      host,
    );

    expect(queryAllByRole(settingsHost, 'dialog', { name: 'Battle Settings' })).toHaveLength(1);
    const dialog = getByRole(settingsHost, 'dialog', { name: 'Battle Settings' });
    expect(dialog.getAttribute('data-battle-console-dialog')).toBe('settings');
    expect(dialog.querySelector('[data-battle-console-settings-grid]')).not.toBeNull();
    const guide = getByRole(settingsHost, 'switch', { name: 'Trajectory guide' });
    const close = getByRole(settingsHost, 'button', { name: 'Close settings' });
    await vi.waitFor(() => expect(guide).toBe(document.activeElement));
    close.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(guide).toBe(document.activeElement);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(close).toBe(document.activeElement);
    fireEvent.click(settingsHost.querySelector('[data-battle-console-settings-backdrop]')!);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'settings-close' });
    render(
      <BattleConsoleRoot
        state={{
          ...state,
          settings: {
            ...state.settings,
            open: false,
            returnFocusKey: 'command-console-host::settings-trigger',
          },
        }}
        lifecycleStatus="ready"
        dispatch={() => {}}
        portalHosts={{ settings: settingsHost, armory: null, coach: null }}
      />,
      host,
    );
    await vi.waitFor(() => expect(getByRole(host, 'button', { name: 'Battle settings' })).toBe(document.activeElement));
    render(null, host);
    host.remove();
    settingsHost.remove();
  });

  it('returns pause-origin settings focus to the retained match control', async () => {
    const host = document.createElement('div');
    const settingsHost = document.createElement('div');
    const match = document.createElement('button');
    match.dataset['ui'] = 'match-drawer-toggle';
    document.body.append(host, settingsHost, match);
    render(
      <BattleConsoleRoot
        state={{ ...state, settings: { ...state.settings, open: true, returnFocusKey: 'pause-origin::menu-trigger' } }}
        lifecycleStatus="ready"
        dispatch={vi.fn()}
        portalHosts={{ settings: settingsHost, armory: null, coach: null }}
      />,
      host,
    );
    await vi.waitFor(() => expect(getByRole(settingsHost, 'switch', { name: 'Trajectory guide' })).toBe(document.activeElement));
    render(
      <BattleConsoleRoot
        state={{ ...state, settings: { ...state.settings, open: false, returnFocusKey: 'pause-origin::menu-trigger' } }}
        lifecycleStatus="ready"
        dispatch={vi.fn()}
        portalHosts={{ settings: settingsHost, armory: null, coach: null }}
      />,
      host,
    );
    await vi.waitFor(() => expect(match).toBe(document.activeElement));
    render(null, host);
    host.remove();
    settingsHost.remove();
    match.remove();
  });

  it('projects the inline Armory disclosure and restores focus after Escape', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const dispatch = vi.fn();
    render(<BattleConsoleRoot state={state} lifecycleStatus="ready" dispatch={dispatch} />, host);

    const open = getByRole(host, 'button', { name: 'Open Armory' });
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(open.textContent).toBe('Armory');
    fireEvent.click(open);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'armory-open' });

    render(
      <BattleConsoleRoot
        state={{ ...state, armory: { ...state.armory, open: true } }}
        lifecycleStatus="ready"
        dispatch={dispatch}
      />,
      host,
    );
    expect(
      host.querySelector('[data-semantic-key="armory-inline-host::weapon-trigger"]'),
    ).toHaveProperty('hidden', true);
    expect(host.querySelector('[data-console-owner="preact"]')?.hasAttribute('inert')).toBe(true);
    expect(queryAllByRole(host, 'dialog', { name: 'Armory' })).toHaveLength(1);
    const armory = getByRole(host, 'dialog', { name: 'Armory' });
    expect(armory.getAttribute('data-battle-console-dialog')).toBe('armory');
    expect(armory.querySelector('[data-battle-console-armory-scroll]')).not.toBeNull();
    expect(armory.textContent)
      .not.toContain('WeaponsCredits');
    const close = getByRole(host, 'button', { name: 'Close Armory' });
    await vi.waitFor(() => expect(close).toBe(document.activeElement));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'armory-close' });
    render(
      <BattleConsoleRoot
        state={{ ...state, armory: { ...state.armory, open: false } }}
        lifecycleStatus="ready"
        dispatch={dispatch}
      />,
      host,
    );
    await vi.waitFor(() => expect(getByRole(host, 'button', { name: 'Open Armory' })).toBe(document.activeElement));
    render(null, host);
    host.remove();
  });

  it('renders canonical semantic ink from the physical mode atlas without browser scaling', () => {
    const host = document.createElement('div');
    render(
      <BattleConsoleRoot
        state={state}
        lifecycleStatus="ready"
        dispatch={vi.fn()}
        layoutMode="standard"
        scale={295 / 347}
      />,
      host,
    );

    const layer = host.querySelector<HTMLElement>('[data-battle-console-semantic-mode="standard"]');
    const commander = host.querySelector<HTMLElement>('[data-battle-console-semantic-ink="commander-title"]');
    expect(Number(layer?.style.transform.match(/scale\((.+)\)/)?.[1])).toBeCloseTo(347 / 295, 12);
    expect(commander?.style.backgroundImage).toContain('canonical-semantic-atlas-standard.png');
    expect(commander?.style.left).not.toBe('151px');
  });

  it('owns first-salvo briefing entry focus without a legacy HUD node reference', async () => {
    const host = document.createElement('div');
    const coachHost = document.createElement('div');
    const dispatch = vi.fn();
    document.body.append(host, coachHost);

    render(
      <BattleConsoleRoot
        state={{ ...state, coach: { step: 'aim', briefingOpen: true } }}
        lifecycleStatus="ready"
        dispatch={dispatch}
        portalHosts={{ settings: null, armory: null, coach: coachHost }}
      />,
      host,
    );

    await vi.waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Enter battle');
    });
    const enter = getByRole(coachHost, 'button', { name: 'Enter battle' });
    const skip = getByRole(coachHost, 'button', { name: 'Skip' });
    fireEvent.keyDown(enter, { key: 'Tab' });
    expect(document.activeElement).toBe(skip);
    fireEvent.keyDown(skip, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(enter);
    skip.focus();
    window.dispatchEvent(new Event('st:splash-dismissed'));
    expect(document.activeElement).toBe(enter);
    expect(coachHost.textContent).toContain('Adjust angle and power');
    expect(coachHost.textContent).toContain('Wind changes each turn');
    expect(coachHost.textContent).toContain('Fire commits your shot');
    fireEvent.click(getByRole(coachHost, 'button', { name: 'Enter battle' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'coach-enter' });

    render(
      <BattleConsoleRoot
        state={{ ...state, coach: { step: 'aim', briefingOpen: false } }}
        lifecycleStatus="ready"
        dispatch={dispatch}
        portalHosts={{ settings: null, armory: null, coach: coachHost }}
      />,
      host,
    );
    expect(queryAllByRole(coachHost, 'dialog', { name: 'First salvo briefing' })).toHaveLength(0);
    expect(host.querySelector('[data-console-owner="preact"]')?.hasAttribute('inert')).toBe(false);
    const fire = getByRole(host, 'button', { name: 'Fire Baby Missile' });
    await vi.waitFor(() => expect(document.activeElement).toBe(fire));
    render(null, host);
    host.remove();
    coachHost.remove();
  });
});
