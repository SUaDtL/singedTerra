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
    const generateQuickDuelSeed = vi.fn(() => 0xfedcba98);
    const lobby = new Lobby(root, onReady, undefined, undefined, generateQuickDuelSeed);
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
      settings: { seed: 0xfedcba98, rounds: 3 },
      quickOperation: {
        id: 'standard',
        title: 'Standard Duel',
        briefing: 'A balanced three-round duel.',
      },
    });
    expect(generateQuickDuelSeed).toHaveBeenCalledOnce();
    expect(emitted.players[0]).not.toHaveProperty('ai');
  });

  it("carries Crosswind's real wrap-wall rule through the existing local launch config", () => {
    const lobby = new Lobby(root, onReady, undefined, undefined, () => 0xfedcba98);
    lobby.show();

    root.querySelector<HTMLButtonElement>('[data-operation-id="crosswind-range"]')!.click();
    button(root, 'Quick Duel vs CPU').click();

    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady.mock.calls[0]![0]).toMatchObject({
      mode: 'hotseat',
      settings: { seed: 0xfedcba98, rounds: 3, walls: 'wrap' },
      quickOperation: {
        id: 'crosswind-range',
        title: 'Crosswind Range',
        briefing: 'Wraparound walls turn shifting wind into a ranging test.',
      },
    });
  });

  it('requests exactly one fresh unsigned seed for each redeployment in one Lobby', () => {
    const supplied = [0, 0xffff_ffff];
    const generateQuickDuelSeed = vi.fn(() => supplied.shift()!);
    const lobby = new Lobby(root, onReady, undefined, undefined, generateQuickDuelSeed);
    lobby.show();

    button(root, 'Quick Duel vs CPU').click();
    button(root, 'Quick Duel vs CPU').click();

    expect(generateQuickDuelSeed).toHaveBeenCalledTimes(2);
    expect(onReady.mock.calls.map(([config]) => config.settings?.seed))
      .toEqual([0, 0xffff_ffff]);
    for (const [config] of onReady.mock.calls) {
      expect(config.settings).toEqual({ seed: expect.any(Number), rounds: 3 });
      expect(config.settings!.seed).toBeGreaterThanOrEqual(0);
      expect(config.settings!.seed).toBeLessThanOrEqual(0xffff_ffff);
    }
  });

  it('applies the chosen operation only to the ordinary Quick Duel settings', () => {
    const lobby = new Lobby(root, onReady, undefined, undefined, () => 42);
    lobby.show();

    const operation = root.querySelector<HTMLButtonElement>('[data-operation-id="caldera-run"]');
    expect(operation).not.toBeNull();
    operation!.click();
    button(root, 'Quick Duel vs CPU').click();

    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'hotseat',
      settings: { seed: 42, rounds: 3, hazards: 'lava', battlefieldWorld: 'obsidian-caldera' },
    }));
  });
});
