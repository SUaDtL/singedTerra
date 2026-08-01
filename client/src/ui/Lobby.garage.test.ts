import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkPlayer } from '../client/LobbyTransport';
import { Lobby, type LobbyConfig } from './Lobby';

interface LobbyInternals {
  activeTab: 'hotseat' | 'online';
  onlineSubView: 'create' | 'join' | 'browse' | 'waiting';
  waitingPlayerId: string;
  waitingPlayers: NetworkPlayer[];
  render(): void;
}

function internals(lobby: Lobby): LobbyInternals {
  return lobby as unknown as LobbyInternals;
}

function spotlight(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>('.lobby-preview__spotlight')!;
}

function spotlightParts(root: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    Array.from(root.querySelectorAll<HTMLElement>('.lobby-preview__part')).map((part) => [
      part.dataset.slot!,
      part.querySelector('strong')!.textContent!,
    ]),
  );
}

describe('Lobby tank Garage', () => {
  let root: HTMLDivElement;
  let onReady: ReturnType<typeof vi.fn<(config: LobbyConfig) => void>>;

  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
    root = document.createElement('div');
    root.id = 'lobby';
    document.body.append(root);
    onReady = vi.fn();
  });

  afterEach(() => {
    root.remove();
    vi.restoreAllMocks();
  });

  it('spotlights Player 1 at Garage scale while retaining both roster thumbnails', () => {
    const lobby = new Lobby(root, onReady);
    lobby.show();

    const active = spotlight(root);
    expect(active.dataset.owner).toBe('player-1');
    expect(active.querySelector('.lobby-preview__spotlight-name')!.textContent).toBe('Player 1');
    const canvas = active.querySelector<HTMLCanvasElement>('canvas')!;
    expect(canvas).toMatchObject({
      width: 320,
      height: 180,
    });
    expect(canvas.dataset.tankPreviewSignature).toMatch(/^spotlight\|/);
    expect(spotlightParts(root)).toEqual({
      treads: 'Tracks',
      hull: 'Armor Hull',
      turret: 'Cupola',
      barrel: 'Cannon',
    });
    expect(root.querySelectorAll('.lobby-preview__convoy .lobby-preview__tank')).toHaveLength(2);
  });

  it('moves the spotlight to Player 2 and reflects preset and independent-slot changes', () => {
    const lobby = new Lobby(root, onReady);
    lobby.show();

    root.querySelector<HTMLButtonElement>(
      '.lobby-garage[data-owner="player-2"] [data-preset="ranger"]',
    )!.click();

    expect(spotlight(root).dataset.owner).toBe('player-2');
    expect(spotlightParts(root)).toEqual({
      treads: 'Spider Legs',
      hull: 'Scout Hull',
      turret: 'Sensor Pod',
      barrel: 'Railgun',
    });

    root.querySelector<HTMLButtonElement>(
      '.lobby-garage[data-owner="player-2"] [data-slot="turret"]',
    )!.click();
    expect(spotlightParts(root)).toEqual({
      treads: 'Spider Legs',
      hull: 'Scout Hull',
      turret: 'Bunker',
      barrel: 'Railgun',
    });
  });

  it('activates Player 2 for color and synchronizes typed identity without losing focus', () => {
    const lobby = new Lobby(root, onReady);
    lobby.show();

    const playerTwoRow = root.querySelectorAll<HTMLElement>('.lobby-row')[1]!;
    playerTwoRow.querySelector<HTMLButtonElement>('.lobby-swatch[title="Green"]')!.click();
    expect(spotlight(root).dataset.owner).toBe('player-2');
    expect(spotlight(root).style.getPropertyValue('--tank-color')).toBe('#4de87a');

    const name = root.querySelectorAll<HTMLInputElement>('.lobby-row > .lobby-name')[1]!;
    const activeBeforeTyping = spotlight(root);
    const canvasBeforeTyping = activeBeforeTyping.querySelector('canvas');
    name.focus();
    name.value = 'Dust Viper';
    name.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.activeElement).toBe(name);
    expect(spotlight(root)).toBe(activeBeforeTyping);
    expect(spotlight(root).querySelector('canvas')).toBe(canvasBeforeTyping);
    expect(spotlight(root).dataset.owner).toBe('player-2');
    expect(spotlight(root).querySelector('.lobby-preview__spotlight-name')!.textContent)
      .toBe('Dust Viper');
    expect(root.querySelector(
      '.lobby-preview__tank[data-owner="player-2"] .lobby-preview__name',
    )!.textContent).toBe('Dust Viper');
  });

  it('mixes four slots per hot-seat player and submits the exact loadout', () => {
    const lobby = new Lobby(root, onReady);
    lobby.show();

    const garages = root.querySelectorAll<HTMLElement>('.lobby-garage');
    expect(garages).toHaveLength(2);
    let playerTwo = root.querySelector<HTMLElement>(
      '.lobby-garage[data-owner="player-2"]',
    )!;
    expect(playerTwo).not.toBeNull();
    expect(playerTwo.querySelectorAll('[data-preset]')).toHaveLength(4);
    expect(playerTwo.querySelectorAll('[data-slot]')).toHaveLength(4);

    playerTwo.querySelector<HTMLButtonElement>('[data-preset="ranger"]')!.click();
    playerTwo = root.querySelector<HTMLElement>(
      '.lobby-garage[data-owner="player-2"]',
    )!;
    playerTwo.querySelector<HTMLButtonElement>('[data-slot="turret"]')!.click();

    root.querySelector<HTMLButtonElement>('.lobby-start')!.click();

    const config = onReady.mock.calls[0]![0];
    expect(config.players[0].loadout).toEqual({
      treads: 'foundry',
      hull: 'foundry',
      turret: 'foundry',
      barrel: 'foundry',
    });
    expect(config.players[1].loadout).toEqual({
      treads: 'ranger',
      hull: 'ranger',
      turret: 'bulwark',
      barrel: 'ranger',
    });
  });

  it('exposes the same Garage on the online create form', () => {
    const lobby = new Lobby(root, onReady);
    lobby.show();
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent === 'Play Online')!
      .click();

    const garage = root.querySelector<HTMLElement>(
      '.lobby-garage[data-owner="online-player"]',
    );
    expect(garage).not.toBeNull();
    expect(garage!.querySelector('[data-preset="bulwark"]')).not.toBeNull();
    expect(garage!.querySelector('[data-preset="jackal"]')).not.toBeNull();
    expect(spotlight(root).dataset.owner).toBe('online-player');
    expect(root.querySelectorAll('.lobby-preview canvas')).toHaveLength(2);
  });

  it('names and cycles the Jackal parts by their visible vehicle role', () => {
    const lobby = new Lobby(root, onReady);
    lobby.show();

    let garage = root.querySelector<HTMLElement>(
      '.lobby-garage[data-owner="player-1"]',
    )!;
    garage.querySelector<HTMLButtonElement>('[data-preset="jackal"]')!.click();
    garage = root.querySelector<HTMLElement>(
      '.lobby-garage[data-owner="player-1"]',
    )!;

    expect(garage.querySelector('[data-slot="treads"] strong')!.textContent)
      .toBe('Dune Wheels');
    expect(garage.querySelector('[data-slot="hull"] strong')!.textContent)
      .toBe('Raider Hull');
    expect(garage.querySelector('[data-slot="turret"] strong')!.textContent)
      .toBe('Sensor Ring');
    expect(garage.querySelector('[data-slot="barrel"] strong')!.textContent)
      .toBe('Howitzer');
  });

  it('previews the joiner color in join mode instead of the host color', () => {
    const lobby = new Lobby(root, onReady);
    lobby.show();
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent === 'Play Online')!
      .click();
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent === 'Join Room instead')!
      .click();

    expect(
      root.querySelector<HTMLElement>('.lobby-preview__tank')!
        .style.getPropertyValue('--tank-color'),
    ).toBe('#4d8ce8');
    expect(spotlight(root).dataset.owner).toBe('online-player');
    expect(spotlight(root).style.getPropertyValue('--tank-color')).toBe('#4d8ce8');
  });

  it('prefers the local seat in a waiting-room roster', () => {
    const lobby = new Lobby(root, onReady);
    Object.assign(internals(lobby), {
      activeTab: 'online',
      onlineSubView: 'waiting',
      waitingPlayerId: 'seat-local',
      waitingPlayers: [
        {
          id: 'seat-host',
          name: 'Host',
          color: '#e84d4d',
          ready: true,
          loadout: { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' },
        },
        {
          id: 'seat-local',
          name: 'Local Ranger',
          color: '#4d8ce8',
          ready: false,
          loadout: { treads: 'ranger', hull: 'ranger', turret: 'ranger', barrel: 'ranger' },
        },
      ],
    });
    internals(lobby).render();

    expect(spotlight(root).dataset.owner).toBe('online-player');
    expect(spotlight(root).querySelector('.lobby-preview__spotlight-name')!.textContent)
      .toBe('Local Ranger');
    expect(spotlightParts(root)).toEqual({
      treads: 'Spider Legs',
      hull: 'Scout Hull',
      turret: 'Sensor Pod',
      barrel: 'Railgun',
    });
    expect(root.querySelectorAll('.lobby-preview__convoy .lobby-preview__tank')).toHaveLength(2);
  });
});
