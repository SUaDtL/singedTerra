import type { WeaponType } from '../engine/WeaponSystem';

/**
 * Discriminated union of all player inputs (SPEC §4.3 / §5). Sent by clients as
 * the `player_action` socket event; applied by `GameEngine.applyAction`.
 * Input is only honored during the PLAYER_TURN phase.
 */
export type PlayerAction =
  | SetAngleAction
  | SetPowerAction
  | SelectWeaponAction
  | FireAction
  | UseShieldAction
  | BuyAction;

export type PlayerActionType =
  | 'set_angle'
  | 'set_power'
  | 'select_weapon'
  | 'fire'
  | 'use_shield'
  | 'buy';

/** Set the active tank's barrel angle (degrees, 0 = right, 90 = up). */
export interface SetAngleAction {
  type: 'set_angle';
  angle: number;
}

/** Set the active tank's firing power (0–100). */
export interface SetPowerAction {
  type: 'set_power';
  power: number;
}

/** Select the active tank's weapon. */
export interface SelectWeaponAction {
  type: 'select_weapon';
  weapon: WeaponType;
}

/** Fire the currently selected weapon at the current angle/power. */
export interface FireAction {
  type: 'fire';
}

/**
 * Activate the shield: raise the active tank's destructible force field (consumes
 * one shield round) and end the turn. Like {@link FireAction} this is a
 * turn-ending commitment — it is the FIRST non-fire action the networked replay
 * log carries (SPEC §4.5, Sprint 4 Slice 3).
 */
export interface UseShieldAction {
  type: 'use_shield';
}

/**
 * Buy one bundle of a weapon from the store (SPEC §9). Spends the active tank's
 * credits and adds the weapon's `bundleSize` to its inventory. Unlike fire /
 * use_shield this does NOT end the turn — a player may buy several times, then
 * fire. Honored only during PLAYER_TURN; rejected if credits are insufficient.
 */
export interface BuyAction {
  type: 'buy';
  weapon: WeaponType;
}
