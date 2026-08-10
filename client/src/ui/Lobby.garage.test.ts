import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TankLoadout } from '@shared/types/TankLoadout';
import type { NetworkPlayer } from '../client/LobbyTransport';
import { Lobby, type LobbyConfig } from './Lobby';

interface LobbyInternals {
  surface: 'chooser' | 'preparation';
  activeTab: 'hotseat' | 'online';
  onlineSubView: 'create' | 'join' | 'browse' | 'waiting';
  players: Array<{ loadout: TankLoadout }>;
  waitingPlayerId: string;
  waitingPlayers: NetworkPlayer[];
  render(): void;
}

function internals(lobby: Lobby): LobbyInternals {
  return lobby as unknown as LobbyInternals;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function openLocal(lobby: Lobby, root: HTMLElement): void {
  lobby.show();
  const choice = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find((candidate) => candidate.textContent === 'Local Battle');
  if (!choice) throw new Error('Expected Local Battle choice');
  choice.click();
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

function playerPreviewSignature(root: HTMLElement, player: number): string {
  return root.querySelector<HTMLCanvasElement>(
    `.lobby-preview__tank[data-owner="player-${player}"] canvas`,
  )!.dataset.tankPreviewSignature!;
}

function playerCountSelect(root: HTMLElement): HTMLSelectElement {
  const field = Array.from(root.querySelectorAll<HTMLElement>('.lobby-field'))
    .find((candidate) => candidate.querySelector('label')?.textContent === 'Players');
  return field!.querySelector('select')!;
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
    openLocal(lobby, root);

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

  it('starts fresh hot-seat opponents with distinct authored presets', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);

    expect(playerPreviewSignature(root, 1)).toContain(
      '|foundry|foundry|foundry|foundry',
    );
    expect(playerPreviewSignature(root, 2)).toContain(
      '|ranger|ranger|ranger|ranger',
    );
    expect(root.querySelector(
      '.lobby-garage[data-owner="player-1"] [data-preset="foundry"]',
    )!.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector(
      '.lobby-garage[data-owner="player-2"] [data-preset="ranger"]',
    )!.getAttribute('aria-pressed')).toBe('true');

    root.querySelector<HTMLButtonElement>('.lobby-start')!.click();
    const config = required(required(onReady.mock.calls[0], 'onReady call')[0], 'emitted config');
    expect(required(config.players[0], 'first emitted player').loadout).toEqual({
      treads: 'foundry',
      hull: 'foundry',
      turret: 'foundry',
      barrel: 'foundry',
    });
    expect(required(config.players[1], 'second emitted player').loadout).toEqual({
      treads: 'ranger',
      hull: 'ranger',
      turret: 'ranger',
      barrel: 'ranger',
    });
  });

  it('gives grown seats stable presets without resetting existing Garage edits', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);

    root.querySelector<HTMLButtonElement>(
      '.lobby-garage[data-owner="player-1"] [data-preset="jackal"]',
    )!.click();
    const count = playerCountSelect(root);
    count.value = '4';
    count.dispatchEvent(new Event('change', { bubbles: true }));

    expect(playerPreviewSignature(root, 1)).toContain(
      '|jackal|jackal|jackal|jackal',
    );
    expect(playerPreviewSignature(root, 2)).toContain(
      '|ranger|ranger|ranger|ranger',
    );
    expect(playerPreviewSignature(root, 3)).toContain(
      '|bulwark|bulwark|bulwark|bulwark',
    );
    expect(playerPreviewSignature(root, 4)).toContain(
      '|jackal|jackal|jackal|jackal',
    );

    const rows = internals(lobby).players;
    expect(rows[0]!.loadout).not.toBe(rows[1]!.loadout);
    rows[0]!.loadout.turret = 'bulwark';
    expect(rows[1]!.loadout.turret).toBe('ranger');
    expect(rows[3]!.loadout.turret).toBe('jackal');
  });

  it('moves the spotlight to Player 2 and reflects preset and independent-slot changes', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);

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
    openLocal(lobby, root);

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
    openLocal(lobby, root);

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

    const config = required(required(onReady.mock.calls[0], 'onReady call')[0], 'emitted config');
    expect(required(config.players[0], 'first emitted player').loadout).toEqual({
      treads: 'foundry',
      hull: 'foundry',
      turret: 'foundry',
      barrel: 'foundry',
    });
    expect(required(config.players[1], 'second emitted player').loadout).toEqual({
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
    openLocal(lobby, root);

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

  it('names the editing Vehicle Bay and summarizes uniform and mixed loadouts', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);

    root.querySelector<HTMLButtonElement>(
      '.lobby-garage[data-owner="player-1"] .lobby-garage__open',
    )!.click();

    let garage = root.querySelector<HTMLElement>('.lobby-garage[data-owner="player-1"]')!;
    expect(garage.getAttribute('role')).toBe('dialog');
    expect(garage.getAttribute('aria-label')).toBe('Vehicle Bay: Player 1');
    expect(garage.querySelector('.lobby-garage__editor-header')?.textContent)
      .toBe('Vehicle Bay: Player 1');
    expect(garage.querySelector('.lobby-garage__build-summary')?.textContent)
      .toBe('Foundry loadout');
    expect(garage.querySelector('.lobby-garage__preset-group')?.getAttribute('aria-label'))
      .toBe('Preset loadouts');
    expect(garage.querySelector('.lobby-garage__component-group')?.getAttribute('aria-label'))
      .toBe('Component bay');

    garage.querySelector<HTMLButtonElement>('[data-slot="turret"]')!.click();
    garage = root.querySelector<HTMLElement>('.lobby-garage[data-owner="player-1"]')!;
    expect(garage.querySelector('.lobby-garage__build-summary')?.textContent)
      .toContain('Mixed assembly');
    expect(garage.querySelector('.lobby-garage__build-summary')?.textContent)
      .toContain('Sensor Pod');
  });

  it('previews the joiner color in join mode instead of the host color', () => {
    const lobby = new Lobby(root, onReady);
    lobby.show();
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent === 'Play Online')!
      .click();
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent === 'Join with a code')!
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
      surface: 'preparation',
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
