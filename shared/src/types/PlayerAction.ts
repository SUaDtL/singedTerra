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
  | FireAction;

export type PlayerActionType =
  | 'set_angle'
  | 'set_power'
  | 'select_weapon'
  | 'fire';

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
