import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import { HUD } from './HUD';

function mount(): {
  root: HTMLElement;
  overlay: HTMLElement;
  hud: HUD;
  state: GameState;
} {
  const root = document.createElement('div');
  root.id = 'hud';
  const overlay = document.createElement('div');
  overlay.id = 'game-overlay';
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
  const hud = new HUD(root, overlay, modal);
  const engine = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  });
  return { root, overlay, hud, state: engine.getState() };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD combat focus', () => {
  it.each([
    ['PLAYER_TURN', false, 'decision'],
    ['PLAYER_TURN', true, 'outcome'],
    ['FIRING', false, 'outcome'],
    ['RESOLVING', false, 'outcome'],
    ['LOBBY', false, 'terminal'],
    ['ROUND_OVER', false, 'terminal'],
    ['GAME_OVER', false, 'terminal'],
  ] as const)('derives %s with pending=%s as %s', (phase, pending, expected) => {
    const { root, overlay, hud, state } = mount();
    state.phase = phase;

    hud.update(state, pending, true);

    expect(root.dataset['combatFocus']).toBe(expected);
    expect(overlay.dataset['combatFocus']).toBe(expected);
  });

  it('describes mixed outcome regions without disabling available Store and Menu controls', () => {
    const { root, overlay, hud, state } = mount();
    hud.update(state, true, true);

    const console = root.querySelector<HTMLElement>('.st-hud__command-console')!;
    const touchToolbar = overlay.querySelector<HTMLElement>('.st-hud__touch-strip')!;
    const store = root.querySelector<HTMLButtonElement>('.st-hud__store-btn')!;
    const menu = overlay.querySelector<HTMLButtonElement>('.st-hud__touch-menu')!;
    const progress = root.querySelector<HTMLElement>('.st-hud__aim')!;
    expect(console.getAttribute('aria-disabled')).toBeNull();
    expect(touchToolbar.getAttribute('aria-disabled')).toBeNull();
    expect(console.getAttribute('aria-label')).toBe(
      'Shot outcome in progress. Combat controls unavailable; Store remains available.',
    );
    expect(touchToolbar.getAttribute('aria-label')).toBe(
      'Touch commands during shot outcome. Combat controls unavailable; Menu remains available.',
    );
    expect(store.disabled).toBe(false);
    expect(store.getAttribute('aria-disabled')).not.toBe('true');
    expect(menu.disabled).toBe(false);
    expect(menu.getAttribute('aria-disabled')).not.toBe('true');
    expect(progress.getAttribute('role')).toBe('status');
    expect(progress.getAttribute('aria-live')).toBe('polite');
    expect(progress.getAttribute('aria-hidden')).toBeNull();
    expect(progress.classList.contains('st-hud__aim--hidden')).toBe(false);
  });

  it('restores decision emphasis and assistive state on a fresh player turn', () => {
    const { root, overlay, hud, state } = mount();
    state.phase = 'RESOLVING';
    hud.update(state, false, true);
    state.phase = 'PLAYER_TURN';
    state.turn += 1;

    hud.update(state, false, true);

    expect(root.dataset['combatFocus']).toBe('decision');
    expect(overlay.dataset['combatFocus']).toBe('decision');
    expect(root.querySelector('.st-hud__command-console')?.getAttribute('aria-disabled')).toBeNull();
    expect(overlay.querySelector('.st-hud__touch-strip')?.getAttribute('aria-disabled')).toBeNull();
    expect(root.querySelector('.st-hud__command-console')?.getAttribute('aria-label')).toBe(
      'Turn command console',
    );
    expect(overlay.querySelector('.st-hud__touch-strip')?.getAttribute('aria-label')).toBe(
      'Touch commands',
    );
    expect(root.querySelector('.st-hud__active-row')?.classList.contains('st-hud__active-row--hidden')).toBe(false);
  });

  it('uses terminal descriptions without claiming mixed parents are enabled or disabled', () => {
    const { root, overlay, hud, state } = mount();
    state.phase = 'ROUND_OVER';

    hud.update(state, false, true);

    const console = root.querySelector<HTMLElement>('.st-hud__command-console')!;
    const touchToolbar = overlay.querySelector<HTMLElement>('.st-hud__touch-strip')!;
    expect(console.getAttribute('aria-disabled')).toBeNull();
    expect(touchToolbar.getAttribute('aria-disabled')).toBeNull();
    expect(console.getAttribute('aria-label')).toBe(
      'Turn command console outside an active turn. Combat controls inactive; Store remains available.',
    );
    expect(touchToolbar.getAttribute('aria-label')).toBe(
      'Touch combat controls inactive outside an active turn; Menu remains available.',
    );
  });
});
