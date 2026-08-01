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
  it('renders the player range, selected count, shared-node order, and crowded layout', () => {
    const playerRows = [section('player-1'), section('player-2'), section('player-3')];
    const advanced = section('advanced');
    const root = buildLobbyHotSeatView(options({ playerCount: 3, playerRows, advanced }));

    expect(root.className).toBe('lobby-hotseat crowded');
    expect(root.querySelector('.lobby-sub')?.textContent)
      .toBe('Hot-seat setup — choose 2-4 players, name them, pick a color.');
    const select = root.querySelector('select');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect([...select!.options].map((option) => option.value)).toEqual(['2', '3', '4']);
    expect(select!.value).toBe('3');

    const rows = root.querySelector('.lobby-rows');
    expect(rows?.classList.contains('crowded')).toBe(true);
    expect([...rows!.children]).toEqual(playerRows);
    expect([...root.children].indexOf(rows!)).toBeLessThan([...root.children].indexOf(advanced));
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
    expect(start.textContent).toBe('Start Game');
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

    expect(root.className).toBe('lobby-hotseat');
    expect(root.querySelector('.lobby-rows')?.classList.contains('crowded')).toBe(false);
    expect(root.querySelector('.lobby-error')?.textContent)
      .toBe('Each player must pick a unique color.');
    const start = startButton(root);
    expect(start.disabled).toBe(true);
    start.click();
    expect(onStart).not.toHaveBeenCalled();
  });
});
