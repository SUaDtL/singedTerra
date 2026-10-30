// Normal-speed source-bound footage through visible player controls. No seeded saves.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {pathToFileURL} from 'node:url';
import { LAST_STAND_HELPER_INPUTS, admitJourneyBase, packagedRuntimeSnapshot, assertPackagedRuntimeParity,
  fetchBoundRuntime, assertServedBytes, readShopControlObservation, selectLastStandFitting,
  changeLastStandSetting, validateCompactCombatControls, assertWaveCheckpointEdition } from '../e2e/helpers/lastStandJourney.mjs';
import { tierJourneyControlGeometry } from '../e2e/helpers/lastStandTierJourney.mjs';

async function main() {
const {chromium}=await import('@playwright/test');
const baseline = process.argv.includes('--baseline');
const baselineReference = baseline ? process.argv[process.argv.indexOf('--baseline') + 1] : null;
const output = resolve(process.argv[2]);
assert.ok(process.argv[2] && !process.argv[2].startsWith('--'), 'Fresh evidence directory required');
const base = admitJourneyBase(process.env.E2E_LIVE_URL ?? 'http://127.0.0.1:4173/singedTerra/');
// A before-capture keeps its exported source receipt after implementation begins.
// It is explicitly historical; only the new candidate claims current-source parity.
for (const name of baseline ? [] : ['verify-last-stand-source.mjs', 'verify-last-stand.mjs'])
  execFileSync(process.execPath, [resolve('scripts/assets', name)], { stdio: 'pipe' });
const runtime = packagedRuntimeSnapshot();
const runnerInputs = () => Object.fromEntries(['scripts/last-stand-combat-feedback.mjs',
  'e2e/helpers/lastStandJourney.mjs', ...LAST_STAND_HELPER_INPUTS, 'e2e/helpers/lastStandTierJourney.mjs',
  'campaign-unity/Tools/contracts/last-stand-observation-v1.json','campaign-unity/Tools/contracts/last-stand-observation-v2.json',
  'campaign-unity/Tools/contracts/last-stand-observation-v3.json',
  'scripts/assets/verify-last-stand-source.mjs', 'scripts/assets/verify-last-stand.mjs'].map(path =>
  [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
if (baseline) {
  assert.ok(baselineReference, 'Historical capture requires its prior source-verified runtime record');
  const prior = JSON.parse(readFileSync(baselineReference, 'utf8'));
  assert.equal(prior.baseline, true);
  assertPackagedRuntimeParity(prior.runtime, runtime);
}
const manifest = JSON.parse(readFileSync('client/public/last-stand/asset-manifest.json', 'utf8'));
for (const [path, expected] of Object.entries({ ...manifest.files, 'index.html': manifest.wrapperSha256 }))
  assertServedBytes(await fetchBoundRuntime(base, path), expected);
mkdirSync(output, { recursive: false });
const report = { status: 'running', scope: 'actual headless Web player, normal-speed visual comparison; no native or human acceptance',
  baseline, sourceValidation: baseline ? 'historical export receipt and served-byte parity' : 'current source, export receipt and served-byte parity',
  baselineReference: baseline ? { path: baselineReference, sha256: createHash('sha256').update(readFileSync(baselineReference)).digest('hex') } : null,
  runtime, inputs: runnerInputs(), runnerSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'), runs: [] };
const persist = () => writeFileSync(join(output, 'result.json'), JSON.stringify(report, null, 2));
console.log('COMBAT_CAPTURE_RUNTIME_BOUND=' + output);
try {
for (const fitting of ['repair', 'launcher']) for (const effects of baseline ? ['full'] : ['full', 'reduced']) {
  const directory = join(output, fitting + '-' + effects); mkdirSync(directory);
  const run = { fitting, effects, status: 'running', states: [], encounters: [], actions: [], captures: [], errors: [] };
  report.runs.push(run); persist();
  const browser = await chromium.launch({ headless: true });
  let context, page, parseError, failure;
  try {
    context = await browser.newContext({ viewport: { width: 1366, height: 768 },
      recordVideo: { dir: directory, size: { width: 1366, height: 768 } },
      proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' } });
    page = await context.newPage(); page.setDefaultTimeout(10000);
    const layouts = [];
    page.on('pageerror', error => run.errors.push(String(error)));
    page.on('console', message => {
      const raw = message.text();
      if (message.type() === 'error') run.errors.push(raw);
      try {
        if (raw.startsWith('ST_LS_STATE ')) run.states.push(JSON.parse(raw.slice(12)));
        if (raw.startsWith('ST_ENC_STATE ')) run.encounters.push(JSON.parse(raw.slice(13)));
        if (raw.startsWith('ST_LS_HUD_LAYOUT ')) layouts.push(readShopControlObservation(raw));
      } catch (error) { parseError ??= error; }
    });
    const state = () => run.states.at(-1), encounter = () => run.encounters.at(-1);
    const until = async (predicate, seconds = 90) => {
      const deadline = Date.now() + seconds * 1000;
      while (Date.now() < deadline) {
        if (parseError) throw parseError;
        if (predicate()) return;
        await page.waitForTimeout(50);
      }
      throw new Error('Expected player observation absent: ' + JSON.stringify(state()));
    };
    const controls=layout=>[...layout.controls,...layout.shopControls,...layout.settingsControls];
    const click = async name => {
      const pixels=await page.locator('#unity-canvas').evaluate(c=>({width:c.width,height:c.height}));
      await until(()=>Math.abs(layouts.at(-1)?.width-pixels.width)<1&&Math.abs(layouts.at(-1)?.height-pixels.height)<1,10);
      await until(() => layouts.at(-1)&&controls(layouts.at(-1)).some(c => c.name === name && c.active && c.interactable), 10);
      const layout = layouts.at(-1), canvas = await page.locator('#unity-canvas').boundingBox();
      const item = controls(layout).find(c => c.name === name && c.active && c.interactable);
      assert.ok(tierJourneyControlGeometry(layout, canvas).find(c => c.name === name)?.full, 'Fully visible ' + name);
      const x = canvas.x + (item.x + item.width / 2) * canvas.width / layout.width;
      const y = canvas.y + (item.y + item.height / 2) * canvas.height / layout.height;
      run.actions.push({ name, label: item.label, tick: state()?.tick, x, y });
      await page.mouse.click(x, y, { delay: 100 });
    };
    const changeSetting=control=>changeLastStandSetting({control,click,currentLayout:()=>layouts.at(-1),currentState:state,
      readValue:()=>control==='SettingsMute'?state().muted:encounter().fullEffects,waitFor:predicate=>until(predicate,10)});
    await page.goto(new URL('last-stand/', base).href);
    await until(() => state()?.saveState === 'ready');
    assert.equal(state().level, 0); assert.equal(state().wallet, 0); assert.equal(state().selectedTier, 1);
    await selectLastStandFitting({fitting,click,currentLayout:()=>layouts.at(-1),currentState:state,
      waitFor:predicate=>until(predicate,10)});
    await click('Deploy'); await until(() => state()?.phase === 'battle');
    await until(() => encounter()?.fitting === fitting, 5);
    assert.equal(encounter().fitting, fitting, 'Actual deployed fitting matches the capture label');
    if (effects === 'reduced') { await changeSetting('DisplayEffects'); await until(() => encounter()?.fullEffects === false, 5); }
    const started = Date.now();
    for (const [label, tick] of [['early', 180], ['busy-muted', 1000]]) {
      if (label === 'busy-muted') {
        if(baseline)await click('ToggleMute');else await changeSetting('SettingsMute');
        await until(() => state()?.muted === true, 5);
      }
      await until(() => state()?.tick >= tick);
      assert.equal(state().phase, 'battle'); assert.equal(state().paused, false);
      assert.equal(encounter()?.fitting, fitting);
      assert.equal(encounter()?.fullEffects, effects === 'full');
      if(!baseline)validateCompactCombatControls(layouts.at(-1));
      const path = join(directory, label + '.png'); await page.screenshot({ path });
      run.captures.push({ label, path, state: state(), encounter: encounter(), elapsedMs: Date.now() - started });
    }
    assert.ok(Date.now() - started >= 45_000, 'Capture uses normal elapsed time');
    if (!baseline) {
      await click('SpeedRate'); await until(() => state()?.paused === true, 5);
      const paused = state().tick, model = { hull: state().hull, kills: state().kills, wallet: state().wallet };
      for (const [width, height] of [[1920, 1080], [1366, 768], [720, 640], [390, 844], [844, 390]]) {
        await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
        const pixels = await page.locator('#unity-canvas').evaluate(c => ({ width: c.width, height: c.height }));
        await until(() => Math.abs(layouts.at(-1)?.width - pixels.width) < 1 && Math.abs(layouts.at(-1)?.height - pixels.height) < 1, 8);
        const canvas = await page.locator('#unity-canvas').boundingBox();
        tierJourneyControlGeometry(layouts.at(-1), canvas);
        const original = encounter().fullEffects;
        await changeSetting('DisplayEffects'); await until(() => encounter().fullEffects !== original, 5);
        await changeSetting('DisplayEffects'); await until(() => encounter().fullEffects === original, 5);
        assert.equal(state().tick, paused); assert.equal(state().muted, true); assert.equal(state().paused, true);
        assert.deepEqual({ hull: state().hull, kills: state().kills, wallet: state().wallet }, model);
        validateCompactCombatControls(layouts.at(-1));
        const label = 'paused-controls-' + width + 'x' + height;
        const path = join(directory, label + '.png'); await page.screenshot({ path });
        run.captures.push({ label, path, viewport: { width, height }, state: state(), encounter: encounter() });
      }
    }
    await assertCombatCaptureSave({page,baseline,state});
    assert.deepEqual(run.errors, []);
  } catch (error) { failure = error; }
  finally {
    run.cleanupErrors = [];
    for (const [name, close] of [['context', async () => { if (context) await context.close(); }],
      ['browser', async () => browser.close()]]) {
      try { await close(); } catch (error) { run.cleanupErrors.push({ name, error: String(error) }); failure ??= error; }
    }
    failure ??= parseError;
    if (run.errors.length) failure ??= new Error('Browser errors: ' + run.errors.join('; '));
    try { if (page) run.video = await page.video().path(); } catch (error) { failure ??= error; }
    run.status = failure ? 'failed' : 'pass';
    if (failure) run.error = String(failure);
    persist();
  }
  if (failure) throw failure;
  console.log('COMBAT_CAPTURE_PASS=' + fitting + '-' + effects);
}
if (!baseline) for (const name of ['verify-last-stand-source.mjs', 'verify-last-stand.mjs'])
  execFileSync(process.execPath, [resolve('scripts/assets', name)], { stdio: 'pipe' });
assertPackagedRuntimeParity(runtime, packagedRuntimeSnapshot());
assert.deepEqual(runnerInputs(), report.inputs, 'Capture runner inputs changed during observation');
report.status = 'pass';
persist();
console.log('COMBAT_CAPTURE_EVIDENCE=' + output);
} catch (error) {
  report.status = 'failed'; report.error = String(error); persist(); throw error;
}

}

export async function assertCombatCaptureSave({page,baseline,state}) {
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('singedTerra.lastStand.prototype.v1')));
    if(baseline)assert.equal(saved.credits,0,'Archived pre-wave capture has no banked wave income');
    else {
      assert.equal(saved.version,6,'Current capture requires save version 6');
      assert.ok(saved.checkpoint?.encounter.completedWave>0,'Current capture completed a durable wave');
      assertWaveCheckpointEdition(saved.checkpoint);
      assert.ok(saved.credits>0,'Cleared waves bank income during the run');
      assert.equal(saved.credits,state().wallet,'Stored wave income matches live wallet');
    }
    assert.equal(saved.pendingDefeat, null);
    assert.ok(Object.values(saved.permanentLevels).every(level => level === 0));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
