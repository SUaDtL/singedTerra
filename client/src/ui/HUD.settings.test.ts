import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { HUD } from './HUD';

function mount(): { root: HTMLElement; modal: HTMLElement; hud: HUD } {
  const app = document.createElement('main');
  const stage = document.createElement('div');
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  stage.append(overlay);
  app.append(stage, root, modal);
  document.body.append(app);

  const hud = new HUD(root, overlay, modal, overlay);
  const state = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  }).getState();
  hud.update(state, false, true);
  return { root, modal, hud };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD battle settings', () => {
  it('moves trajectory guidance out of the live firing row and into one gear-opened dialog', () => {
    const { root, modal } = mount();

    expect(root.querySelector('[data-ui="deterministic-aim-guide"]')).toBeNull();
    const gear = root.querySelector<HTMLButtonElement>('[aria-label="Battle settings"]')!;
    expect(gear).toBeTruthy();
    gear.focus();
    gear.click();

    const settings = modal.querySelector<HTMLElement>('[data-ui="battle-settings"]')!;
    expect(settings.getAttribute('role')).toBe('dialog');
    expect(settings.getAttribute('aria-modal')).toBe('true');
    expect(settings.getAttribute('aria-label')).toBe('Battle Settings');
    expect(settings.classList.contains('st-hud__overlay--hidden')).toBe(false);
    expect(document.activeElement).toBe(settings.querySelector('[role="switch"]'));
  });

  it('projects supplied renderer and audio preference truth and dispatches each setting once', () => {
    const { root, modal, hud } = mount();
    const toggleGuide = vi.fn();
    const toggleSound = vi.fn();
    const settingsHud = hud as HUD & {
      onToggleSound(cb: () => void): void;
      setBattleSettingsState(state: { aimGuideEnabled: boolean; soundEnabled: boolean }): void;
    };
    settingsHud.onAimGuide(toggleGuide);
    settingsHud.onToggleSound(toggleSound);
    settingsHud.setBattleSettingsState({ aimGuideEnabled: false, soundEnabled: true });

    root.querySelector<HTMLButtonElement>('[aria-label="Battle settings"]')!.click();
    const settings = modal.querySelector<HTMLElement>('[data-ui="battle-settings"]')!;
    const guide = settings.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Trajectory guide"]')!;
    const sound = settings.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Sound"]')!;
    expect(guide.getAttribute('aria-checked')).toBe('false');
    expect(sound.getAttribute('aria-checked')).toBe('true');

    guide.click();
    sound.click();
    expect(toggleGuide).toHaveBeenCalledTimes(1);
    expect(toggleSound).toHaveBeenCalledTimes(1);
  });

  it('closes the Command Menu before opening Settings, traps focus, and restores the gear after Escape', () => {
    const { root, modal } = mount();
    const menu = root.querySelector<HTMLButtonElement>('.st-hud__menu')!;
    menu.click();
    modal.querySelector<HTMLButtonElement>('[data-ui="command-menu"] button[data-command="battle-settings"]')!.click();

    const commandMenu = modal.querySelector<HTMLElement>('[data-ui="command-menu"]')!;
    const settings = modal.querySelector<HTMLElement>('[data-ui="battle-settings"]')!;
    const [guide, sound, close] = [...settings.querySelectorAll<HTMLButtonElement>('button')];
    expect(commandMenu.classList.contains('st-hud__overlay--hidden')).toBe(true);
    expect(settings.classList.contains('st-hud__overlay--hidden')).toBe(false);
    expect(root.inert).toBe(true);
    expect(commandMenu.inert).toBe(true);

    close!.focus();
    settings.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(guide);
    settings.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(close);

    settings.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(settings.classList.contains('st-hud__overlay--hidden')).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('[aria-label="Battle settings"]'));
    expect(root.inert).toBe(false);
    expect(sound).toBeTruthy();
  });

  it('closes on its backdrop and returns focus to its gear trigger', () => {
    const { root, modal } = mount();
    const gear = root.querySelector<HTMLButtonElement>('[aria-label="Battle settings"]')!;
    gear.click();
    const settings = modal.querySelector<HTMLElement>('[data-ui="battle-settings"]')!;

    settings.click();

    expect(settings.classList.contains('st-hud__overlay--hidden')).toBe(true);
    expect(document.activeElement).toBe(gear);
  });
});
