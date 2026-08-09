import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { HUD } from './HUD';

function mount(): {
  stage: HTMLElement;
  lobby: HTMLElement;
  root: HTMLElement;
  overlay: HTMLElement;
  modal: HTMLElement;
  hud: HUD;
} {
  const app = document.createElement('main');
  const stage = document.createElement('div');
  const lobby = document.createElement('div');
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  stage.append(overlay);
  app.append(stage, root, lobby, modal);
  document.body.append(app);
  const hud = new HUD(root, overlay, modal);
  const state = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  }).getState();
  hud.update(state, false, true);
  return { stage, lobby, root, overlay, modal, hud };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD Command Menu', () => {
  it('opens a named command navigation dialog with Resume as its first action', () => {
    const { root, modal } = mount();

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();

    const menu = modal.querySelector<HTMLElement>('[data-ui="command-menu"]')!;
    expect(menu.getAttribute('role')).toBe('dialog');
    expect(menu.getAttribute('aria-modal')).toBe('true');
    expect(menu.getAttribute('aria-label')).toBe('Command Menu');
    expect(menu.querySelector('h2')?.textContent).toBe('Command Menu');
    expect(menu.querySelector<HTMLButtonElement>('button')?.textContent).toBe('Resume');
  });

  it('closes the voluntary Store surface before opening Command Menu', () => {
    const { root, modal } = mount();

    root.querySelector<HTMLButtonElement>('.st-hud__store-btn')!.click();
    expect(modal.querySelector('.st-hud__store')?.classList.contains('st-hud__store--hidden')).toBe(false);

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();

    expect(modal.querySelector('.st-hud__store')?.classList.contains('st-hud__store--hidden')).toBe(true);
  });

  it('provides a Command Menu handoff from the blocking Store surface', () => {
    const { root, modal } = mount();
    root.querySelector<HTMLButtonElement>('.st-hud__store-btn')!.click();

    modal.querySelector<HTMLButtonElement>('[data-command="open-menu"]')!.click();

    expect(modal.querySelector('.st-hud__store')?.classList.contains('st-hud__store--hidden')).toBe(true);
    expect(modal.querySelector('[data-ui="command-menu"]')?.classList
      .contains('st-hud__overlay--hidden')).toBe(false);
  });

  it('returns focus to the Menu control that opened Command Menu', () => {
    const { root, modal } = mount();
    const menuButton = root.querySelector<HTMLButtonElement>('.st-hud__menu')!;
    menuButton.focus();
    menuButton.click();

    const resume = modal.querySelector<HTMLButtonElement>('[data-ui="command-menu"] button')!;
    expect(document.activeElement).toBe(resume);
    resume.click();

    expect(document.activeElement).toBe(menuButton);
  });

  it('cycles Tab within Command Menu instead of escaping to the match', () => {
    const { root, modal } = mount();
    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();
    const menu = modal.querySelector<HTMLElement>('[data-ui="command-menu"]')!;
    const [resume, returnToLobby] = [...menu.querySelectorAll<HTMLButtonElement>('button')];

    returnToLobby!.focus();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(resume);

    menu.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    }));
    expect(document.activeElement).toBe(returnToLobby);
  });

  it('isolates background surfaces while Command Menu is open and restores them on Resume', () => {
    const { stage, lobby, root, modal } = mount();
    const store = modal.querySelector<HTMLElement>('.st-hud__store')!;
    const victory = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')!;

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();

    expect(stage.inert).toBe(true);
    expect(root.inert).toBe(true);
    expect(lobby.inert).toBe(true);
    expect(store.inert).toBe(true);
    expect(victory.inert).toBe(true);

    modal.querySelector<HTMLButtonElement>('[data-ui="command-menu"] button')!.click();

    expect(stage.inert).toBe(false);
    expect(root.inert).toBe(false);
    expect(lobby.inert).toBe(false);
    expect(store.inert).toBe(false);
    expect(victory.inert).toBe(false);
  });

  it('preserves a background surface that was already isolated before Command Menu opens', () => {
    const { lobby, root, modal } = mount();
    lobby.inert = true;
    lobby.setAttribute('aria-hidden', 'false');

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();
    modal.querySelector<HTMLButtonElement>('[data-ui="command-menu"] button')!.click();

    expect(lobby.inert).toBe(true);
    expect(lobby.getAttribute('aria-hidden')).toBe('false');
  });

  it('omits First Salvo help until a replay action is available', () => {
    const { root, modal } = mount();

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();

    expect(modal.querySelector('[data-ui="command-menu"]')?.textContent)
      .not.toContain('Replay First Salvo');
  });

  it('isolates the lobby exit from Command Menu actions', () => {
    const { root, modal } = mount();

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();

    const exit = modal.querySelector<HTMLElement>('[data-ui="command-menu-exit"]')!;
    expect(exit.getAttribute('role')).toBe('group');
    expect(exit.getAttribute('aria-label')).toBe('Leave this match');
    expect(exit.querySelector('button')?.textContent).toBe('Return to Lobby');
    expect(getComputedStyle(exit).borderTopWidth).toBe('1px');
  });
});
