import {
  campaignStorageBindingFromRunState,
  parseCampaignReplayPayload,
  type CampaignReplayPayload,
} from '../../campaign/replay';
import {
  CampaignStorageConflictError,
  type CampaignStorage,
} from '../../campaign/storage';
import type { CampaignSavePresentation } from './contracts';

export interface CampaignRunReplacementPresentationPort {
  readonly presentation: CampaignSavePresentation;
  readonly replacementRevision: number | null;
  refresh(): Promise<void>;
}

export interface CampaignRunReplacementConfirmationRequest {
  readonly slotId: string;
  readonly expectedRevision: number;
}

export interface CampaignRunReplacementConfirmationPort {
  confirm(request: CampaignRunReplacementConfirmationRequest): boolean | Promise<boolean>;
}

export type CampaignRunReplacementResult =
  | Readonly<{
    status: 'replaced';
    payload: CampaignReplayPayload;
    revision: number;
  }>
  | Readonly<{
    status: 'cancelled';
    expectedRevision: number;
  }>
  | Readonly<{
    status: 'conflict';
    expectedRevision: number;
    currentRevision: number;
    presentation: CampaignSavePresentation;
  }>
  | Readonly<{
    status: 'blocked';
    presentation: CampaignSavePresentation;
  }>
  | Readonly<{
    status: 'unavailable';
    expectedRevision: number;
    error: unknown;
  }>;

export const browserCampaignRunReplacementConfirmation: CampaignRunReplacementConfirmationPort =
  Object.freeze({
    confirm: () => window.confirm(
      'Start a new Ash Road run? This replaces the saved run on this device.',
    ),
  });

/** Owns the confirmation and revision-bound write, but never launches a campaign. */
export class CampaignRunReplacementCoordinator {
  constructor(
    private readonly storage: CampaignStorage,
    private readonly presentation: CampaignRunReplacementPresentationPort,
    private readonly confirmation: CampaignRunReplacementConfirmationPort,
    private readonly slotId = 'ash-road-local',
  ) {}

  async replace(payloadValue: CampaignReplayPayload): Promise<CampaignRunReplacementResult> {
    const presentation = this.presentation.presentation;
    const expectedRevision = this.presentation.replacementRevision;
    if ((presentation.status !== 'compatible' && presentation.status !== 'complete')
      || expectedRevision === null) {
      return Object.freeze({ status: 'blocked', presentation });
    }

    let confirmed: boolean;
    try {
      confirmed = await this.confirmation.confirm({ slotId: this.slotId, expectedRevision });
    } catch (error) {
      return Object.freeze({ status: 'unavailable', expectedRevision, error });
    }
    if (!confirmed) return Object.freeze({ status: 'cancelled', expectedRevision });

    try {
      const record = await this.storage.compareAndSwap({
        slotId: this.slotId,
        expectedRevision,
        binding: campaignStorageBindingFromRunState(payloadValue.runState),
        payload: payloadValue,
      });
      const payload = parseCampaignReplayPayload(record.payload);
      if (!payload) {
        return Object.freeze({
          status: 'unavailable',
          expectedRevision,
          error: new Error('campaign replacement produced an invalid replay payload'),
        });
      }
      return Object.freeze({ status: 'replaced', payload, revision: record.revision });
    } catch (error) {
      if (error instanceof CampaignStorageConflictError) {
        await this.presentation.refresh();
        return Object.freeze({
          status: 'conflict',
          expectedRevision,
          currentRevision: error.currentRevision,
          presentation: this.presentation.presentation,
        });
      }
      return Object.freeze({ status: 'unavailable', expectedRevision, error });
    }
  }
}
