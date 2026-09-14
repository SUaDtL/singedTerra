import type { GameClient, GameInputCapabilities } from './GameClient';

/** Back-compatible capabilities for hot-seat, network, and verified-duel clients. */
export const FULL_GAME_INPUT_CAPABILITIES: GameInputCapabilities = Object.freeze({
  angle: Object.freeze({ min: 0, max: 180 }),
  power: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  primaryAction: 'selected_weapon',
  movement: true,
  weaponCycling: true,
  weaponSelection: true,
  buying: true,
});

/** Resolve an optional mode projection without changing existing clients. */
export function inputCapabilitiesFor(
  client: Pick<GameClient, 'inputCapabilities'> | null | undefined,
): GameInputCapabilities {
  return client?.inputCapabilities ?? FULL_GAME_INPUT_CAPABILITIES;
}
