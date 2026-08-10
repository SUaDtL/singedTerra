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
    customizationOpen: false,
    validationMessage: null,
    onPlayerCountChange: vi.fn(),
    onCustomizationToggle: vi.fn(),
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
  it('presents valid defaults as ready and progressively discloses customization', () => {
    const onCustomizationToggle = vi.fn();
    const root = buildLobbyHotSeatView(options({ onCustomizationToggle }));
    const ready = root.querySelector<HTMLElement>('.lobby-hotseat-ready');
    const customization = root.querySelector<HTMLDetailsElement>(
      '.lobby-hotseat-customization',
    );
    const setup = root.querySelector<HTMLElement>('.lobby-route-brief__setup');
    const start = startButton(root);

    expect(ready?.querySelector('h3')?.textContent).toBe('Battery ready');
    expect(ready?.textContent).toContain('2-player local battle');
    expect(ready?.textContent).toContain('Current crew and battlefield setup is ready');
    expect(customization).toBeInstanceOf(HTMLDetailsElement);
    expect(customization?.open).toBe(false);
    expect(customization?.querySelector('summary')?.textContent)
      .toBe('Customize crew and battlefield');
    expect(customization?.contains(setup ?? null)).toBe(true);
    expect(customization?.contains(start)).toBe(false);

    customization!.open = true;
    customization!.dispatchEvent(new Event('toggle'));
    expect(onCustomizationToggle).toHaveBeenCalledWith(true);

    customization!.dataset.invalid = 'true';
    customization!.open = false;
    customization!.dispatchEvent(new Event('toggle'));
    expect(customization?.open).toBe(true);

    customization!.dataset.invalid = 'false';
    customization!.open = false;
    customization!.dispatchEvent(new Event('toggle'));
    expect(onCustomizationToggle).toHaveBeenLastCalledWith(false);
  });

  it('renders the player range, selected count, shared-node order, and crowded layout', () => {
    const playerRows = [section('player-1'), section('player-2'), section('player-3')];
    const advanced = section('advanced');
    const root = buildLobbyHotSeatView(options({ playerCount: 3, playerRows, advanced }));

    expect(root.className).toBe('lobby-route-brief lobby-hotseat crowded');
    expect(root.querySelector('.lobby-route-brief__title')?.textContent).toBe('Local battery');
    expect(root.querySelector('.lobby-route-brief__purpose')?.textContent)
      .toBe('Configure the crew sharing this battlefield.');
    expect(root.querySelector('.lobby-route-brief__setup')?.getAttribute('aria-label'))
      .toBe('Local battery setup');
    const select = root.querySelector('select');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect([...select!.options].map((option) => option.value)).toEqual(['2', '3', '4']);
    expect(select!.value).toBe('3');

    const rows = root.querySelector('.lobby-rows');
    expect(rows?.classList.contains('crowded')).toBe(true);
    expect([...rows!.children]).toEqual(playerRows);
    const crew = root.querySelector<HTMLElement>('[aria-labelledby="crew-manifest-heading"]');
    const protocol = root.querySelector<HTMLElement>('[aria-labelledby="battlefield-protocol-heading"]');
    expect(crew?.querySelector('.lobby-preparation-section__title')?.textContent)
      .toBe('Crew manifest');
    expect(crew?.querySelector('select')).toBe(select);
    expect(crew?.querySelector('.lobby-rows')).toBe(rows);
    expect(protocol?.querySelector('.lobby-preparation-section__title')?.textContent)
      .toBe('Battlefield protocol');
    expect(protocol?.querySelector('[data-section="advanced"]')).toBe(advanced);
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
    expect(start.textContent).toBe('Deploy local battle');
    expect(start.className).toBe('lobby-start lobby-btn primary');
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

    expect(root.className).toBe('lobby-route-brief lobby-hotseat');
    expect(root.querySelector('.lobby-rows')?.classList.contains('crowded')).toBe(false);
    expect(root.querySelector('.lobby-error')?.textContent)
      .toBe('Each player must pick a unique color.');
    const customization = root.querySelector<HTMLDetailsElement>('.lobby-hotseat-customization');
    expect(customization?.open).toBe(true);
    customization!.open = false;
    customization!.dispatchEvent(new Event('toggle'));
    expect(customization?.open).toBe(true);
    const start = startButton(root);
    expect(start.disabled).toBe(true);
    start.click();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('restores an explicitly opened customization view after a route rerender', () => {
    const root = buildLobbyHotSeatView(options({ customizationOpen: true }));

    expect(root.querySelector<HTMLDetailsElement>('.lobby-hotseat-customization')?.open)
      .toBe(true);
  });
});
