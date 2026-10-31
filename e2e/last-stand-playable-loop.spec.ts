import { chromium, test } from '@playwright/test';
import { runLastStandJourney, closeLastStandOwnedBrowsers, lastStandJourneyTimeBudget, runWaveJourneyTest, lastStandJourneyConfiguration } from './helpers/lastStandJourney.mjs';
import { runLastStandWaveJourney } from './helpers/lastStandWaveJourney.mjs';

// Retired storage is deliberately opaque. No removed parser or game is needed
// to prove that ordinary startup, Last Stand and Return leave these bytes alone.
const retiredCampaignRecord = { kind: 'campaign-storage-record', schemaVersion: 1,
  slotId: 'ash-road-local', revision: 4,
  binding: { episodeId: 'ash-road', retired: true },
  payload: { checkpoint: 'opaque historical record', acceptedCommands: [] } };

test.afterEach(async () => { await closeLastStandOwnedBrowsers(); });

test('Last Stand earned waves and complete checkpoints survive reload', { tag: '@last-stand' }, async ({ page, baseURL }, testInfo) => {
  await runWaveJourneyTest({test,page,baseURL,testInfo,runJourney:runLastStandWaveJourney});
});

test('Last Stand Campaigns journey preserves no-award exit and a stronger redeploy', { tag: '@last-stand' }, async ({ baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'One journey owns its explicit viewport matrix');
  // Native ownership probes and captured media are deliberately outside the
  // unchanged game-time/audio windows; allow their slower Windows wall time.
  test.setTimeout(lastStandJourneyTimeBudget().testMs);
  if (!baseURL) throw new Error('Production baseURL is required');
  const result = await runLastStandJourney({ baseURL, chromium, retiredCampaignRecord,
    ...lastStandJourneyConfiguration() });
  await testInfo.attach('Last Stand source-bound result', { path: result.resultPath, contentType: 'application/json' });
  await testInfo.attach('Last Stand observed lifecycle', { body: Buffer.from(JSON.stringify(result.report.lifecycle, null, 2)), contentType: 'application/json' });
});
