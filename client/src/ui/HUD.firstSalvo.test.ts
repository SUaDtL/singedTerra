import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import { HUD } from './HUD';

interface MountedHud {
  root: HTMLElement;
  overlay: HTMLElement;
  modal: HTMLElement;
  hud: HUD;
  state: GameState;
}

function mount(): MountedHud {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
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
  return { root, overlay, modal, hud, state };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
});

describe('HUD First Salvo presentation seam', () => {
  it('presents a live, non-modal Aim coach and highlights only the aim instrument', () => {
    const { root, overlay, hud } = mount();

    hud.setFirstSalvoStep('aim');

    const card = overlay.querySelector<HTMLElement>('[data-ui="first-salvo-coach"]')!;
    const skip = card.querySelector<HTMLButtonElement>('button')!;
    expect(card.getAttribute('role')).toBe('region');
    expect(card.getAttribute('aria-label')).toBe('First Salvo coach');
    expect(card.querySelector('[data-first-salvo-status]')?.getAttribute('role')).toBe('status');
    expect(card.querySelector('[data-first-salvo-status]')?.getAttribute('aria-live')).toBe('polite');
    expect(card.textContent).toContain('Aim');
    expect(card.textContent).toContain('Arrow keys');
    expect(skip.textContent).toBe('Skip');
    expect(skip.tabIndex).toBe(0);
    expect(card.classList.contains('st-hud__first-salvo--hidden')).toBe(false);
    expect(root.querySelector('[data-first-salvo-target="aim"]')?.classList
      .contains('st-hud__first-salvo-target--active')).toBe(true);
    expect(root.querySelector('[data-first-salvo-target="power-and-wind"]')?.classList
      .contains('st-hud__first-salvo-target--active')).toBe(false);
    expect(root.querySelector('[data-first-salvo-target="fire"]')?.classList
      .contains('st-hud__first-salvo-target--active')).toBe(false);
  });

  it('switches the active targets and calls Skip once after idempotent frame updates', () => {
    const { root, hud } = mount();
    const skip = vi.fn();
    hud.onFirstSalvoSkip(skip);

    hud.setFirstSalvoStep('power-and-wind');
    hud.setFirstSalvoStep('power-and-wind');

    expect(document.querySelector('[data-ui="first-salvo-coach"]')?.textContent)
      .toContain('Wind Vector');
    expect(root.querySelector('[data-first-salvo-target="aim"]')?.classList
      .contains('st-hud__first-salvo-target--active')).toBe(false);
    const powerAndWindTargets = [
      ...root.querySelectorAll<HTMLElement>('[data-first-salvo-target="power-and-wind"]'),
    ];
    expect(powerAndWindTargets).toHaveLength(2);
    expect(powerAndWindTargets
      .every((target) => target.classList.contains('st-hud__first-salvo-target--active'))).toBe(true);
    root.ownerDocument.querySelector<HTMLButtonElement>('[data-ui="first-salvo-coach"] button')!.click();
    expect(skip).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-ui="first-salvo-coach"]')?.classList
      .contains('st-hud__first-salvo--hidden')).toBe(true);
  });

  it('highlights and clears both rendered touch Aim and Power controls', () => {
    const { overlay, hud } = mount();
    const touchAim = [
      overlay.querySelector<HTMLElement>('[data-command="aim-left"]')!,
      overlay.querySelector<HTMLElement>('[data-command="aim-right"]')!,
    ];
    const touchPower = [
      overlay.querySelector<HTMLElement>('[data-command="power-down"]')!,
      overlay.querySelector<HTMLElement>('[data-command="power-up"]')!,
    ];

    hud.setFirstSalvoStep('aim');
    expect(touchAim.every((target) => target.dataset['firstSalvoTarget'] === 'aim')).toBe(true);
    expect(touchAim.every((target) => target.classList.contains('st-hud__first-salvo-target--active'))).toBe(true);
    expect(touchPower.every((target) => !target.classList.contains('st-hud__first-salvo-target--active'))).toBe(true);

    hud.setFirstSalvoStep('power-and-wind');
    expect(touchPower.every((target) => target.dataset['firstSalvoTarget'] === 'power-and-wind')).toBe(true);
    expect(touchPower.every((target) => target.classList.contains('st-hud__first-salvo-target--active'))).toBe(true);
    expect(touchAim.every((target) => !target.classList.contains('st-hud__first-salvo-target--active'))).toBe(true);

    hud.setFirstSalvoStep(null);
    expect([...touchAim, ...touchPower]
      .every((target) => !target.classList.contains('st-hud__first-salvo-target--active'))).toBe(true);
  });

  it('uses primary-action copy for a live shield and exposes an accessible replay control', () => {
    const { root, overlay, modal, hud, state } = mount();
    const replay = vi.fn();
    hud.onFirstSalvoReplay(replay);
    state.tanks[0]!.selectedWeapon = 'shield';
    hud.update(state, false, true);

    hud.setFirstSalvoStep('fire');

    const card = overlay.querySelector<HTMLElement>('[data-ui="first-salvo-coach"]')!;
    expect(root.querySelector('.st-hud__primary-action')?.textContent).toContain('Activate shield');
    expect(card.textContent).toContain('Primary action');
    expect(card.textContent).toContain('Space');
    expect(card.textContent).not.toContain('shot');
    expect(card.textContent).not.toContain('Fire');
    expect(root.querySelector('[data-first-salvo-target="fire"]')?.classList
      .contains('st-hud__first-salvo-target--active')).toBe(true);

    overlay.querySelector<HTMLButtonElement>('[data-command="menu"]')!.click();
    const replayButton = [...modal.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Replay First Salvo')!;
    expect(replayButton.tabIndex).toBe(0);
    replayButton.click();
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it('clears the live coach state on dismissal so the same step announces again after replay', () => {
    const { overlay, hud } = mount();
    hud.setFirstSalvoStep('aim');
    const card = overlay.querySelector<HTMLElement>('[data-ui="first-salvo-coach"]')!;
    const status = card.querySelector<HTMLElement>('[data-first-salvo-status]')!;
    const observer = new MutationObserver(() => undefined);
    observer.observe(card, { attributes: true, childList: true, characterData: true, subtree: true });

    hud.setFirstSalvoStep('aim');
    expect(observer.takeRecords()).toHaveLength(0);

    hud.setFirstSalvoStep(null);
    expect(card.classList.contains('st-hud__first-salvo--hidden')).toBe(true);
    expect(status.textContent).toBe('');
    observer.takeRecords();

    hud.setFirstSalvoStep('aim');
    const replayRecords = observer.takeRecords();
    observer.disconnect();
    expect(status.textContent).toContain('Aim');
    expect(replayRecords).not.toHaveLength(0);
  });
});
