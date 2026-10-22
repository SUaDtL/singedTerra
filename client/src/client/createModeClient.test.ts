import { describe, expect, it } from 'vitest';
import { createModeClient, type ClientConstructionSetup } from './createModeClient';

const ordinary = { mode: 'hotseat', players: [{ name: 'Alice', color: '#e84d4d' }, { name: 'Bob', color: '#4d8ce8' }], playerNames: ['Alice', 'Bob'] } as const;

describe('createModeClient supported launch modes', () => {
  it('continues to construct the ordinary hot-seat client', async () => {
    const client = await createModeClient({ ...ordinary, players: [...ordinary.players], playerNames: [...ordinary.playerNames] });
    expect(client.constructor.name).toBe('HotSeatClient');
    expect(client.getState()?.phase).toBe('PLAYER_TURN');
    client.stop();
  });
  it.each(['experience', 'campaign', 'campaignRunState', 'campaignReplayPayload', 'campaignReplayRevision'])('rejects retired %s data before ordinary acquisition', async (key) => {
    for (const value of [undefined, null, {}, 'campaign']) {
      await expect(createModeClient({ ...ordinary, [key]: value } as unknown as ClientConstructionSetup))
        .rejects.toThrow('no longer available');
    }
  });
});
