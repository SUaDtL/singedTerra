export type LobbyPrimaryTab = 'hotseat' | 'online';

const TAB_IDS: Record<LobbyPrimaryTab, string> = {
  hotseat: 'lobby-mode-hotseat',
  online: 'lobby-mode-online',
};

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
  rejoinAvailable: boolean;
  account: HTMLElement | null;
  vehiclePreview: HTMLElement;
  content: HTMLElement;
  controls: HTMLElement;
  onTabChange: (tab: LobbyPrimaryTab) => void;
  onRejoin: () => void;
}

export function buildLobbyOnlineView(content: HTMLElement): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.append(content);
  return wrapper;
}

export function buildLobbyShellView(options: LobbyShellViewOptions): HTMLElement {
  const card = document.createElement('div');
  card.className = 'lobby-card';

  const title = document.createElement('h1');
  title.textContent = 'singedTerra';
  card.append(title);
  if (options.account) card.append(options.account);
  card.append(options.vehiclePreview);

  if (options.rejoinAvailable) {
    const banner = document.createElement('div');
    banner.className = 'lobby-rejoin-banner';

    const text = document.createElement('span');
    text.className = 'lobby-rejoin-text';
    text.textContent = 'You have a game in progress.';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lobby-btn';
    button.textContent = 'Rejoin your game';
    button.addEventListener('click', () => { options.onRejoin(); });
    banner.append(text, button);
    card.append(banner);
  }

  const tabs = document.createElement('div');
  tabs.className = 'lobby-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Choose play mode');

  const selectTab = (tab: LobbyPrimaryTab): void => {
    options.onTabChange(tab);
    document.getElementById(TAB_IDS[tab])?.focus();
  };

  const handleTabKey = (event: KeyboardEvent, current: LobbyPrimaryTab): void => {
    const target = event.key === 'Home'
      ? 'hotseat'
      : event.key === 'End'
        ? 'online'
        : event.key === 'ArrowLeft' || event.key === 'ArrowRight'
          ? current === 'hotseat' ? 'online' : 'hotseat'
          : null;
    if (target === null) return;
    event.preventDefault();
    selectTab(target);
  };

  const hotSeat = document.createElement('button');
  hotSeat.type = 'button';
  hotSeat.className = 'lobby-tab' + (options.activeTab === 'hotseat' ? ' active' : '');
  hotSeat.id = TAB_IDS.hotseat;
  hotSeat.setAttribute('role', 'tab');
  hotSeat.setAttribute('aria-selected', String(options.activeTab === 'hotseat'));
  hotSeat.setAttribute('aria-controls', MODE_PANEL_ID);
  hotSeat.tabIndex = options.activeTab === 'hotseat' ? 0 : -1;
  hotSeat.textContent = 'Hot Seat';
  hotSeat.addEventListener('click', () => { selectTab('hotseat'); });
  hotSeat.addEventListener('keydown', (event) => { handleTabKey(event, 'hotseat'); });

  const online = document.createElement('button');
  online.type = 'button';
  online.className = 'lobby-tab' + (options.activeTab === 'online' ? ' active' : '');
  online.id = TAB_IDS.online;
  online.setAttribute('role', 'tab');
  online.setAttribute('aria-selected', String(options.activeTab === 'online'));
  online.setAttribute('aria-controls', MODE_PANEL_ID);
  online.tabIndex = options.activeTab === 'online' ? 0 : -1;
  online.textContent = 'Play Online';
  online.addEventListener('click', () => { selectTab('online'); });
  online.addEventListener('keydown', (event) => { handleTabKey(event, 'online'); });

  tabs.append(hotSeat, online);
  const context = document.createElement('section');
  context.className = 'lobby-mode-context';
  const contextTitle = document.createElement('h2');
  contextTitle.textContent = MODE_CONTEXT[options.activeTab].title;
  const contextDescription = document.createElement('p');
  contextDescription.textContent = MODE_CONTEXT[options.activeTab].description;
  context.append(contextTitle, contextDescription);
  const panel = document.createElement('section');
  panel.className = 'lobby-mode-panel';
  panel.id = MODE_PANEL_ID;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', TAB_IDS[options.activeTab]);
  panel.append(context, options.content);
  card.append(tabs, panel, options.controls);
  return card;
}
