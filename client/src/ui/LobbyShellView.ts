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
  quickOperations?: readonly { readonly id: string; readonly title: string; readonly briefing: string }[];
  onQuickDuel: (operationId: string) => void;
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

    const operations = options.quickOperations ?? [{ id: 'standard', title: 'Standard Duel', briefing: '' }];
    let selectedOperation = operations[0]!;
    const operationField = document.createElement('section');
    operationField.className = 'lobby-quick-operation';
    operationField.dataset.ui = 'quick-operation';
    operationField.setAttribute('aria-label', 'Quick operations');
    const operationKicker = document.createElement('span');
    operationKicker.className = 'lobby-quick-operation__kicker';
    operationKicker.textContent = 'QUICK OPERATIONS';
    const operationTitle = document.createElement('h2');
    operationTitle.textContent = 'Choose a battlefield condition';
    const operationCards = document.createElement('div');
    operationCards.className = 'lobby-quick-operation__cards';
    const operationBriefing = document.createElement('p');
    operationBriefing.className = 'lobby-quick-operation__briefing';
    operationBriefing.dataset.ui = 'quick-operation-briefing';
    const cardButtons: HTMLButtonElement[] = [];
    const selectOperation = (operation: typeof selectedOperation): void => {
      selectedOperation = operation;
      operationBriefing.textContent = operation.briefing;
      for (const card of cardButtons) {
        card.setAttribute('aria-pressed', String(card.dataset['operationId'] === operation.id));
      }
    };
    for (const operation of operations) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'lobby-quick-operation__card';
      card.dataset['operationId'] = operation.id;
      card.setAttribute('aria-pressed', 'false');
      const cardTitle = document.createElement('span');
      cardTitle.className = 'lobby-quick-operation__card-title';
      cardTitle.textContent = operation.title;
      const cardBriefing = document.createElement('span');
      cardBriefing.className = 'lobby-quick-operation__card-briefing';
      cardBriefing.textContent = operation.briefing;
      card.append(cardTitle, cardBriefing);
      card.addEventListener('click', () => { selectOperation(operation); });
      cardButtons.push(card);
      operationCards.append(card);
    }
    selectOperation(selectedOperation);
    operationField.append(operationKicker, operationTitle, operationCards, operationBriefing);
    chooser.append(
      operationField,
      choice(
        'Quick Duel vs CPU',
        options.rejoinAvailable
          ? 'lobby-btn lobby-deployment-choice--secondary'
          : 'lobby-btn primary',
        () => { options.onQuickDuel(selectedOperation.id); },
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
