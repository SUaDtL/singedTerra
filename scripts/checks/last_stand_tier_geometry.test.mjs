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
