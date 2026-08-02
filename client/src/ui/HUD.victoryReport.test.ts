import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import { HUD } from './HUD';

function mount(): {
  app: HTMLElement;
  stage: HTMLElement;
  root: HTMLElement;
  lobby: HTMLElement;
  modal: HTMLElement;
  hud: HUD;
  state: GameState;
} {
  document.body.innerHTML = `
    <main id="app">
      <section id="stage"><div id="game-overlay"></div></section>
      <aside id="hud"></aside>
      <section id="lobby"><button type="button">Hot Seat</button></section>
      <div id="modal-layer"></div>
    </main>
  `;
  const app = document.querySelector<HTMLElement>('#app')!;
  const stage = document.querySelector<HTMLElement>('#stage')!;
  const root = document.querySelector<HTMLElement>('#hud')!;
  const lobby = document.querySelector<HTMLElement>('#lobby')!;
  const modal = document.querySelector<HTMLElement>('#modal-layer')!;
  const overlay = document.querySelector<HTMLElement>('#game-overlay')!;
  const hud = new HUD(root, overlay, modal);
  const state = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  }).getState();
  state.phase = 'GAME_OVER';
  state.winner = state.tanks[0]!.id;
  state.tanks[0]!.loadout = {
    treads: 'ranger',
    hull: 'bulwark',
    turret: 'jackal',
    barrel: 'foundry',
  };
  state.tanks[0]!.kills = 2;
  state.tanks[0]!.totalDamage = 134;
  state.tanks[1]!.kills = 0;
  state.tanks[1]!.totalDamage = 52;
  return { app, stage, root, lobby, modal, hud, state };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('HUD Victory After-Action Report', () => {
  it('stages the exact winner and assembled tank in one real modal report', () => {
    const { stage, root, lobby, modal, hud, state } = mount();
    const restart = vi.fn();
    const quit = vi.fn();
    hud.onRestart(restart);
    hud.onQuit(quit);

    hud.update(state);

    const report = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')!;
    const title = report.querySelector<HTMLElement>('.st-hud__victory-title')!;
    const tank = report.querySelector<HTMLCanvasElement>('.st-hud__victory-tank')!;
    const playAgain = report.querySelector<HTMLButtonElement>('.st-hud__victory-primary')!;
    const mainMenu = report.querySelector<HTMLButtonElement>('.st-hud__restart--ghost')!;

    expect(report.getAttribute('role')).toBe('dialog');
    expect(report.getAttribute('aria-modal')).toBe('true');
    expect(report.getAttribute('aria-labelledby')).toBe(title.id);
    expect(report.querySelector('.st-hud__victory-eyebrow')?.textContent)
      .toBe('After action report');
    expect(title.textContent).toBe('Alice wins');
    expect(report.querySelector('.st-hud__victory-status')?.textContent)
      .toBe('Match winner');
    expect(report.style.getPropertyValue('--st-victory-color')).toBe('#e84d4d');
    expect(tank.hidden).toBe(false);
    expect(tank.dataset['tankPreviewSignature'])
      .toBe('spotlight|#e84d4d|ranger|bulwark|jackal|foundry');
    expect(modal.querySelectorAll('.st-hud__score-cell--winner').length).toBe(3);
    expect(stage.inert).toBe(true);
    expect(root.inert).toBe(true);
    expect(lobby.inert).toBe(true);
    expect(playAgain.textContent).toBe('Play again');
    expect(document.activeElement).toBe(playAgain);

    playAgain.click();
    mainMenu.click();
    expect(restart).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
  });

  it('contains both tab directions, then releases isolation and stale art on exit', () => {
    const { stage, root, lobby, modal, hud, state } = mount();
    hud.update(state);
    const report = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')!;
    const tank = report.querySelector<HTMLCanvasElement>('.st-hud__victory-tank')!;
    const playAgain = report.querySelector<HTMLButtonElement>('.st-hud__victory-primary')!;
    const mainMenu = report.querySelector<HTMLButtonElement>('.st-hud__restart--ghost')!;

    playAgain.focus();
    report.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(mainMenu);
    report.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(playAgain);
    report.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true,
    }));
    expect(document.activeElement).toBe(mainMenu);

    state.phase = 'PLAYER_TURN';
    state.winner = null;
    hud.update(state);

    expect(report.classList.contains('st-hud__overlay--hidden')).toBe(true);
    expect(stage.inert).toBe(false);
    expect(root.inert).toBe(false);
    expect(lobby.inert).toBe(false);
    expect(tank.hidden).toBe(true);
    expect(tank.dataset['tankPreviewSignature']).toBeUndefined();
  });

  it('supersedes an open pause surface when a live network match ends', () => {
    const { root, modal, hud, state } = mount();
    state.phase = 'PLAYER_TURN';
    state.winner = null;
    hud.update(state);

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();
    const pause = [...modal.querySelectorAll<HTMLElement>('.st-hud__overlay')]
      .find((surface) => surface.textContent?.includes('Paused'))!;
    expect(hud.isPaused()).toBe(true);
    expect(pause.classList.contains('st-hud__overlay--hidden')).toBe(false);

    state.phase = 'GAME_OVER';
    state.winner = state.tanks[0]!.id;
    hud.update(state);

    expect(hud.isPaused()).toBe(false);
    expect(pause.classList.contains('st-hud__overlay--hidden')).toBe(true);
    expect(modal.querySelector('.st-hud__overlay--victory')?.classList
      .contains('st-hud__overlay--hidden')).toBe(false);
  });

  it('presents an honest draw without winner art or highlighted standings', () => {
    const { modal, hud, state } = mount();
    state.winner = null;

    hud.update(state);

    const report = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')!;
    expect(report.querySelector('.st-hud__victory-title')?.textContent).toBe('Draw');
    expect(report.querySelector('.st-hud__victory-status')?.textContent)
      .toBe('No tank standing');
    expect(report.querySelector<HTMLCanvasElement>('.st-hud__victory-tank')?.hidden)
      .toBe(true);
    expect(modal.querySelectorAll('.st-hud__score-cell--winner')).toHaveLength(0);
  });
});
