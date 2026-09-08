import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby } from './Lobby';

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`);
  return match;
}

describe('Lobby deployment chooser', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
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

  it('starts at deployment choices without rendering either setup flow', () => {
    const lobby = new Lobby(root, vi.fn());

    lobby.show();

    expect(root.querySelectorAll('.lobby-deployment-chooser button:not([data-operation-id])')).toHaveLength(3);
    expect(root.querySelector('.lobby-start')).toBeNull();
    expect(root.querySelector('.lobby-name')).toBeNull();
    expect(root.querySelector('.lobby-preview')).toBeNull();
  });

  it('does not construct listener-owning preparation nodes while only the chooser is active', () => {
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

  it('opens Local Battle and restores focus to that choice on return', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();

    button(root, 'Local Battle').click();
    expect(root.querySelector('.lobby-start')).not.toBeNull();
    expect(root.querySelector('.lobby-preview')).not.toBeNull();

    button(root, 'Back to deployment choices').click();
    expect(document.activeElement).toBe(button(root, 'Local Battle'));
    expect(root.querySelector('.lobby-start')).toBeNull();
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

  it('preserves Local and Online working state across chooser round trips', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();

    button(root, 'Local Battle').click();
    const preparation = root.querySelector<HTMLDetailsElement>('.lobby-hotseat-customization')!;
    preparation.open = true;
    preparation.dispatchEvent(new Event('toggle'));
    const localName = root.querySelector<HTMLInputElement>('.lobby-name')!;
    localName.value = 'Dust Fox';
    localName.dispatchEvent(new Event('input', { bubbles: true }));
    button(root, 'Back to deployment choices').click();

    button(root, 'Play Online').click();
    const onlineName = root.querySelector<HTMLInputElement>('.lobby-name')!;
    onlineName.value = 'Signal Fox';
    onlineName.dispatchEvent(new Event('input', { bubbles: true }));
    button(root, 'Join with a code').click();
    expect(root.querySelector('.lobby-code-input')).not.toBeNull();
    button(root, 'Back to deployment choices').click();

    button(root, 'Local Battle').click();
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Dust Fox');
    button(root, 'Back to deployment choices').click();

    button(root, 'Play Online').click();
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Signal Fox');
    expect(root.querySelector('.lobby-code-input')).not.toBeNull();
  });

  it('opens a valid room invite directly in Online join preparation', () => {
    history.replaceState(null, '', '/singedTerra/?join=ab12');
    const lobby = new Lobby(root, vi.fn());

    lobby.show();

    expect(root.querySelector('.lobby-deployment-chooser')).toBeNull();
    expect(root.querySelector<HTMLInputElement>('.lobby-code-input')?.value).toBe('AB12');
    expect(button(root, 'Back to deployment choices')).toBeTruthy();
  });
});
