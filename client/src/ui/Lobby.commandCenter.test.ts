import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby } from './Lobby';

function button(root: HTMLElement, text: string): HTMLButtonElement {
  let match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
  const category = text === 'Local Battle' || text === 'Play Online'
    ? 'multiplayer'
    : text.includes('Ash Road') ? 'campaigns' : null;
  if (!match && category) {
    root.querySelector<HTMLButtonElement>(
      `[data-command-surface="rail"][data-command-category="${category}"]`,
    )?.click();
    if (category === 'multiplayer') {
      const item = root.querySelector<HTMLButtonElement>(
        `[data-command-item="${text === 'Play Online' ? 'online' : 'local-battle'}"]`,
      );
      item?.click();
      if (item) return item;
    }
    match = [...root.querySelectorAll('button')]
      .find((candidate) => candidate.textContent === text);
  }
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`);
  return match;
}

describe('Lobby command center navigation', () => {
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
    root.remove();
    vi.restoreAllMocks();
  });

  it('starts at the contextual command item without rendering Multiplayer setup', () => {
    const lobby = new Lobby(root, vi.fn());

    lobby.show();

    expect(root.querySelectorAll('.command-center__library-items [data-command-item]'))
      .toHaveLength(6);
    expect(button(root, 'Start First Salvo')).toBeInstanceOf(HTMLButtonElement);
    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="campaigns"]',
    )?.click();
    const campaignPrimary = root.querySelector<HTMLButtonElement>(
      '[data-campaign-command-view] [data-command-primary]',
    );
    expect(campaignPrimary?.disabled).toBe(true);
    expect(['Checking save', 'Save unavailable']).toContain(campaignPrimary?.textContent);
    expect(root.querySelector('.lobby-start')).toBeNull();
    expect(root.querySelector('.lobby-name')).toBeNull();
    expect(root.querySelector('.lobby-preview')).toBeNull();
  });

  it('does not construct listener-owning Multiplayer nodes while Skirmishes is active', () => {
    const listenerTargets: EventTarget[] = [];
    const nativeAddEventListener = EventTarget.prototype.addEventListener;
    vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function recordListener(
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      listenerTargets.push(this);
      nativeAddEventListener.call(this, type, listener, options);
    });
    const lobby = new Lobby(root, vi.fn());

    lobby.show();

    const preparationTargets = listenerTargets.filter((target): target is Element => (
      target instanceof Element && target.matches(
        '.lobby-name, .lobby-start, .lobby-garage, .lobby-advanced-trigger, .lobby-hotseat-customization',
      )
    ));
    expect(preparationTargets).toEqual([]);
  });

  it('mounts Local Battle in place and keeps focus on its selected library item', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();

    button(root, 'Local Battle').click();
    expect(root.querySelector('.lobby-start')).not.toBeNull();
    expect(root.querySelector('.lobby-preview')).not.toBeNull();
    expect(document.activeElement).toBe(root.querySelector(
      '.command-center__library-items button[data-command-item="local-battle"]',
    ));
    expect(root.querySelector('.command-center')).not.toBeNull();
  });

  it('aborts every rendered element listener before the lobby tree is hidden', () => {
    const registrations: Array<{ target: EventTarget; signal?: AbortSignal }> = [];
    const nativeAddEventListener = EventTarget.prototype.addEventListener;
    vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function scopedListener(
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      registrations.push({
        target: this,
        ...(typeof options === 'object' && options?.signal ? { signal: options.signal } : {}),
      });
      nativeAddEventListener.call(this, type, listener, options);
    });
    const onReady = vi.fn();
    const lobby = new Lobby(root, onReady);
    lobby.show();
    button(root, 'Local Battle').click();
    const staleStart = root.querySelector<HTMLButtonElement>('.lobby-start')!;
    const activeRegistrations = registrations.filter(({ target }) => (
      target instanceof Element && root.contains(target)
    ));
    expect(activeRegistrations.length).toBeGreaterThan(10);
    expect(activeRegistrations.every(({ signal }) => signal instanceof AbortSignal && !signal.aborted))
      .toBe(true);

    lobby.hide();

    expect(activeRegistrations.every(({ signal }) => signal?.aborted === true)).toBe(true);
    staleStart.click();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('preserves Local and Online working state across command-item round trips', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();

    button(root, 'Local Battle').click();
    expect(root.querySelector('[data-multiplayer-command-view="local-battle"]')).not.toBeNull();
    const localName = root.querySelector<HTMLInputElement>('.lobby-name')!;
    localName.value = 'Dust Fox';
    localName.dispatchEvent(new Event('input', { bubbles: true }));

    button(root, 'Play Online').click();
    const onlineName = root.querySelector<HTMLInputElement>('.lobby-name')!;
    onlineName.value = 'Signal Fox';
    onlineName.dispatchEvent(new Event('input', { bubbles: true }));
    button(root, 'Join with a code').click();
    expect(root.querySelector('.lobby-code-input')).not.toBeNull();

    button(root, 'Local Battle').click();
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Dust Fox');

    button(root, 'Play Online').click();
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Signal Fox');
    expect(root.querySelector('.lobby-code-input')).not.toBeNull();
  });

  it('opens a valid room invite directly in Online join preparation', () => {
    history.replaceState(null, '', '/singedTerra/?join=ab12');
    const lobby = new Lobby(root, vi.fn());

    lobby.show();

    expect(root.querySelector('.command-center')).not.toBeNull();
    expect(root.querySelector('[data-command-item="online"]')?.getAttribute('aria-current'))
      .toBe('true');
    expect(root.querySelector<HTMLInputElement>('.lobby-code-input')?.value).toBe('AB12');
  });
});
