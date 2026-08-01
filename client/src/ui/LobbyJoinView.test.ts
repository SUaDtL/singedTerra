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

    expect(root.className).toBe('');
    expect(root.querySelector('.lobby-sub')?.textContent)
      .toBe('Enter the 4-character room code to join.');
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
    expect([...root.children]).toEqual([
      root.querySelector('.lobby-sub'),
      field,
      nameColor,
      garage,
      status,
      root.querySelector('.lobby-btn-row'),
    ]);
    expect([...root.querySelectorAll('.lobby-btn-row button')].map((item) => item.textContent))
      .toEqual(['Join Room', 'Create instead', 'Browse public rooms']);
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
    button(root, 'Create instead').click();
    button(root, 'Browse public rooms').click();
    expect(onJoin).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onBrowse).toHaveBeenCalledOnce();

    const busyJoin = button(buildLobbyJoinView(options({ busy: true, onJoin })), 'Joining...');
    expect(busyJoin.className).toBe('lobby-btn');
    expect(busyJoin.disabled).toBe(true);
    busyJoin.click();
    expect(onJoin).toHaveBeenCalledOnce();
  });
});
