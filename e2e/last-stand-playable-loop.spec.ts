import { chromium, test } from '@playwright/test';
import { runLastStandJourney, closeLastStandOwnedBrowsers, lastStandJourneyTimeBudget } from './helpers/lastStandJourney.mjs';
import { runLastStandTierJourney } from './helpers/lastStandTierJourney.mjs';

// Retired storage is deliberately opaque. No removed parser or game is needed
// to prove that ordinary startup, Last Stand and Return leave these bytes alone.
const retiredCampaignRecord = { kind: 'campaign-storage-record', schemaVersion: 1,
  slotId: 'ash-road-local', revision: 4,
  binding: { episodeId: 'ash-road', retired: true },
  payload: { checkpoint: 'opaque historical record', acceptedCommands: [] } };

test.afterEach(async () => { await closeLastStandOwnedBrowsers(); });

test('Last Stand tier goals unlock and survive reload', { tag: '@last-stand' }, async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'One journey owns the five-profile matrix');
  test.setTimeout(lastStandJourneyTimeBudget().testMs);
  page.setDefaultTimeout(lastStandJourneyTimeBudget().actionMs);
  if (!baseURL) throw new Error('Production baseURL is required');
  await runLastStandTierJourney({ page, baseURL, testInfo });
});

test('Last Stand Campaigns journey preserves no-award exit and a stronger redeploy', { tag: '@last-stand' }, async ({ baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'One journey owns its explicit viewport matrix');
  // Native ownership probes and captured media are deliberately outside the
  // unchanged game-time/audio windows; allow their slower Windows wall time.
  test.setTimeout(lastStandJourneyTimeBudget().testMs);
  if (!baseURL) throw new Error('Production baseURL is required');
  const result = await runLastStandJourney({ baseURL, chromium, retiredCampaignRecord,
    entrypoint: process.env['LAST_STAND_ENTRYPOINT'] ?? 'maintained-playwright',
    profileName: process.env['LAST_STAND_QUALIFICATION_PROFILE'] ?? 'windows-player' });
  await testInfo.attach('Last Stand source-bound result', { path: result.resultPath, contentType: 'application/json' });
  await testInfo.attach('Last Stand observed lifecycle', { body: Buffer.from(JSON.stringify(result.report.lifecycle, null, 2)), contentType: 'application/json' });
});
