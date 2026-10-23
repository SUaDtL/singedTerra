// Source-bound normal-speed observations through real player input. No seeded saves.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';
import { runLastStandWaveJourney } from '../e2e/helpers/lastStandWaveJourney.mjs';

const baseURL = process.env.E2E_LIVE_URL ?? 'http://127.0.0.1:4173/singedTerra/';
const output = resolve(process.argv[2] ?? 'campaign-unity/Evidence/first-session-polish/first-session-' + new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(output, { recursive: false }); // Refuse overwrite of a previous observation.
const observations = [];
for (const fitting of ['repair', 'launcher']) {
  const directory = join(output, fitting); mkdirSync(directory);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' } });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const attachments = [];
    const evidenceSink = {
      outputPath: name => { assert.equal(name, name.split(/[\\/]/).at(-1)); return join(directory, name); },
      attach: async (name, value) => { attachments.push({ name, path: value.path, contentType: value.contentType }); },
    };
    await runLastStandWaveJourney({ page, baseURL, testInfo: evidenceSink, fitting });
    observations.push({ fitting, status: 'pass', attachments });
    console.log('FIRST_SESSION_PASS=' + fitting);
  } catch (error) {
    observations.push({ fitting, status: 'failed', error: String(error) }); throw error;
  } finally {
    await browser.close();
    writeFileSync(join(output, 'result.json'), JSON.stringify({ scope: 'scripted functional observation; owner acceptance separate', observations }, null, 2));
  }
}
console.log('FIRST_SESSION_EVIDENCE=' + output);
