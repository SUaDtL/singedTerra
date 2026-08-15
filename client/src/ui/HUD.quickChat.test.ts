import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { HUD } from './HUD';

function mount(): {
  hud: HUD;
  root: HTMLElement;
  overlay: HTMLElement;
  state: ReturnType<GameEngine['getState']>;
} {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
  const hud = new HUD(root, overlay, modal, overlay);
  const engine = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  });
  return { hud, root, overlay, state: engine.getState() };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
});

describe('HUD quick chat', () => {
  it('renders an accessible six-message palette only when network chat is enabled', () => {
    const { hud, root, overlay, state } = mount();
    hud.update(state);
    expect(root.querySelector('.st-hud__quick-chat')).toBeNull();
    expect(overlay.querySelector('.st-hud__quick-chat')?.classList.contains('st-hud__quick-chat--hidden')).toBe(true);

    const sent: string[] = [];
    hud.onQuickChat((key) => sent.push(key));
    hud.setQuickChatEnabled(true);
    const toggle = overlay.querySelector<HTMLButtonElement>('.st-hud__quick-chat-toggle')!;
    expect(toggle.getAttribute('aria-label')).toBe('Open quick chat');
    toggle.click();
    expect(overlay.querySelectorAll('.st-hud__quick-chat-option')).toHaveLength(6);
    overlay.querySelector<HTMLButtonElement>('[data-quick-chat="nice_shot"]')!.click();
    expect(sent).toEqual(['nice_shot']);
  });

  it('renders received sender content as text, never markup', () => {
    const { hud, root, state } = mount();
    hud.update(state);
    hud.showQuickChat({ key: 'ready', playerName: '<img src=x onerror=alert(1)>' });
    const toast = root.parentElement?.querySelector('.st-hud__toast')!;
    expect(toast.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(toast.querySelector('img')).toBeNull();
  });
});
