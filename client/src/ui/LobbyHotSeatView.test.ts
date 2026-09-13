import { describe, expect, it, vi } from 'vitest';
import { buildLobbyHotSeatView, type LobbyHotSeatViewOptions } from './LobbyHotSeatView';

function section(name: string): HTMLElement {
  const element = document.createElement('section');
  element.dataset['section'] = name;
  return element;
}

function options(overrides: Partial<LobbyHotSeatViewOptions> = {}): LobbyHotSeatViewOptions {
  return {
    minPlayers: 2,
    maxPlayers: 4,
    playerCount: 2,
    playerRows: [section('player-1'), section('player-2')],
    advanced: section('advanced'),
    validationMessage: null,
    verifiedDeployment: null,
    onPlayerCountChange: vi.fn(),
    onStart: vi.fn(),
    ...overrides,
  };
}

function startButton(root: HTMLElement): HTMLButtonElement {
  const button = root.querySelector('.lobby-start');
  if (!(button instanceof HTMLButtonElement)) throw new Error('Missing Start Game button');
  return button;
}

describe('buildLobbyHotSeatView', () => {
  it('opens Local Battle with crew controls and its deployment footer visible', () => {
    const root = buildLobbyHotSeatView(options());
    const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"]')];
    const body = root.querySelector<HTMLElement>('.lobby-hotseat-body');

    expect(root.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Hot Seat modes');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Local Battle', 'Practice vs CPU', 'Verified Deployment',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(body?.getAttribute('aria-label')).toBe('Local Battle');
    expect(body?.querySelector('.lobby-rows')).not.toBeNull();
    expect(body?.querySelector('.lobby-hotseat-footer')?.contains(startButton(root))).toBe(true);
    expect(root.querySelector('.lobby-hotseat-customization')).toBeNull();
  });

  it('routes arrow-key tab selection without mounting inactive surfaces', () => {
    const onSurfaceChange = vi.fn();
    const root = buildLobbyHotSeatView({
      ...options(),
      surface: 'local',
      onSurfaceChange,
      quickOperations: [{ id: 'standard', title: 'Standard Duel', briefing: 'Balanced duel.' }],
      onQuickOperation: vi.fn(),
    } as LobbyHotSeatViewOptions);
    const local = root.querySelector<HTMLButtonElement>('[role="tab"][data-hotseat-surface="local"]')!;

    local.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onSurfaceChange).toHaveBeenCalledWith('practice', true);
    expect(root.querySelector('[data-operation-lane="practice"]')).toBeNull();
    expect(root.querySelector('.lobby-verified-deployment')).toBeNull();
  });

  it('composes authenticated career choices into one Commander Operations board', () => {
    const onQuickOperation = vi.fn();
    const root = buildLobbyHotSeatView(options({
      quickOperations: [
        { id: 'standard', title: 'Standard Duel', briefing: 'A balanced two-tank exhibition.' },
        { id: 'crosswind-range', title: 'Crosswind Range', briefing: 'Wraparound walls turn shifting wind into a ranging test.' },
      ],
      onQuickOperation,
      surface: 'verified',
      verifiedDeployment: {
        action: 'start',
        commanderName: 'Ranger',
        busy: false,
        message: null,
        abandonIntent: false,
        fieldOrder: {
          id: 'first-strike',
          title: 'First Strike',
          instruction: 'Damage the CPU within your first three salvos.',
          progress: { salvosRemaining: 3 },
          result: null,
        },
        onLaunch: vi.fn(),
        onRequestAbandon: vi.fn(),
        onConfirmAbandon: vi.fn(),
        onCancelAbandon: vi.fn(),
      },
    }));

    const panel = root.querySelector<HTMLElement>('[role="tabpanel"]');
    const dossier = root.querySelector<HTMLElement>('.lobby-verified-deployment__dossier');
    const verified = root.querySelector<HTMLElement>('.lobby-verified-deployment');
    expect(panel?.getAttribute('aria-label')).toBe('Verified Deployment');
    expect(dossier?.getAttribute('aria-label')).toBe('Commander dossier');
    expect(verified?.textContent).toContain('Commander Ranger');
    expect(root.querySelector('[data-operation-lane="practice"]')).toBeNull();
    expect(root.querySelector('.lobby-rows')).toBeNull();
    expect(root.querySelector('.lobby-hotseat-footer .lobby-verified-deployment__launch'))
      .not.toBeNull();
    expect(root.textContent).not.toMatch(/bonus|reward|unlock|medal|streak/i);
  });

  it('mounts only Practice vs CPU and launches the selected existing operation', () => {
    const onQuickOperation = vi.fn();
    const root = buildLobbyHotSeatView(options({
      surface: 'practice',
      quickOperations: [
        { id: 'standard', title: 'Standard Duel', briefing: 'Balanced duel.' },
        { id: 'crosswind-range', title: 'Crosswind Range', briefing: 'Ranging test.' },
      ],
      onQuickOperation,
    }));
    const selector = root.querySelector<HTMLSelectElement>('[data-ui="practice-operation-selector"]')!;
    const selection = root.querySelector<HTMLElement>('[data-ui="selected-practice-operation"]')!;
    expect(selection.textContent).toContain('Standard Duel');
    expect(selection.textContent).toContain('Balanced duel.');
    selector.value = 'crosswind-range';
    selector.dispatchEvent(new Event('change'));
    expect(selection.textContent).toContain('Crosswind Range');
    expect(selection.textContent).toContain('Ranging test.');
    root.querySelector<HTMLButtonElement>('[data-ui="launch-practice-operation"]')!.click();

    expect(root.querySelector('[role="tabpanel"]')?.getAttribute('aria-label')).toBe('Practice vs CPU');
    expect(root.querySelector('.lobby-rows')).toBeNull();
    expect(root.querySelector('.lobby-verified-deployment')).toBeNull();
    expect(onQuickOperation).toHaveBeenCalledWith('crosswind-range');
  });

  it('presents valid defaults as directly editable local preparation', () => {
    const root = buildLobbyHotSeatView(options());
    const setup = root.querySelector<HTMLElement>('.lobby-route-brief__setup');
    const start = startButton(root);

    expect(setup).not.toBeNull();
    expect(root.querySelector('.lobby-hotseat-customization')).toBeNull();
    expect(root.querySelector('.lobby-hotseat-scroll')?.contains(setup)).toBe(true);
    expect(root.querySelector('.lobby-hotseat-footer')?.contains(start)).toBe(true);
  });

  it('renders the player range, selected count, shared-node order, and crowded layout', () => {
    const playerRows = [section('player-1'), section('player-2'), section('player-3')];
    const advanced = section('advanced');
    const root = buildLobbyHotSeatView(options({ playerCount: 3, playerRows, advanced }));

    expect(root.className).toBe('lobby-route-brief lobby-hotseat crowded');
    expect(root.querySelector('.lobby-route-brief__setup')?.getAttribute('aria-label'))
      .toBe('Local battery setup');
    const select = root.querySelector('select');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect([...select!.options].map((option) => option.value)).toEqual(['2', '3', '4']);
    expect(select!.value).toBe('3');

    const rows = root.querySelector('.lobby-rows');
    expect(rows?.classList.contains('crowded')).toBe(true);
    expect([...rows!.children]).toEqual(playerRows);
    const crew = root.querySelector<HTMLElement>('[aria-labelledby="crew-manifest-heading"]');
    const protocol = root.querySelector<HTMLElement>('[aria-labelledby="battlefield-protocol-heading"]');
    expect(crew?.querySelector('.lobby-preparation-section__title')?.textContent)
      .toBe('Crew');
    expect(crew?.querySelector('select')).toBe(select);
    expect(crew?.querySelector('.lobby-rows')).toBe(rows);
    expect(protocol?.querySelector('.lobby-preparation-section__title')?.textContent)
      .toBe('Battlefield');
    expect(protocol?.querySelector('[data-section="advanced"]')).toBe(advanced);
  });

  it('routes player-count changes and an enabled Start action', () => {
    const onPlayerCountChange = vi.fn();
    const onStart = vi.fn();
    const root = buildLobbyHotSeatView(options({ onPlayerCountChange, onStart }));
    const select = root.querySelector('select')!;

    select.value = '4';
    select.dispatchEvent(new Event('change'));
    expect(onPlayerCountChange).toHaveBeenCalledOnce();
    expect(onPlayerCountChange).toHaveBeenCalledWith(4);

    const start = startButton(root);
    expect(start.textContent).toBe('Deploy local battle');
    expect(start.className).toBe('lobby-start lobby-btn primary');
    expect(start.disabled).toBe(false);
    start.click();
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('renders the current validation error and suppresses an invalid Start action', () => {
    const onStart = vi.fn();
    const root = buildLobbyHotSeatView(options({
      validationMessage: 'Each player must pick a unique color.',
      onStart,
    }));

    expect(root.className).toBe('lobby-route-brief lobby-hotseat');
    expect(root.querySelector('.lobby-rows')?.classList.contains('crowded')).toBe(false);
    expect(root.querySelector('.lobby-error')?.textContent)
      .toBe('Each player must pick a unique color.');
    expect(root.querySelector('.lobby-hotseat-customization')).toBeNull();
    const start = startButton(root);
    expect(start.disabled).toBe(true);
    start.click();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('keeps casual deployment primary while disclosing one authenticated verified start', () => {
    const onLaunch = vi.fn();
    const root = buildLobbyHotSeatView(options({
      surface: 'verified',
      verifiedDeployment: {
        action: 'start',
        commanderName: 'Ranger',
        busy: false,
        message: null,
        abandonIntent: false,
        fieldOrder: {
          id: 'first-strike', title: 'First Strike',
          instruction: 'Damage the CPU within your first three salvos.',
          progress: { salvosRemaining: 3 }, result: null,
        },
        onLaunch,
        onRequestAbandon: vi.fn(),
        onConfirmAbandon: vi.fn(),
        onCancelAbandon: vi.fn(),
      },
    }));
    const verified = root.querySelector<HTMLElement>('.lobby-verified-deployment');

    expect(verified?.getAttribute('aria-label')).toBe('Verified deployment');
    expect(verified?.querySelector('h3')?.textContent).toBe('Verified deployment');
    expect(verified?.textContent).toContain('Commander Ranger versus deterministic CPU');
    expect(verified?.textContent).toContain('Baby Missile only');
    expect(verified?.textContent).toContain('6 human / 6 CPU salvos maximum');
    expect(verified?.textContent).toContain('Fixed battlefield rules');
    expect(verified?.textContent).toContain('Verified XP stakes');
    expect(verified?.textContent).toContain('30-minute deadline');
    expect(root.textContent).toContain('Commander dossier');
    expect(root.textContent).toContain('First Strike · Damage the CPU within your first three salvos.');
    expect(verified?.querySelector('input')).toBeNull();
    const launch = [...root.querySelectorAll('button')]
      .find((candidate) => candidate.textContent === 'Start verified deployment');
    expect(launch).toBeInstanceOf(HTMLButtonElement);
    launch!.click();
    expect(onLaunch).toHaveBeenCalledOnce();
  });

  it('renders a contained resume and requires a separate abandon confirmation', () => {
    const onLaunch = vi.fn();
    const onRequestAbandon = vi.fn();
    const onConfirmAbandon = vi.fn();
    const onCancelAbandon = vi.fn();
    const root = buildLobbyHotSeatView(options({
      surface: 'verified',
      verifiedDeployment: {
        action: 'resume',
        commanderName: 'Ranger',
        busy: false,
        message: 'Recovered 2 of 6 human salvos.',
        abandonIntent: true,
        fieldOrder: null,
        onLaunch,
        onRequestAbandon,
        onConfirmAbandon,
        onCancelAbandon,
      },
    }));
    const verified = root.querySelector<HTMLElement>('.lobby-verified-deployment')!;

    expect(root.contains(verified)).toBe(true);
    expect(verified.textContent).toContain('Recovered 2 of 6 human salvos.');
    expect(verified.querySelector('input')).toBeNull();
    expect([...root.querySelectorAll('.lobby-hotseat-footer button')].map((candidate) => candidate.textContent))
      .toEqual([
        'Resume verified deployment',
        'Abandon verified deployment',
        'Confirm abandon',
        'Keep deployment',
      ]);

    [...root.querySelectorAll<HTMLButtonElement>('.lobby-hotseat-footer button')]
      .find((candidate) => candidate.textContent === 'Resume verified deployment')!
      .click();
    [...root.querySelectorAll<HTMLButtonElement>('.lobby-hotseat-footer button')]
      .find((candidate) => candidate.textContent === 'Abandon verified deployment')!
      .click();
    [...root.querySelectorAll<HTMLButtonElement>('.lobby-hotseat-footer button')]
      .find((candidate) => candidate.textContent === 'Confirm abandon')!
      .click();
    [...root.querySelectorAll<HTMLButtonElement>('.lobby-hotseat-footer button')]
      .find((candidate) => candidate.textContent === 'Keep deployment')!
      .click();
    expect(onLaunch).toHaveBeenCalledOnce();
    expect(onRequestAbandon).toHaveBeenCalledOnce();
    expect(onConfirmAbandon).toHaveBeenCalledOnce();
    expect(onCancelAbandon).toHaveBeenCalledOnce();
  });

  it('does not expose a false verified action without authenticated view state', () => {
    const root = buildLobbyHotSeatView(options({ verifiedDeployment: null }));

    expect(root.querySelector('.lobby-verified-deployment')).toBeNull();
    expect(startButton(root).disabled).toBe(false);
  });
});
