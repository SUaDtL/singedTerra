import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TankLoadout } from '@shared/types/TankLoadout';
import type { LobbySession } from '../client/LobbySession';
import type { NetworkPlayer } from '../client/LobbyTransport';
import { Lobby, type LobbyConfig } from './Lobby';

interface LobbyInternals {
  activeTab: 'hotseat' | 'online';
  onlineSubView: 'create' | 'join' | 'browse' | 'waiting';
  onlineBusy: boolean;
  onlineError: string;
  onlineLoadout: TankLoadout;
  players: Array<{ loadout: TankLoadout }>;
  session: LobbySession;
  waitingRoomId: string;
  waitingRoomCode: string;
  waitingPlayerId: string;
  waitingToken: string;
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

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function openLocal(lobby: Lobby, root: HTMLElement): void {
  lobby.show();
  openMultiplayer(root, 'local-battle', 'Local Battle');
}

function openMultiplayer(root: HTMLElement, itemId: 'local-battle' | 'online', action: string): void {
  root.querySelector<HTMLButtonElement>(
    '[data-command-surface="rail"][data-command-category="multiplayer"]',
  )?.click();
  root.querySelector<HTMLButtonElement>(`[data-command-item="${itemId}"]`)?.click();
  if (itemId === 'local-battle' || itemId === 'online') return;
  const choice = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find((candidate) => candidate.textContent === action);
  if (!choice) throw new Error(`Expected ${action} choice`);
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

function openGarage(root: HTMLElement, owner: string): HTMLElement {
  root.querySelector<HTMLButtonElement>(
    `.lobby-garage[data-owner="${owner}"] .lobby-garage__open`,
  )!.click();
  return root.querySelector<HTMLElement>(
    `.lobby-garage[role="dialog"][data-owner="${owner}"]`,
  )!;
}

describe('Lobby tank Garage', () => {
  let root: HTMLDivElement;
  let onReady: ReturnType<typeof vi.fn<(config: LobbyConfig) => void>>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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

  it('marks the selected crew seat and exposes its real identity facts', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);

    const playerOne = root.querySelector<HTMLInputElement>('[aria-label="Player 1 name"]')!
      .closest<HTMLElement>('.lobby-row')!;
    expect(playerOne.dataset.crewSeat).toBe('player-1');
    expect(playerOne.getAttribute('aria-current')).toBe('true');
    expect(playerOne.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Player 1');
    expect(playerOne.querySelector<HTMLSelectElement>('.lobby-control')?.selectedOptions[0]?.textContent)
      .toContain('Human');
    expect(playerOne.querySelector('.lobby-swatch.selected')?.getAttribute('title')).toBe('Red');
    expect(playerOne.querySelector('.lobby-garage__build-summary')?.textContent)
      .toBe('Foundry loadout');
    const selector = playerOne.querySelector<HTMLButtonElement>('[data-crew-seat-select]');
    expect(selector?.getAttribute('aria-pressed')).toBe('true');
    expect(selector?.querySelector('.lobby-row__appearance')?.textContent)
      .toBe('Foundry loadout');
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
      '.lobby-garage[data-owner="player-1"] .lobby-garage__build-summary',
    )!.textContent).toBe('Foundry loadout');
    expect(root.querySelector(
      '.lobby-garage[data-owner="player-2"] .lobby-garage__build-summary',
    )!.textContent).toBe('Ranger loadout');

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

    openGarage(root, 'player-1')
      .querySelector<HTMLButtonElement>('[data-preset="jackal"]')!
      .click();
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

    const preparation = root.querySelector<HTMLElement>('[data-local-preparation]')!;
    const inspection = preparation.querySelector<HTMLElement>(
      '[aria-label="Selected vehicle inspection"]',
    )!;
    const preview = inspection.querySelector<HTMLElement>('.lobby-preview--inspection')!;
    expect(preview.querySelector('.lobby-preview__label')?.textContent).toBe('Selected vehicle');
    expect(spotlight(root).querySelector<HTMLCanvasElement>('canvas')?.dataset.tankPreviewSignature)
      .toBe('spotlight|#e84d4d|foundry|foundry|foundry|foundry');
    expect(spotlightParts(root)).toEqual({
      treads: 'Tracks',
      hull: 'Armor Hull',
      turret: 'Cupola',
      barrel: 'Cannon',
    });

    let editor = openGarage(root, 'player-2');
    editor.querySelector<HTMLButtonElement>('[data-preset="ranger"]')!.click();

    expect(spotlight(root).dataset.owner).toBe('player-2');
    expect(spotlightParts(root)).toEqual({
      treads: 'Spider Legs',
      hull: 'Scout Hull',
      turret: 'Sensor Pod',
      barrel: 'Railgun',
    });

    editor = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="player-2"]',
    )!;
    editor.querySelector<HTMLButtonElement>(
      '[data-slot="turret"][data-variant="bulwark"]',
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

  it('makes Player 2 the selected inspection owner when its controller is edited', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);

    const playerTwoController = root.querySelector<HTMLSelectElement>(
      '[aria-label="Player 2 controller"]',
    )!;
    playerTwoController.value = 'easy';
    playerTwoController.dispatchEvent(new Event('change', { bubbles: true }));

    const playerOne = root.querySelector<HTMLInputElement>('[aria-label="Player 1 name"]')!
      .closest<HTMLElement>('.lobby-row')!;
    const playerTwo = root.querySelector<HTMLInputElement>('[aria-label="Player 2 name"]')!
      .closest<HTMLElement>('.lobby-row')!;
    expect(playerOne.getAttribute('aria-current')).not.toBe('true');
    expect(playerTwo.dataset.crewSeat).toBe('player-2');
    expect(playerTwo.getAttribute('aria-current')).toBe('true');
    expect(playerTwo.querySelector<HTMLSelectElement>('.lobby-control')?.selectedOptions[0]?.textContent)
      .toContain('CPU · Easy');
    expect(spotlight(root).dataset.owner).toBe('player-2');
    expect(spotlight(root).querySelector('.lobby-preview__spotlight-name')?.textContent)
      .toBe('Player 2');

    root.querySelector<HTMLButtonElement>('.lobby-start')!.click();
    expect(required(required(onReady.mock.calls[0], 'onReady call')[0], 'emitted config')).toEqual({
      mode: 'hotseat',
      players: [
        {
          name: 'Player 1',
          color: '#e84d4d',
          loadout: {
            treads: 'foundry',
            hull: 'foundry',
            turret: 'foundry',
            barrel: 'foundry',
          },
        },
        {
          name: 'Player 2',
          color: '#4d8ce8',
          loadout: {
            treads: 'ranger',
            hull: 'ranger',
            turret: 'ranger',
            barrel: 'ranger',
          },
          ai: 'easy',
        },
      ],
      playerNames: ['Player 1', 'Player 2'],
    });
  });

  it('keeps four crew seats semantically reachable with one Local Deploy action', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);

    const count = playerCountSelect(root);
    count.value = '4';
    count.dispatchEvent(new Event('change', { bubbles: true }));

    const roster = root.querySelector<HTMLElement>('.lobby-rows')!;
    const seats = [...roster.querySelectorAll<HTMLElement>('.lobby-row')];
    expect(roster.getAttribute('role')).toBe('list');
    expect(seats).toHaveLength(4);
    expect(seats.map((seat) => seat.dataset.crewSeat)).toEqual([
      'player-1',
      'player-2',
      'player-3',
      'player-4',
    ]);
    expect(seats.every((seat) => seat.getAttribute('role') === 'listitem')).toBe(true);
    expect(root.querySelector('.lobby-hotseat-scroll')?.contains(roster)).toBe(true);
    expect(root.querySelectorAll<HTMLButtonElement>('.lobby-start')).toHaveLength(1);
  });

  it('mixes four slots per hot-seat player and submits the exact loadout', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);

    const garages = root.querySelectorAll<HTMLElement>('.lobby-garage');
    expect(garages).toHaveLength(2);
    let playerTwo = openGarage(root, 'player-2');
    expect(playerTwo).not.toBeNull();
    expect(playerTwo.querySelectorAll('[data-preset]')).toHaveLength(4);
    expect(playerTwo.querySelectorAll('[data-slot-group]')).toHaveLength(4);
    expect(playerTwo.querySelectorAll('[data-slot][data-variant]')).toHaveLength(16);

    playerTwo.querySelector<HTMLButtonElement>('[data-preset="ranger"]')!.click();
    playerTwo = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="player-2"]',
    )!;
    playerTwo.querySelector<HTMLButtonElement>(
      '[data-slot="turret"][data-variant="bulwark"]',
    )!.click();

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
    openMultiplayer(root, 'online', 'Play Online');

    const garage = root.querySelector<HTMLElement>(
      '.lobby-garage[data-owner="online-player"]',
    );
    expect(garage).not.toBeNull();
    expect(garage!.querySelector('[data-preset]')).toBeNull();
    expect(garage!.querySelector('.lobby-garage__build-summary')?.textContent)
      .toBe('Foundry loadout');
    const editor = openGarage(root, 'online-player');
    expect(editor.querySelector('[data-preset="bulwark"]')).not.toBeNull();
    expect(editor.querySelector('[data-preset="jackal"]')).not.toBeNull();
    expect(spotlight(root).dataset.owner).toBe('online-player');
    expect(root.querySelectorAll('.lobby-preview canvas')).toHaveLength(2);
  });

  it('keeps one immediate editor and exact owner loadout across Online create and join', () => {
    const lobby = new Lobby(root, onReady);
    lobby.show();
    openMultiplayer(root, 'online', 'Play Online');

    let editor = openGarage(root, 'online-player');
    expect(editor.querySelectorAll('[data-slot][data-variant]')).toHaveLength(16);
    editor.querySelector<HTMLButtonElement>(
      '[data-slot="turret"][data-variant="bulwark"]',
    )!.click();
    expect(internals(lobby).onlineLoadout).toEqual({
      treads: 'foundry',
      hull: 'foundry',
      turret: 'bulwark',
      barrel: 'foundry',
    });

    editor = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="online-player"]',
    )!;
    editor.querySelector<HTMLButtonElement>('.lobby-garage__close')!.click();
    expect(document.activeElement).toBe(root.querySelector(
      '.lobby-garage[data-owner="online-player"] .lobby-garage__open',
    ));

    Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'Join with a code')!
      .click();
    editor = openGarage(root, 'online-player');
    expect(editor.querySelectorAll('[data-slot][data-variant]')).toHaveLength(16);
    expect(editor.querySelector(
      '[data-slot="turret"][data-variant="bulwark"]',
    )?.getAttribute('aria-pressed')).toBe('true');
    editor.querySelector<HTMLButtonElement>(
      '[data-slot="barrel"][data-variant="jackal"]',
    )!.click();
    expect(internals(lobby).onlineLoadout).toEqual({
      treads: 'foundry',
      hull: 'foundry',
      turret: 'bulwark',
      barrel: 'jackal',
    });

    editor = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="online-player"]',
    )!;
    editor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }));
    expect(root.querySelector('.lobby-garage[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(root.querySelector(
      '.lobby-garage[data-owner="online-player"] .lobby-garage__open',
    ));
  });

  it('marks the waiting Garage busy, blocks duplicate mutations, and recovers after rejection', async () => {
    const lobby = new Lobby(root, onReady);
    Object.assign(internals(lobby), {
      activeTab: 'online',
      onlineSubView: 'waiting',
      waitingRoomId: 'room-1',
      waitingRoomCode: 'ABCD',
      waitingPlayerId: 'seat-local',
      waitingToken: 't1',
      waitingPlayers: [{
        id: 'seat-local',
        name: 'Local Ranger',
        color: '#4d8ce8',
        ready: false,
        loadout: { treads: 'ranger', hull: 'ranger', turret: 'ranger', barrel: 'ranger' },
      }],
    });
    const pending = deferred<Awaited<ReturnType<LobbySession['updatePlayer']>>>();
    const updatePlayer = vi.spyOn(internals(lobby).session, 'updatePlayer')
      .mockReturnValueOnce(pending.promise);

    lobby.show();
    openMultiplayer(root, 'online', 'Play Online');
    let editor = openGarage(root, 'online-player');
    editor.querySelector<HTMLButtonElement>(
      '[data-slot="turret"][data-variant="bulwark"]',
    )!.click();

    expect(updatePlayer).toHaveBeenCalledOnce();
    expect(updatePlayer).toHaveBeenCalledWith({
      loadout: { treads: 'ranger', hull: 'ranger', turret: 'bulwark', barrel: 'ranger' },
    });
    expect(internals(lobby).onlineBusy).toBe(true);
    editor = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="online-player"]',
    )!;
    expect(editor.getAttribute('aria-busy')).toBe('true');
    const mutationControls = Array.from(editor.querySelectorAll<HTMLButtonElement>(
      '[data-preset], [data-slot][data-variant]',
    ));
    expect(mutationControls).toHaveLength(20);
    expect(mutationControls.every((control) => control.disabled)).toBe(true);
    expect(document.activeElement).toBe(editor.querySelector('.lobby-garage__close'));
    mutationControls.at(-1)!.click();
    expect(updatePlayer).toHaveBeenCalledOnce();

    pending.resolve({
      ok: false,
      status: 409,
      data: { error: 'Appearance update rejected' },
    });
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(internals(lobby).onlineBusy).toBe(false);
    expect(internals(lobby).onlineError).toBe('Appearance update rejected');
    editor = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="online-player"]',
    )!;
    expect(editor.hasAttribute('aria-busy')).toBe(false);
    expect(Array.from(editor.querySelectorAll<HTMLButtonElement>(
      '[data-preset], [data-slot][data-variant]',
    )).every((control) => !control.disabled)).toBe(true);
    expect(document.activeElement).toBe(editor.querySelector(
      '[data-slot="turret"][data-variant="bulwark"]',
    ));
  });

  it('blocks waiting-room rename after busy Done and restores Customize after rejection', async () => {
    const lobby = new Lobby(root, onReady);
    Object.assign(internals(lobby), {
      activeTab: 'online',
      onlineSubView: 'waiting',
      waitingRoomId: 'room-1',
      waitingRoomCode: 'ABCD',
      waitingPlayerId: 'seat-local',
      waitingToken: 't1',
      waitingPlayers: [{
        id: 'seat-local',
        name: 'Local Ranger',
        color: '#4d8ce8',
        ready: false,
        loadout: { treads: 'ranger', hull: 'ranger', turret: 'ranger', barrel: 'ranger' },
      }],
    });
    const pending = deferred<Awaited<ReturnType<LobbySession['updatePlayer']>>>();
    const updatePlayer = vi.spyOn(internals(lobby).session, 'updatePlayer')
      .mockReturnValueOnce(pending.promise);

    lobby.show();
    openMultiplayer(root, 'online', 'Play Online');
    let editor = openGarage(root, 'online-player');
    editor.querySelector<HTMLButtonElement>(
      '[data-slot="turret"][data-variant="bulwark"]',
    )!.click();
    editor = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="online-player"]',
    )!;
    editor.querySelector<HTMLButtonElement>('.lobby-garage__close')!.click();

    const name = root.querySelector<HTMLInputElement>('.lobby-name')!;
    expect(name.disabled).toBe(true);
    expect(document.activeElement).toBe(root.querySelector(
      '.lobby-garage[data-owner="online-player"]',
    ));
    name.value = 'Second request';
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    name.dispatchEvent(new Event('blur'));
    expect(updatePlayer).toHaveBeenCalledOnce();

    pending.resolve({
      ok: false,
      status: 409,
      data: { error: 'Appearance update rejected' },
    });
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(document.activeElement).toBe(root.querySelector(
      '.lobby-garage[data-owner="online-player"] .lobby-garage__open',
    ));
  });

  it('restores Customize after Escape closes a busy Garage and the update succeeds', async () => {
    const lobby = new Lobby(root, onReady);
    Object.assign(internals(lobby), {
      activeTab: 'online',
      onlineSubView: 'waiting',
      waitingRoomId: 'room-1',
      waitingRoomCode: 'ABCD',
      waitingPlayerId: 'seat-local',
      waitingToken: 't1',
      waitingPlayers: [{
        id: 'seat-local',
        name: 'Local Ranger',
        color: '#4d8ce8',
        ready: false,
        loadout: { treads: 'ranger', hull: 'ranger', turret: 'ranger', barrel: 'ranger' },
      }],
    });
    const pending = deferred<Awaited<ReturnType<LobbySession['updatePlayer']>>>();
    const updatePlayer = vi.spyOn(internals(lobby).session, 'updatePlayer')
      .mockReturnValueOnce(pending.promise);

    lobby.show();
    openMultiplayer(root, 'online', 'Play Online');
    let editor = openGarage(root, 'online-player');
    editor.querySelector<HTMLButtonElement>(
      '[data-slot="turret"][data-variant="bulwark"]',
    )!.click();
    editor = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="online-player"]',
    )!;
    editor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(root.querySelector(
      '.lobby-garage[data-owner="online-player"]',
    ));
    expect(updatePlayer).toHaveBeenCalledOnce();

    pending.resolve({ ok: true, status: 200, data: {} });
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(document.activeElement).toBe(root.querySelector(
      '.lobby-garage[data-owner="online-player"] .lobby-garage__open',
    ));
  });

  it('names every selected Jackal part by its visible vehicle role', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);

    let garage = openGarage(root, 'player-1');
    garage.querySelector<HTMLButtonElement>('[data-preset="jackal"]')!.click();
    garage = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="player-1"]',
    )!;

    expect(garage.querySelector('[data-slot="treads"][data-variant="jackal"]')!.textContent)
      .toBe('Dune Wheels');
    expect(garage.querySelector('[data-slot="hull"][data-variant="jackal"]')!.textContent)
      .toBe('Raider Hull');
    expect(garage.querySelector('[data-slot="turret"][data-variant="jackal"]')!.textContent)
      .toBe('Sensor Ring');
    expect(garage.querySelector('[data-slot="barrel"][data-variant="jackal"]')!.textContent)
      .toBe('Howitzer');
    expect(garage.querySelectorAll('[data-variant="jackal"][aria-pressed="true"]'))
      .toHaveLength(4);
  });

  it('names the editing Vehicle Bay and summarizes uniform and mixed loadouts', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);
    root.classList.add('is-compact');

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
    expect(root.querySelector('.lobby-preview')?.getAttribute('aria-hidden')).toBe('true');

    garage.querySelector<HTMLButtonElement>(
      '[data-slot="turret"][data-variant="ranger"]',
    )!.click();
    garage = root.querySelector<HTMLElement>('.lobby-garage[data-owner="player-1"]')!;
    expect(garage.querySelector('.lobby-garage__build-summary')?.textContent)
      .toContain('Mixed assembly');
    expect(garage.querySelector('.lobby-garage__build-summary')?.textContent)
      .toContain('Sensor Pod');

    garage.querySelector<HTMLButtonElement>('.lobby-garage__close')!.click();
    expect(root.querySelector('.lobby-preview')?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('opens Player 2 in an owner-bound Garage with its own live tank and preset thumbnails', () => {
    const lobby = new Lobby(root, onReady);
    openLocal(lobby, root);

    root.querySelector<HTMLButtonElement>(
      '.lobby-garage[data-owner="player-2"] .lobby-garage__open',
    )!.click();

    const editor = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="player-2"]',
    );
    expect(editor).not.toBeNull();
    expect(editor?.getAttribute('aria-label')).toBe('Vehicle Bay: Player 2');
    expect(root.querySelector('[data-crew-seat="player-1"]')?.getAttribute('aria-current'))
      .not.toBe('true');
    expect(root.querySelector('[data-crew-seat="player-2"]')?.getAttribute('aria-current'))
      .toBe('true');
    expect(spotlight(root).dataset.owner).toBe('player-2');
    expect(editor?.querySelector<HTMLCanvasElement>('.lobby-garage__tank-preview')
      ?.dataset.tankPreviewSignature).toBe(
      'spotlight|#4d8ce8|ranger|ranger|ranger|ranger',
    );

    const presetSignatures = Array.from(
      editor?.querySelectorAll<HTMLCanvasElement>('[data-preset] canvas') ?? [],
      (canvas) => canvas.dataset.tankPreviewSignature,
    );
    expect(presetSignatures).toEqual([
      'preset|#4d8ce8|foundry|foundry|foundry|foundry',
      'preset|#4d8ce8|ranger|ranger|ranger|ranger',
      'preset|#4d8ce8|bulwark|bulwark|bulwark|bulwark',
      'preset|#4d8ce8|jackal|jackal|jackal|jackal',
    ]);
  });

  it('previews the joiner color in join mode instead of the host color', () => {
    const lobby = new Lobby(root, onReady);
    lobby.show();
    openMultiplayer(root, 'online', 'Play Online');
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
    lobby.show();
    openMultiplayer(root, 'online', 'Play Online');

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
