import type { PlayerAction } from '../types/PlayerAction.ts';

export type CampaignCommitmentAction = 'fire' | 'shield';

export interface CampaignCommitment {
  readonly id: number;
  readonly rootCommitmentId: number;
  readonly actorId: string;
  readonly action: CampaignCommitmentAction;
}

/**
 * Classify only commands the engine has already accepted as turn-ending
 * campaign commitments. Naming a fire or shield action is not sufficient.
 */
export function classifyCampaignCommitment(input: {
  readonly action: Pick<PlayerAction, 'type'> | { readonly type: string };
  readonly accepted: boolean;
}): CampaignCommitmentAction | null {
  if (!input.accepted) return null;
  if (input.action.type === 'fire') return 'fire';
  if (input.action.type === 'use_shield') return 'shield';
  return null;
}

/** Create the immutable causal root for one accepted campaign commitment. */
export function createCampaignCommitment(input: {
  readonly id: number;
  readonly actorId: string;
  readonly action: CampaignCommitmentAction;
}): CampaignCommitment {
  return Object.freeze({
    id: input.id,
    rootCommitmentId: input.id,
    actorId: input.actorId,
    action: input.action,
  });
}
