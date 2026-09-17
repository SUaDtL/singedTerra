import { WEAPONS, type WeaponType } from '@shared/engine/WeaponSystem';
import type { GameClient, GameInputCapabilities } from './GameClient';

/** Stable ordinary roster retained whenever a mode does not publish a narrower profile. */
export const IMPLEMENTED_WEAPON_ROSTER: readonly WeaponType[] = Object.freeze(
  (Object.keys(WEAPONS) as WeaponType[]).filter((type) => WEAPONS[type].implemented),
);

/** Back-compatible capabilities for hot-seat, network, and verified-duel clients. */
export const FULL_GAME_INPUT_CAPABILITIES: GameInputCapabilities = Object.freeze({
  angle: Object.freeze({ min: 0, max: 180 }),
  power: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  primaryAction: 'selected_weapon',
  weaponRoster: IMPLEMENTED_WEAPON_ROSTER,
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

/** Resolve the mode roster without teaching input or presentation about mode identities. */
export function inputWeaponRosterFor(
  capabilities: GameInputCapabilities,
): readonly WeaponType[] {
  return capabilities.weaponRoster ?? IMPLEMENTED_WEAPON_ROSTER;
}

/** Defense-in-depth check shared by input, presentation, and application composition. */
export function inputAllowsWeapon(
  capabilities: GameInputCapabilities,
  weapon: WeaponType,
): boolean {
  return inputWeaponRosterFor(capabilities).includes(weapon);
}
