import { describe, expect, it } from 'vitest';
import { buildLobbyShellView } from './LobbyShellView';

describe('buildLobbyShellView', () => {
  it('assembles the brand, command context, dossier, and command center as one shell', () => {
    const account = document.createElement('section');
    account.className = 'account-panel';
    account.textContent = 'Commander Mara';
    const commandCenter = document.createElement('section');
    commandCenter.className = 'command-center';
    commandCenter.textContent = 'Campaigns';

    const root = buildLobbyShellView({ account, commandCenter });
    const deployment = root.querySelector<HTMLElement>('.lobby-deployment')!;
    const masthead = root.querySelector<HTMLElement>('.lobby-command-rail')!;

    expect(deployment.getAttribute('aria-label')).toBe('Command preparation');
    expect(masthead.getAttribute('aria-label')).toBe('Command header');
    expect([...masthead.children]).toEqual([
      root.querySelector('.lobby-command-rail__brand'),
      root.querySelector('.lobby-command-rail__context'),
      account,
    ]);
    expect(account.classList.contains('lobby-command-rail__dossier')).toBe(true);
    expect(deployment.lastElementChild).toBe(commandCenter);
    expect(root.querySelectorAll('.command-center')).toHaveLength(1);
  });

  it('keeps the two required header bays anchored when no account is available', () => {
    const commandCenter = document.createElement('section');
    const root = buildLobbyShellView({ account: null, commandCenter });
    const masthead = root.querySelector<HTMLElement>('.lobby-command-rail')!;

    expect(masthead.children).toHaveLength(2);
    expect(root.querySelector('.lobby-command-rail__brand')?.textContent).toBe('singedTerra');
    expect(root.querySelector('.lobby-command-header__kicker')?.textContent)
      .toBe('COMMAND PREPARATION');
    expect(root.querySelector('.account-panel')).toBeNull();
  });
});
