import { describe, expect, it, vi } from 'vitest';
import {
  buildLobbyLocalBattleView,
  buildLobbyVerifiedOperationsView,
  type LobbyHotSeatVerifiedDeploymentOptions,
  type LobbyLocalBattleViewOptions,
} from './LobbyHotSeatView';

function section(name: string): HTMLElement {
  const element = document.createElement('section');
  element.dataset.section = name;
  return element;
}

function localOptions(
  overrides: Partial<LobbyLocalBattleViewOptions> = {},
): LobbyLocalBattleViewOptions {
  return {
    minPlayers: 2,
    maxPlayers: 4,
    playerCount: 2,
    playerRows: [section('player-1'), section('player-2')],
    vehicleInspection: section('vehicle-inspection'),
    advanced: section('advanced'),
    validationMessage: null,
    onPlayerCountChange: vi.fn(),
    onStart: vi.fn(),
    ...overrides,
  };
}

function deploymentOptions(
  overrides: Partial<LobbyHotSeatVerifiedDeploymentOptions> = {},
): LobbyHotSeatVerifiedDeploymentOptions {
  return {
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
    ...overrides,
  };
}

function challengeOptions() {
  return {
    accountId: '11111111-1111-4111-8111-111111111111',
    busy: false,
    state: { status: 'idle' as const },
    career: { status: 'unavailable' as const, accountId: '11111111-1111-4111-8111-111111111111' },
    onLaunch: vi.fn(),
    onRetry: vi.fn(),
    onAbandon: vi.fn(),
  };
}

describe('owned multiplayer preparation views', () => {
  it('mounts Local Battle directly without retired route tabs or tabpanels', () => {
    const root = buildLobbyLocalBattleView(localOptions());

    expect(root.classList.contains('lobby-hotseat--local')).toBe(true);
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    expect(root.querySelector('[role="tabpanel"]')).toBeNull();
    expect(root.querySelector('[data-multiplayer-surface="local"]')).not.toBeNull();
    expect(root.querySelector('.lobby-rows')).not.toBeNull();
    expect(root.querySelector('.lobby-start')).not.toBeNull();
    expect(root.querySelector('.lobby-verified-deployment')).toBeNull();
  });

  it('presents crew and effective rules as one named preparation flow with one Deploy action', () => {
    const root = buildLobbyLocalBattleView(localOptions());
    const preparation = root.querySelector<HTMLElement>('[data-local-preparation]');

    expect(preparation).not.toBeNull();
    const headingId = preparation?.getAttribute('aria-labelledby');
    const contextId = preparation?.getAttribute('aria-describedby');
    expect(headingId).toBeTruthy();
    expect(contextId).toBeTruthy();
    expect(root.querySelector(`#${headingId}`)?.textContent).toMatch(/crew preparation/i);
    expect(root.querySelector(`#${contextId}`)?.textContent).toMatch(/crew/i);
    expect(root.querySelector(`#${contextId}`)?.textContent).toMatch(/vehicle/i);
    expect(root.querySelector(`#${contextId}`)?.textContent).toMatch(/rules/i);
    const inspection = preparation?.querySelector<HTMLElement>(
      '[aria-label="Selected vehicle inspection"]',
    );
    expect(inspection?.querySelector('[data-section="vehicle-inspection"]')).not.toBeNull();

    const rules = preparation?.querySelector<HTMLElement>(
      '[aria-labelledby="battlefield-protocol-heading"]',
    );
    expect(rules?.querySelector('#battlefield-protocol-heading')?.textContent)
      .toBe('Effective rules');
    expect(preparation?.querySelectorAll<HTMLButtonElement>('.lobby-start')).toHaveLength(1);
    expect(preparation?.querySelector<HTMLButtonElement>('.lobby-start')?.textContent)
      .toBe('Deploy local battle');
  });

  it('renders the player range, selected count, shared-node order, and crowded layout', () => {
    const playerRows = [section('player-1'), section('player-2'), section('player-3')];
    const advanced = section('advanced');
    const root = buildLobbyLocalBattleView(localOptions({
      playerCount: 3,
      playerRows,
      advanced,
    }));

    expect(root.className).toBe('lobby-route-brief lobby-hotseat lobby-hotseat--local crowded');
    const select = root.querySelector('select')!;
    expect([...select.options].map((option) => option.value)).toEqual(['2', '3', '4']);
    expect(select.value).toBe('3');
    const rows = root.querySelector('.lobby-rows')!;
    expect([...rows.children]).toEqual(playerRows);
    expect(rows.classList.contains('crowded')).toBe(true);
    expect(root.querySelector('[aria-labelledby="crew-manifest-heading"]')?.contains(rows)).toBe(true);
    expect(root.querySelector('[aria-labelledby="battlefield-protocol-heading"]')?.contains(advanced))
      .toBe(true);
  });

  it('keeps four labelled crew seats inside the controlled Local scroll owner', () => {
    const playerRows = [1, 2, 3, 4].map((player) => {
      const row = section(`player-${player}`);
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-label', `Player ${player} crew seat`);
      return row;
    });
    const root = buildLobbyLocalBattleView(localOptions({
      playerCount: 4,
      playerRows,
    }));
    const scrollOwner = root.querySelector<HTMLElement>('.lobby-hotseat-scroll');
    const roster = root.querySelector<HTMLElement>('.lobby-rows');

    expect(roster?.getAttribute('role')).toBe('list');
    expect(scrollOwner?.contains(roster ?? null)).toBe(true);
    expect([...roster!.children]).toEqual(playerRows);
    expect(playerRows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Player 1 crew seat',
      'Player 2 crew seat',
      'Player 3 crew seat',
      'Player 4 crew seat',
    ]);
    expect(root.querySelectorAll('.lobby-start')).toHaveLength(1);
  });

  it('routes Local Battle edits and the single owned launch action', () => {
    const onPlayerCountChange = vi.fn();
    const onStart = vi.fn();
    const root = buildLobbyLocalBattleView(localOptions({ onPlayerCountChange, onStart }));
    const select = root.querySelector('select')!;
    select.value = '4';
    select.dispatchEvent(new Event('change'));
    const start = root.querySelector<HTMLButtonElement>('.lobby-start')!;
    start.click();

    expect(onPlayerCountChange).toHaveBeenCalledWith(4);
    expect(start.textContent).toBe('Deploy local battle');
    expect(root.querySelectorAll('.lobby-hotseat-footer .lobby-btn.primary')).toHaveLength(1);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('renders Local validation in place and suppresses an invalid launch', () => {
    const onStart = vi.fn();
    const root = buildLobbyLocalBattleView(localOptions({
      validationMessage: 'Each player must pick a unique color.',
      onStart,
    }));
    const start = root.querySelector<HTMLButtonElement>('.lobby-start')!;

    expect(root.querySelector('.lobby-error')?.textContent)
      .toBe('Each player must pick a unique color.');
    expect(start.disabled).toBe(true);
    start.click();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('mounts authenticated Verified Operations directly with its dossier and launch owner', () => {
    const deployment = deploymentOptions();
    const root = buildLobbyVerifiedOperationsView({ verifiedDeployment: deployment });

    expect(root.classList.contains('lobby-hotseat--verified')).toBe(true);
    expect(root.querySelector('[data-multiplayer-surface="verified"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="Hot Seat modes"]')).toBeNull();
    expect(root.querySelector('.lobby-rows')).toBeNull();
    expect(root.textContent).toContain('Commander Ranger versus deterministic CPU');
    expect(root.textContent).toContain('Commander dossier');
    expect(root.textContent).toContain('First Strike · Damage the CPU within your first three salvos.');
    root.querySelector<HTMLButtonElement>('.lobby-verified-deployment__launch')!.click();
    expect(deployment.onLaunch).toHaveBeenCalledOnce();
  });

  it('selects one verified operation without allocating a competing action', () => {
    const onVerifiedSurfaceChange = vi.fn();
    const deployment = deploymentOptions();
    const challenge = challengeOptions();
    const deploymentRoot = buildLobbyVerifiedOperationsView({
      verifiedDeployment: deployment,
      verifiedChallenge: challenge,
      onVerifiedSurfaceChange,
    });
    const selector = deploymentRoot.querySelector<HTMLElement>(
      '[role="tablist"][aria-label="Verified operation"]',
    )!;
    const challengeChoice = selector.querySelector<HTMLButtonElement>(
      '[data-verified-surface="challenge"]',
    )!;
    challengeChoice.click();
    challengeChoice.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(onVerifiedSurfaceChange).toHaveBeenNthCalledWith(1, 'challenge', true);
    expect(onVerifiedSurfaceChange).toHaveBeenNthCalledWith(2, 'deployment', true);
    expect(deploymentRoot.querySelector('.lobby-verified-deployment')).not.toBeNull();
    expect(deploymentRoot.querySelector('.lobby-verified-challenge')).toBeNull();

    const challengeRoot = buildLobbyVerifiedOperationsView({
      verifiedDeployment: deployment,
      verifiedChallenge: challenge,
      verifiedSurface: 'challenge',
      onVerifiedSurfaceChange,
    });
    expect(challengeRoot.querySelector('[data-verified-surface="challenge"]')?.getAttribute('aria-selected'))
      .toBe('true');
    expect(challengeRoot.querySelector('.lobby-verified-challenge')).not.toBeNull();
    expect(challengeRoot.querySelector('.lobby-verified-deployment')).toBeNull();
    expect(challengeRoot.querySelector('.lobby-hotseat-footer')).toBeNull();
  });

  it('keeps verified resume and abandon confirmation inside the owned footer', () => {
    const deployment = deploymentOptions({
      action: 'resume',
      message: 'Recovered 2 of 6 human salvos.',
      abandonIntent: true,
      fieldOrder: null,
    });
    const root = buildLobbyVerifiedOperationsView({ verifiedDeployment: deployment });
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.lobby-hotseat-footer button')];

    expect(buttons.map((button) => button.textContent)).toEqual([
      'Resume verified deployment',
      'Abandon verified deployment',
      'Confirm abandon',
      'Keep deployment',
    ]);
    for (const button of buttons) button.click();
    expect(deployment.onLaunch).toHaveBeenCalledOnce();
    expect(deployment.onRequestAbandon).toHaveBeenCalledOnce();
    expect(deployment.onConfirmAbandon).toHaveBeenCalledOnce();
    expect(deployment.onCancelAbandon).toHaveBeenCalledOnce();
  });

  it('does not expose a false verified action without authenticated view state', () => {
    const root = buildLobbyVerifiedOperationsView({ verifiedDeployment: null });
    expect(root.querySelector('.lobby-verified-deployment')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });
});
