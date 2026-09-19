import {
  parseCampaignReplayPayload,
  type CampaignReplayPayload,
} from '../../campaign/replay';
import {
  CampaignStorageIncompatibleError,
  type CampaignStorageBinding,
  type CampaignStorageRecord,
} from '../../campaign/storage';
import { ASH_ROAD_EPISODE } from '../../campaign/content/episode';
import { FUEL_STOP_FIXTURE } from '../../campaign/content/fuel-stop';
import type { CampaignSavePresentation } from './contracts';

export interface CampaignSaveLoadPort {
  load(slotId: string): Promise<CampaignStorageRecord | null>;
}

export interface CampaignResumeCandidate {
  readonly payload: CampaignReplayPayload;
  readonly revision: number;
}

export interface CampaignSaveProjection {
  readonly presentation: CampaignSavePresentation;
  readonly resumeCandidate: CampaignResumeCandidate | null;
  readonly replacementRevision: number | null;
}

const CHECKING = Object.freeze({ status: 'checking' } as const);
const CURRENT_ASH_ROAD_BINDING: CampaignStorageBinding = Object.freeze({
  episodeId: ASH_ROAD_EPISODE.episodeId,
  episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
  episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
  profileId: FUEL_STOP_FIXTURE.combatProfile.profileId,
  profileVersion: FUEL_STOP_FIXTURE.combatProfile.profileVersion,
  profileContentDigest: FUEL_STOP_FIXTURE.combatProfile.contentDigest,
});

function sameBinding(left: CampaignStorageBinding, right: CampaignStorageBinding): boolean {
  return left.episodeId === right.episodeId
    && left.episodeVersion === right.episodeVersion
    && left.episodeContentDigest === right.episodeContentDigest
    && left.profileId === right.profileId
    && left.profileVersion === right.profileVersion
    && left.profileContentDigest === right.profileContentDigest;
}

function isCompletedAshRoad(payload: CampaignReplayPayload): boolean {
  const { runState } = payload;
  const { run, encounter } = runState.checkpoint;
  const route = ASH_ROAD_EPISODE.routes.find(({ id }) => id === run.routeId);
  if (!route || run.currentEncounterIndex !== route.encounterIds.length - 1) return false;
  const finalEncounterId = route.encounterIds.at(-1);
  if (encounter.encounterId !== finalEncounterId) return false;
  return runState.appliedResults.some(({ result }) => (
    result.attempt === runState.attempt
      && result.encounterId === finalEncounterId
      && result.outcome === 'success'
  ));
}

function bindingFromParsedPayload(payload: CampaignReplayPayload): CampaignStorageBinding {
  const { run, profile } = payload.runState.checkpoint;
  return Object.freeze({
    episodeId: run.episodeId,
    episodeVersion: run.episodeVersion,
    episodeContentDigest: run.episodeContentDigest,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    profileContentDigest: profile.contentDigest,
  });
}

/** Project a payload that has already passed the strict replay parser. */
export function projectParsedCampaignSaveRecord(
  record: CampaignStorageRecord,
  payload: CampaignReplayPayload,
): CampaignSaveProjection {
  const payloadBinding = bindingFromParsedPayload(payload);
  if (!sameBinding(record.binding, payloadBinding)
    || !sameBinding(record.binding, CURRENT_ASH_ROAD_BINDING)
    || !sameBinding(payloadBinding, CURRENT_ASH_ROAD_BINDING)) {
    return Object.freeze({
      presentation: Object.freeze({ status: 'incompatible' }),
      resumeCandidate: null,
      replacementRevision: null,
    });
  }
  if (isCompletedAshRoad(payload)) {
    return Object.freeze({
      presentation: Object.freeze({ status: 'complete' }),
      resumeCandidate: null,
      replacementRevision: record.revision,
    });
  }
  return Object.freeze({
    presentation: Object.freeze({ status: 'compatible' }),
    resumeCandidate: Object.freeze({ payload, revision: record.revision }),
    replacementRevision: record.revision,
  });
}

export class CampaignSavePresentationOwner {
  private generation = 0;
  private currentPresentation: CampaignSavePresentation = CHECKING;
  private currentResumeCandidate: CampaignResumeCandidate | null = null;
  private currentReplacementRevision: number | null = null;

  constructor(
    private readonly storage: CampaignSaveLoadPort,
    private readonly slotId = 'ash-road-local',
  ) {}

  get presentation(): CampaignSavePresentation {
    return this.currentPresentation;
  }

  get resumeCandidate(): CampaignResumeCandidate | null {
    return this.currentResumeCandidate;
  }

  get replacementRevision(): number | null {
    return this.currentReplacementRevision;
  }

  async refresh(): Promise<void> {
    const generation = ++this.generation;
    this.currentPresentation = CHECKING;
    try {
      const record = await this.storage.load(this.slotId);
      if (generation !== this.generation) return;
      if (record === null) {
        this.currentResumeCandidate = null;
        this.currentReplacementRevision = null;
        this.currentPresentation = Object.freeze({ status: 'empty' });
        return;
      }
      const payload = parseCampaignReplayPayload(record.payload);
      if (!payload) {
        this.currentResumeCandidate = null;
        this.currentReplacementRevision = null;
        this.currentPresentation = Object.freeze({ status: 'incompatible' });
        return;
      }
      const projection = projectParsedCampaignSaveRecord(record, payload);
      this.currentResumeCandidate = projection.resumeCandidate;
      this.currentReplacementRevision = projection.replacementRevision;
      this.currentPresentation = projection.presentation;
    } catch (error) {
      if (generation !== this.generation) return;
      this.currentResumeCandidate = null;
      this.currentReplacementRevision = null;
      this.currentPresentation = error instanceof CampaignStorageIncompatibleError
        ? Object.freeze({ status: 'incompatible' })
        : Object.freeze({ status: 'unavailable' });
    }
  }

  invalidate(): void {
    this.generation += 1;
  }

  beginRestoring(): boolean {
    if (this.currentPresentation.status !== 'compatible' || !this.currentResumeCandidate) {
      return false;
    }
    this.currentPresentation = Object.freeze({ status: 'restoring' });
    return true;
  }
}
