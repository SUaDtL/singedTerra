"""The authored Web entry keeps a usable way back from Last Stand."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile
import unittest


TOOLS = Path(__file__).resolve().parent

# Retained event boundary from Unity 6000.3.24f1 export
# Web-20261005T124312Z-041935.framework.js, raw SHA-256
# 7ca052c4ea72a2f18abf328a3787e7143488921f54fa7da92a5c7b71a337131a.
# The native return below is controlled. This is not a Unity/browser journey.
COMPILED_KEY_CALLBACK = r'''function registerKeyEventCallback(target,userData,useCapture,callbackfunc,eventTypeId,eventTypeString,targetThread){if(!JSEvents.keyEvent)JSEvents.keyEvent=_malloc(176);var keyEventHandlerFunc=function(e){var keyEventData=JSEvents.keyEvent;keyEventData=keyEventData;HEAPF64[keyEventData>>3]=e.timeStamp;var idx=keyEventData>>2;HEAP32[idx+2]=e.location;HEAP32[idx+3]=e.ctrlKey;HEAP32[idx+4]=e.shiftKey;HEAP32[idx+5]=e.altKey;HEAP32[idx+6]=e.metaKey;HEAP32[idx+7]=e.repeat;HEAP32[idx+8]=e.charCode;HEAP32[idx+9]=e.keyCode;HEAP32[idx+10]=e.which;stringToUTF8(e.key||"",keyEventData+44,32);stringToUTF8(e.code||"",keyEventData+76,32);stringToUTF8(e.char||"",keyEventData+108,32);stringToUTF8(e.locale||"",keyEventData+140,32);if(((a1,a2,a3)=>dynCall_iiii.apply(null,[callbackfunc,a1,a2,a3]))(eventTypeId,keyEventData,userData))e.preventDefault()};var eventHandler={target:findEventTarget(target),allowsDeferredCalls:true,eventTypeString:eventTypeString,callbackfunc:callbackfunc,handlerFunc:keyEventHandlerFunc,useCapture:useCapture};return JSEvents.registerOrRemoveHandler(eventHandler)}'''


class WebEntryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / 'campaign-unity'
        tools = self.root / 'Tools'
        tools.mkdir(parents=True)
        (self.root / 'Evidence').mkdir()
        shutil.copyfile(TOOLS / 'make_web_entry.py', tools / 'make_web_entry.py')
        shutil.copyfile(TOOLS / 'web-index-template.html', tools / 'web-index-template.html')

    def render(self, scene):
        build = self.root / 'Builds' / ('Web-' + scene)
        assets = build / 'Build'
        assets.mkdir(parents=True)
        (build / 'index.html').write_text('<html>Unity export</html>', encoding='utf-8')
        for suffix in ('loader.js', 'framework.js', 'data', 'wasm'):
            (assets / ('game.' + suffix)).write_bytes(b'fixture')
        subprocess.run([sys.executable, str(self.root / 'Tools/make_web_entry.py'),
                        str(build), '--scene', scene], check=True, capture_output=True)
        return (build / 'index.html').read_text(encoding='utf-8')

    def test_last_stand_return_stays_visible_above_loading_and_error(self):
        html = self.render('last-stand')
        self.assertIn('href="../#campaigns/last-stand"', html)
        self.assertIn('Return to Campaigns', html)
        self.assertIn('id="last-stand-nav"', html)
        self.assertIn('height:calc(100vh - var(--nav-height))', html)
        self.assertIn('top:var(--nav-height)', html)
        self.assertIn('id="loading"', html)
        self.assertIn('id="error"', html)
        self.assertIn('id="retry"', html)
        self.assertIn("typeof createUnityInstance !== 'function'", html)
        self.assertIn('Promise.resolve()', html)
        self.assertNotIn('e.textContent=String(message)', html)
        self.assertLess(html.index('id="last-stand-return"'), html.index('id="unity-canvas"'))

    def test_other_scene_has_no_last_stand_return(self):
        for scene in ('field', 'review', 'gallery'):
            with self.subTest(scene=scene):
                self.assertNotIn('last-stand-return', self.render(scene))

    def test_last_stand_return_discloses_paused_wave_checkpoint_resume(self):
        html = self.render('last-stand')
        self.assertIn('Return or reload safely: Resume Run restores your last saved wave, paused.', html)
        self.assertIn('Only progress since that checkpoint is replayed. Saves and earned rewards stay in this browser.', html)
        self.assertIn('aria-describedby="last-stand-loss"', html)
        self.assertIn('id="last-stand-loss"', html)
        self.assertLess(html.index('id="last-stand-loss"'), html.index('id="unity-canvas"'))
        self.assertNotIn('window.confirm', html)
        self.assertNotIn('localStorage', html)

    def test_generated_wrapper_preserves_native_tab_traversal(self):
        """Generated owner keeps browser defaults despite a handled native return.

        jsdom exercises event dispatch, not native traversal, rendering or link
        activation. The unchanged real-player journey remains the browser oracle.
        """
        payload = {'html': {scene: self.render(scene) for scene in
                           ('last-stand', 'field', 'review', 'gallery')},
                   'compiled_callback': COMPILED_KEY_CALLBACK}
        script = r'''
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const payload = JSON.parse(process.argv[1]);
(async () => {
  let boundaries = 0;
  for (const [scene, html] of Object.entries(payload.html)) {
    for (const targetName of ['window', 'document', 'canvas']) {
      for (const capture of [false, true]) {
        const dom = new JSDOM(html, {runScripts: 'outside-only', url: 'http://localhost/last-stand/'});
        try {
          const {window} = dom, document = window.document;
          const canvas = document.querySelector('#unity-canvas');
          const target = {window, document, canvas}[targetName];
          let nativeCalls = 0, pointerCalls = 0;
          window.console.info = () => {};
          window.HEAPF64 = new Float64Array(32);
          window.HEAP32 = new Int32Array(64);
          window._malloc = () => 8;
          window.stringToUTF8 = () => {};
          window.findEventTarget = value => value;
          window.dynCall_iiii = () => {nativeCalls++; return 1;};
          window.JSEvents = {registerOrRemoveHandler: handler => {
            handler.target.addEventListener(handler.eventTypeString, handler.handlerFunc, handler.useCapture);
            return 0;
          }};
          window.eval(payload.compiled_callback);
          window.createUnityInstance = () => {
            for (const type of ['keydown', 'keyup', 'keypress']) {
              window.registerKeyEventCallback(target, 0, capture, 1, 2, type, 0);
            }
            document.addEventListener('pointerdown', () => pointerCalls++);
            return Promise.resolve({});
          };
          window.eval(document.querySelector('script:not([src])').textContent);
          await new Promise(resolve => setImmediate(resolve));
          assert.equal(document.activeElement, canvas, 'Generated ready bootstrap focuses the canvas');
          const key = (element, type, value, modifiers = {}) => {
            const event = new window.KeyboardEvent(type, {key: value, bubbles: true, cancelable: true, ...modifiers});
            element.dispatchEvent(event);
            return event;
          };
          for (const type of ['keydown', 'keyup', 'keypress']) {
            for (const shiftKey of [false, true]) {
              const before = nativeCalls, event = key(canvas, type, 'Tab', {shiftKey});
              assert.equal(event.defaultPrevented, scene !== 'last-stand',
                `${scene}/${targetName}/${capture}/${type}: native ${shiftKey ? 'Shift+Tab' : 'Tab'} browser default`);
              assert.equal(nativeCalls - before, scene === 'last-stand' ? 0 : 1);
            }
            for (const [value, modifiers] of [['Enter', {}], ['a', {}], ['Tab', {ctrlKey: true}],
                                             ['Tab', {altKey: true}], ['Tab', {metaKey: true}]]) {
              const before = nativeCalls, event = key(canvas, type, value, modifiers);
              assert.equal(event.defaultPrevented, true, 'Canvas non-navigation input still reaches Unity');
              assert.equal(nativeCalls - before, 1);
            }
          }
          if (scene === 'last-stand') {
            for (const id of ['last-stand-return', 'retry']) {
              const control = document.getElementById(id);
              for (const type of ['keydown', 'keyup', 'keypress']) {
                for (const value of ['Tab', 'Enter', ' ']) {
                  const before = nativeCalls, event = key(control, type, value);
                  assert.equal(event.defaultPrevented, false, `${id}/${type}/${value}: wrapper control browser default`);
                  assert.equal(nativeCalls, before, 'Outer controls do not feed Unity keyboard input');
                }
              }
            }
          }
          canvas.dispatchEvent(new window.Event('pointerdown', {bubbles: true}));
          assert.equal(pointerCalls, 1, 'Canvas pointer input is unaffected');
          boundaries++;
        } finally {dom.window.close();}
      }
    }
  }
  console.log(`Controlled native-return event-boundary proof: ${boundaries} generated scene/listener combinations`);
})().catch(error => {console.error(error); process.exitCode = 1;});
'''
        result = subprocess.run(['node', '-e', script, json.dumps(payload)],
                                cwd=TOOLS.parents[1], capture_output=True, text=True,
                                timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
