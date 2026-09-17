import type {
  CampaignCommitment,
  CampaignCommitmentAction,
} from './commitments.ts';
import type { CampaignObjectState } from './objects.ts';
import type {
  CampaignEffectFailureCode,
  CampaignEffectState,
} from './effects.ts';
import type { CampaignIncendiaryZone } from './zones.ts';
import type { CampaignAnnouncedStrike } from './warnings.ts';

export type CampaignDamageKind = 'hull' | 'shield' | 'fall' | 'object' | 'hazard';
export type CampaignDamageAttribution = 'enemy' | 'self' | 'ally' | 'object' | 'environment';
export type CampaignDamageTargetKind = 'tank' | 'object';
export type CampaignDamageSourceKind = 'weapon' | 'object' | 'hazard' | 'environment';

export interface CampaignDamageComponent {
  readonly damageKind: CampaignDamageKind;
  readonly amount: number;
  readonly creditedDamage: number;
  readonly target: Readonly<{ kind: CampaignDamageTargetKind; id: string }>;
  readonly attribution: CampaignDamageAttribution;
  readonly source: Readonly<{ kind: CampaignDamageSourceKind; id: string }>;
  readonly actorId: string;
  readonly rootCommitmentId: number;
}

export interface CampaignDamageSummary {
  readonly actorId: string;
  readonly rootCommitmentId: number;
  readonly components: readonly CampaignDamageComponent[];
  readonly hullDamage: number;
  readonly shieldAbsorption: number;
  readonly fallDamage: number;
  readonly hazardDamage: number;
  readonly selfDamage: number;
  readonly alliedDamage: number;
  readonly objectDamage: number;
  readonly creditedDamage: number;
}

export interface CampaignSettledOutcome {
  readonly commitmentId: number;
  readonly rootCommitmentId: number;
  readonly actorId: string;
  readonly action: CampaignCommitmentAction;
  readonly damage: CampaignDamageSummary;
}

export type CampaignVerdict = Readonly<{
  outcome: 'success' | 'failure';
  reason: 'protected-object' | 'player' | 'objective' | 'limit';
}>;

export interface CampaignResolvedResult extends CampaignVerdict {
  readonly commitmentId: number;
}

export interface CampaignTechnicalFailureResult {
  readonly outcome: 'technical-failure';
  readonly reason: 'technical-failure';
  readonly code: CampaignEffectFailureCode;
  readonly reward: false;
  readonly commitmentId: number;
}

export type CampaignResult = CampaignResolvedResult | CampaignTechnicalFailureResult;

export interface CampaignProjection {
  /** Canonical authored identity for content-specific tactics and presentation. */
  encounterId?: string;
  commitmentCount: number;
  activeCommitment: CampaignCommitment | null;
  settledOutcome: CampaignSettledOutcome | null;
  result: CampaignResult | null;
  /** Present when the authored encounter owns physical battlefield objects. */
  objects?: CampaignObjectState[];
  /** Present when bounded campaign objects or persistent-zone work is enabled. */
  effects?: CampaignEffectState;
  /** Separate commitment-persistent campaign hazards; never ordinary Napalm fire. */
  zones?: CampaignIncendiaryZone[];
  /** Fixed-target authored pressure; absent from ordinary games and warning-free encounters. */
  warning?: CampaignAnnouncedStrike;
}

export function createCampaignDamageSummary(input: {
  readonly actorId: string;
  readonly rootCommitmentId: number;
}): CampaignDamageSummary {
  return Object.freeze({
    actorId: input.actorId,
    rootCommitmentId: input.rootCommitmentId,
    components: Object.freeze([]) as readonly CampaignDamageComponent[],
    hullDamage: 0,
    shieldAbsorption: 0,
    fallDamage: 0,
    hazardDamage: 0,
    selfDamage: 0,
    alliedDamage: 0,
    objectDamage: 0,
    creditedDamage: 0,
  });
}

/**
 * Append one immutable physical component without losing its originating actor
 * and root. Later causal effects can retain the same attribution contract.
 */
export function appendCampaignDamageComponent(
  summary: CampaignDamageSummary,
  component: CampaignDamageComponent,
): CampaignDamageSummary {
  if (component.actorId !== summary.actorId
    || component.rootCommitmentId !== summary.rootCommitmentId) {
    throw new Error('campaign damage component does not belong to the settled root');
  }

  const ownedComponent = Object.freeze({
    ...component,
    target: Object.freeze({ ...component.target }),
    source: Object.freeze({ ...component.source }),
  });
  const components = Object.freeze([...summary.components, ownedComponent]);

  return Object.freeze({
    actorId: summary.actorId,
    rootCommitmentId: summary.rootCommitmentId,
    components,
    hullDamage: summary.hullDamage + (component.damageKind === 'hull' ? component.amount : 0),
    shieldAbsorption:
      summary.shieldAbsorption + (component.damageKind === 'shield' ? component.amount : 0),
    fallDamage: summary.fallDamage + (component.damageKind === 'fall' ? component.amount : 0),
    hazardDamage: summary.hazardDamage + (component.damageKind === 'hazard' ? component.amount : 0),
    selfDamage: summary.selfDamage + (component.attribution === 'self' ? component.amount : 0),
    alliedDamage: summary.alliedDamage + (component.attribution === 'ally' ? component.amount : 0),
    objectDamage: summary.objectDamage + (component.damageKind === 'object' ? component.amount : 0),
    creditedDamage: summary.creditedDamage + component.creditedDamage,
  });
}

export function createCampaignSettledOutcome(
  commitment: CampaignCommitment,
  damage: CampaignDamageSummary,
): CampaignSettledOutcome {
  return Object.freeze({
    commitmentId: commitment.id,
    rootCommitmentId: commitment.rootCommitmentId,
    actorId: commitment.actorId,
    action: commitment.action,
    damage,
  });
}

/** Resolve exactly one terminal verdict in failure, objective, then limit order. */
export function decideCampaignOutcome(input: {
  readonly protectedObjectFailed: boolean;
  readonly playerFailed: boolean;
  readonly objectiveSatisfied: boolean;
  readonly limitReached: boolean;
  readonly limitOutcome: 'success' | 'failure';
}): CampaignVerdict | null {
  if (input.protectedObjectFailed) {
    return Object.freeze({ outcome: 'failure', reason: 'protected-object' });
  }
  if (input.playerFailed) {
    return Object.freeze({ outcome: 'failure', reason: 'player' });
  }
  if (input.objectiveSatisfied) {
    return Object.freeze({ outcome: 'success', reason: 'objective' });
  }
  if (input.limitReached) {
    return Object.freeze({ outcome: input.limitOutcome, reason: 'limit' });
  }
  return null;
}
