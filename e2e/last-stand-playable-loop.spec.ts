import { chromium, test } from '@playwright/test';
import { runLastStandJourney, closeLastStandOwnedBrowsers, lastStandJourneyTimeBudget } from './helpers/lastStandJourney.mjs';
import { ASH_ROAD_COMBAT_PROFILE_REFERENCE, resolveCampaignCombatProfile } from '../shared/src/campaign/combatProfiles';
import { parseCampaignRun } from '../shared/src/campaign/definitions';
import { ASH_ROAD_EPISODE } from '../client/src/campaign/content/episode';
import { createCampaignCheckpoint } from '../client/src/campaign/checkpoint';
import { createCampaignLoadout } from '../client/src/campaign/loadout';
import { createCampaignRunState } from '../client/src/campaign/runReducer';
import { campaignStorageBindingFromRunState, createCampaignReplayPayload } from '../client/src/campaign/replay';
import { CAMPAIGN_STORAGE_SCHEMA_VERSION } from '../client/src/campaign/storage';
import { runLastStandTierJourney } from './helpers/lastStandTierJourney.mjs';

// Storage setup uses the existing Ash Road owners; no gameplay state is injected.
function compatibleAshRoad() {
  const route = ASH_ROAD_EPISODE.routes[0]!;
  const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE);
  const run = parseCampaignRun({ kind: 'campaign-run', runVersion: 1,
    runId: 'last-stand-route-preservation', episodeId: ASH_ROAD_EPISODE.episodeId,
    episodeVersion: ASH_ROAD_EPISODE.episodeVersion, episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
    combatProfileId: profile.profileId, combatProfileVersion: profile.profileVersion,
    combatProfileContentDigest: profile.contentDigest, routeId: route.id,
    encounterIds: route.encounterIds, currentEncounterIndex: 0 });
  if (!run) throw new Error('Invalid existing Ash Road fixture');
  const encounter = ASH_ROAD_EPISODE.encounters.find(item => item.encounterId === route.encounterIds[0])!;
  const checkpoint = createCampaignCheckpoint({ run, encounter, combatProfile: profile, attempt: 1, supplies: 2 });
  const runState = createCampaignRunState(checkpoint, createCampaignLoadout());
  return { kind: 'campaign-storage-record', schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
    slotId: 'ash-road-local', revision: 4, binding: campaignStorageBindingFromRunState(runState),
    payload: createCampaignReplayPayload({ runState, acceptedCommands: [] }) };
}

test.afterEach(async () => { await closeLastStandOwnedBrowsers(); });

test('Last Stand tier goals unlock and survive reload', { tag: '@last-stand' }, async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'One journey owns the five-profile matrix');
  test.setTimeout(240_000);
  if (!baseURL) throw new Error('Production baseURL is required');
  await runLastStandTierJourney({ page, baseURL, testInfo });
});

test('Last Stand Campaigns journey preserves no-award exit and a stronger redeploy', { tag: '@last-stand' }, async ({ baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'One journey owns its explicit viewport matrix');
  // Native ownership probes and captured media are deliberately outside the
  // unchanged game-time/audio windows; allow their slower Windows wall time.
  test.setTimeout(lastStandJourneyTimeBudget().testMs);
  if (!baseURL) throw new Error('Production baseURL is required');
  const result = await runLastStandJourney({ baseURL, chromium, ashRoadRecord: compatibleAshRoad(),
    entrypoint: process.env['LAST_STAND_ENTRYPOINT'] ?? 'maintained-playwright',
    profileName: process.env['LAST_STAND_QUALIFICATION_PROFILE'] ?? 'windows-player' });
  await testInfo.attach('Last Stand source-bound result', { path: result.resultPath, contentType: 'application/json' });
  await testInfo.attach('Last Stand observed lifecycle', { body: Buffer.from(JSON.stringify(result.report.lifecycle, null, 2)), contentType: 'application/json' });
});
