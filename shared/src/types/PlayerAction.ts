import type { WeaponType, AccessoryType } from '../engine/WeaponSystem';

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
  | BuyAction
  | NextRoundAction;

export type PlayerActionType =
  | 'set_angle'
  | 'set_power'
  | 'select_weapon'
  | 'fire'
  | 'use_shield'
  | 'buy'
  | 'next_round';

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
 * fire. Honored during PLAYER_TURN (active tank) and during the ROUND_OVER
 * between-rounds shop; rejected if credits are insufficient.
 */
export interface BuyAction {
  type: 'buy';
  /**
   * The weapon bundle to buy. Present for a WEAPON purchase; omitted when buying an
   * {@link accessory} instead. Exactly one of `weapon`/`accessory` is set.
   */
  weapon?: WeaponType;
  /**
   * A non-weapon accessory to buy (SE-parity — currently `'battery'`, which raises the
   * tank's powerCap). Present for an ACCESSORY purchase; omitted for a weapon buy. The
   * field is optional + additive, so existing weapon-only buy rows are unchanged.
   */
  accessory?: AccessoryType;
  /**
   * Which tank is buying. Omitted during PLAYER_TURN (the active tank buys, as
   * before). During the ROUND_OVER between-rounds shop ALL players may buy, so the
   * tank is named explicitly. A mismatch with the active tank during PLAYER_TURN is
   * ignored (the active tank still buys) to preserve the prior contract.
   */
  tankId?: string;
}

/**
 * Advance from the ROUND_OVER between-rounds shop into the next round's combat
 * (V1 match structure). Valid only during ROUND_OVER; flips the staged next round
 * (terrain + reset tanks already prepared at round resolution) to PLAYER_TURN.
 * In networked play this is a logged action so every client advances in lockstep.
 */
export interface NextRoundAction {
  type: 'next_round';
}
