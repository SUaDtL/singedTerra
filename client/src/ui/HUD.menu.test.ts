import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { HUD } from './HUD';

const mountedHuds: HUD[] = [];

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
  const hud = new HUD(root, overlay, modal, overlay);
  mountedHuds.push(hud);
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

afterEach(async () => {
  await Promise.all(mountedHuds.splice(0).map((hud) => hud.destroy()));
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD Command Menu', () => {
  it('uses one decorative menu icon with the accessible Menu name', () => {
    const { root, overlay } = mount();
    const menu = root.querySelector<HTMLButtonElement>('.st-hud__menu')!;
    const match = overlay.querySelector<HTMLButtonElement>('[data-ui="match-drawer-toggle"]')!;
    expect(menu.textContent).toBe('');
    expect(menu.getAttribute('aria-label')).toBe('Menu');
    expect(match.textContent).toBe('Match');
    expect(menu.querySelector('svg[data-icon="menu"][aria-hidden="true"]')).not.toBeNull();
    expect(match.querySelector('svg, .st-ui-glyph')).toBeNull();
  });

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

  it('retires transient rail notices when Command Menu owns the interaction', () => {
    const { root, modal, hud } = mount();
    hud.flashMessage('This battle is not accepting local input.');
    const toast = root.querySelector<HTMLElement>('.st-hud__toast')!;
    expect(toast.classList.contains('st-hud__toast--hidden')).toBe(false);

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();

    expect(modal.querySelector('[data-ui="command-menu"]')).not.toBeNull();
    expect(toast.classList.contains('st-hud__toast--hidden')).toBe(true);

    hud.flashMessage('A later transient notice');
    expect(toast.textContent).toBe('A later transient notice');
    expect(toast.classList.contains('st-hud__toast--hidden')).toBe(true);
  });

  it('keeps weapon purchasing out of the Command Menu', () => {
    const { root, modal } = mount();

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();
    expect([...modal.querySelectorAll<HTMLButtonElement>('[data-ui="command-menu"] button')]
      .some((button) => button.textContent === 'Open Store')).toBe(false);
  });

  it('routes Battle Settings from Command Menu to the successor settings dialog', async () => {
    const { root, modal } = mount();

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();
    modal.querySelector<HTMLButtonElement>('[data-ui="command-menu"] button[data-command="battle-settings"]')!.click();

    expect(modal.querySelector<HTMLElement>('[data-ui="command-menu"]')!.classList
      .contains('st-hud__overlay--hidden')).toBe(true);
    await vi.waitFor(() => {
      expect(modal.querySelector<HTMLElement>(
        '[data-battle-console-dialog="settings"][role="dialog"][aria-label="Battle Settings"]',
      ))
        .not.toBeNull();
    }, { timeout: 10_000 });
  }, 15_000);

  it('keeps Armory equip and purchase controls in the live successor console', async () => {
    const { root, modal } = mount();

    await vi.waitFor(() => {
      expect(root.querySelector<HTMLButtonElement>('[aria-label="Open Armory"]')).not.toBeNull();
    });
    root.querySelector<HTMLButtonElement>('[aria-label="Open Armory"]')!.click();
    await vi.waitFor(() => {
      expect(modal.querySelector<HTMLElement>('[role="dialog"][aria-label="Armory"]')).not.toBeNull();
    });
    const armory = modal.querySelector<HTMLElement>('[role="dialog"][aria-label="Armory"]')!;
    const missile = [...armory.querySelectorAll<HTMLElement>('[data-battle-console-armory-item]')]
      .find((item) => item.querySelector('h3')?.textContent === 'Missile')!;
    expect([...missile.querySelectorAll('button')].map((button) => button.textContent))
      .toEqual(expect.arrayContaining(['Equip', expect.stringContaining('Buy')]));
    expect(modal.querySelector('[aria-label="Store"]')).toBeNull();
  });

  it('keeps page recovery visible and disables retained commands with Armory open', async () => {
    const { root, overlay, modal, hud } = mount();
    const quit = vi.fn();
    hud.onQuit(quit);
    await vi.waitFor(() => {
      expect(root.querySelector<HTMLButtonElement>('[aria-label="Open Armory"]')).not.toBeNull();
    });
    root.querySelector<HTMLButtonElement>('[aria-label="Open Armory"]')!.click();
    await vi.waitFor(() => {
      expect(modal.querySelector<HTMLElement>('[role="dialog"][aria-label="Armory"]')).not.toBeNull();
    });

    const frame = new GameEngine({
      players: [
        { name: 'Alice', color: '#e84d4d' },
        { name: 'Bob', color: '#4d8ce8' },
      ],
      maxPlayers: 2,
      seed: 1,
    }).getState();
    frame.tanks[0]!.credits = 20_000;
    hud.update(frame, false, true, true, true);
    const armory = modal.querySelector<HTMLElement>('[role="dialog"][aria-label="Armory"]')!;
    const armoryHost = modal.querySelector<HTMLElement>('[data-battle-console-portal-host="armory"]')!;
    const buy = [...armory.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.startsWith('Buy ') && !button.disabled)!;
    const modalOwnership = [...modal.children]
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((host) => ({ host, inert: host.inert, ariaHidden: host.getAttribute('aria-hidden') }));
    hud.setQuickChatEnabled(true);
    const quickChat = overlay.querySelector<HTMLButtonElement>('.st-hud__quick-chat-toggle')!;
    buy.focus();
    hud.setPageRecovery('pending');
    hud.update(frame, false, false, true, false);

    const recovery = modal.querySelector<HTMLElement>('.st-hud__turnwatch--page-recovery')!;
    expect(recovery.textContent).toContain('Restoring game controls…');
    expect(recovery.parentElement).toBe(modal);
    expect(modal.querySelector('[role="dialog"][aria-label="Armory"]')).not.toBeNull();
    expect([...modal.querySelectorAll<HTMLButtonElement>(
      '[role="dialog"][aria-label="Armory"] button[data-battle-console-action]',
    )].every((button) => button.disabled)).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-battle-console-action="fire"]')?.disabled ?? true).toBe(true);
    expect(recovery.getAttribute('role')).toBe('status');
    expect(recovery.getAttribute('aria-live')).toBe('assertive');
    expect(recovery.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(recovery);
    recovery.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(recovery);
    recovery.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(recovery);
    expect(root.inert).toBe(true);
    expect(overlay.inert).toBe(true);
    quickChat.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(recovery);
    expect(quickChat.getAttribute('aria-expanded')).toBe('false');
    expect(armoryHost.inert).toBe(true);
    expect(armoryHost.getAttribute('aria-hidden')).toBe('true');
    expect(modal.querySelector<HTMLElement>('[data-battle-console-portal-host="settings"]')!.inert)
      .toBe(true);
    expect(modal.querySelector<HTMLElement>('[data-battle-console-portal-host="coach"]')!.inert)
      .toBe(true);
    expect(modalOwnership.every(({ host }) => host.inert && host.getAttribute('aria-hidden') === 'true'))
      .toBe(true);
    expect(buy.disabled).toBe(true);

    hud.update(frame, false, true, true, true);
    expect(buy.disabled).toBe(false);
    hud.setPageRecovery(null);
    expect(root.inert).not.toBe(true);
    expect(overlay.inert).not.toBe(true);
    expect(armoryHost.inert).not.toBe(true);
    expect(armoryHost.hasAttribute('aria-hidden')).toBe(false);
    for (const prior of modalOwnership) {
      expect(prior.host.inert).toBe(prior.inert);
      expect(prior.host.getAttribute('aria-hidden')).toBe(prior.ariaHidden);
    }
    expect(document.activeElement).toBe(buy);

    const closeArmory = armory.querySelector<HTMLButtonElement>('[aria-label="Close Armory"]')!;
    buy.focus();
    hud.setPageRecovery('pending');
    buy.disabled = true;
    hud.setPageRecovery(null);
    expect(document.activeElement).toBe(closeArmory);

    hud.setPageRecovery('pending');
    hud.setPageRecovery('failed');
    expect(recovery.textContent).toContain('Game recovery failed. Return to the lobby or reload.');
    expect(recovery.getAttribute('role')).toBe('alertdialog');
    expect(recovery.getAttribute('aria-modal')).toBe('true');
    const leave = recovery.querySelector<HTMLButtonElement>('.st-hud__turnwatch-leave')!;
    expect(document.activeElement).toBe(leave);
    leave.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(leave);
    leave.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(leave);
    leave.click();
    expect(quit).toHaveBeenCalledOnce();
    hud.setPageRecovery(null);
    expect(root.contains(recovery)).toBe(true);
    expect(recovery.classList.contains('st-hud__turnwatch--page-recovery')).toBe(false);
  });

  it('restores the exact Settings focus and host semantics after successful recovery', async () => {
    const { root, modal, hud } = mount();
    await vi.waitFor(() => expect(root.querySelector(
      '[data-semantic-key="command-console-host::settings-trigger"]',
    )).not.toBeNull());
    root.querySelector<HTMLButtonElement>(
      '[data-semantic-key="command-console-host::settings-trigger"]',
    )!.click();
    await vi.waitFor(() => expect(modal.querySelector(
      '[role="dialog"][aria-label="Battle Settings"]',
    )).not.toBeNull());
    const host = modal.querySelector<HTMLElement>('[data-battle-console-portal-host="settings"]')!;
    const sound = modal.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Sound"]')!;
    sound.focus();

    hud.setPageRecovery('pending');
    expect(host.inert).toBe(true);
    expect(host.getAttribute('aria-hidden')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal.querySelector('[role="dialog"][aria-label="Battle Settings"]')).not.toBeNull();

    hud.setPageRecovery(null);
    expect(host.inert).not.toBe(true);
    expect(host.hasAttribute('aria-hidden')).toBe(false);
    expect(document.activeElement).toBe(sound);
  });

  it('restores an ordinary retained command or falls back to the live Menu control', async () => {
    const { root, overlay, hud } = mount();
    await vi.waitFor(() => expect(root.querySelector(
      '[data-battle-console-action="fire"]',
    )).not.toBeNull());
    const fire = root.querySelector<HTMLButtonElement>('[data-battle-console-action="fire"]')!;
    const menu = root.querySelector<HTMLButtonElement>('.st-hud__menu')!;
    const match = overlay.querySelector<HTMLButtonElement>('[data-ui="match-drawer-toggle"]')!;
    fire.focus();

    hud.setPageRecovery('pending');
    hud.setPageRecovery(null);
    expect(document.activeElement).toBe(fire);

    fire.focus();
    hud.setPageRecovery('pending');
    match.style.display = 'none';
    fire.disabled = true;
    hud.setPageRecovery(null);
    expect(document.activeElement).toBe(menu);

    fire.disabled = false;
    fire.focus();
    hud.setPageRecovery('pending');
    menu.style.display = 'none';
    match.style.display = 'block';
    fire.disabled = true;
    hud.setPageRecovery(null);
    expect(document.activeElement).toBe(match);
  });

  it('temporarily yields Command Menu accessibility ownership to recovery', () => {
    const { root, modal, hud } = mount();
    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();
    const commandMenu = modal.querySelector<HTMLElement>('[data-ui="command-menu"]')!;
    const resume = commandMenu.querySelector<HTMLButtonElement>('button')!;
    expect(document.activeElement).toBe(resume);

    hud.setPageRecovery('pending');
    expect(commandMenu.inert).toBe(true);
    expect(commandMenu.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(modal.querySelector('.st-hud__turnwatch--page-recovery'));

    hud.setPageRecovery(null);
    expect(commandMenu.inert).not.toBe(true);
    expect(commandMenu.getAttribute('aria-hidden')).toBe('false');
    expect(document.activeElement).toBe(resume);
  });

  it('temporarily yields First Salvo briefing accessibility ownership to recovery', async () => {
    const { modal, hud } = mount();
    hud.setFirstSalvoStep('aim');
    await vi.waitFor(() => expect(modal.querySelector(
      '[role="dialog"][aria-label="First salvo briefing"]',
    )).not.toBeNull());
    const coachHost = modal.querySelector<HTMLElement>('[data-battle-console-portal-host="coach"]')!;
    const enter = [...coachHost.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Enter battle')!;
    enter.focus();

    hud.setPageRecovery('pending');
    expect(coachHost.inert).toBe(true);
    expect(coachHost.getAttribute('aria-hidden')).toBe('true');

    hud.setPageRecovery(null);
    expect(coachHost.inert).not.toBe(true);
    expect(coachHost.hasAttribute('aria-hidden')).toBe(false);
    expect(document.activeElement).toBe(enter);
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

  it('closes the compact Match drawer when Resume returns to live play', () => {
    const { root, overlay, modal } = mount();
    const match = overlay.querySelector<HTMLButtonElement>('[data-ui="match-drawer-toggle"]')!;
    match.click();
    expect(root.classList.contains('st-hud--match-drawer-open')).toBe(true);

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();
    expect(root.classList.contains('st-hud--match-drawer-open')).toBe(false);
    modal.querySelector<HTMLButtonElement>('[data-ui="command-menu"] button')!.click();

    expect(root.classList.contains('st-hud--match-drawer-open')).toBe(false);
    expect(match.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(match);
  });

  it('cycles Tab within Command Menu instead of escaping to the match', () => {
    const { root, modal } = mount();
    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();
    const menu = modal.querySelector<HTMLElement>('[data-ui="command-menu"]')!;
    const [resume, , returnToLobby] = [...menu.querySelectorAll<HTMLButtonElement>('button')];

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
    const victory = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')!;

    root.querySelector<HTMLButtonElement>('.st-hud__menu')!.click();

    expect(stage.inert).toBe(true);
    expect(root.inert).toBe(true);
    expect(lobby.inert).toBe(true);
    expect(victory.inert).toBe(true);

    modal.querySelector<HTMLButtonElement>('[data-ui="command-menu"] button')!.click();

    expect(stage.inert).toBe(false);
    expect(root.inert).toBe(false);
    expect(lobby.inert).toBe(false);
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
