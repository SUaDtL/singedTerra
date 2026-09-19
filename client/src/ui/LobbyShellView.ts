export interface LobbyShellViewOptions {
  readonly account: HTMLElement | null;
  readonly commandCenter: HTMLElement;
}

/**
 * The pre-game shell owns only global command chrome. Category navigation and
 * every preparation workspace belong to CommandCenterShell contributions.
 */
export function buildLobbyShellView(options: LobbyShellViewOptions): HTMLElement {
  const card = document.createElement('div');
  card.className = 'lobby-card';

  const deployment = document.createElement('main');
  deployment.className = 'lobby-deployment';
  deployment.setAttribute('aria-label', 'Command preparation');

  const masthead = document.createElement('header');
  masthead.className = 'lobby-deployment__masthead lobby-command-rail';
  masthead.setAttribute('aria-label', 'Command header');

  const brand = document.createElement('h1');
  brand.className = 'lobby-command-rail__brand';
  brand.textContent = 'singedTerra';

  const commandContext = document.createElement('div');
  commandContext.className = 'lobby-command-header lobby-command-rail__context';
  commandContext.setAttribute('aria-label', 'Pre-game command preparation');
  const contextTitle = document.createElement('h2');
  contextTitle.className = 'lobby-command-header__kicker';
  contextTitle.textContent = 'COMMAND PREPARATION';
  commandContext.append(contextTitle);

  masthead.append(brand, commandContext);
  if (options.account) {
    options.account.classList.add('lobby-command-rail__dossier');
    masthead.append(options.account);
  }

  deployment.append(masthead, options.commandCenter);
  card.append(deployment);
  return card;
}
