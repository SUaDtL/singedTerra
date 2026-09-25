import { getByRole } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUICK_OPERATIONS } from '../../client/quickOperations';
import {
  Lobby,
  type LobbyConfig,
  type LobbyLaunchFocusSnapshot,
} from '../Lobby';
import { ApplicationLaunchLifecycle, ApplicationSurfaceController } from '../ApplicationSurface';

function selectSkirmishes(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>(
    '[data-command-surface="rail"][data-command-category="skirmishes"]',
  )!.click();
}

function selectItem(root: HTMLElement, itemId: string): void {
  root.querySelector<HTMLButtonElement>(`[data-command-item="${itemId}"]`)!.click();
}

function primary(root: HTMLElement): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(
    '[data-skirmish-command-view] [data-command-primary]',
  )!;
}

function selectedFacts(root: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    [...root.querySelectorAll<HTMLElement>('[data-skirmish-fact]')].map((group) => [
      group.querySelector('dt')!.textContent!,
      group.querySelector('dd')!.textContent!,
    ]),
  );
}

describe('Skirmishes command contribution', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    root = document.createElement('div');
    root.id = 'lobby';
    document.body.append(root);
  });

  afterEach(() => {
    history.replaceState(null, '', '/');
    document.body.replaceChildren();
    document.head.querySelector('#lobby-style')?.remove();
    vi.restoreAllMocks();
  });

  it('contributes every authored operation as its own ordered library item', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();
    selectSkirmishes(root);

    const items = [...root.querySelectorAll<HTMLElement>(
      '.command-center__library-items [data-command-item]',
    )];
    expect(items.map((item) => item.dataset['commandItem'])).toEqual(
      QUICK_OPERATIONS.map((operation) => operation.id),
    );
    expect(items.map((item) => item.textContent)).toEqual(
      QUICK_OPERATIONS.map((operation) => `${operation.title}${operation.briefing}`),
    );
  });

  it.each(QUICK_OPERATIONS)(
    'presents $title facts with one launch action and preserves the existing launch payload',
    (operation) => {
      const onReady = vi.fn<(config: LobbyConfig) => void>();
      const generateSeed = vi.fn(() => 0x1234abcd);
      const lobby = new Lobby(root, onReady, undefined, undefined, generateSeed);
      lobby.show();
      selectSkirmishes(root);
      selectItem(root, operation.id);

      const workspace = root.querySelector<HTMLElement>('[data-skirmish-command-view]')!;
      expect(getByRole(workspace, 'heading', { name: operation.title })).toBeTruthy();
      expect(workspace.textContent).toContain(operation.briefing);
      expect(workspace.textContent).toContain('vs CPU');
      expect(getByRole(workspace, 'heading', { name: 'Mission brief' })).toBeTruthy();
      expect(workspace.querySelectorAll('.skirmish-command__note').length).toBeGreaterThanOrEqual(3);
      expect(workspace.querySelector('.skirmish-command__backdrop-note')?.textContent).toContain('visual only');
      expect(workspace.querySelector('figcaption')?.textContent).toContain('illustrative backdrop');
      const objective = workspace.querySelector('[data-ui="quick-operation-objective"]');
      if (objective) {
        expect(workspace.querySelector('.skirmish-command__briefing')?.contains(objective)).toBe(true);
        expect(workspace.querySelector('figure')?.contains(objective)).toBe(false);
      }
      const rounds = operation.settings.rounds ?? 3;
      expect(workspace.textContent).toContain(`${rounds} ${rounds === 1 ? 'round' : 'rounds'}`);
      expect(workspace.querySelectorAll('[data-command-primary]')).toHaveLength(1);

      primary(root).click();

      expect(onReady).toHaveBeenCalledOnce();
      const payload = onReady.mock.calls[0]![0];
      expect(payload.quickOperation).toEqual({
        id: operation.id,
        title: operation.title,
        briefing: operation.briefing,
        ...(operation.practiceObjective ? { practiceObjective: operation.practiceObjective } : {}),
      });
      expect(payload.settings).toMatchObject({
        rounds: operation.settings.rounds ?? 3,
        ...operation.settings,
      });
      if (operation.id === 'standard' || operation.id === 'first-salvo') {
        expect(payload.publicSeedChallenge).toBeUndefined();
      } else {
        expect(payload.publicSeedChallenge?.origin).toBe('local-selection');
      }
      expect(payload.players[1]?.ai).toBe('medium');
      if (operation.practiceObjective?.contentVersion === 2) {
        expect(generateSeed).not.toHaveBeenCalled();
      } else {
        expect(generateSeed).toHaveBeenCalledOnce();
        expect(payload.settings?.seed).toBe(0x1234abcd);
      }
    },
  );

  it.each([
    ['standard', {
      Battlefield: 'Automatic', Rounds: '3 rounds', Opponent: 'vs CPU',
    }],
    ['first-salvo', {
      Battlefield: 'Automatic', Rounds: '1 round', Opponent: 'vs CPU',
    }],
    ['crosswind-range', {
      Battlefield: 'Glassstorm Expanse', Rounds: '3 rounds', Opponent: 'vs CPU',
      Walls: 'Wrap walls', Seed: '42',
    }],
    ['caldera-run', {
      Battlefield: 'Obsidian Caldera', Rounds: '3 rounds', Opponent: 'vs CPU',
      Hazard: 'Lava hazard', Seed: '42',
    }],
    ['last-light-siege', {
      Battlefield: 'Ember Dusk', Rounds: '3 rounds', Opponent: 'vs CPU',
      Pressure: 'Sudden death, turn 12',
    }],
    ['lean-arsenal', {
      Battlefield: 'Automatic', Rounds: '3 rounds', Opponent: 'vs CPU',
      Arsenal: 'Arms level 0', Seed: '42',
    }],
  ] as const)(
    'projects only the exact launch facts owned by %s',
    (operationId, expectedFacts) => {
      const lobby = new Lobby(root, vi.fn());
      lobby.show();
      selectSkirmishes(root);
      selectItem(root, operationId);

      expect(selectedFacts(root)).toEqual(expectedFacts);
    },
  );

  it('keeps First Salvo as an explicit one-round contextual item', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();
    selectSkirmishes(root);
    selectItem(root, 'first-salvo');

    expect(root.querySelector('[data-command-item="first-salvo"]')?.getAttribute('aria-current'))
      .toBe('true');
    expect(primary(root).textContent).toBe('Start First Salvo');
    expect(root.querySelector('[data-skirmish-fact="Rounds"]')?.textContent)
      .toContain('1 round');
  });

  it('adds only a validated imported challenge and launches through its existing owner', () => {
    history.replaceState(null, '', '/singedTerra/#challenge=ST1-LL-4E2');
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(root, onReady);
    lobby.show();
    selectSkirmishes(root);

    const challengeItem = root.querySelector<HTMLButtonElement>(
      '[data-command-item="imported-challenge"]',
    );
    expect(challengeItem?.textContent).toContain('Imported Challenge');
    challengeItem!.click();
    expect(root.querySelector('[data-skirmish-fact="Seed"]')?.textContent).toContain('5690');
    expect(selectedFacts(root)).toEqual({
      Battlefield: 'Ember Dusk',
      Rounds: '3 rounds',
      Opponent: 'vs CPU',
      Pressure: 'Sudden death, turn 12',
      Seed: 'Seed · 5690',
    });
    expect(root.textContent).toContain('Hold the Field · Win the duel.');
    expect(root.querySelectorAll('[data-skirmish-command-view] [data-command-primary]'))
      .toHaveLength(1);

    primary(root).click();

    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady.mock.calls[0]![0]).toMatchObject({
      settings: { seed: 5690, rounds: 3 },
      quickOperation: { id: 'last-light-siege', title: 'Last Light Siege' },
      publicSeedChallenge: {
        operationId: 'last-light-siege',
        seed: 5690,
        origin: 'imported-public-challenge',
      },
    });
  });

  it('does not contribute or launch an invalid imported challenge', () => {
    history.replaceState(null, '', '/singedTerra/#challenge=ST1-LL-%31%36');
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(root, onReady);
    lobby.show();
    selectSkirmishes(root);

    expect(root.querySelector('[data-command-item="imported-challenge"]')).toBeNull();
    expect(root.textContent).not.toContain('%31%36');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('restores the exact Skirmish workspace, retry owner, and launch focus after acquisition fails', async () => {
    const battle = document.createElement('main');
    document.body.append(battle);
    const surfaces = new ApplicationSurfaceController({ pregame: root, battle }, 'pregame');
    const lifecycle = new ApplicationLaunchLifecycle<LobbyLaunchFocusSnapshot | null>(surfaces);
    let lobby!: Lobby;
    let acquisition!: Promise<unknown>;
    const onReady = vi.fn<(config: LobbyConfig) => void>(() => {
      acquisition = lifecycle.launch({
        captureFocus: () => lobby.captureLaunchFocus(),
        acquire: async () => { throw new Error('Operation acquisition failed'); },
        commit: vi.fn(),
        restore: (snapshot, error) => {
          expect(error).toBeInstanceOf(Error);
          lobby.showLaunchFailure('Operation acquisition failed.');
          lobby.restoreLaunchFocus(snapshot);
        },
      });
    });
    lobby = new Lobby(root, onReady);
    lobby.show();
    selectSkirmishes(root);
    selectItem(root, 'crosswind-range');
    const initiatingAction = primary(root);
    initiatingAction.focus();

    initiatingAction.click();
    await acquisition;

    expect(surfaces.state).toBe('pregame');
    expect(root.querySelector('[data-command-category="skirmishes"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(root.querySelector('[data-command-item="crosswind-range"]')?.getAttribute('aria-current'))
      .toBe('true');
    expect(getByRole(root, 'heading', { name: 'Crosswind Range' })).toBeTruthy();
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('Operation acquisition failed.');
    expect(primary(root)).toBe(initiatingAction);
    expect(primary(root).textContent).toBe('Start Crosswind Range');
    expect(document.activeElement).toBe(initiatingAction);
    expect(onReady).toHaveBeenCalledOnce();
  });
});
