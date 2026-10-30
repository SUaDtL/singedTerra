import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { admitJourneyBase, packagedRuntimeSnapshot, assertPackagedRuntimeParity,
  fetchBoundRuntime, assertServedBytes, readShopControlObservation, selectLastStandFitting } from './lastStandJourney.mjs';

const inside = (a, b) => a.x >= b.x - .5 && a.y >= b.y - .5 &&
  a.x + a.width <= b.x + b.width + .5 && a.y + a.height <= b.y + b.height + .5;

// Active controls can be clipped by a genuine scroll viewport. Validate its
// measured bounds and full scroll reach before testing visible intersections.
export function tierJourneyControlGeometry(layout, canvas) {
  const screen = { x: 0, y: 0, width: layout.width, height: layout.height };
  const backgroundControls = [...layout.controls, ...layout.shopControls];
  const settingsControls = (layout.settingsControls ?? []).filter(item => item.active);
  const researchControls = (layout.researchControls ?? []).filter(item => item.active);
  const historyControls = (layout.historyControls ?? []).filter(item => item.active);
  const plannerControls = (layout.plannerControls ?? []).filter(item => item.active);
  const settingsOpen = settingsControls.length > 0;
  const researchOpen=researchControls.length>0,historyOpen=historyControls.length>0,plannerOpen=plannerControls.length>0;
  assert.ok(Number(settingsOpen)+Number(researchOpen)+Number(historyOpen)+Number(plannerOpen)<=1,'Exactly one progression/settings modal owns input');
  if (settingsOpen||researchOpen||historyOpen||plannerOpen) assert.ok(backgroundControls.every(item => !item.interactable),
    'Modal must disable every underlying control');
  const controls = settingsOpen ? settingsControls : researchOpen?researchControls:historyOpen?historyControls:plannerOpen?plannerControls:backgroundControls.filter(item => item.active);
  let graphics;
  const projected = controls.map(item => {
    assert.ok(item.width * canvas.width / layout.width >= 43.99 && item.height * canvas.height / layout.height >= 43.99,
      '44 CSS pixel target: ' + item.name);
    let clip = screen;
    const settingsContent = settingsOpen && !['SettingsClose','ChoicePrevious','ChoiceNext'].includes(item.name) && !/^SettingsTab[0-3]$/.test(item.name);
    const researchContent=researchOpen&&!['ResearchClose','ResearchFilter','ResearchBack'].includes(item.name);
    const historyContent=historyOpen&&Object.hasOwn(layout,'plannerControls')&&item.name!=='RunHistoryClose';
    const plannerContent=plannerOpen&&item.name!=='PlannerClose';
    if (settingsContent || researchContent || historyContent || plannerContent || item.name.startsWith('ShopCard_') && layout.maximumScrollOffset > 0) {
      assert.equal(layout.graphicsTruncated, false, 'Complete graphics required to qualify clipped controls');
      graphics ??= JSON.parse(layout.raw.slice('ST_LS_HUD_LAYOUT '.length)).graphics;
      const viewportName = settingsContent ? 'SettingsViewport' : researchContent?
        item.name.startsWith('ResearchProject-')?'ResearchListViewport':'ResearchDetailViewport':
        historyContent?'RunHistoryViewport':plannerContent?'PlannerViewport':'ShopViewport';
      // The shared chamfered chrome is an Image subclass; decorative frames
      // and text are not the control's hit surface or its clipping owner.
      const surface = g => ['Image','LastStandConsoleSurface'].includes(g.kind) && g.active;
      const viewports = graphics.filter(g => g.path.endsWith('/' + viewportName) && surface(g));
      const matches = graphics.filter(g => g.path.endsWith('/' + item.name) && surface(g));
      assert.equal(viewports.length,1,'One actual scroll viewport required');
      assert.equal(matches.length,1,'One actual clipped control surface required');
      const viewport = viewports[0], graphic = matches[0];
      assert.ok(viewport?.hasClip && graphic?.hasClip, 'Measured scroll viewport and control required');
      clip = graphic.clip;
      assert.deepEqual(clip, viewport.clip, 'Control must use its actual scroll viewport');
      const contentName=viewportName.replace(/Viewport$/,'Content');
      assert.ok(graphic.path.startsWith(viewport.path + '/'+contentName+'/'),
        'Clipped control belongs to its actual scroll content');
      assert.ok(inside(clip, screen) && clip.width > 0 && clip.height > 0, 'Clip lies inside the Canvas');
      for (const key of ['x', 'y', 'width', 'height'])
        assert.ok(Math.abs(item[key] - graphic[key]) < .5, 'Control and graphic bounds agree: ' + item.name);
      const scrollOffset = settingsContent ? layout.settingsScrollOffset : researchContent?layout.researchScrollOffset:
        historyContent?layout.historyScrollOffset:plannerContent?layout.plannerScrollOffset:layout.scrollOffset;
      const maximumScrollOffset = settingsContent ? layout.settingsMaximumScrollOffset : researchContent?layout.researchMaximumScrollOffset:
        historyContent?layout.historyMaximumScrollOffset:plannerContent?layout.plannerMaximumScrollOffset:layout.maximumScrollOffset;
      assert.ok(Number.isFinite(scrollOffset) && Number.isFinite(maximumScrollOffset) && maximumScrollOffset >= 0 &&
        scrollOffset >= 0 && scrollOffset <= maximumScrollOffset + .5, 'Finite bounded actual scroll range');
      assert.ok(item.x >= clip.x - .5 && item.x + item.width <= clip.x + clip.width + .5 && item.height <= clip.height + .5,
        'Complete control target must fit the scroll viewport');
      // Layout's scroll offsets are CSS units; emitted rectangles are backing pixels.
      const scale = layout.height / canvas.height;
      const offset = scrollOffset * scale, maximum = maximumScrollOffset * scale;
      // The Lab has independent list/detail scroll owners but reports the
      // selected pane's offset. Each actual target still requires measured
      // clipping here, and the browser journey proves reach with wheel input.
      if(!researchContent)assert.ok(item.y + offset >= clip.y - .5 &&
        item.y + offset - maximum + item.height <= clip.y + clip.height + .5,
        'Complete control target must be reachable in the real scroll range');
    } else assert.ok(inside(item, screen), 'Control outside Canvas: ' + item.name);
    const x = Math.max(item.x, clip.x), y = Math.max(item.y, clip.y);
    return { name: item.name, full: inside(item, clip), clip, x, y,
      width: Math.max(0, Math.min(item.x + item.width, clip.x + clip.width) - x),
      height: Math.max(0, Math.min(item.y + item.height, clip.y + clip.height) - y) };
  });
  const visible = projected.filter(item => item.width > 0 && item.height > 0);
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    const a = visible[i], b = visible[j];
    assert.ok(!(a.x + a.width > b.x + .5 && b.x + b.width > a.x + .5 && a.y + a.height > b.y + .5 && b.y + b.height > a.y + .5),
      'Visible targets overlap: ' + a.name + '/' + b.name);
  }
  return projected;
}

// Ordinary input and passive observations only. Never seed a wallet, a record,
// an unlock, the simulation clock or a gameplay callback.
export async function runLastStandTierJourney({ page, baseURL, testInfo, fitting = 'repair', firstSession = false }) {
  assert.ok(['repair', 'launcher'].includes(fitting), 'Known player fitting required');
  const base = admitJourneyBase(baseURL);
  for (const name of ['verify-last-stand-source.mjs', 'verify-last-stand.mjs'])
    execFileSync(process.execPath, [resolve('scripts/assets', name)], { encoding: 'utf8' });
  const before = packagedRuntimeSnapshot();
  const manifest = JSON.parse(readFileSync(resolve('client/public/last-stand/asset-manifest.json'), 'utf8'));
  for (const [path, expected] of Object.entries({ ...manifest.files, 'index.html': manifest.wrapperSha256 }))
    assertServedBytes(await fetchBoundRuntime(base, path), expected);
  const states = [], layouts = [], errors = [], shots = [];
  const inputHashes = () => Object.fromEntries(['e2e/helpers/lastStandTierJourney.mjs', 'e2e/last-stand-playable-loop.spec.ts',
    ...(firstSession ? ['scripts/last-stand-first-session.mjs'] : [])]
    .map(path => [path, createHash('sha256').update(readFileSync(resolve(path))).digest('hex')]));
  let load = 0, observerError;
  const report = { normalSpeed: true, seeded: false, host: process.platform, fitting, firstSession,
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
    return { layout, canvas, projected: tierJourneyControlGeometry(layout, canvas) };
  };
  const click = async name => {
    const { layout, canvas, projected } = await geometry();
    const item = [...layout.controls, ...layout.shopControls, ...layout.settingsControls].find(item => item.name === name && item.active && item.interactable);
    assert.ok(item, 'Current operable control: ' + name);
    assert.ok(projected.find(item => item.name === name)?.full, 'Click target must be fully revealed: ' + name);
    const x = canvas.x + (item.x + item.width / 2) * canvas.width / layout.width;
    const y = canvas.y + (item.y + item.height / 2) * canvas.height / layout.height;
    report.actions.push({ name, x, y, load, at: Date.now() });
    await page.mouse.click(x, y, { delay: 100 });
  };
  const capture = async label => {
    const path = testInfo.outputPath(label + '.png'); await page.screenshot({ path });
    shots.push(path); report.screenshots.push({ label, viewport: page.viewportSize(), state: current(states) });
  };
  const selectFitting = () => selectLastStandFitting({fitting,click,currentLayout:()=>current(layouts),
    currentState:()=>current(states),waitFor:predicate=>until(predicate,8)});
  const captureShop = async label => {
    await click('ShopEntry');
    await until(() => current(layouts)?.shopControls.some(item => item.name === 'ShopClose' && item.active), 8);
    for (const category of ['Attack', 'Defense', 'Utility']) {
      await click('ShopTab' + category); await page.waitForTimeout(250);
      await geometry(); await capture(label + '-shop-' + category.toLowerCase());
      if (category === 'Utility') await matrix(label + '-shop-utility');
    }
    await click('ShopClose');
  };
  const matrix = async label => {
    for (const [width, height] of [[1920, 1080], [1366, 768], [720, 640], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
      const pixels = await page.locator('#unity-canvas').evaluate(c => ({ width: c.width, height: c.height }));
      await until(() => Math.abs(current(layouts)?.width - pixels.width) < 1 && Math.abs(current(layouts)?.height - pixels.height) < 1, 8);
      await geometry(); await capture(`${label}-${width}x${height}`);
      if (label.includes('-shop-') && current(layouts).maximumScrollOffset > 0) {
        const names = current(layouts).shopControls.filter(item => item.active && item.name.startsWith('ShopCard_')).map(item => item.name);
        for (const name of names) {
          for (let attempt = 0; attempt < 5; attempt++) {
            const { layout, canvas, projected } = await geometry();
            const target = projected.find(item => item.name === name);
            if (target.full) break;
            const item = layout.shopControls.find(item => item.name === name), clip = target.clip;
            const sign = item.y < clip.y ? -1 : 1;
            const x = canvas.x + (clip.x + clip.width / 2) * canvas.width / layout.width;
            const y = canvas.y + (clip.y + (sign > 0 ? clip.height - 8 : 8)) * canvas.height / layout.height;
            const distance = Math.min(80, clip.height - 16) * canvas.height / layout.height;
            await page.mouse.move(x, y); await page.mouse.down();
            await page.mouse.move(x, y - sign * distance, { steps: 8 }); await page.mouse.up();
            await until(() => Math.abs(current(layouts).scrollOffset - layout.scrollOffset) > .5, 5);
            report.actions.push({ name: 'scroll-to-' + name, load, from: layout.scrollOffset, to: current(layouts).scrollOffset });
          }
          const { projected } = await geometry();
          assert.ok(projected.find(item => item.name === name)?.full, 'Actual scrolling must reveal the complete Buy: ' + name);
          await capture(`${label}-${width}x${height}-${name}`);
        }
      }
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
    assert.equal(current(layouts).controls.find(item => item.name === 'ToggleTier').active, false);
    assert.equal(current(layouts).controls.find(item => item.name === 'TierNext').interactable, true);
    const initialEnvironment=current(states).environmentId;
    await click('TierNext');await until(()=>current(states)?.garageTierId==='2',8);
    assert.equal(current(states).garageTierUnlocked,false,'The first locked tier is preview-only');
    assert.equal(current(states).lockedTierPreview,true);assert.equal(current(states).menu,'');
    assert.equal(current(states).selectedTier,1);assert.equal(current(states).environmentId,'iron-perimeter');
    assert.equal(current(layouts).controls.find(item=>item.name==='TierNext').interactable,false,'No navigation beyond the first locked tier');
    assert.equal(current(layouts).controls.find(item=>item.name==='Deploy').interactable,false);
    assert.deepEqual(await stored('locked-preview'),initial,'Locked environment preview preserves the exact gameplay save');
    await capture('first-locked-tier-preview');
    await click('TierPrevious');await until(()=>current(states)?.garageTierId==='1',8);
    assert.equal(current(states).lockedTierPreview,false);assert.equal(current(states).menu,'');
    assert.equal(current(states).environmentId,initialEnvironment,'Previous restores the committed environment');
    await selectFitting();
    await matrix('garage');
    if (firstSession) await captureShop('permanent');
    await click('Deploy');
    await until(() => current(states)?.activeTier === 1 && current(states)?.phase === 'battle');
    await matrix('combat');
    await until(() => current(states)?.tick >= 1100);
    await click('SpeedRate'); await until(() => current(states)?.paused);
    const pausedTick = current(states).tick;
    await page.waitForTimeout(1200); assert.equal(current(states).tick, pausedTick);
    if (firstSession) {
      await captureShop('temporary');
      assert.equal(current(states).tick, pausedTick, 'Shop observation preserves explicit Pause');
    }
    await click('SpeedRate'); await until(() => !current(states)?.paused);
    await until(() => current(states)?.goalMet);
    assert.equal(current(states).phase, 'battle'); assert.equal(current(states).tierTwoUnlocked, false);
    const live = await stored('goal-live'); assert.equal(live.tierRecords['tier-goals-v1'].bestTicks1, 0);
    await capture('goal-met-live');
    if (firstSession) await matrix('goal-met-live');
    await until(() => current(states)?.phase === 'result');
    const terminal = await stored('terminal');
    assert.equal(terminal.pendingDefeat.tier, 1); assert.equal(terminal.pendingDefeat.reward, 1);
    assert.ok(terminal.pendingDefeat.elapsedTicks >= 1200 && terminal.tierRecords['tier-goals-v1'].tierTwoUnlocked);
    assert.equal(terminal.credits, 0);
    await matrix('saved-result');
    await reload(); assert.deepEqual(await stored('pending-reload'), terminal);
    await click('Claim'); await until(() => current(states)?.phase === 'workshop' && current(states)?.wallet === 1);
    await click('ShopEntry');
    await until(()=>current(layouts)?.shopControls.some(item=>item.name==='ShopClose'&&item.active),8);
    if(!current(layouts).shopControls.some(item=>item.name==='ShopCard_cannonAttackBuy'&&item.active)){
      await click('ShopTabAttack');await until(()=>current(layouts)?.shopControls.some(item=>item.name==='ShopCard_cannonAttackBuy'&&item.active),8);
    }
    await click('ShopCard_cannonAttackBuy'); await until(() => current(states)?.level === 1 && current(states)?.wallet === 0);
    await click('ShopClose');await until(()=>!current(layouts)?.shopControls.some(item=>item.name==='ShopClose'&&item.active),8);
    await reload();
    assert.equal(current(states).tierTwoUnlocked, true); assert.equal(current(states).level, 1);
    await selectFitting();
    if (firstSession) {
      await capture('earned-upgrade-returning');
      await click('Deploy');
      await until(() => current(states)?.activeTier === 1 && current(states)?.tick >= 20);
      assert.equal(current(states).cannonDamage, 30, 'Earned first upgrade is active on the same tier');
      await capture('same-tier-stronger-redeploy');
      const beforeInterruption = await stored('same-tier-redeploy');
      await reload();
      assert.deepEqual(await stored('same-tier-interrupted'), beforeInterruption, 'Unfinished comparison run grants nothing');
      await selectFitting();
    }
    await click('TierNext'); await until(() => current(states)?.selectedTier === 2);
    assert.equal(current(states).garageTierId,'2');assert.equal(current(states).garageTierUnlocked,true);
    assert.equal(current(states).lockedTierPreview,false);assert.equal(current(states).environmentId,'iron-perimeter');
    assert.equal(current(states).menu,'');
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
