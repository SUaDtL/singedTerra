export type LobbyPrimaryTab = 'hotseat' | 'online';

export interface LobbyShellViewOptions {
  activeTab: LobbyPrimaryTab;
  rejoinAvailable: boolean;
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
  card.append(title, options.vehiclePreview);

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

  const hotSeat = document.createElement('button');
  hotSeat.type = 'button';
  hotSeat.className = 'lobby-tab' + (options.activeTab === 'hotseat' ? ' active' : '');
  hotSeat.textContent = 'Hot Seat';
  hotSeat.addEventListener('click', () => { options.onTabChange('hotseat'); });

  const online = document.createElement('button');
  online.type = 'button';
  online.className = 'lobby-tab' + (options.activeTab === 'online' ? ' active' : '');
  online.textContent = 'Play Online';
  online.addEventListener('click', () => { options.onTabChange('online'); });

  tabs.append(hotSeat, online);
  card.append(tabs, options.content, options.controls);
  return card;
}
