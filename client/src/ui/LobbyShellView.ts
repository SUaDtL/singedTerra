export type LobbyPrimaryTab = 'hotseat' | 'online';

const MODE_PANEL_ID = 'lobby-mode-panel';

const MODE_CONTEXT: Record<LobbyPrimaryTab, { title: string; description: string }> = {
  hotseat: {
    title: 'Hot Seat',
    description: 'Set your crew, then start a shared-screen match.',
  },
  online: {
    title: 'Play Online',
    description: 'Create a room, join by code, or browse public games.',
  },
};

export interface LobbyShellViewOptions {
  activeTab: LobbyPrimaryTab;
  surface: 'chooser' | 'preparation';
  showBack: boolean;
  rejoinAvailable: boolean;
  account: HTMLElement | null;
  vehiclePreview: HTMLElement;
  content: HTMLElement;
  controls: HTMLElement;
  onTabChange: (tab: LobbyPrimaryTab) => void;
  onQuickDuel: () => void;
  onRejoin: () => void;
  onBack: () => void;
}

export function buildLobbyOnlineView(content: HTMLElement): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.append(content);
  return wrapper;
}

export function buildLobbyShellView(options: LobbyShellViewOptions): HTMLElement {
  const card = document.createElement('div');
  card.className = 'lobby-card';

  const deployment = document.createElement('main');
  deployment.className = 'lobby-deployment';
  deployment.setAttribute('aria-label', 'Deployment preparation');

  const title = document.createElement('h1');
  title.textContent = 'singedTerra';
  const masthead = document.createElement('header');
  masthead.className = 'lobby-deployment__masthead';
  const commandHeader = document.createElement('div');
  commandHeader.className = 'lobby-command-header';
  commandHeader.setAttribute('aria-label', 'Pre-game command preparation');
  const commandKicker = document.createElement('h2');
  commandKicker.className = 'lobby-command-header__kicker';
  commandKicker.textContent = 'COMMAND PREPARATION';
  commandHeader.append(commandKicker);
  masthead.append(title, commandHeader);
  if (options.account) masthead.append(options.account);

  if (options.rejoinAvailable) {
    const banner = document.createElement('div');
    banner.className = 'lobby-rejoin-banner';

    const text = document.createElement('span');
    text.className = 'lobby-rejoin-text';
    text.textContent = 'You have a game in progress.';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lobby-btn primary';
    button.textContent = 'Rejoin your game';
    button.addEventListener('click', () => { options.onRejoin(); });
    banner.append(text, button);
    masthead.append(banner);
  }

  if (options.surface === 'chooser') {
    const chooser = document.createElement('nav');
    chooser.className = 'lobby-deployment-chooser';
    chooser.setAttribute('aria-label', 'Choose deployment');

    const choice = (
      label: string,
      className: string,
      onClick: () => void,
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = label;
      button.addEventListener('click', onClick);
      return button;
    };

    chooser.append(
      choice(
        'Quick Duel vs CPU',
        options.rejoinAvailable
          ? 'lobby-btn lobby-deployment-choice--secondary'
          : 'lobby-btn primary',
        () => { options.onQuickDuel(); },
      ),
      choice(
        'Local Battle',
        'lobby-btn lobby-deployment-choice--secondary',
        () => { options.onTabChange('hotseat'); },
      ),
      choice(
        'Play Online',
        'lobby-btn lobby-deployment-choice--secondary',
        () => { options.onTabChange('online'); },
      ),
    );
    deployment.append(masthead, chooser);
    card.append(deployment);
    return card;
  }

  const back = options.showBack ? document.createElement('button') : null;
  if (back) {
    back.type = 'button';
    back.className = 'lobby-btn lobby-deployment__back';
    back.textContent = 'Back to deployment choices';
    back.addEventListener('click', () => { options.onBack(); });
  }

  const context = document.createElement('section');
  context.className = 'lobby-mode-context lobby-deployment__mission-brief';
  const contextTitle = document.createElement('h2');
  contextTitle.textContent = MODE_CONTEXT[options.activeTab].title;
  const contextDescription = document.createElement('p');
  contextDescription.textContent = MODE_CONTEXT[options.activeTab].description;
  context.append(contextTitle, contextDescription);
  const panel = document.createElement('section');
  panel.className = 'lobby-mode-panel';
  panel.id = MODE_PANEL_ID;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-label', `${MODE_CONTEXT[options.activeTab].title} preparation`);
  panel.append(options.content);
  deployment.append(masthead);
  if (back) deployment.append(back);
  deployment.append(context, panel, options.vehiclePreview, options.controls);
  card.append(deployment);
  return card;
}
