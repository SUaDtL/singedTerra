import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tierJourneyControlGeometry } from '../../e2e/helpers/lastStandTierJourney.mjs';

function sample() {
  const clip = { x: 11, y: 107, width: 300, height: 148 };
  const buy = { name: 'ShopCard_fieldRepairBuy', x: 165, y: 299, width: 138, height: 44, active: true };
  const layout = { width: 844, height: 266, scrollOffset: 0, maximumScrollOffset: 100,
    controls: [], shopControls: [buy], graphicsTruncated: false };
  const graphics = [{ path: 'ShopPanel/ShopViewport', active: true, hasClip: true, clip },
    { ...buy, path: 'ShopPanel/ShopViewport/ShopContent/' + buy.name, kind: 'Image', hasClip: true, clip }];
  const run = () => tierJourneyControlGeometry({ ...layout, raw: 'ST_LS_HUD_LAYOUT ' + JSON.stringify({ graphics }) }, { width: 844, height: 266 });
  return { layout, graphics, buy, run };
}

test('clipped Buy is reachable but not yet a complete click target', () => {
  const s = sample();
  assert.equal(s.run()[0].full, false);
  s.layout.scrollOffset = 100; s.buy.y -= 100; s.graphics[1].y -= 100;
  assert.equal(s.run()[0].full, true);
});
test('offscreen ordinary controls still fail', () => {
  const s = sample(); s.layout.shopControls = []; s.layout.controls = [{ ...s.buy, name: 'Deploy' }];
  assert.throws(s.run, /outside Canvas/);
});
test('CSS scroll offsets reveal backing-pixel controls at DPR 2', () => {
  const s = sample();
  s.layout.width *= 2; s.layout.height *= 2;
  for (const item of [s.buy, s.graphics[1], s.graphics[0].clip])
    for (const key of ['x', 'y', 'width', 'height']) item[key] *= 2;
  assert.equal(s.run()[0].full, false);
  s.layout.scrollOffset = 100; s.buy.y -= 200; s.graphics[1].y -= 200;
  assert.equal(s.run()[0].full, true);
});
test('DPR 2 still rejects an insufficient CSS scroll range', () => {
  const s = sample();
  s.layout.width *= 2; s.layout.height *= 2;
  for (const item of [s.buy, s.graphics[1], s.graphics[0].clip])
    for (const key of ['x', 'y', 'width', 'height']) item[key] *= 2;
  s.layout.maximumScrollOffset = 80;
  assert.throws(s.run, /reachable/);
});
test('a scroll range that cannot reveal the complete Buy fails', () => {
  const s = sample(); s.layout.maximumScrollOffset = 80;
  assert.throws(s.run, /reachable/);
});
test('truncated or mismatched clipping evidence fails', () => {
  const s = sample(); s.layout.graphicsTruncated = true;
  assert.throws(s.run, /Complete graphics/);
  s.layout.graphicsTruncated = false; s.graphics[1].clip = { ...s.graphics[1].clip, height: 160 };
  assert.throws(s.run, /actual shop viewport/);
});
test('small targets and overlapping visible targets still fail', () => {
  const s = sample(); s.buy.height = 30; s.graphics[1].height = 30;
  assert.throws(s.run, /44 CSS pixel/);
  const overlap = sample(); overlap.layout.controls = [
    { name: 'Deploy', x: 400, y: 10, width: 44, height: 44, active: true },
    { name: 'ShopClose', x: 410, y: 10, width: 44, height: 44, active: true }];
  assert.throws(overlap.run, /overlap/);
});

function settingsSample(dpr = 1) {
  const clip = { x: 28, y: 180, width: 334, height: 160 };
  const button = { name: 'SettingsBack', x: 36, y: 360, width: 318, height: 44, active: true, interactable: true };
  const background = { name: 'Menu', x: 36, y: 210, width: 68, height: 44, active: true, interactable: false };
  const layout = { width: 390 * dpr, height: 688 * dpr, controls: [background], shopControls: [], settingsControls: [button],
    scrollOffset: 0, maximumScrollOffset: 9999, settingsScrollOffset: 0, settingsMaximumScrollOffset: 80, graphicsTruncated: false };
  const graphics = [{ path: 'SettingsModal/SettingsPanel/SettingsViewport', active: true, hasClip: true, clip },
    { ...button, path: 'SettingsModal/SettingsPanel/SettingsViewport/SettingsContent/SettingsBack', kind: 'Image', hasClip: true, clip }];
  for (const rect of [clip, button, graphics[1], background])
    for (const key of ['x', 'y', 'width', 'height']) rect[key] *= dpr;
  const run = () => tierJourneyControlGeometry({ ...layout, raw: 'ST_LS_HUD_LAYOUT ' + JSON.stringify({ graphics }) }, { width: 390, height: 688 });
  return { layout, graphics, button, background, clip, run };
}
test('settings controls use their actual independent scroll range at both DPRs', () => {
  for (const dpr of [1, 2]) {
    const s = settingsSample(dpr);
    assert.equal(s.run()[0].full, false);
    s.layout.settingsScrollOffset = 80; s.button.y -= 80 * dpr; s.graphics[1].y -= 80 * dpr;
    assert.equal(s.run()[0].full, true);
    s.layout.settingsMaximumScrollOffset = 40; s.layout.settingsScrollOffset = 0;
    s.button.y += 80 * dpr; s.graphics[1].y += 80 * dpr;
    assert.throws(s.run, /reachable/, 'Unrelated shop range cannot qualify a settings control');
  }
});
test('modal settings cannot leave underlying controls interactive', () => {
  const s = settingsSample(); s.background.interactable = true;
  assert.throws(s.run, /disable every underlying/);
});
test('settings clipping requires matching real viewport, control and content evidence', () => {
  const truncated = settingsSample(); truncated.layout.graphicsTruncated = true;
  assert.throws(truncated.run, /Complete graphics/);
  const wrongMask = settingsSample(); wrongMask.graphics[1].clip = { ...wrongMask.clip, height: 200 };
  assert.throws(wrongMask.run, /actual settings viewport/);
  const wrongParent = settingsSample(); wrongParent.graphics[1].path = 'Unrelated/SettingsBack';
  assert.throws(wrongParent.run, /actual settings content/);
  const wrongRect = settingsSample(); wrongRect.graphics[1].width -= 10;
  assert.throws(wrongRect.run, /bounds agree/);
});
