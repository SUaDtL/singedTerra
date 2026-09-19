import { describe, expect, it, vi } from 'vitest';
import { buildLobbyCreateView, type LobbyCreateViewOptions } from './LobbyCreateView';

function section(name: string): HTMLElement {
  const element = document.createElement('section');
  element.dataset['section'] = name;
  return element;
}

function advancedButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lobby-advanced-trigger';
  button.textContent = 'Advanced settings';
  return button;
}

function options(overrides: Partial<LobbyCreateViewOptions> = {}): LobbyCreateViewOptions {
  return {
    minPlayers: 2,
    maxPlayers: 4,
    playerCount: 3,
    botCount: 2,
    botDifficulty: 'medium',
    visibility: 'public',
    busy: false,
    nameColor: section('name-color'),
    garage: section('garage'),
    advanced: advancedButton(),
    status: section('status'),
    onPlayerCountChange: vi.fn(),
    onBotCountChange: vi.fn(),
    onBotDifficultyChange: vi.fn(),
    onVisibilityChange: vi.fn(),
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    onBrowse: vi.fn(),
    ...overrides,
  };
}

function field(root: HTMLElement, label: string): HTMLElement {
  const match = [...root.querySelectorAll<HTMLElement>('.lobby-field')]
    .find((candidate) => candidate.querySelector('label')?.textContent === label);
  if (!match) throw new Error(`Missing ${label} field`);
  return match;
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`);
  return match;
}

describe('buildLobbyCreateView', () => {
  it('renders dynamic selectors, shared-node order, and the Advanced Settings entry', () => {
    const nameColor = section('name-color');
    const garage = section('garage');
    const advanced = advancedButton();
    const status = section('status');
    const root = buildLobbyCreateView(options({ nameColor, garage, advanced, status }));

    expect(root.classList).toContain('lobby-route-brief');
    expect(root.classList).toContain('lobby-route-brief--online');
    expect(root.classList).toContain('preparation-frame');
    expect(root.querySelector('.lobby-route-brief__title')?.textContent).toBe('Open operation');
    expect(root.querySelector('.lobby-route-brief__purpose')?.textContent)
      .toBe('Set the battlefield, then issue a room code to your crew.');
    expect(root.querySelector('.lobby-route-brief__setup')?.getAttribute('aria-label'))
      .toBe('Open operation setup');
    const players = field(root, 'Players');
    const bots = field(root, 'CPU opponents');
    const visibility = field(root, 'Visibility');
    expect([...players.querySelectorAll('option')].map((item) => item.value))
      .toEqual(['2', '3', '4']);
    expect(players.querySelector('select')?.value).toBe('3');
    expect([...bots.querySelectorAll('select')[0]!.options].map((item) => item.value))
      .toEqual(['0', '1', '2']);
    expect(bots.querySelectorAll('select')[0]!.value).toBe('2');
    expect([...bots.querySelectorAll('select')[1]!.options].map((item) => item.value))
      .toEqual(['easy', 'medium', 'hard']);
    expect([...bots.querySelectorAll('select')[1]!.options].map((item) => item.textContent))
      .toEqual(['Easy', 'Medium', 'Hard']);
    expect(bots.querySelectorAll('select')[1]!.value).toBe('medium');
    expect([...visibility.querySelectorAll('option')].map((item) => item.value))
      .toEqual(['public', 'private']);
    expect([...visibility.querySelectorAll('option')].map((item) => item.textContent))
      .toEqual(['Public', 'Private']);
    expect(visibility.querySelector('select')?.value).toBe('public');

    const commandVehicle = root.querySelector<HTMLElement>('[aria-labelledby="command-vehicle-heading"]');
    const operationProfile = root.querySelector<HTMLElement>('[aria-labelledby="operation-profile-heading"]');
    const protocol = root.querySelector<HTMLElement>('[aria-labelledby="battlefield-protocol-heading"]');
    expect(commandVehicle?.querySelector('.lobby-preparation-section__title')?.textContent)
      .toBe('Command vehicle');
    expect(commandVehicle?.querySelector('[data-section="name-color"]')).toBe(nameColor);
    expect(commandVehicle?.querySelector('[data-section="garage"]')).toBe(garage);
    expect(operationProfile?.querySelector('.lobby-preparation-section__title')?.textContent)
      .toBe('Operation profile');
    expect(operationProfile?.querySelector('.lobby-field label')?.textContent).toBe('Players');
    expect(protocol?.querySelector('.lobby-advanced-trigger')).toBe(advanced);
    expect(protocol?.querySelector('details.lobby-advanced')).toBeNull();
    expect([...operationProfile!.querySelector('.lobby-preparation-section__body')!.children])
      .toEqual([players, bots, visibility]);
    expect(protocol?.querySelector('[data-section="status"]')).toBe(status);
    expect([...root.querySelectorAll<HTMLButtonElement>('.lobby-online-actions button')].map((item) => ({
      text: item.textContent,
      className: item.className,
      disabled: item.disabled,
    }))).toEqual([
      { text: 'Join with a code', className: 'lobby-btn secondary', disabled: false },
      { text: 'Browse public rooms', className: 'lobby-btn secondary', disabled: false },
    ]);
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Other ways to play online');
    expect(root.querySelector(':scope > .preparation-frame__heading')).not.toBeNull();
    expect(root.querySelector(':scope > .preparation-frame__body')?.contains(
      root.querySelector('.lobby-route-brief__setup'),
    )).toBe(true);
    expect(root.querySelector(':scope > .preparation-frame__dock .lobby-online-primary')?.textContent)
      .toBe('Create operation');
    expect(field(root, 'Visibility').closest('.preparation-frame__body')).not.toBeNull();
  });

  it('routes selector changes and all three actions', () => {
    const callbacks = {
      onPlayerCountChange: vi.fn(),
      onBotCountChange: vi.fn(),
      onBotDifficultyChange: vi.fn(),
      onVisibilityChange: vi.fn(),
      onCreate: vi.fn(),
      onJoin: vi.fn(),
      onBrowse: vi.fn(),
    };
    const root = buildLobbyCreateView(options(callbacks));
    const change = (select: HTMLSelectElement, value: string) => {
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };

    change(field(root, 'Players').querySelector('select')!, '4');
    change(field(root, 'CPU opponents').querySelectorAll('select')[0]!, '1');
    change(field(root, 'CPU opponents').querySelectorAll('select')[1]!, 'hard');
    change(field(root, 'Visibility').querySelector('select')!, 'private');
    expect(callbacks.onPlayerCountChange).toHaveBeenCalledWith(4);
    expect(callbacks.onBotCountChange).toHaveBeenCalledWith(1);
    expect(callbacks.onBotDifficultyChange).toHaveBeenCalledWith('hard');
    expect(callbacks.onVisibilityChange).toHaveBeenCalledWith('private');

    button(root, 'Create operation').click();
    button(root, 'Join with a code').click();
    button(root, 'Browse public rooms').click();
    expect(callbacks.onCreate).toHaveBeenCalledOnce();
    expect(callbacks.onJoin).toHaveBeenCalledOnce();
    expect(callbacks.onBrowse).toHaveBeenCalledOnce();
  });

  it('hides difficulty for zero bots and disables the busy Create action', () => {
    const onCreate = vi.fn();
    const root = buildLobbyCreateView(options({ botCount: 0, busy: true, onCreate }));
    expect(field(root, 'CPU opponents').querySelectorAll('select')).toHaveLength(1);
    const create = button(root, 'Creating...');
    expect(create.classList.contains('primary')).toBe(true);
    expect(create.classList.contains('lobby-online-primary')).toBe(true);
    expect(create.disabled).toBe(true);
    create.click();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
