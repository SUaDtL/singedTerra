import type {
  BattleConsoleIntent,
  BattleConsolePresentationState,
  CampaignBattleConsolePresentation,
} from './types';
import { DEFAULT_POWER_CAP } from '@shared/engine/Tank';

const fieldKeys = [
  'armory.available',
  'armory.credits',
  'campaign.commitmentCount',
  'campaign.encounterId',
  'campaign.objective',
  'campaign.warning',
  'campaign.checkpoint',
  'campaign.checkpoint.ammunition',
  'campaign.checkpoint.decisionApplied',
  'campaign.checkpoint.decisionPending',
  'campaign.checkpoint.encounterId',
  'campaign.checkpoint.finalEncounter',
  'campaign.checkpoint.hull',
  'campaign.checkpoint.emergencyPatchAvailable',
  'campaign.checkpoint.routeRequired',
  'campaign.checkpoint.selectedRouteId',
  'campaign.checkpoint.story',
  'campaign.objects',
  'campaign.result',
  'campaign.retryable',
  'campaign.supplies',
  'armory.items',
  'armory.open',
  'armory.submitting',
  'ballistics.angle',
  'ballistics.canAdjust',
  'ballistics.power',
  'ballistics.powerCap',
  'ballistics.wind',
  'coach.briefingOpen',
  'coach.step',
  'commander.health',
  'commander.id',
  'commander.name',
  'commander.portrait',
  'fireControl.guidance',
  'fireControl.ready',
  'fireControl.status',
  'fireControl.submitting',
  'focusOwner',
  'mobility.canMoveLeft',
  'mobility.canMoveRight',
  'mobility.fuel',
  'settings.guideEnabled',
  'settings.open',
  'settings.returnFocusKey',
  'settings.soundEnabled',
  'weapon.ammo',
  'weapon.canCycle',
  'weapon.name',
  'weapon.type',
] as const;

const intentDiscriminants = [
  'angle-step',
  'armory-buy',
  'armory-close',
  'armory-equip',
  'armory-open',
  'coach-enter',
  'coach-skip',
  'campaign-retry',
  'campaign-route-select',
  'campaign-checkpoint-choice',
  'campaign-emergency-patch',
  'campaign-continue',
  'fire',
  'move',
  'power-step',
  'settings-close',
  'settings-open',
  'settings-toggle-guide',
  'settings-toggle-sound',
  'weapon-next',
  'weapon-select',
] as const satisfies readonly BattleConsoleIntent['type'][];

/** Runtime-visible lock used by the immutable AC-19 contract test. */
export const presentationStateContract = Object.freeze({
  fieldKeys,
  intentDiscriminants,
  forbiddenReferenceKinds: Object.freeze([
    'callback',
    'dom',
    'client',
    'engine',
    'mutable-gameplay-object',
  ] as const),
});

/**
 * Produces a detached value snapshot for the presentation owner.
 * Nested records and Armory purchases are copied so domain-owned containers do
 * not cross the controller/presentation boundary by reference.
 */
export function projectBattleConsoleState(
  state: BattleConsolePresentationState,
): BattleConsolePresentationState {
  const campaign = state.campaign;
  return {
    ...(campaign === undefined
      ? {}
      : {
        campaign: campaign === null
          ? null
          : {
            commitmentCount: campaign.commitmentCount,
            encounterId: campaign.encounterId,
            ...(campaign.objective ? {
              objective: {
                ...campaign.objective,
                protectedObjectIds: [...campaign.objective.protectedObjectIds],
              },
            } : {}),
            ...(campaign.warning ? { warning: { ...campaign.warning } } : {}),
            supplies: campaign.supplies,
            retryable: campaign.retryable,
            objects: campaign.objects.map((object) => ({
              id: object.id,
              kind: object.kind,
              health: object.health,
              maxHealth: object.maxHealth,
              alive: object.alive,
            })),
            result: campaign.result === null ? null : { ...campaign.result },
            ...(campaign.checkpoint === undefined
              ? {}
              : {
                checkpoint: campaign.checkpoint === null
                  ? null
                  : {
                    ...campaign.checkpoint,
                    story: campaign.checkpoint.story === null
                      ? null
                      : { ...campaign.checkpoint.story },
                    ammunition: campaign.checkpoint.ammunition.map((entry) => ({ ...entry })),
                  },
              }),
          },
      }),
    commander: { ...state.commander },
    mobility: { ...state.mobility },
    weapon: { ...state.weapon },
    armory: {
      ...state.armory,
      items: state.armory.items.map((item) => ({
        ...item,
        purchase: { ...item.purchase },
      })),
    },
    ballistics: { ...state.ballistics },
    fireControl: { ...state.fireControl },
    settings: { ...state.settings },
    coach: { ...state.coach },
    focusOwner: state.focusOwner,
  };
}

function sameCampaignResult(
  left: CampaignBattleConsolePresentation['result'],
  right: CampaignBattleConsolePresentation['result'],
): boolean {
  if (left === right) return true;
  if (!left || !right
    || left.outcome !== right.outcome
    || left.reason !== right.reason
    || left.commitmentId !== right.commitmentId) return false;
  if (left.outcome === 'technical-failure' || right.outcome === 'technical-failure') {
    return left.outcome === 'technical-failure'
      && right.outcome === 'technical-failure'
      && left.code === right.code
      && left.reward === right.reward;
  }
  return true;
}

function sameCampaignObjects(
  left: CampaignBattleConsolePresentation['objects'],
  right: CampaignBattleConsolePresentation['objects'],
): boolean {
  return left.length === right.length && left.every((object, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && object.id === candidate.id
      && object.kind === candidate.kind
      && object.health === candidate.health
      && object.maxHealth === candidate.maxHealth
      && object.alive === candidate.alive;
  });
}

function sameCampaign(
  left: BattleConsolePresentationState['campaign'],
  right: BattleConsolePresentationState['campaign'],
): boolean {
  const leftFacts = left ?? null;
  const rightFacts = right ?? null;
  if (leftFacts === rightFacts) return true;
  return leftFacts !== null
    && rightFacts !== null
    && leftFacts.encounterId === rightFacts.encounterId
    && JSON.stringify(leftFacts.objective ?? null) === JSON.stringify(rightFacts.objective ?? null)
    && JSON.stringify(leftFacts.warning ?? null) === JSON.stringify(rightFacts.warning ?? null)
    && leftFacts.commitmentCount === rightFacts.commitmentCount
    && leftFacts.supplies === rightFacts.supplies
    && leftFacts.retryable === rightFacts.retryable
    && sameCampaignObjects(leftFacts.objects, rightFacts.objects)
    && sameCampaignResult(leftFacts.result, rightFacts.result)
    && JSON.stringify(leftFacts.checkpoint ?? null) === JSON.stringify(rightFacts.checkpoint ?? null);
}

function samePurchase(
  left: BattleConsolePresentationState['armory']['items'][number]['purchase'],
  right: BattleConsolePresentationState['armory']['items'][number]['purchase'],
): boolean {
  return left.weapon === right.weapon && left.accessory === right.accessory;
}

function sameArmoryItems(
  left: BattleConsolePresentationState['armory']['items'],
  right: BattleConsolePresentationState['armory']['items'],
): boolean {
  return left.length === right.length && left.every((item, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && item.key === candidate.key
      && item.name === candidate.name
      && item.description === candidate.description
      && samePurchase(item.purchase, candidate.purchase)
      && item.price === candidate.price
      && item.bundleSize === candidate.bundleSize
      && item.owned === candidate.owned
      && item.ammo === candidate.ammo
      && item.equipped === candidate.equipped
      && item.canBuy === candidate.canBuy
      && item.canEquip === candidate.canEquip;
  });
}

function samePortrait(
  left: BattleConsolePresentationState['commander']['portrait'],
  right: BattleConsolePresentationState['commander']['portrait'],
): boolean {
  if (left === right) return true;
  if (!left || !right || left.color !== right.color) return false;
  return left.loadout.treads === right.loadout.treads
    && left.loadout.hull === right.loadout.hull
    && left.loadout.turret === right.loadout.turret
    && left.loadout.barrel === right.loadout.barrel;
}

/** Allocation-free value comparison for the frame-rate presentation boundary. */
export function battleConsolePresentationStatesEqual(
  left: BattleConsolePresentationState,
  right: BattleConsolePresentationState,
): boolean {
  return left === right || (
    left.commander.id === right.commander.id
    && left.commander.name === right.commander.name
    && left.commander.health === right.commander.health
    && samePortrait(left.commander.portrait, right.commander.portrait)
    && left.mobility.fuel === right.mobility.fuel
    && left.mobility.canMoveLeft === right.mobility.canMoveLeft
    && left.mobility.canMoveRight === right.mobility.canMoveRight
    && left.weapon.type === right.weapon.type
    && left.weapon.name === right.weapon.name
    && left.weapon.ammo === right.weapon.ammo
    && left.weapon.canCycle === right.weapon.canCycle
    && left.armory.open === right.armory.open
    && (left.armory.available ?? true) === (right.armory.available ?? true)
    && left.armory.credits === right.armory.credits
    && left.armory.submitting === right.armory.submitting
    && sameArmoryItems(left.armory.items, right.armory.items)
    && left.ballistics.angle === right.ballistics.angle
    && (left.ballistics.canAdjust ?? left.weapon.canCycle) === (right.ballistics.canAdjust ?? right.weapon.canCycle)
    && left.ballistics.power === right.ballistics.power
    && (left.ballistics.powerCap ?? DEFAULT_POWER_CAP) === (right.ballistics.powerCap ?? DEFAULT_POWER_CAP)
    && left.ballistics.wind === right.ballistics.wind
    && left.fireControl.status === right.fireControl.status
    && left.fireControl.guidance === right.fireControl.guidance
    && left.fireControl.ready === right.fireControl.ready
    && left.fireControl.submitting === right.fireControl.submitting
    && left.settings.open === right.settings.open
    && left.settings.soundEnabled === right.settings.soundEnabled
    && left.settings.guideEnabled === right.settings.guideEnabled
    && left.settings.returnFocusKey === right.settings.returnFocusKey
    && left.coach.step === right.coach.step
    && left.coach.briefingOpen === right.coach.briefingOpen
    && sameCampaign(left.campaign, right.campaign)
    && left.focusOwner === right.focusOwner
  );
}

export type { BattleConsoleIntent, BattleConsolePresentationState } from './types';
