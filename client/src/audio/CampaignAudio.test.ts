// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { CampaignProjection } from '@shared/campaign/outcomes';
import { CampaignAudio, type CampaignAudioCue } from './CampaignAudio';

function projection(overrides: Record<string, unknown> = {}): CampaignProjection {
  return {
    encounterId: 'relay-ridge',
    commitmentCount: 0,
    activeCommitment: null,
    settledOutcome: null,
    result: null,
    ...overrides,
  } as unknown as CampaignProjection;
}

const aliveRelay = {
  id: 'ridge-relay', kind: 'relay', x: 700, width: 44, height: 36,
  maxHealth: 35, health: 35, alive: true,
  collisionBounds: { left: 678, right: 722, top: 300, bottom: 336 },
  supportSamples: [{ x: 680, y: 336 }, { x: 700, y: 336 }, { x: 720, y: 336 }],
} as const;

const effect = (rootCommitmentId: number) => ({
  kind: 'supply-drum', sourceObjectId: `drum-${rootCommitmentId}`, x: 200, y: 300,
  actorId: 'human', rootCommitmentId, depth: 0,
  profile: { maxDamage: 30, damageReach: 45, craterRadius: 18, falloffExponent: 1 },
} as const);

describe('CampaignAudio', () => {
  it('announces each live warning once and emits one cue for each new authoritative edge', () => {
    const cues: CampaignAudioCue[] = [];
    const audio = new CampaignAudio({ playCampaignCue: (cue) => cues.push(cue) });
    const opening = projection({
      objects: [aliveRelay],
      warning: { id: 'strike-1', status: 'pending' },
    });
    audio.beginSession(4, opening, { announceInitialWarning: true });
    audio.observe(4, opening);
    audio.observe(4, opening);

    const settled = projection({
      objects: [{ ...aliveRelay, health: 0, alive: false }],
      warning: { id: 'strike-1', status: 'canceled' },
      effects: { activatedObjectIds: ['drum-7'], pending: [], resolved: [effect(7), effect(7)], technicalFailure: null },
      result: { outcome: 'success', reason: 'objective', commitmentId: 9 },
    });
    audio.observe(4, settled);
    audio.observe(4, settled);

    expect(cues).toEqual([
      'warning-announced',
      'relay-disabled',
      'volatile-chain',
      'mission-concluded',
    ]);
  });

  it('primes historical facts and ignores retired-session updates', () => {
    const playCampaignCue = vi.fn();
    const audio = new CampaignAudio({ playCampaignCue });
    const historical = projection({
      objects: [{ ...aliveRelay, health: 0, alive: false }],
      warning: { id: 'strike-1', status: 'pending' },
      effects: { activatedObjectIds: ['drum-3'], pending: [], resolved: [effect(3)], technicalFailure: null },
      result: { outcome: 'failure', reason: 'limit', commitmentId: 5 },
    });

    audio.beginSession(8, historical);
    audio.observe(8, historical);
    audio.beginSession(9, projection({ objects: [aliveRelay] }));
    audio.observe(8, projection({ warning: { id: 'stale', status: 'pending' } }));
    audio.invalidate();
    audio.observe(9, projection({ warning: { id: 'also-stale', status: 'pending' } }));

    expect(playCampaignCue).not.toHaveBeenCalled();
  });

  it('coalesces a volatile chain by root commitment while allowing a later root', () => {
    const cues: CampaignAudioCue[] = [];
    const audio = new CampaignAudio({ playCampaignCue: (cue) => cues.push(cue) });
    audio.beginSession(12, projection());

    audio.observe(12, projection({
      effects: { activatedObjectIds: [], pending: [], resolved: [effect(10), effect(10)], technicalFailure: null },
    }));
    audio.observe(12, projection({
      effects: { activatedObjectIds: [], pending: [], resolved: [effect(10), effect(11)], technicalFailure: null },
    }));

    expect(cues).toEqual(['volatile-chain', 'volatile-chain']);
  });

  it('consumes event identity while sound is off so unmuting cannot replay history', () => {
    let muted = true;
    const audible: CampaignAudioCue[] = [];
    const audio = new CampaignAudio({
      playCampaignCue: (cue) => { if (!muted) audible.push(cue); },
    });
    const warning = projection({ warning: { id: 'strike-muted', status: 'pending' } });
    audio.beginSession(20, warning, { announceInitialWarning: true });
    audio.observe(20, warning);
    muted = false;
    audio.observe(20, warning);

    expect(audible).toEqual([]);
  });

  it('observes synchronously without scheduling mechanical timers or waits', () => {
    vi.useFakeTimers();
    const audio = new CampaignAudio({ playCampaignCue: vi.fn() });
    audio.beginSession(21, projection());

    expect(audio.observe(21, projection({
      result: { outcome: 'success', reason: 'objective', commitmentId: 1 },
    }))).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
