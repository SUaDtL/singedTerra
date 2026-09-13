import { describe, expect, it, vi } from 'vitest';
import {
  buildLobbyOnlineView,
  buildLobbyShellView,
  type LobbyShellViewOptions,
} from './LobbyShellView';

type DesiredShellOptions = LobbyShellViewOptions & {
  surface: 'chooser' | 'preparation';
  onBack: () => void;
  showBack: boolean;
};

function section(name: string): HTMLElement {
  const element = document.createElement('section');
  element.dataset['section'] = name;
  return element;
}

function options(overrides: Partial<DesiredShellOptions> = {}): DesiredShellOptions {
  return {
    activeTab: 'hotseat',
    surface: 'chooser',
    rejoinAvailable: false,
    account: section('account'),
    vehiclePreview: section('vehicle-preview'),
    content: section('content'),
    controls: section('controls'),
    quickOperations: [
      { id: 'standard', title: 'Standard Duel', briefing: 'A balanced two-tank exhibition.', settings: {} },
      { id: 'first-salvo', title: 'First Salvo', briefing: 'One round. Aim, set power, and fire.', settings: { rounds: 1 } },
      {
        id: 'crosswind-range', title: 'Crosswind Range', briefing: 'Wraparound walls turn shifting wind into a ranging test.',
        settings: { walls: 'wrap', battlefieldWorld: 'glassstorm-expanse', seed: 42 },
        practiceObjective: { contentVersion: 2, fieldOrderId: 'first-strike', seed: 42 },
      },
      {
        id: 'caldera-run', title: 'Caldera Run', briefing: 'Lava terrain changes every landing.',
        settings: { hazards: 'lava', battlefieldWorld: 'obsidian-caldera', seed: 42 },
        practiceObjective: { contentVersion: 2, fieldOrderId: 'set-the-position', seed: 42 },
      },
      {
        id: 'last-light-siege',
        title: 'Last Light Siege',
        briefing: 'Best of three before sudden death.',
        settings: { rounds: 3, suddenDeathTurn: 12, battlefieldWorld: 'ember-dusk' },
        practiceObjective: { contentVersion: 1, fieldOrderId: 'hold-the-field' },
      },
      {
        id: 'lean-arsenal', title: 'Lean Arsenal', briefing: 'Level 0 restocks only. Preserve your opening kit.',
        settings: { armsLevel: 0, seed: 42 },
        practiceObjective: { contentVersion: 2, fieldOrderId: 'make-it-count', seed: 42 },
      },
    ],
    onTabChange: vi.fn(),
    onQuickDuel: vi.fn(),
    onRejoin: vi.fn(),
    onBack: vi.fn(),
    showBack: true,
    firstSalvoPreferenceUnseen: false,
    ...overrides,
  };
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`);
  return match;
}

describe('buildLobbyShellView', () => {
  it('places an admitted seed challenge before Quick Operations and starts only on its own action', () => {
    const onSeedChallenge = vi.fn();
    const root = buildLobbyShellView(options({
      seedChallenge: {
        status: 'valid', title: 'Last Light Siege',
        objective: 'Hold the Field · Win the duel.', seed: 42,
      },
      onSeedChallenge,
    }));
    const chooser = root.querySelector<HTMLElement>('.lobby-deployment-chooser')!;
    const challenge = root.querySelector<HTMLElement>('[data-ui="seed-challenge"]')!;
    const operations = root.querySelector<HTMLElement>('[data-ui="quick-operation"]')!;
    const console = operations.closest<HTMLElement>('.lobby-deployment-console')!;

    expect([...chooser.children].indexOf(challenge)).toBeLessThan([...chooser.children].indexOf(console));
    expect([...root.querySelectorAll('button.primary')]).toEqual([button(root, 'Start challenge vs CPU')]);
    expect(onSeedChallenge).not.toHaveBeenCalled();
    button(root, 'Start challenge vs CPU').click();
    expect(onSeedChallenge).toHaveBeenCalledOnce();
  });

  it('renders an invalid challenge as a generic inert alert', () => {
    const onSeedChallenge = vi.fn();
    const root = buildLobbyShellView(options({ seedChallenge: { status: 'invalid' }, onSeedChallenge }));
    const alert = root.querySelector<HTMLElement>('[data-ui="seed-challenge-error"]')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe('This seed challenge is invalid or no longer supported.');
    expect(root.textContent).not.toContain('Start challenge vs CPU');
    expect(onSeedChallenge).not.toHaveBeenCalled();
  });

  it('opens with exactly three deployment choices and no preparation content', () => {
    const root = buildLobbyShellView(options());
    const deployment = root.querySelector<HTMLElement>('.lobby-deployment')!;
    const chooser = root.querySelector<HTMLElement>('.lobby-deployment-chooser')!;
    const choices = [...chooser.querySelectorAll<HTMLButtonElement>('button:not([data-operation-id])')];

    expect(deployment.tagName).toBe('MAIN');
    expect(deployment.getAttribute('aria-label')).toBe('Deployment preparation');
    expect(chooser.getAttribute('aria-label')).toBe('Choose deployment');
    expect(choices.map((choice) => choice.textContent)).toEqual([
      'Quick Duel vs CPU',
      'Local Battle',
      'Play Online',
    ]);
    expect(choices.filter((choice) => choice.classList.contains('primary')))
      .toEqual([choices[0]]);
    expect(choices.slice(1).every((choice) => (
      choice.classList.contains('lobby-deployment-choice--secondary')
    ))).toBe(true);
    expect(root.querySelector('[role="tabpanel"]')).toBeNull();
    expect(root.querySelector('[data-section="content"]')).toBeNull();
    expect(root.querySelector('[data-section="vehicle-preview"]')).toBeNull();
    expect(root.querySelector('[data-section="controls"]')).toBeNull();
  });

  it('presents operation cards with a selected briefing and launches the selected card', () => {
    const onQuickDuel = vi.fn();
    const root = buildLobbyShellView(options({ onQuickDuel }));
    const cards = [...root.querySelectorAll<HTMLButtonElement>('[data-operation-id]')];
    const caldera = root.querySelector<HTMLButtonElement>('[data-operation-id="caldera-run"]')!;

    expect(cards.map((card) => card.dataset['operationId'])).toEqual([
      'standard',
      'crosswind-range',
      'caldera-run',
      'last-light-siege',
      'lean-arsenal',
    ]);
    expect(cards[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[data-ui="quick-operation-briefing"]')?.textContent)
      .toBe('A balanced two-tank exhibition.');

    caldera.click();

    expect(caldera.getAttribute('aria-pressed')).toBe('true');
    expect(cards[0]?.getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector('[data-ui="quick-operation-briefing"]')?.textContent)
      .toBe('Lava terrain changes every landing.');
    expect(root.querySelector<HTMLElement>('[data-ui="quick-operation-objective"]')?.textContent)
      .toBe('Set the Position · Change firing position, then damage the CPU with your first salvo.');
    expect(root.querySelector<HTMLElement>('[data-ui="quick-operation-objective"]')?.dataset)
      .toMatchObject({ contentVersion: '2', fieldOrderId: 'set-the-position' });
    root.querySelector<HTMLButtonElement>('[data-operation-id="last-light-siege"]')!.click();
    expect(root.querySelector('[data-ui="quick-operation-objective"]')?.textContent)
      .toBe('Hold the Field · Win the duel.');
    expect(root.querySelector<HTMLElement>('[data-ui="quick-operation-objective"]')?.dataset)
      .toMatchObject({ contentVersion: '1', fieldOrderId: 'hold-the-field' });
    button(root, 'Quick Duel vs CPU').click();
    expect(onQuickDuel).toHaveBeenCalledWith('last-light-siege');
  });

  it('keeps the battlefield preview and real operation facts synchronized with selection', () => {
    const root = buildLobbyShellView(options());
    const preview = root.querySelector<HTMLElement>('[data-ui="battlefield-preview"]')!;
    const previewTitle = root.querySelector<HTMLElement>('[data-ui="battlefield-preview-title"]')!;
    const previewFacts = root.querySelector<HTMLElement>('[data-ui="battlefield-preview-facts"]')!;

    expect(preview.dataset['battlefieldWorld']).toBe('automatic');
    expect(previewTitle.textContent).toBe('Standard Duel');
    expect(previewFacts.textContent).toContain('3 rounds');
    expect(previewFacts.textContent).toContain('vs CPU');
    expect(previewFacts.textContent).toContain('Automatic');
    expect(preview.querySelector<HTMLElement>('[data-ui="battlefield-illustration-note"]')!.hidden).toBe(false);

    root.querySelector<HTMLButtonElement>('[data-operation-id="crosswind-range"]')!.click();

    expect(preview.dataset['battlefieldWorld']).toBe('glassstorm-expanse');
    expect(previewTitle.textContent).toBe('Crosswind Range');
    expect(previewFacts.textContent).toContain('Wrap walls');
    expect(previewFacts.textContent).toContain('Seed 42');
    expect(preview.querySelector<HTMLElement>('[data-ui="battlefield-illustration-note"]')!.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-operation-id="caldera-run"]')!.click();

    expect(preview.dataset['battlefieldWorld']).toBe('obsidian-caldera');
    expect(previewTitle.textContent).toBe('Caldera Run');
    expect(previewFacts.textContent).toContain('Lava hazard');
  });

  it.each([
    ['standard', 'ember-dusk', [['Battlefield', 'Automatic'], ['Rounds', '3 rounds'], ['Opponent', 'vs CPU']]],
    ['crosswind-range', 'glassstorm-expanse', [['Battlefield', 'Glassstorm Expanse'], ['Rounds', '3 rounds'], ['Opponent', 'vs CPU'], ['Walls', 'Wrap walls'], ['Seed', 'Seed 42']]],
    ['caldera-run', 'obsidian-caldera', [['Battlefield', 'Obsidian Caldera'], ['Rounds', '3 rounds'], ['Opponent', 'vs CPU'], ['Hazard', 'Lava hazard'], ['Seed', 'Seed 42']]],
    ['last-light-siege', 'ember-dusk', [['Battlefield', 'Ember Dusk'], ['Rounds', '3 rounds'], ['Opponent', 'vs CPU'], ['Pressure', 'Sudden death · Turn 12']]],
    ['lean-arsenal', 'ember-dusk', [['Battlefield', 'Automatic'], ['Rounds', '3 rounds'], ['Opponent', 'vs CPU'], ['Arsenal', 'Arms level 0'], ['Seed', 'Seed 42']]],
  ] as const)('shows the matching illustration and complete facts for %s', (id, artwork, facts) => {
    const root = buildLobbyShellView(options());
    root.querySelector<HTMLButtonElement>(`[data-operation-id="${id}"]`)!.click();
    const preview = root.querySelector<HTMLElement>('[data-ui="battlefield-preview"]')!;
    expect(preview.querySelector('img')!.getAttribute('src'))
      .toBe(`${import.meta.env.BASE_URL}art/battlefield-theater-${artwork}-v3.webp`);
    const readout = preview.querySelector('[data-ui="battlefield-preview-facts"]')!;
    expect([...readout.children].map((group) => [
      group.querySelector('dt')!.textContent, group.querySelector('dd')!.textContent,
    ])).toEqual(facts);
  });

  it('routes each deployment choice exactly once', () => {
    const onQuickDuel = vi.fn();
    const onTabChange = vi.fn();
    const root = buildLobbyShellView(options({ onQuickDuel, onTabChange }));

    button(root, 'Quick Duel vs CPU').click();
    button(root, 'Local Battle').click();
    button(root, 'Play Online').click();

    expect(onQuickDuel).toHaveBeenCalledOnce();
    expect(onQuickDuel).toHaveBeenCalledWith('standard');
    expect(onTabChange.mock.calls).toEqual([['hotseat'], ['online']]);
  });

  it('keeps decorative rail glyphs out of established deployment action names', () => {
    const root = buildLobbyShellView(options());

    for (const label of ['Quick Duel vs CPU', 'Local Battle', 'Play Online']) {
      const action = button(root, label);
      const glyph = action.querySelector<HTMLElement>('.lobby-deployment-rail__glyph');

      expect(action.getAttribute('aria-label')).toBe(label);
      expect(action.textContent).toBe(label);
      expect(glyph?.getAttribute('aria-hidden')).toBe('true');
      expect(glyph?.textContent).toBe('');
    }
  });

  it('offers one explicit First Salvo start before disclosing ordinary Quick Duels', () => {
    const onQuickDuel = vi.fn();
    const root = buildLobbyShellView(options({ firstSalvoPreferenceUnseen: true, onQuickDuel }));
    const primaryActions = [...root.querySelectorAll<HTMLButtonElement>('button.primary')];

    expect(primaryActions).toEqual([button(root, 'Start First Salvo')]);
    expect(root.querySelector<HTMLDetailsElement>('details[data-ui="other-quick-duels"]')?.open).toBe(false);
    expect(button(root, 'Local Battle').classList.contains('lobby-deployment-choice--secondary')).toBe(true);
    expect(button(root, 'Play Online').classList.contains('lobby-deployment-choice--secondary')).toBe(true);

    button(root, 'Start First Salvo').click();
    expect(onQuickDuel).toHaveBeenCalledWith('first-salvo');

    const disclosure = root.querySelector<HTMLDetailsElement>('details[data-ui="other-quick-duels"]')!;
    disclosure.open = true;
    button(root, 'Quick Duel vs CPU').click();
    expect(onQuickDuel).toHaveBeenLastCalledWith('standard');
  });

  it.each([
    ['hotseat', 'Hot Seat', 'Set your crew, then start a shared-screen match.'],
    ['online', 'Play Online', 'Create a room, join by code, or browse public games.'],
  ] as const)('renders only the selected %s preparation flow', (activeTab, title, description) => {
    const content = section('content');
    const vehiclePreview = section('vehicle-preview');
    const controls = section('controls');
    const root = buildLobbyShellView(options({
      surface: 'preparation',
      activeTab,
      content,
      vehiclePreview,
      controls,
    }));
    const panel = root.querySelector<HTMLElement>('[role="tabpanel"]')!;
    const context = root.querySelector<HTMLElement>('.lobby-mode-context')!;

    expect(root.querySelector('.lobby-deployment-chooser')).toBeNull();
    expect(context.querySelector('h2')?.textContent).toBe(title);
    expect(context.querySelector('p')?.textContent).toBe(description);
    expect(panel.getAttribute('aria-label')).toBe(`${title} preparation`);
    expect([...panel.children]).toEqual([content]);
    expect(root.querySelector('[data-section="vehicle-preview"]')).toBe(vehiclePreview);
    expect(root.querySelector('[data-section="controls"]')).toBe(controls);
  });

  it('returns from preparation through one clearly named action', () => {
    const onBack = vi.fn();
    const root = buildLobbyShellView(options({ surface: 'preparation', onBack }));
    const back = button(root, 'Deployment choices');

    expect(back.type).toBe('button');
    expect(back.getAttribute('aria-label')).toBe('Deployment choices');
    back.click();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledWith();
  });

  it('can omit the global Back action while preserving Online waiting content', () => {
    const content = section('waiting-room');
    const root = buildLobbyShellView(options({
      activeTab: 'online',
      surface: 'preparation',
      showBack: false,
      content,
    }));

    expect(root.querySelector('[data-section="waiting-room"]')).toBe(content);
    expect([...root.querySelectorAll('button')].some((candidate) => (
      candidate.textContent === 'Back to deployment choices'
    ))).toBe(false);
  });

  it('keeps a valid rejoin opportunity before the chooser', () => {
    const onRejoin = vi.fn();
    const root = buildLobbyShellView(options({ onRejoin, rejoinAvailable: true }));
    const deployment = root.querySelector<HTMLElement>('.lobby-deployment')!;
    const masthead = root.querySelector<HTMLElement>('.lobby-deployment__masthead')!;
    const rejoin = root.querySelector<HTMLElement>('.lobby-rejoin-banner')!;
    const chooser = root.querySelector<HTMLElement>('.lobby-deployment-chooser')!;

    expect([...deployment.children].indexOf(masthead)).toBeLessThan(
      [...deployment.children].indexOf(chooser),
    );
    expect(masthead.contains(rejoin)).toBe(true);
    button(root, 'Rejoin your game').click();
    expect(onRejoin).toHaveBeenCalledOnce();
  });

  it('makes Rejoin the sole primary action when a game can be resumed', () => {
    const root = buildLobbyShellView(options({ rejoinAvailable: true, firstSalvoPreferenceUnseen: true }));
    const quickDuel = button(root, 'Quick Duel vs CPU');
    const rejoin = button(root, 'Rejoin your game');
    const primaryActions = [...root.querySelectorAll<HTMLButtonElement>('button.primary')];

    expect(primaryActions).toEqual([rejoin]);
    expect(quickDuel.classList.contains('primary')).toBe(false);
    expect(root.querySelector('button')?.textContent).not.toBe('Start First Salvo');
  });

  it('omits optional account and rejoin surfaces without changing the chooser', () => {
    const root = buildLobbyShellView(options({ account: null, rejoinAvailable: false }));

    expect(root.querySelector('[data-section="account"]')).toBeNull();
    expect(root.querySelector('.lobby-rejoin-banner')).toBeNull();
    expect(root.querySelectorAll('.lobby-deployment-chooser button:not([data-operation-id])')).toHaveLength(3);
  });

  it('preserves the online content wrapper as a neutral ownership boundary', () => {
    const content = section('online');
    const wrapper = buildLobbyOnlineView(content);

    expect([...wrapper.children]).toEqual([content]);
  });
});
