import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import type {
  HotSeatProgressionReceipt,
  HotSeatProgressionSummary,
} from '../client/hotSeatProgression';
import { HUD } from './HUD';

function trustedReceipt(
  current: Omit<HotSeatProgressionSummary, 'progressionVersion'>,
): HotSeatProgressionReceipt {
  const earned = current.totalXp >= 200 ? 200 : 100;
  const priorTotalXp = current.totalXp - earned;
  return {
    prior: {
      progressionVersion: 1,
      totalXp: priorTotalXp,
      level: Math.floor(priorTotalXp / 500) + 1,
      levelXp: priorTotalXp % 500,
      nextLevelXp: 500,
    },
    current: { progressionVersion: 1, ...current },
  };
}

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

  it('names earned victory XP and the next visible level milestone without adding a third action', () => {
    const { modal, hud, state } = mount();
    hud.update(state);
    const report = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')!;
    const receipt = report.querySelector<HTMLElement>('.st-hud__victory-progression-receipt')!;
    const playAgain = report.querySelector<HTMLButtonElement>('.st-hud__victory-primary')!;
    const mainMenu = report.querySelector<HTMLButtonElement>('.st-hud__restart--ghost')!;

    expect(receipt.hidden).toBe(true);
    hud.setProgressionReceipt({
      won: true,
      receipt: trustedReceipt({
        totalXp: 1_200,
        level: 3,
        levelXp: 200,
        nextLevelXp: 500,
      }),
    });

    expect(receipt.hidden).toBe(false);
    expect(receipt.querySelector('.st-hud__victory-progression-summary')?.textContent)
      .toBe('Victory · +200 XP · 300 XP to Level 4');
    expect(receipt.querySelector('.st-hud__victory-career-current')).toBeNull();
    expect(receipt.querySelector('.st-hud__victory-career-insignia')).toBeNull();
    expect(receipt.querySelector('.st-hud__victory-career-next')).toBeNull();
    expect(receipt.getAttribute('role')).toBe('status');
    expect(receipt.getAttribute('aria-live')).toBe('polite');
    expect(report.querySelectorAll('button')).toHaveLength(2);

    playAgain.focus();
    report.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(mainMenu);

    state.phase = 'PLAYER_TURN';
    hud.update(state);
    expect(receipt.hidden).toBe(true);
    expect(receipt.textContent).toBe('');
  });

  it('names participation XP and the next level after a recorded non-win', () => {
    const { modal, hud, state } = mount();
    hud.update(state);
    const receipt = modal.querySelector<HTMLElement>('.st-hud__victory-progression-receipt')!;

    hud.setProgressionReceipt({
      won: false,
      receipt: trustedReceipt({
        totalXp: 100,
        level: 1,
        levelXp: 100,
        nextLevelXp: 500,
      }),
    });

    expect(receipt.querySelector('.st-hud__victory-progression-summary')?.textContent)
      .toBe('Match complete · +100 XP · 400 XP to Level 2');
    expect(receipt.querySelector('.st-hud__victory-career-current')).toBeNull();
    expect(receipt.querySelector('.st-hud__victory-career-next')).toBeNull();
  });

  it('does not turn a casual hot-seat threshold crossing into a promotion claim', () => {
    const { modal, hud, state } = mount();
    hud.update(state);
    const report = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')!;
    const receipt = report.querySelector<HTMLElement>('.st-hud__victory-progression-receipt')!;

    hud.setProgressionReceipt({
      won: true,
      receipt: trustedReceipt({
        totalXp: 2_000,
        level: 5,
        levelXp: 0,
        nextLevelXp: 500,
      }),
    });

    expect(receipt.classList.contains('st-hud__victory-progression-receipt--promotion'))
      .toBe(false);
    expect(receipt.querySelector('.st-hud__victory-promotion-kicker')).toBeNull();
    expect(receipt.querySelector('.st-hud__victory-promotion-code')).toBeNull();
    expect(receipt.querySelector('.st-hud__victory-promotion-insignia')).toBeNull();
    expect(receipt.querySelector('.st-hud__victory-promotion-title')).toBeNull();
    expect(receipt.querySelector('.st-hud__victory-progression-summary')?.textContent)
      .toBe('Victory · +200 XP · 500 XP to Level 6');
    expect(receipt.querySelector('.st-hud__victory-career-next')).toBeNull();
    expect(report.querySelectorAll('button')).toHaveLength(2);

    state.phase = 'PLAYER_TURN';
    hud.update(state);
    expect(receipt.hidden).toBe(true);
    expect(receipt.classList.contains('st-hud__victory-progression-receipt--promotion'))
      .toBe(false);
    expect(receipt.childElementCount).toBe(0);
  });

  it('does not turn casual participation XP after a loss into a promotion claim', () => {
    const { modal, hud, state } = mount();
    hud.update(state);
    const receipt = modal.querySelector<HTMLElement>('.st-hud__victory-progression-receipt')!;

    hud.setProgressionReceipt({
      won: false,
      receipt: {
        prior: {
          progressionVersion: 1,
          totalXp: 1_900,
          level: 4,
          levelXp: 400,
          nextLevelXp: 500,
        },
        current: {
          progressionVersion: 1,
          totalXp: 2_000,
          level: 5,
          levelXp: 0,
          nextLevelXp: 500,
        },
      },
    });

    expect(receipt.querySelector('.st-hud__victory-promotion-kicker')).toBeNull();
    expect(receipt.querySelector('.st-hud__victory-promotion-title')).toBeNull();
    expect(receipt.querySelector('.st-hud__victory-progression-summary')?.textContent)
      .toBe('Match complete · +100 XP · 500 XP to Level 6');
    expect(receipt.querySelector('.st-hud__victory-career-next')).toBeNull();
  });

  it('keeps the future-only sign-in handoff out of the report until an anonymous match asks for it', () => {
    const { modal, hud, state } = mount();
    const signIn = vi.fn();
    hud.update(state);
    const report = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')!;
    const handoff = report.querySelector<HTMLElement>('.st-hud__victory-progression-handoff')!;

    expect([...document.head.querySelectorAll('style')].some((style) =>
      style.textContent?.includes('.st-hud__victory-progression-handoff[hidden]'),
    )).toBe(true);
    expect(handoff.hidden).toBe(true);
    expect(getComputedStyle(handoff).display).toBe('none');
    expect(handoff.textContent).toContain('Sign in to record future matches.');
    expect(report.querySelectorAll('button')).toHaveLength(2);

    hud.onProgressionSignIn(signIn);
    hud.setAnonymousProgressionHandoff();

    const signInButton = report.querySelector<HTMLButtonElement>('.st-hud__victory-progression-sign-in')!;
    const playAgain = report.querySelector<HTMLButtonElement>('.st-hud__victory-primary')!;
    const mainMenu = report.querySelector<HTMLButtonElement>('.st-hud__restart--ghost')!;
    expect(handoff.hidden).toBe(false);
    expect(getComputedStyle(handoff).display).toBe('grid');
    expect(handoff.getAttribute('role')).toBe('status');
    expect(handoff.getAttribute('aria-live')).toBe('polite');
    expect(handoff.getAttribute('aria-atomic')).toBe('true');
    expect(signInButton.textContent).toBe('Sign in');
    expect(report.querySelectorAll('button')).toHaveLength(3);

    signInButton.focus();
    report.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(mainMenu);
    report.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(signInButton);
    report.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(playAgain);

    signInButton.click();
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('clears the anonymous sign-in handoff when trusted progression or report retirement wins', () => {
    const { modal, hud, state } = mount();
    hud.update(state);
    const handoff = modal.querySelector<HTMLElement>('.st-hud__victory-progression-handoff')!;

    hud.setAnonymousProgressionHandoff();
    hud.setProgressionReceipt({
      won: true,
      receipt: trustedReceipt({
        totalXp: 1_200,
        level: 3,
        levelXp: 200,
        nextLevelXp: 500,
      }),
    });
    expect(handoff.hidden).toBe(true);

    hud.setAnonymousProgressionHandoff();
    state.phase = 'PLAYER_TURN';
    hud.update(state);
    expect(handoff.hidden).toBe(true);
  });

  it('supersedes an open pause surface when a live network match ends', () => {
    const { root, modal, hud, state } = mount();
    state.phase = 'PLAYER_TURN';
    state.winner = null;
    hud.update(state);

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();
    const pause = modal.querySelector<HTMLElement>('[data-ui="command-menu"]')!;
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
