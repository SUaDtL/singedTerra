import { describe, expect, it, vi } from 'vitest';
import { buildLobbyCreateView, type LobbyCreateViewOptions } from './LobbyCreateView';

function section(name: string): HTMLElement {
  const element = document.createElement('section');
  element.dataset['section'] = name;
  return element;
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
    advancedFields: [section('wind'), section('gravity')],
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
  it('renders dynamic selectors, shared-node order, and Advanced fields', () => {
    const nameColor = section('name-color');
    const garage = section('garage');
    const advancedFields = [section('wind'), section('gravity')];
    const status = section('status');
    const root = buildLobbyCreateView(options({ nameColor, garage, advancedFields, status }));

    expect(root.querySelector('.lobby-sub')?.textContent)
      .toBe('Create a new online room and invite friends.');
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

    const advanced = root.querySelector('details.lobby-advanced')!;
    expect(advanced.querySelector('summary')?.textContent).toBe('Advanced settings');
    expect([...advanced.children].slice(1)).toEqual(advancedFields);
    expect([...root.children]).toEqual([
      root.querySelector('.lobby-sub'),
      nameColor,
      garage,
      players,
      bots,
      visibility,
      advanced,
      status,
      root.querySelector('.lobby-btn-row'),
    ]);
    expect([...root.querySelectorAll<HTMLButtonElement>('.lobby-btn-row button')].map((item) => ({
      text: item.textContent,
      className: item.className,
      disabled: item.disabled,
    }))).toEqual([
      { text: 'Create Room', className: 'lobby-btn', disabled: false },
      { text: 'Join Room instead', className: 'lobby-btn secondary', disabled: false },
      { text: 'Browse public rooms', className: 'lobby-btn secondary', disabled: false },
    ]);
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

    button(root, 'Create Room').click();
    button(root, 'Join Room instead').click();
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
    expect(create.className).toBe('lobby-btn');
    expect(create.disabled).toBe(true);
    create.click();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
