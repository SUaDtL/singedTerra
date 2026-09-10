import type { AccessoryType, WeaponType } from '@shared/engine/WeaponSystem';
import type { TankLoadout } from '@shared/types/TankLoadout';
import type { FirstSalvoStep } from '../firstSalvoCoach';

export type BattleConsoleHostMode = 'wide' | 'standard' | 'compact-touch';

/** Stable semantic-owner identity used for focus transfer and restoration. */
export type SemanticKey = string;

/** A store request contains exactly one domain purchase kind. */
export type StorePurchase =
  | { readonly weapon: WeaponType; readonly accessory?: never }
  | { readonly weapon?: never; readonly accessory: AccessoryType };

/** Callback-free data required to render one Armory entry. */
export interface ArmoryItemPresentation {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly purchase: StorePurchase;
  readonly price: number;
  readonly bundleSize: number;
  readonly owned: number;
  readonly ammo: number | null;
  readonly equipped: boolean;
  readonly canBuy: boolean;
  readonly canEquip: boolean;
}

export type BattleConsoleLifecycleStatus =
  | 'unmounted'
  | 'loading'
  | 'ready'
  | 'fallback'
  | 'destroyed';

/**
 * Complete presentation input for the battle console.
 *
 * This boundary intentionally contains values only: no callbacks, DOM nodes,
 * gameplay clients, engine instances, or mutable gameplay objects.
 */
export interface BattleConsolePresentationState {
  readonly commander: {
    readonly id: string | null;
    readonly name: string;
    readonly portrait: {
      readonly color: string;
      readonly loadout: TankLoadout;
    } | null;
    readonly health: number | null;
  };
  readonly mobility: {
    readonly fuel: number | null;
    readonly canMoveLeft: boolean;
    readonly canMoveRight: boolean;
  };
  readonly weapon: {
    readonly type: WeaponType;
    readonly name: string;
    readonly ammo: number | null;
    readonly canCycle: boolean;
  };
  readonly armory: {
    /** Missing only in historical snapshots; the live HUD supplies the active tank balance. */
    readonly credits?: number | null;
    readonly open: boolean;
    readonly submitting: boolean;
    readonly items: readonly ArmoryItemPresentation[];
  };
  readonly ballistics: {
    readonly angle: number;
    readonly power: number;
    /** Missing only in historical contract fixtures; live HUD state always supplies it. */
    readonly powerCap?: number;
    readonly wind: number;
  };
  readonly fireControl: {
    readonly status: string;
    readonly guidance: string;
    readonly ready: boolean;
    readonly submitting: boolean;
  };
  readonly settings: {
    readonly open: boolean;
    readonly soundEnabled: boolean;
    readonly guideEnabled: boolean;
    readonly returnFocusKey: SemanticKey | null;
  };
  readonly coach: {
    readonly step: FirstSalvoStep | null;
    readonly briefingOpen: boolean;
  };
  readonly focusOwner: SemanticKey | null;
}

/** Closed intent channel from presentation to the existing controller/domain. */
export type BattleConsoleIntent =
  | { readonly type: 'move'; readonly delta: -1 | 1 }
  | { readonly type: 'weapon-next' }
  | { readonly type: 'weapon-select'; readonly weapon: WeaponType }
  | { readonly type: 'armory-open' | 'armory-close' }
  | { readonly type: 'armory-buy'; readonly purchase: StorePurchase; readonly tankId: string }
  | { readonly type: 'armory-equip'; readonly weapon: WeaponType }
  | { readonly type: 'angle-step' | 'power-step'; readonly delta: number }
  | { readonly type: 'settings-open'; readonly origin: SemanticKey }
  | { readonly type: 'settings-close' | 'settings-toggle-sound' | 'settings-toggle-guide' }
  | { readonly type: 'fire' }
  | { readonly type: 'coach-skip' | 'coach-enter' };
