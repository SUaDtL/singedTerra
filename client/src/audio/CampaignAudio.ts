import type { CampaignProjection } from '@shared/campaign/outcomes';

export type CampaignAudioCue =
  | 'warning-announced'
  | 'relay-disabled'
  | 'volatile-chain'
  | 'mission-concluded';

export interface CampaignAudioPort {
  playCampaignCue(cue: CampaignAudioCue): void;
}

/**
 * Presentation-only edge detector for authored campaign events.
 *
 * The engine remains the authority: this class only observes immutable campaign
 * projections, deduplicates their stable identities, and asks the audio layer to
 * play a cue. Existing ledger entries are primed at session start so a resumed or
 * terminal snapshot never replays historical sound.
 */
export class CampaignAudio {
  private generation: number | null = null;
  private readonly seenWarnings = new Set<string>();
  private readonly seenEffectRoots = new Set<string>();
  private readonly seenResults = new Set<string>();
  private readonly relayAlive = new Map<string, boolean>();

  constructor(private readonly port: CampaignAudioPort) {}

  beginSession(
    generation: number,
    initial?: CampaignProjection,
    options: Readonly<{ announceInitialWarning?: boolean }> = {},
  ): void {
    this.generation = generation;
    this.seenWarnings.clear();
    this.seenEffectRoots.clear();
    this.seenResults.clear();
    this.relayAlive.clear();

    if (!initial) return;
    const encounter = initial.encounterId ?? 'campaign';
    if (initial.warning && !options.announceInitialWarning) {
      this.seenWarnings.add(`${encounter}:${initial.warning.id}`);
    }
    for (const object of initial.objects ?? []) {
      if (object.kind === 'relay') this.relayAlive.set(`${encounter}:${object.id}`, object.alive);
    }
    for (const effect of initial.effects?.resolved ?? []) {
      this.seenEffectRoots.add(`${encounter}:${effect.rootCommitmentId}`);
    }
    if (initial.result) {
      this.seenResults.add(`${encounter}:${initial.result.commitmentId}`);
    }
  }

  invalidate(): void {
    this.generation = null;
  }

  observe(generation: number, campaign?: CampaignProjection): void {
    if (this.generation !== generation || !campaign) return;
    const encounter = campaign.encounterId ?? 'campaign';

    const warning = campaign.warning;
    if (warning && (warning.status === 'pending' || warning.status === 'due')) {
      const key = `${encounter}:${warning.id}`;
      if (!this.seenWarnings.has(key)) {
        this.seenWarnings.add(key);
        this.port.playCampaignCue('warning-announced');
      }
    }

    for (const object of campaign.objects ?? []) {
      if (object.kind !== 'relay') continue;
      const key = `${encounter}:${object.id}`;
      const prior = this.relayAlive.get(key);
      if (prior === true && !object.alive) this.port.playCampaignCue('relay-disabled');
      this.relayAlive.set(key, object.alive);
    }

    for (const effect of campaign.effects?.resolved ?? []) {
      const key = `${encounter}:${effect.rootCommitmentId}`;
      if (!this.seenEffectRoots.has(key)) {
        this.seenEffectRoots.add(key);
        this.port.playCampaignCue('volatile-chain');
      }
    }

    if (campaign.result) {
      const key = `${encounter}:${campaign.result.commitmentId}`;
      if (!this.seenResults.has(key)) {
        this.seenResults.add(key);
        this.port.playCampaignCue('mission-concluded');
      }
    }
  }
}
