// Execute the actual Unity jslib callbacks with a bounded document adapter.
// Run: node --test campaign-unity/Tools/last_stand_controls/fullscreen_browser.test.mjs
// This proves adapter notifications, not real browser permission behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../../Unity/Assets/Plugins/WebGL/LastStandBrowser.jslib', import.meta.url), 'utf8');
function fixture({ on = false, enabled = true, reject = false, synchronous = false } = {}) {
  const messages = [], calls = [], listeners = new Map(), library = {}, module = {};
  const element = {};
  const operation = name => {
    calls.push(name);
    if (synchronous) throw new Error('denied by test host');
    return reject ? Promise.reject(new Error('denied by test host')) : Promise.resolve();
  };
  const document = {
    fullscreenEnabled: enabled, fullscreenElement: on ? element : null,
    documentElement: { requestFullscreen: () => operation('enter') },
    exitFullscreen: () => operation('exit'),
    addEventListener(name, callback) {
      listeners.set(name, [...(listeners.get(name) || []), callback]);
    },
  };
  vm.runInNewContext(source, {
    LibraryManager: { library }, mergeInto: (target, values) => Object.assign(target, values),
    Module: module, document, window: { location: { assign() {} } },
    SendMessage(owner, method, state) {
      assert.equal(owner, 'LastStandBrowserBridge'); assert.equal(method, 'FullscreenChanged'); messages.push(state);
    },
  });
  return { library, document, messages, calls, element, listeners,
    dispatch: name => (listeners.get(name) || []).forEach(callback => callback()) };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('rejected exit reports the still-present fullscreen element', async () => {
  const f = fixture({ on: true, reject: true }); f.library.LastStandBrowser_Initialize();
  f.library.LastStandBrowser_Fullscreen(); await flush();
  assert.deepEqual(f.calls, ['exit']); assert.deepEqual(f.messages, ['on', 'refused-on']);
});
test('rejected entry reports the absent fullscreen element', async () => {
  const f = fixture({ reject: true }); f.library.LastStandBrowser_Initialize();
  f.library.LastStandBrowser_Fullscreen(); await flush();
  assert.deepEqual(f.calls, ['enter']); assert.deepEqual(f.messages, ['off', 'refused-off']);
});
test('synchronous refusal reports current state for either action', () => {
  for (const on of [false, true]) {
    const f = fixture({ on, synchronous: true }); f.library.LastStandBrowser_Fullscreen();
    assert.deepEqual(f.messages, [on ? 'refused-on' : 'refused-off']);
  }
});
test('fullscreenerror event reads actual document state instead of prior report', () => {
  const f = fixture({ on: true }); f.library.LastStandBrowser_Initialize();
  f.document.fullscreenElement = null; f.dispatch('fullscreenerror');
  f.document.fullscreenElement = f.element; f.dispatch('fullscreenerror');
  assert.deepEqual(f.messages, ['on', 'refused-off', 'refused-on']);
});
test('successful request waits for actual change event', async () => {
  const f = fixture(); f.library.LastStandBrowser_Initialize(); f.library.LastStandBrowser_Fullscreen(); await flush();
  assert.deepEqual(f.messages, ['off']);
  f.document.fullscreenElement = f.element; f.dispatch('fullscreenchange');
  assert.deepEqual(f.messages, ['off', 'on']);
});
test('unsupported host refuses request and initialization does not duplicate listeners', () => {
  const f = fixture({ enabled: false }); f.library.LastStandBrowser_Initialize(); f.library.LastStandBrowser_Initialize();
  f.library.LastStandBrowser_Fullscreen();
  assert.deepEqual(f.messages, ['unavailable', 'unavailable']); assert.deepEqual(f.calls, []);
  assert.equal(f.listeners.get('fullscreenerror').length, 1); assert.equal(f.listeners.get('fullscreenchange').length, 1);
});
