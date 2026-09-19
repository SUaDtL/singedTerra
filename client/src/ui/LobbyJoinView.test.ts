import { describe, expect, it, vi } from 'vitest';
import { buildLobbyJoinView, type LobbyJoinViewOptions } from './LobbyJoinView';

function section(name: string): HTMLElement {
  const element = document.createElement('section');
  element.dataset['section'] = name;
  return element;
}

function options(overrides: Partial<LobbyJoinViewOptions> = {}): LobbyJoinViewOptions {
  return {
    code: 'AB12',
    busy: false,
    nameColor: section('name-color'),
    garage: section('garage'),
    status: section('status'),
    onCodeInput: vi.fn((value: string) => value),
    onJoin: vi.fn(),
    onCreate: vi.fn(),
    onBrowse: vi.fn(),
    ...overrides,
  };
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`);
  return match;
}

describe('buildLobbyJoinView', () => {
  it('renders the exact code control and shared-node order', () => {
    const nameColor = section('name-color');
    const garage = section('garage');
    const status = section('status');
    const root = buildLobbyJoinView(options({ nameColor, garage, status }));

    expect(root.classList).toContain('lobby-route-brief');
    expect(root.classList).toContain('lobby-route-brief--online');
    expect(root.classList).toContain('preparation-frame');
    expect(root.querySelector('.lobby-route-brief__title')?.textContent).toBe('Rally to a signal');
    expect(root.querySelector('.lobby-route-brief__purpose')?.textContent)
      .toBe('Enter a room code and join the operation already in motion.');
    expect(root.querySelector('.lobby-route-brief__setup')?.getAttribute('aria-label'))
      .toBe('Rally setup');
    const field = root.querySelector('.lobby-field');
    expect(field?.querySelector('label')?.textContent).toBe('Room code');
    const input = field?.querySelector('input');
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input).toMatchObject({
      type: 'text',
      className: 'lobby-code-input',
      maxLength: 4,
      value: 'AB12',
      placeholder: 'XXXX',
    });
    expect([...root.querySelector('.lobby-route-brief__setup')!.children]).toEqual([
      field,
      nameColor,
      garage,
      status,
    ]);
    expect([...root.querySelectorAll('.lobby-online-actions button')].map((item) => item.textContent))
      .toEqual(['Create a room', 'Browse public rooms']);
    expect(root.querySelector('.preparation-frame__dock .lobby-online-primary')?.textContent)
      .toBe('Join Room');
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Other ways to play online');
  });

  it('routes raw code input through the canonicalizing callback', () => {
    const onCodeInput = vi.fn(() => 'A1B2');
    const root = buildLobbyJoinView(options({ onCodeInput }));
    const input = root.querySelector<HTMLInputElement>('.lobby-code-input')!;

    input.value = 'a-1 b2c';
    input.dispatchEvent(new Event('input'));

    expect(onCodeInput).toHaveBeenCalledOnce();
    expect(onCodeInput).toHaveBeenCalledWith('a-1 b2c');
    expect(input.value).toBe('A1B2');
  });

  it('routes actions and renders a disabled busy Join state', () => {
    const onJoin = vi.fn();
    const onCreate = vi.fn();
    const onBrowse = vi.fn();
    const root = buildLobbyJoinView(options({ onJoin, onCreate, onBrowse }));

    button(root, 'Join Room').click();
    button(root, 'Create a room').click();
    button(root, 'Browse public rooms').click();
    expect(onJoin).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onBrowse).toHaveBeenCalledOnce();

    const busyJoin = button(buildLobbyJoinView(options({ busy: true, onJoin })), 'Joining...');
    expect(busyJoin.classList.contains('primary')).toBe(true);
    expect(busyJoin.classList.contains('lobby-online-primary')).toBe(true);
    expect(busyJoin.disabled).toBe(true);
    busyJoin.click();
    expect(onJoin).toHaveBeenCalledOnce();
  });
});
