import { GameEngine } from '@shared/engine/GameEngine';
import type { GameClient } from './GameClient';
import { HotSeatClient } from './HotSeatClient';
import { buildClientEngineOptions } from './gameEngineOptions';
import type { HotSeatModeSetup, ModeSetup } from './modeConfig';

/** Compatibility input for the existing exported main factory seam. */
export type ClientConstructionSetup = HotSeatModeSetup | (ModeSetup & {
  mode: 'network';
  roomId: string;
  playerId: string;
});

/** Construct and initialize the ordinary client selected by a normalized mode setup. */
export async function createModeClient(setup: ClientConstructionSetup): Promise<GameClient> {
  if (setup.mode === 'network') {
    const { NetworkClient } = await import('./NetworkClient');
    const { supabase } = await import('../lib/supabase');
    const gameOptions = buildClientEngineOptions(setup);
    const client = new NetworkClient(
      supabase,
      setup.roomId,
      setup.playerId,
      gameOptions,
      setup.token,
      setup.settings?.commandProtocolVersion,
    );
    try {
      await client.initialize();
    } catch (error) {
      client.stop();
      throw error;
    }
    return client;
  }

  return new HotSeatClient(new GameEngine(buildClientEngineOptions(setup)));
}
