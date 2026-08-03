import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout';

const { callFunctionMock } = vi.hoisted(() => ({
  callFunctionMock: vi.fn(),
}));

vi.mock('../lib/edgeFunctions', () => ({
  callFunction: callFunctionMock,
}));

import { LobbyTransport } from './LobbyTransport';

const joinParams = {
  code: 'ABCD',
  playerName: 'Alice',
  color: '#e84d4d',
  loadout: DEFAULT_TANK_LOADOUT,
};

describe('LobbyTransport network ruleset rollout', () => {
  beforeEach(() => {
    callFunctionMock.mockReset();
  });

  it('creates rooms and starts joins with current ruleset 2', async () => {
    callFunctionMock.mockResolvedValue({ ok: false, status: 400, data: { error: 'stop' } });
    const transport = new LobbyTransport();

    await transport.createRoom({
      playerName: 'Alice',
      color: '#e84d4d',
      loadout: DEFAULT_TANK_LOADOUT,
      bots: [],
      maxPlayers: 2,
      visibility: 'public',
      maxWind: '',
      gravity: '',
      walls: '',
      rounds: '',
      interestRate: '',
      suddenDeath: '',
      armsLevel: '',
    });
    await transport.joinRoom(joinParams);

    expect(callFunctionMock).toHaveBeenNthCalledWith(1, 'create_room', expect.objectContaining({
      rulesetVersion: 2,
    }));
    expect(callFunctionMock).toHaveBeenNthCalledWith(2, 'join_room', {
      ...joinParams,
      rulesetVersion: 2,
    });
  });

  it('carries concrete through the create-room request body', async () => {
    callFunctionMock.mockResolvedValue({ ok: false, status: 400, data: { error: 'stop' } });

    await new LobbyTransport().createRoom({
      playerName: 'Alice',
      color: '#e84d4d',
      loadout: DEFAULT_TANK_LOADOUT,
      bots: [],
      maxPlayers: 2,
      visibility: 'public',
      maxWind: '',
      gravity: '',
      walls: 'concrete',
      battlefieldWorld: 'glassstorm-expanse',
      rounds: '',
      interestRate: '',
      suddenDeath: '',
      armsLevel: '',
    });

    expect(callFunctionMock).toHaveBeenCalledWith('create_room', expect.objectContaining({
      options: expect.objectContaining({ walls: 'concrete', battlefieldWorld: 'glassstorm-expanse' }),
    }));
  });

  it('retries exactly once as v1 when the referee identifies a legacy room', async () => {
    const mismatch = {
      ok: false,
      status: 409,
      data: { error: 'ruleset_mismatch', requiredRulesetVersion: 1 },
    };
    const joined = {
      ok: true,
      status: 200,
      data: {
        roomId: 'room-v1',
        playerId: 'player-2',
        token: 'x',
        options: { maxPlayers: 2, maxWind: 10, gravity: 0.15, rulesetVersion: 1 },
      },
    };
    callFunctionMock.mockResolvedValueOnce(mismatch).mockResolvedValueOnce(joined);

    const result = await new LobbyTransport().joinRoom(joinParams);

    expect(result).toBe(joined);
    expect(callFunctionMock).toHaveBeenCalledTimes(2);
    expect(callFunctionMock).toHaveBeenNthCalledWith(1, 'join_room', {
      ...joinParams,
      rulesetVersion: 2,
    });
    expect(callFunctionMock).toHaveBeenNthCalledWith(2, 'join_room', {
      ...joinParams,
      rulesetVersion: 1,
    });
  });

  it.each([
    ['wrong status', { ok: false, status: 400, data: { error: 'ruleset_mismatch', requiredRulesetVersion: 1 } }],
    ['wrong error', { ok: false, status: 409, data: { error: 'room_full', requiredRulesetVersion: 1 } }],
    ['missing required version', { ok: false, status: 409, data: { error: 'ruleset_mismatch' } }],
    ['malformed required version', { ok: false, status: 409, data: { error: 'ruleset_mismatch', requiredRulesetVersion: '1' } }],
    ['current required version', { ok: false, status: 409, data: { error: 'ruleset_mismatch', requiredRulesetVersion: 2 } }],
  ])('does not retry on %s', async (_label, response) => {
    callFunctionMock.mockResolvedValue(response);

    const result = await new LobbyTransport().joinRoom(joinParams);

    expect(result).toBe(response);
    expect(callFunctionMock).toHaveBeenCalledTimes(1);
  });
});
