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
    onTabChange: vi.fn(),
    onQuickDuel: vi.fn(),
    onRejoin: vi.fn(),
    onBack: vi.fn(),
    showBack: true,
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
  it('opens with exactly three deployment choices and no preparation content', () => {
    const root = buildLobbyShellView(options());
    const deployment = root.querySelector<HTMLElement>('.lobby-deployment')!;
    const chooser = root.querySelector<HTMLElement>('.lobby-deployment-chooser')!;
    const choices = [...chooser.querySelectorAll<HTMLButtonElement>('button')];

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

  it('routes each deployment choice exactly once', () => {
    const onQuickDuel = vi.fn();
    const onTabChange = vi.fn();
    const root = buildLobbyShellView(options({ onQuickDuel, onTabChange }));

    button(root, 'Quick Duel vs CPU').click();
    button(root, 'Local Battle').click();
    button(root, 'Play Online').click();

    expect(onQuickDuel).toHaveBeenCalledOnce();
    expect(onQuickDuel).toHaveBeenCalledWith();
    expect(onTabChange.mock.calls).toEqual([['hotseat'], ['online']]);
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
    const back = button(root, 'Back to deployment choices');

    expect(back.type).toBe('button');
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
    const root = buildLobbyShellView(options({ rejoinAvailable: true }));
    const quickDuel = button(root, 'Quick Duel vs CPU');
    const rejoin = button(root, 'Rejoin your game');
    const primaryActions = [...root.querySelectorAll<HTMLButtonElement>('button.primary')];

    expect(primaryActions).toEqual([rejoin]);
    expect(quickDuel.classList.contains('primary')).toBe(false);
  });

  it('omits optional account and rejoin surfaces without changing the chooser', () => {
    const root = buildLobbyShellView(options({ account: null, rejoinAvailable: false }));

    expect(root.querySelector('[data-section="account"]')).toBeNull();
    expect(root.querySelector('.lobby-rejoin-banner')).toBeNull();
    expect(root.querySelectorAll('.lobby-deployment-chooser button')).toHaveLength(3);
  });

  it('preserves the online content wrapper as a neutral ownership boundary', () => {
    const content = section('online');
    const wrapper = buildLobbyOnlineView(content);

    expect([...wrapper.children]).toEqual([content]);
  });
});
