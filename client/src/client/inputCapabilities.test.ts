import { describe, expect, it } from 'vitest';
import type { GameClient, GameInputCapabilities } from './GameClient';
import {
  FULL_GAME_INPUT_CAPABILITIES,
  inputCapabilitiesFor,
} from './inputCapabilities';

describe('inputCapabilitiesFor', () => {
  it('preserves every ordinary control when a client omits a mode projection', () => {
    expect(inputCapabilitiesFor(null)).toBe(FULL_GAME_INPUT_CAPABILITIES);
    expect(inputCapabilitiesFor({} as GameClient)).toEqual({
      angle: { min: 0, max: 180 },
      power: { min: 0, max: Number.POSITIVE_INFINITY },
      primaryAction: 'selected_weapon',
      movement: true,
      weaponCycling: true,
      weaponSelection: true,
      buying: true,
    });
  });

  it('returns an explicit constrained-mode projection unchanged', () => {
    const narrowed: GameInputCapabilities = {
      angle: { min: 10, max: 170 },
      power: { min: 1, max: 100 },
      primaryAction: 'fire',
      movement: false,
      weaponCycling: false,
      weaponSelection: false,
      buying: false,
    };

    expect(inputCapabilitiesFor({ inputCapabilities: narrowed })).toBe(narrowed);
  });
});
