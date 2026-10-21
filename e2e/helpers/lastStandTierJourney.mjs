import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { admitJourneyBase, packagedRuntimeSnapshot, assertPackagedRuntimeParity,
  fetchBoundRuntime, assertServedBytes, readShopControlObservation } from './lastStandJourney.mjs';

// Ordinary input and passive observations only. Never seed a wallet, a record,
// an unlock, the simulation clock or a gameplay callback.
export async function runLastStandTierJourney({ page, baseURL, testInfo }) {
  const base = admitJourneyBase(baseURL);
  for (const name of ['verify-last-stand-source.mjs', 'verify-last-stand.mjs'])
    execFileSync(process.execPath, [resolve('scripts/assets', name)], { encoding: 'utf8' });
  const before = packagedRuntimeSnapshot();
  const manifest = JSON.parse(readFileSync(resolve('client/public/last-stand/asset-manifest.json'), 'utf8'));
  for (const [path, expected] of Object.entries({ ...manifest.files, 'index.html': manifest.wrapperSha256 }))
    assertServedBytes(await fetchBoundRuntime(base, path), expected);
  const states = [], layouts = [], errors = [], shots = [];
  const inputHashes = () => Object.fromEntries(['e2e/helpers/lastStandTierJourney.mjs', 'e2e/last-stand-playable-loop.spec.ts']
    .map(path => [path, createHash('sha256').update(readFileSync(resolve(path))).digest('hex')]));
  let load = 0, observerError;
  const report = { normalSpeed: true, seeded: false, host: process.platform,
    scope: 'functional browser journey; no native audio or owner visual acceptance claim',
    states, layouts, screenshots: [], actions: [], storage: [], profiles: [], errors, inputs: inputHashes(), manifest: before };
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    const raw = message.text();
    if (message.type() === 'error') errors.push(raw);
    try {
      if (raw.startsWith('ST_LS_STATE ')) states.push({ ...JSON.parse(raw.slice(12)), load, observedAt: Date.now() });
      if (raw.startsWith('ST_LS_HUD_LAYOUT ')) layouts.push({ ...readShopControlObservation(raw), load });
    } catch (error) { observerError ??= error; }
  });
  const current = rows => rows.filter(row => row.load === load).at(-1);
  const until = async (predicate, seconds = 110) => {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
      if (observerError) throw observerError;
      if (predicate()) return;
      await page.waitForTimeout(50);
    }
    throw new Error('Tier journey expected runtime state absent: ' + JSON.stringify(current(states)));
  };
  const stored = async label => {
    const raw = await page.evaluate(() => localStorage.getItem('singedTerra.lastStand.prototype.v1'));
    const data = raw === null ? null : JSON.parse(raw);
    report.storage.push({ label, raw, data, load }); return data;
  };
  const geometry = async () => {
    // Scene readiness precedes the browser's first Canvas resize after reload.
    // Admit only a current backing-pixel report, as the resize matrix does.
    const deadline = Date.now() + 8000;
    let layout, pixels;
    do {
      pixels = await page.locator('#unity-canvas').evaluate(c => ({ width: c.width, height: c.height }));
      layout = current(layouts);
      if (layout && Math.abs(layout.width - pixels.width) < 1 && Math.abs(layout.height - pixels.height) < 1) break;
      await page.waitForTimeout(50);
    } while (Date.now() < deadline);
    assert.ok(layout && Math.abs(layout.width - pixels.width) < 1 && Math.abs(layout.height - pixels.height) < 1,
      'Current Canvas backing dimensions must match the observed layout');
    const canvas = await page.locator('#unity-canvas').boundingBox();
    assert.ok(layout && canvas);
    const controls = [...layout.controls, ...layout.shopControls].filter(item => item.active);
    for (const item of controls) {
      assert.ok(item.width * canvas.width / layout.width >= 43.99 && item.height * canvas.height / layout.height >= 43.99,
        '44 CSS pixel target: ' + item.name);
      assert.ok(item.x >= -.5 && item.y >= -.5 && item.x + item.width <= layout.width + .5 && item.y + item.height <= layout.height + .5);
    }
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      assert.ok(!(a.x + a.width > b.x + .5 && b.x + b.width > a.x + .5 && a.y + a.height > b.y + .5 && b.y + b.height > a.y + .5),
        'Targets overlap: ' + a.name + '/' + b.name);
    }
    return { layout, canvas };
  };
  const click = async name => {
    const { layout, canvas } = await geometry();
    const item = [...layout.controls, ...layout.shopControls].find(item => item.name === name && item.active && item.interactable);
    assert.ok(item, 'Current operable control: ' + name);
    const x = canvas.x + (item.x + item.width / 2) * canvas.width / layout.width;
    const y = canvas.y + (item.y + item.height / 2) * canvas.height / layout.height;
    report.actions.push({ name, x, y, load, at: Date.now() });
    await page.mouse.click(x, y, { delay: 100 });
  };
  const capture = async label => {
    const path = testInfo.outputPath(label + '.png'); await page.screenshot({ path });
    shots.push(path); report.screenshots.push({ label, viewport: page.viewportSize(), state: current(states) });
  };
  const matrix = async label => {
    for (const [width, height] of [[1920, 1080], [1366, 768], [720, 640], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
      const pixels = await page.locator('#unity-canvas').evaluate(c => ({ width: c.width, height: c.height }));
      await until(() => Math.abs(current(layouts)?.width - pixels.width) < 1 && Math.abs(current(layouts)?.height - pixels.height) < 1, 8);
      await geometry(); await capture(`${label}-${width}x${height}`);
      report.profiles.push({ label, width, height });
    }
    await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(300);
  };
  const reload = async () => { load++; await page.reload(); await until(() => current(states)?.saveState === 'ready'); };
  try {
    await page.setViewportSize({ width: 1366, height: 768 });
    load++; await page.goto(new URL('last-stand/', base).href);
    await until(() => current(states)?.saveState === 'ready');
    assert.equal(current(states).selectedTier, 1); assert.equal(current(states).tierTwoUnlocked, false);
    const initial = await stored('initial');
    assert.equal(initial.credits, 0); assert.equal(initial.version, 3);
    assert.ok(Object.values(initial.permanentLevels).every(level => level === 0));
    assert.deepEqual(initial.tierRecords['tier-goals-v1'], { bestTicks1: 0, bestKills1: 0, bestTicks2: 0, bestKills2: 0, tierTwoUnlocked: false });
    assert.equal(current(layouts).controls.find(item => item.name === 'ToggleTier').interactable, false);
    await matrix('garage'); await click('Deploy');
    await until(() => current(states)?.activeTier === 1 && current(states)?.phase === 'battle');
    await matrix('combat');
    await until(() => current(states)?.tick >= 1100);
    await click('Pause'); await until(() => current(states)?.paused);
    const pausedTick = current(states).tick;
    await page.waitForTimeout(1200); assert.equal(current(states).tick, pausedTick);
    await click('Pause'); await until(() => !current(states)?.paused);
    await until(() => current(states)?.goalMet);
    assert.equal(current(states).phase, 'battle'); assert.equal(current(states).tierTwoUnlocked, false);
    const live = await stored('goal-live'); assert.equal(live.tierRecords['tier-goals-v1'].bestTicks1, 0);
    await capture('goal-met-live');
    await until(() => current(states)?.phase === 'result');
    const terminal = await stored('terminal');
    assert.equal(terminal.pendingDefeat.tier, 1); assert.equal(terminal.pendingDefeat.reward, 1);
    assert.ok(terminal.pendingDefeat.elapsedTicks >= 1200 && terminal.tierRecords['tier-goals-v1'].tierTwoUnlocked);
    assert.equal(terminal.credits, 0);
    await matrix('saved-result');
    await reload(); assert.deepEqual(await stored('pending-reload'), terminal);
    await click('Claim'); await until(() => current(states)?.phase === 'workshop' && current(states)?.wallet === 1);
    await click('Purchase'); await until(() => current(states)?.level === 1 && current(states)?.wallet === 0);
    await reload();
    assert.equal(current(states).tierTwoUnlocked, true); assert.equal(current(states).level, 1);
    await click('ToggleTier'); await until(() => current(states)?.selectedTier === 2);
    await capture('tier-two-selected'); await click('Deploy');
    await until(() => current(states)?.activeTier === 2 && current(states)?.tick >= 20);
    assert.equal(current(states).tierTwoUnlocked, true);
    await capture('tier-two-deployed');
    await reload();
    const interrupted = await stored('unfinished-tier-two');
    assert.equal(interrupted.tierRecords['tier-goals-v1'].bestTicks2, 0);
    assert.equal(interrupted.credits, 0); assert.equal(interrupted.pendingDefeat, null);
    await page.getByRole('link', { name: 'Return to Campaigns', exact: true }).click();
    await page.locator('[data-command-item="last-stand"][aria-current="true"]').waitFor({ state: 'visible' });
    assert.equal(errors.length, 0, errors.join('\n'));
    assertPackagedRuntimeParity(before, packagedRuntimeSnapshot());
    assert.deepEqual(inputHashes(), report.inputs, 'Browser journey inputs changed while running');
    report.status = 'pass';
  } catch (error) { report.status = 'failed'; report.error = String(error); throw error; }
  finally {
    const path = testInfo.outputPath('tier-observations.json');
    writeFileSync(path, JSON.stringify(report, null, 2));
    await testInfo.attach('Tier progression observations', { path, contentType: 'application/json' });
    for (const path of shots) await testInfo.attach('Tier progression screenshot', { path, contentType: 'image/png' });
  }
}
