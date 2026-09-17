import type { AccessoryType, WeaponType } from '@shared/engine/WeaponSystem';
import type { TankLoadout } from '@shared/types/TankLoadout';
import type { FirstSalvoStep } from '../firstSalvoCoach';
import type { CampaignResult } from '@shared/campaign/outcomes';
import type { CampaignObjectState } from '@shared/campaign/objects';
import type { CampaignWeaponId } from '@shared/campaign/combatProfiles';
import type { CampaignLoadoutDecision } from '../../campaign/loadout';

export type BattleConsoleHostMode = 'wide' | 'standard' | 'compact-touch';

/** Stable semantic-owner identity used for focus transfer and restoration. */
export type SemanticKey = string;

/** Stable command identity for one wide/standard semantic control. */
export type BattleConsoleSemanticActionId =
  | 'move-left'
  | 'move-right'
  | 'weapon-next'
  | 'armory-toggle'
  | 'angle-decrease'
  | 'angle-increase'
  | 'power-decrease'
  | 'power-increase'
  | 'settings-open'
  | 'fire';

/** Typed behavior projected onto one retained semantic topology node. */
export interface BattleConsoleSemanticControlBinding {
  readonly stableKey: SemanticKey;
  readonly actionId: BattleConsoleSemanticActionId;
  readonly disabled: boolean;
}

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

/** Detached campaign facts; geometry and interactions remain Canvas/domain owned. */
export interface CampaignBattleConsolePresentation {
  readonly encounterId?: string;
  readonly objective?: Readonly<{
    readonly kind: 'eliminate' | 'survive-or-eliminate';
    readonly protectedObjectIds: readonly string[];
    readonly humanCommitments?: number;
  }>;
  readonly warning?: Readonly<{
    readonly status: 'pending' | 'due' | 'canceled' | 'fired';
    readonly sourceObjectId: string;
    readonly dueHumanCommitment: number;
    readonly targetX: number;
  }>;
  readonly commitmentCount: number;
  readonly supplies: number;
  readonly retryable: boolean;
  readonly objects: readonly Pick<
    CampaignObjectState,
    'id' | 'kind' | 'health' | 'maxHealth' | 'alive'
  >[];
  readonly result: CampaignResult | null;
  readonly checkpoint?: null | {
    readonly encounterId: string;
    readonly story: { readonly id: string; readonly title: string; readonly body: string } | null;
    readonly selectedRouteId: string | null;
    readonly routeRequired: boolean;
    readonly decisionPending: boolean;
    readonly decisionApplied: boolean;
    readonly finalEncounter: boolean;
    readonly hull: number;
    readonly emergencyPatchAvailable?: boolean;
    readonly ammunition: readonly {
      readonly weaponId: CampaignWeaponId;
      readonly quantity: number | null;
      readonly maximum: number | null;
    }[];
  };
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
  /** Explicitly null in live ordinary play; optional only for retained historical fixtures. */
  readonly campaign?: CampaignBattleConsolePresentation | null;
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
    /** False when the active mode does not admit Armory commands. */
    readonly available?: boolean;
    /** Missing only in historical snapshots; the live HUD supplies the active tank balance. */
    readonly credits?: number | null;
    readonly open: boolean;
    readonly submitting: boolean;
    readonly items: readonly ArmoryItemPresentation[];
  };
  readonly ballistics: {
    readonly angle: number;
    readonly power: number;
    /** Whether the active commander may adjust angle and power. */
    readonly canAdjust?: boolean;
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
  | { readonly type: 'campaign-retry' }
  | { readonly type: 'campaign-route-select'; readonly routeId: string }
  | { readonly type: 'campaign-checkpoint-choice'; readonly choice: CampaignLoadoutDecision }
  | { readonly type: 'campaign-emergency-patch' }
  | { readonly type: 'campaign-continue' }
  | { readonly type: 'coach-skip' | 'coach-enter' };
