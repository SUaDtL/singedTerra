import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TankLoadout } from '@shared/types/TankLoadout';
import { Lobby, type LobbyConfig } from './Lobby';

interface LobbyInternals {
  players: Array<{
    name: string;
    color: string;
    ai?: 'easy' | 'medium' | 'hard';
    loadout: TankLoadout;
  }>;
}

function internals(lobby: Lobby): LobbyInternals {
  return lobby as unknown as LobbyInternals;
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`);
  return match;
}

describe('Lobby Quick Duel', () => {
  let root: HTMLDivElement;
  let onReady: ReturnType<typeof vi.fn<(config: LobbyConfig) => void>>;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    onReady = vi.fn();
  });

  afterEach(() => {
    root.remove();
    vi.restoreAllMocks();
  });

  it.each([
    {
      humanName: '   ',
      expectedHumanName: 'Player 1',
      humanColor: '#4d8ce8',
      cpuColor: '#e84d4d',
    },
    {
      humanName: '   ',
      expectedHumanName: 'Player 1',
      humanColor: '#e84d4d',
      cpuColor: '#4d8ce8',
    },
    {
      humanName: '  Commander SUaDtL  ',
      expectedHumanName: 'Commander SUaDtL',
      humanColor: '#4d8ce8',
      cpuColor: '#e84d4d',
    },
  ])('starts an exact two-seat CPU duel for human $humanColor from deployment choices', ({
    humanName,
    expectedHumanName,
    humanColor,
    cpuColor,
  }) => {
    const lobby = new Lobby(root, onReady);
    internals(lobby).players = [
      {
        name: humanName,
        color: humanColor,
        ai: 'hard',
        loadout: {
          treads: 'foundry',
          hull: 'foundry',
          turret: 'invalid' as never,
          barrel: 'foundry',
        },
      },
      {
        name: 'Ignored secondary row',
        color: humanColor,
        loadout: {
          treads: 'invalid' as never,
          hull: 'invalid' as never,
          turret: 'invalid' as never,
          barrel: 'invalid' as never,
        },
      },
    ];
    lobby.show();

    button(root, 'Quick Duel vs CPU').click();

    expect(onReady).toHaveBeenCalledOnce();
    const emitted = onReady.mock.calls[0]![0];
    expect(emitted).toEqual({
      mode: 'hotseat',
      players: [
        {
          name: expectedHumanName,
          color: humanColor,
          loadout: {
            treads: 'foundry',
            hull: 'foundry',
            turret: 'foundry',
            barrel: 'foundry',
          },
        },
        {
          name: 'CPU 1',
          color: cpuColor,
          ai: 'medium',
          loadout: {
            treads: 'ranger',
            hull: 'ranger',
            turret: 'ranger',
            barrel: 'ranger',
          },
        },
      ],
      playerNames: [expectedHumanName, 'CPU 1'],
    });
    expect(emitted.players[0]).not.toHaveProperty('ai');
    expect(emitted).not.toHaveProperty('settings');
  });
});
