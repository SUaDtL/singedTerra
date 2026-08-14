import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import { HUD } from './HUD';

function mount(): {
  root: HTMLElement;
  hud: HUD;
  state: GameState;
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
  const state = engine.getState();
  hud.update(state);
  return { root, hud, state };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD turn handoff beacon', () => {
  it('makes the active player primary and weapon secondary in one status row', () => {
    const { root } = mount();
    const row = root.querySelector<HTMLElement>('.st-hud__active-row')!;
    const status = root.querySelector<HTMLElement>('.st-hud__turn-status')!;

    expect(root.querySelector('.st-hud__turn-kicker')?.textContent).toBe('Active turn');
    expect(root.querySelector('.st-hud__turn-owner')?.textContent).toBe('Alice');
    expect(root.querySelector('.st-hud__weapon-value')?.textContent).toBe('Baby Missile');
    expect(row.getAttribute('role')).toBeNull();
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.getAttribute('aria-label')).toBe(
      "Alice's turn. Weapon Baby Missile. 100 fuel remaining.",
    );
    expect(row.style.getPropertyValue('--st-turn-color')).toBe('#e84d4d');
    expect(row.classList.contains('st-hud__active-row--handoff')).toBe(true);
  });

  it('emphasizes old and new roster owners across human handoffs and same-seat turns', () => {
    const { root, hud, state } = mount();
    const rows = [...root.querySelectorAll<HTMLElement>('.st-hud__player')];
    const aliceRow = rows.find(
      (row) => row.querySelector('.st-hud__name')?.textContent === 'Alice',
    )!;
    const bobRow = rows.find(
      (row) => row.querySelector('.st-hud__name')?.textContent === 'Bob',
    )!;
    const activeRow = root.querySelector<HTMLElement>('.st-hud__active-row')!;

    expect(aliceRow.classList.contains('st-hud__player--active')).toBe(true);
    expect(aliceRow.classList.contains('st-hud__player--handoff')).toBe(true);

    activeRow.classList.remove('st-hud__active-row--handoff');
    hud.update(state);
    expect(activeRow.classList.contains('st-hud__active-row--handoff')).toBe(false);
    expect(aliceRow.classList.contains('st-hud__player--handoff')).toBe(true);

    state.turn += 1;
    hud.update(state);
    expect(activeRow.classList.contains('st-hud__active-row--handoff')).toBe(true);
    expect(aliceRow.classList.contains('st-hud__player--handoff')).toBe(true);

    activeRow.classList.remove('st-hud__active-row--handoff');
    aliceRow.classList.remove('st-hud__player--handoff');
    const bob = state.tanks[1]!;
    state.turn += 1;
    state.activePlayerId = bob.id;
    hud.update(state);

    expect(root.querySelector('.st-hud__turn-owner')?.textContent).toBe('Bob');
    expect(aliceRow.classList.contains('st-hud__player--active')).toBe(false);
    expect(aliceRow.classList.contains('st-hud__player--handoff')).toBe(false);
    expect(bobRow.classList.contains('st-hud__player--active')).toBe(true);
    expect(bobRow.classList.contains('st-hud__player--handoff')).toBe(true);
  });

  it('updates identity, team accent, and CPU labeling on a CPU handoff', () => {
    const { root, hud, state } = mount();
    const bob = state.tanks[1]!;
    bob.ai = 'medium';
    state.turn += 1;
    state.activePlayerId = bob.id;

    hud.update(state);

    expect(root.querySelector('.st-hud__turn-owner')?.textContent).toBe('🤖 Bob');
    expect(root.querySelector('.st-hud__turn-status')?.getAttribute('aria-label'))
      .toBe("🤖 Bob's turn. Weapon Baby Missile. 100 fuel remaining.");
    expect(
      root.querySelector<HTMLElement>('.st-hud__active-row')
        ?.style.getPropertyValue('--st-turn-color'),
    ).toBe('#4d8ce8');
  });

  it('announces pending, flight, and resolving states from their authoritative signals', () => {
    const { root, hud, state } = mount();
    const row = root.querySelector<HTMLElement>('.st-hud__active-row')!;
    const progress = root.querySelector<HTMLElement>('.st-hud__aim')!;

    expect(row.classList.contains('st-hud__active-row--hidden')).toBe(false);
    expect(progress.classList.contains('st-hud__aim--hidden')).toBe(true);

    hud.update(state, true);
    expect(root.querySelector('.st-hud__aim-text')?.textContent)
      .toBe('Alice · Sending shot...');
    expect(progress.getAttribute('role')).toBe('status');
    expect(progress.getAttribute('aria-live')).toBe('polite');
    expect(progress.getAttribute('aria-atomic')).toBe('true');
    expect(progress.getAttribute('aria-label')).toBe('Alice is sending a shot.');
    expect(row.classList.contains('st-hud__active-row--hidden')).toBe(true);
    expect(progress.classList.contains('st-hud__aim--hidden')).toBe(false);

    state.phase = 'FIRING';
    hud.update(state);
    expect(root.querySelector('.st-hud__aim-text')?.textContent)
      .toBe('Alice · Shot in flight...');
    expect(progress.getAttribute('aria-label')).toBe(
      "Alice's shot is in flight.",
    );
    expect(row.classList.contains('st-hud__active-row--hidden')).toBe(true);
    expect(progress.classList.contains('st-hud__aim--hidden')).toBe(false);

    state.phase = 'RESOLVING';
    hud.update(state);
    expect(root.querySelector('.st-hud__aim-text')?.textContent)
      .toBe('Alice · Terrain settling...');
    expect(progress.getAttribute('aria-label')).toBe(
      "Alice's shot is resolving.",
    );
    expect(row.classList.contains('st-hud__active-row--hidden')).toBe(true);
    expect(progress.classList.contains('st-hud__aim--hidden')).toBe(false);

    state.tanks[0]!.alive = false;
    hud.update(state);
    expect(root.querySelector('.st-hud__aim-text')?.textContent)
      .toBe('Alice · Terrain settling...');
    expect(progress.getAttribute('aria-label')).toBe(
      "Alice's shot is resolving.",
    );

    state.phase = 'ROUND_OVER';
    hud.update(state);
    expect(row.classList.contains('st-hud__active-row--hidden')).toBe(true);
    expect(progress.classList.contains('st-hud__aim--hidden')).toBe(true);

    state.tanks[0]!.alive = true;
    state.phase = 'FIRING';
    hud.update(state);
    expect(progress.classList.contains('st-hud__aim--hidden')).toBe(false);

    state.phase = 'GAME_OVER';
    hud.update(state);
    expect(row.classList.contains('st-hud__active-row--hidden')).toBe(true);
    expect(progress.classList.contains('st-hud__aim--hidden')).toBe(true);
  });

  it('clears stale identity for terminal, dead-active, and missing-active states', () => {
    const { root, hud, state } = mount();
    const row = root.querySelector<HTMLElement>('.st-hud__active-row')!;
    const status = root.querySelector<HTMLElement>('.st-hud__turn-status')!;

    state.phase = 'GAME_OVER';
    hud.update(state);
    expect(row.classList.contains('st-hud__active-row--hidden')).toBe(true);
    expect(root.querySelector('.st-hud__turn-owner')?.textContent).toBe('');
    expect(status.getAttribute('aria-label')).toBe('No active turn.');

    state.phase = 'ROUND_OVER';
    hud.update(state);
    expect(row.classList.contains('st-hud__active-row--hidden')).toBe(true);
    expect(root.querySelector('.st-hud__turn-owner')?.textContent).toBe('');

    state.phase = 'PLAYER_TURN';
    state.tanks[0]!.alive = false;
    hud.update(state);
    expect(row.classList.contains('st-hud__active-row--hidden')).toBe(true);
    expect(root.querySelector('.st-hud__turn-owner')?.textContent).toBe('');

    state.tanks[0]!.alive = true;
    state.phase = 'PLAYER_TURN';
    state.activePlayerId = 'missing';
    hud.update(state);
    expect(row.classList.contains('st-hud__active-row--hidden')).toBe(true);
    expect(root.querySelector('.st-hud__turn-owner')?.textContent).toBe('');
    expect(status.getAttribute('aria-label')).toBe('No active turn.');
  });

  it('does not rewrite the owner live region on an unchanged animation frame', () => {
    const { root, hud, state } = mount();
    const row = root.querySelector<HTMLElement>('.st-hud__active-row')!;
    const observer = new MutationObserver(() => undefined);
    observer.observe(row, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    hud.update(state);

    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
  });

  it('resets its handoff latch when the persistent HUD starts a new game', () => {
    const { root, hud, state } = mount();
    const activeRow = root.querySelector<HTMLElement>('.st-hud__active-row')!;
    const aliceRow = [...root.querySelectorAll<HTMLElement>('.st-hud__player')]
      .find((row) => row.querySelector('.st-hud__name')?.textContent === 'Alice')!;

    activeRow.classList.remove('st-hud__active-row--handoff');
    aliceRow.classList.remove('st-hud__player--handoff');
    hud.update(state);
    expect(activeRow.classList.contains('st-hud__active-row--handoff')).toBe(false);

    hud.hideEndScreens();
    const freshState = new GameEngine({
      players: [
        { name: 'Alice', color: '#e84d4d' },
        { name: 'Bob', color: '#4d8ce8' },
      ],
      maxPlayers: 2,
      seed: 1,
    }).getState();
    hud.update(freshState);

    expect(activeRow.classList.contains('st-hud__active-row--handoff')).toBe(true);
    expect(aliceRow.classList.contains('st-hud__player--handoff')).toBe(true);
  });

  it('removes handoff motion while preserving the visible status for reduced motion', () => {
    mount();
    const css = document.getElementById('st-hud-style')?.textContent ?? '';

    expect(css).toContain('.st-hud__active-row--handoff');
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.st-hud__active-row--handoff/,
    );
  });
});
