import { describe, expect, it, vi } from 'vitest';
import {
  buildLobbyOnlineView,
  buildLobbyShellView,
  type LobbyShellViewOptions,
} from './LobbyShellView';

function section(name: string): HTMLElement {
  const element = document.createElement('section');
  element.dataset['section'] = name;
  return element;
}

function options(overrides: Partial<LobbyShellViewOptions> = {}): LobbyShellViewOptions {
  return {
    activeTab: 'hotseat',
    rejoinAvailable: true,
    account: section('account'),
    vehiclePreview: section('vehicle-preview'),
    content: section('content'),
    controls: section('controls'),
    onTabChange: vi.fn(),
    onRejoin: vi.fn(),
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
  it('renders the exact shell order with the conditional rejoin affordance', () => {
    const vehiclePreview = section('vehicle-preview');
    const account = section('account');
    const content = section('content');
    const controls = section('controls');
    const root = buildLobbyShellView(options({ account, vehiclePreview, content, controls }));

    expect(root.className).toBe('lobby-card');
    const title = root.querySelector('h1');
    const rejoin = root.querySelector('.lobby-rejoin-banner');
    const tabs = root.querySelector('.lobby-tabs');
    expect(title?.textContent).toBe('singedTerra');
    expect(rejoin?.querySelector('.lobby-rejoin-text')?.textContent)
      .toBe('You have a game in progress.');
    expect([...root.children]).toEqual([
      title,
      account,
      vehiclePreview,
      rejoin,
      tabs,
      content,
      controls,
    ]);
    expect(button(root, 'Rejoin your game').type).toBe('button');
  });

  it('renders active primary tabs and routes tab and rejoin actions', () => {
    const onTabChange = vi.fn();
    const onRejoin = vi.fn();
    const root = buildLobbyShellView(options({ onTabChange, onRejoin }));
    const hotSeat = button(root, 'Hot Seat');
    const online = button(root, 'Play Online');
    const rejoin = button(root, 'Rejoin your game');

    expect(hotSeat.className).toBe('lobby-tab active');
    expect(online.className).toBe('lobby-tab');
    expect(hotSeat.type).toBe('button');
    expect(online.type).toBe('button');
    hotSeat.click();
    online.click();
    rejoin.click();
    expect(onTabChange.mock.calls).toEqual([['hotseat'], ['online']]);
    expect(onRejoin).toHaveBeenCalledOnce();
    expect(onRejoin).toHaveBeenCalledWith();
  });

  it('omits rejoin, marks Online active, and preserves the online wrapper', () => {
    const subView = section('online-sub-view');
    const onlineView = buildLobbyOnlineView(subView);
    const root = buildLobbyShellView(options({
      activeTab: 'online',
      rejoinAvailable: false,
      content: onlineView,
    }));

    expect(root.querySelector('.lobby-rejoin-banner')).toBeNull();
    expect(button(root, 'Hot Seat').className).toBe('lobby-tab');
    expect(button(root, 'Play Online').className).toBe('lobby-tab active');
    expect(onlineView.tagName).toBe('DIV');
    expect(onlineView.className).toBe('');
    expect([...onlineView.children]).toEqual([subView]);
  });

  it('omits the account slot when optional accounts are unavailable', () => {
    const root = buildLobbyShellView(options({ account: null }));

    expect(root.querySelector('[data-section="account"]')).toBeNull();
    expect(button(root, 'Hot Seat')).toBeTruthy();
  });
});
