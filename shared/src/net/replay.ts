import type { GameEngine } from '../engine/GameEngine';
import type { WeaponType } from '../engine/WeaponSystem';

/**
 * The networked action log contract — the SHARED source of truth.
 *
 * In networked play the canonical game is `seed + an ordered action log`. Each row
 * in `room_actions` carries one of these {@link NetworkAction} values, and every
 * client replays them through its OWN `GameEngine` via {@link replayNetworkAction}.
 * Because the translation from a logged action to engine `PlayerAction`s lives HERE
 * (in `shared/`, which depends on nothing), the live client and any determinism
 * harness exercise the EXACT same replay path — they can never drift.
 *
 * Only turn-ending and turn-neutral COMMITTED actions are logged:
 *  - `fire`       — turn-ending; carries the committed aim (angle/power/weapon).
 *  - `use_shield` — turn-ending; no payload (raises the active tank's field).
 *  - `buy`        — turn-neutral; a store purchase. `tankId` is set ONLY for the
 *                   ROUND_OVER between-rounds shop (any tank may buy); during a
 *                   normal turn it is omitted (the engine buys for the active tank).
 *  - `next_round` — leave the ROUND_OVER shop and begin the next round's combat.
 *
 * Aim-only actions (set_angle/set_power/select_weapon) are NEVER logged — they are
 * local UI state, folded into the `fire` row's committed aim.
 */
export interface NetworkFireAction {
  type:   'fire';
  angle:  number;   // degrees, 0 = right, 90 = up
  power:  number;   // 0–100
  weapon: string;   // WeaponType value
}
export interface NetworkShieldAction {
  type: 'use_shield';
}
export interface NetworkBuyAction {
  type:    'buy';
  weapon:  string;
  /** The tank buying. Present only in the ROUND_OVER shop (per-tank shopping); omitted during a normal turn. */
  tankId?: string;
}
export interface NetworkNextRoundAction {
  type: 'next_round';
}
export type NetworkAction =
  | NetworkFireAction
  | NetworkShieldAction
  | NetworkBuyAction
  | NetworkNextRoundAction;

/**
 * Apply one logged {@link NetworkAction} to an engine. A `fire` is synthesized as
 * the three aim setup actions then the fire (so the committed aim replays exactly);
 * the others map one-to-one onto a `PlayerAction`. Pure w.r.t. the engine it is
 * given — used both for the live engine and a throwaway one when computing the next
 * active seat. This is the ONLY sanctioned log→engine translation; keep it free of
 * wall-clock and randomness so every client lands on the identical state.
 */
export function replayNetworkAction(engine: GameEngine, action: NetworkAction): void {
  switch (action.type) {
    case 'use_shield':
      engine.applyAction({ type: 'use_shield' });
      return;
    case 'next_round':
      engine.applyAction({ type: 'next_round' });
      return;
    case 'buy':
      engine.applyAction({
        type:   'buy',
        weapon: action.weapon as WeaponType,
        ...(action.tankId ? { tankId: action.tankId } : {}),
      });
      return;
    case 'fire':
      engine.applyAction({ type: 'set_angle',     angle:  action.angle });
      engine.applyAction({ type: 'set_power',     power:  action.power });
      engine.applyAction({ type: 'select_weapon', weapon: action.weapon as WeaponType });
      engine.applyAction({ type: 'fire' });
      return;
  }
}
