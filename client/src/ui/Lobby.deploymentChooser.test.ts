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

    expect(root.querySelectorAll('.lobby-deployment-chooser button')).toHaveLength(3);
    expect(root.querySelector('.lobby-start')).toBeNull();
    expect(root.querySelector('.lobby-name')).toBeNull();
    expect(root.querySelector('.lobby-preview')).toBeNull();
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
