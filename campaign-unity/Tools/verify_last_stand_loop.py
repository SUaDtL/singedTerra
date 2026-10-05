"""One source-bound Last Stand Web build and normal-speed real-pointer loop."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from array import array
import base64
import datetime
import json
import math
import statistics
import subprocess
import threading
import time
import unittest
import uuid

from input_observer import install as observe_input, validate as validate_input
from native_chrome import NativeChrome
from visual_review_checks import artifact_hashes, digest, pointer, require
from visual_review_motion import MotionCapture

ROOT = Path(__file__).resolve().parents[1]
EDITOR = Path('C:/Users/brenn/singedTerra-engine-lab/tools/unity-6000.3.24f1/Editor/Unity.exe')
EVIDENCE = ROOT / 'Evidence' / 'last-stand-playable-loop' / 't03'
SAVE_KEY = 'singedTerra.lastStand.prototype.v1'
SPEC = {'revision': 4, 'model_sha256': '0fce3f7b2eb7f6743b3b5c5960b8fdece577c884403710bca32ea84427ddf1df',
        'normative_sha256': '58b5ecaec95493a38751a65320949dd846716b86abf46a6cab82a62161b694aa'}
PLAN = {'revision': 6, 'model_sha256': 'f912cf6d951328966555e3c2f9511fcaca3bbefc5c21d04de7c896f1920a7304',
        'normative_sha256': 'b8a8dd6156609bb6c14d5ce45ce34c8fb4124d37af806b240741e90e640f00b1'}

def classify_console(messages):
    """Fail closed on browser, Unity, and shader errors, including split messages."""
    errors = []
    consumed = set()
    for index, message in enumerate(messages):
        text = str(message.get('text', '')).strip()
        kind = message.get('type', '')
        if index in consumed:
            continue
        if kind == 'error':
            errors.append({'index': index, 'type': kind, 'text': text})
            continue
        if 'exception' in text.lower() or 'uncaught' in text.lower():
            errors.append({'index': index, 'type': kind, 'text': text})
            continue
        lowered = text.casefold()
        if lowered.startswith('[unitycache]') and (
                'not stored in the browser cache' in lowered or 'failed' in lowered or
                'error:' in lowered):
            errors.append({'index': index, 'type': kind, 'text': text,
                           'reason': 'Unity browser cache operation failed'})
            continue
        if text.casefold() == 'error: shader':
            error = {'index': index, 'type': kind, 'text': text}
            if index + 1 < len(messages):
                detail_message = messages[index + 1]
                detail = str(detail_message.get('text', '')).strip()
                if detail_message.get('type') == 'log' and detail:
                    error['detail'] = detail
                    consumed.add(index + 1)
            errors.append(error)
            continue
        if (lowered.startswith('error:') or 'shader is not supported' in lowered or
                ('shader' in lowered and ('error' in lowered or 'failed' in lowered))):
            errors.append({'index': index, 'type': kind, 'text': text,
                           'reason': 'unclassified error output'})

    return {
        'status': 'failed' if errors else 'pass',
        'errors': errors,
    }


def classify_request_failures(failures, messages):
    """Recognize only a 304 network abort whose same-load Unity cache read succeeded."""
    accepted, errors = [], []
    for failure in failures:
        success = (f"[UnityCache] '{failure['url']}' successfully revalidated "
                   "and served from the browser cache")
        if (failure['failure'] == 'net::ERR_ABORTED' and
                failure['response_status'] == 304 and
                failure['method'] == 'GET' and failure['resource_type'] == 'fetch' and
                failure['url'].endswith('.data') and
                any(message.get('type') == 'log' and message.get('load') == failure['load'] and
                    message.get('text') == success for message in messages)):
            accepted.append(failure)
        else:
            errors.append('request failed: ' + json.dumps(failure, sort_keys=True))
    return accepted, errors


# rAF timestamps come from the page's own clock. They measure delivered browser
# animation frames independently of CDP screencast transport and file encoding.
FRAME_PROBE = r"""(() => {
  let active = false;
  let frames = [];
  let generation = 0;
  function sample(t, current) {
    if (!active || current !== generation) return;
    if (frames.length < 30000) frames.push(t);
    requestAnimationFrame(next => sample(next, current));
  }
  window.__stFrameProbe = {
    start() {
      frames = []; active = true; generation++;
      const current = generation;
      requestAnimationFrame(t => sample(t, current));
      return performance.now();
    },
    stop() { active = false; generation++; return frames; }
  };
})()"""


def frame_timing(frames, begin, end):
    """Summarize callbacks within one named active-play window, without bridging boundaries."""
    selected = [value for value in frames if begin <= value <= end]
    require(len(selected) >= 30, 'Too few real animation frames in active-play window')
    gaps = [later - earlier for earlier, later in zip(selected, selected[1:])]
    require(all(math.isfinite(gap) and gap > 0 for gap in gaps), 'Invalid animation frame gap')
    ordered = sorted(gaps)
    return {'callbacks': len(selected), 'observed_seconds': (selected[-1] - selected[0]) / 1000,
            'median_ms': statistics.median(gaps),
            'p95_ms': ordered[math.ceil(len(ordered) * .95) - 1],
            'p99_ms': ordered[math.ceil(len(ordered) * .99) - 1],
            'max_ms': ordered[-1],
            'gaps_over_50ms': sum(gap > 50 for gap in gaps),
            'gaps_over_100ms': sum(gap > 100 for gap in gaps)}

# Test-page-only mirror of the signal actually connected to WebAudio output.
# Original connect is called first, with its original arguments and return value.
# The mirror has no path back into the game graph. Analyser samples and Opus bytes
# are captured from the same rendered signal; Unity event logs cannot fake them.
AUDIO_CAPTURE = r"""(() => {
  const original = AudioNode.prototype.connect;
  const originalDisconnect = AudioNode.prototype.disconnect;
  const captures = [];
  const byContext = new WeakMap();
  const mirrored = new WeakMap();
  const supported = typeof MediaRecorder !== 'undefined' &&
    MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
  window.__stAudioCapture = {supported, captures, errors: []};
  if (!supported) return;
  AudioNode.prototype.connect = function(...args) {
    const result = original.apply(this, args);
    if (args[0] !== this.context.destination) return result;
    try {
      let capture = byContext.get(this.context);
      if (!capture) {
        const stream = this.context.createMediaStreamDestination();
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        const chunks = [];
        const recorder = new MediaRecorder(stream.stream, {mimeType:'audio/webm;codecs=opus'});
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onerror = e => window.__stAudioCapture.errors.push(String(e.error || e));
        capture = {stream, analyser, recorder, chunks, samples: [], started: null};
        byContext.set(this.context, capture);
        captures.push(capture);
        const context = this.context;
        const startIfRunning = () => {
          if (context.state === 'running' && recorder.state === 'inactive' && capture.started === null) {
            capture.started = performance.now();
            recorder.start(1000);
          }
        };
        context.addEventListener('statechange', startIfRunning);
        startIfRunning();
        const values = new Float32Array(analyser.fftSize);
        capture.timer = setInterval(() => {
          analyser.getFloatTimeDomainData(values);
          let power = 0, peak = 0;
          for (const value of values) { power += value * value; peak = Math.max(peak, Math.abs(value)); }
          if (capture.samples.length < 30000)
            capture.samples.push({t:performance.now(), rms:Math.sqrt(power / values.length), peak});
        }, 20);
      }
      const outputIndex = args.length > 1 ? args[1] : 0;
      original.call(this, capture.stream, outputIndex);
      original.call(this, capture.analyser, outputIndex);
      mirrored.set(this, capture);
    } catch (error) { window.__stAudioCapture.errors.push(String(error)); }
    return result;
  };
  AudioNode.prototype.disconnect = function(...args) {
    const result = originalDisconnect.apply(this, args);
    const capture = mirrored.get(this);
    if (!capture) return result;
    if (!args.length) { mirrored.delete(this); return result; }
    if (typeof args[0] === 'number' || args[0] !== this.context.destination) return result;
    try {
      const mirrorArgs = [capture.stream, ...args.slice(1)];
      originalDisconnect.apply(this, mirrorArgs);
      mirrorArgs[0] = capture.analyser;
      originalDisconnect.apply(this, mirrorArgs);
    } catch (error) { window.__stAudioCapture.errors.push(String(error)); }
    return result;
  };
  window.__stAudioCapture.finish = async () => {
    const result = [];
    for (const capture of captures) {
      clearInterval(capture.timer);
      if (capture.recorder.state !== 'inactive') {
        await new Promise(resolve => { capture.recorder.onstop = resolve; capture.recorder.stop(); });
      }
      const bytes = new Uint8Array(await new Blob(capture.chunks, {type:'audio/webm'}).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 16384)
        binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
      result.push({audio:btoa(binary), samples:capture.samples, started:capture.started,
        bytes:bytes.length, mime:'audio/webm;codecs=opus'});
    }
    return {supported, errors:window.__stAudioCapture.errors, captures:result};
  };
})();"""


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm'}

    def log_message(self, *args):
        pass


def build_once(output):
    require(EDITOR.is_file(), 'Pinned Unity editor missing')
    command = ['C:/Python314/python.exe', str(ROOT / 'Tools/build_web.py'), '--editor', str(EDITOR), '--scene', 'last-stand']
    completed = subprocess.run(command, cwd=ROOT.parent, capture_output=True, text=True, timeout=1500)
    (output / 'build-command.log').write_text(completed.stdout + '\n' + completed.stderr, encoding='utf-8')
    require(completed.returncode == 0, 'Last Stand build failed; inspect build-command.log')
    lines = [line[len('BUILD_EVIDENCE='):] for line in completed.stdout.splitlines() if line.startswith('BUILD_EVIDENCE=')]
    require(len(lines) == 1, 'Expected one build evidence path')
    receipt = Path(lines[0]) / 'result.json'
    require(receipt.is_file() and receipt.is_relative_to(EVIDENCE), 'Build receipt is not in task evidence')
    source = json.loads(receipt.read_text(encoding='utf-8'))
    build = Path(source['build']).resolve()
    require(source['status'] == 'pass' and build.is_relative_to(ROOT / 'Builds'), 'Build did not pass')
    require(source['scene'] == 'Assets/Scenes/LastStandPrototype.unity', 'Wrong saved scene')
    require(source['source_before'] == source['source_after'], 'Source changed during export')
    require(source['scene_before'] == source['scene_after'], 'Playable scene changed during export')
    require(source['protected_scenes_before'] == source['protected_scenes_after'], 'Protected scenes changed')
    require(source['approved_artifacts'] == {'ST-LS-LOOP-SPEC': SPEC, 'ST-LS-LOOP-PLAN': PLAN}, 'Wrong approved artifact identities')
    require(artifact_hashes(build) == source['artifacts'], 'Export bytes differ from source-bound receipt')
    for relative, expected in source['source_after']['files'].items():
        path = ROOT / relative
        require(path.is_file() and digest(path) == expected, 'Current build source differs: ' + relative)
    return receipt, build, source


def decoded_audio_energy(path, start_seconds, duration_seconds):
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', str(path),
               '-ss', '%.3f' % max(0, start_seconds), '-t', '%.3f' % duration_seconds,
               '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-']
    decoded = subprocess.run(command, capture_output=True, timeout=60)
    require(decoded.returncode == 0 and len(decoded.stdout) >= 3200, 'Recorded WebAudio cannot be decoded or is too short')
    samples = array('h'); samples.frombytes(decoded.stdout)
    return {'samples': len(samples), 'rms': math.sqrt(sum(value * value for value in samples) / len(samples)) / 32768,
            'peak': max(abs(value) for value in samples) / 32768,
            'method': 'ffmpeg decoded recorded Opus to mono 16 kHz PCM'}


class LastStandWebTests(unittest.TestCase):
    def test_defeat_buy_reload_redeploy(self):
        from playwright.sync_api import sync_playwright

        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6]
        output = EVIDENCE / ('browser-' + stamp)
        output.mkdir(parents=True, exist_ok=False)
        report = {'status': 'running', 'checks': [], 'actions': [], 'screenshots': [], 'audio': [],
                  'errors': [], 'owner_listened': False, 'owner_visual_acceptance': False,
                  'normal_speed': True, 'storage_scope': 'isolated same-origin single-tab profile',
                  'browser_mode': 'owned-headless-new-no-overrides', 'focus_scope': 'browser-tab',
                  'windows_window_acceptance': False}
        report_path = output / 'result.json'
        server = None
        native = None
        page = None
        messages = []
        request_failures = []
        load = [0]
        states, hits, layouts, trace = [], [], [], []
        try:
            receipt, build, source = build_once(output)
            report.update(build_receipt=str(receipt), build_receipt_sha256=digest(receipt),
                          build=str(build), source_inventory_sha256=source['source_after']['sha256'],
                          build_artifacts=source['artifacts'])
            server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
            threading.Thread(target=server.serve_forever, daemon=True).start()
            url = 'http://127.0.0.1:' + str(server.server_port) + '/'
            report['url_origin'] = url

            def check(condition, label, detail=None):
                report['checks'].append({'name': label, 'pass': bool(condition), 'detail': detail})
                if not condition and page is not None:
                    try:
                        capture = output / 'failure-screen.png'
                        page.screenshot(path=str(capture), timeout=5000)
                        report['failure_screen'] = {'file': capture.name, 'sha256': digest(capture)}
                    except Exception as capture_error:
                        report['failure_screen_error'] = str(capture_error)
                require(condition, label)

            with sync_playwright() as playwright:
                native = NativeChrome(playwright, output, headless=True)
                page = native.context.pages[0]
                page.set_viewport_size({'width': 1280, 'height': 720})
                page.add_init_script(AUDIO_CAPTURE)
                page.add_init_script(FRAME_PROBE)
                def collect(message):
                    raw = message.text
                    messages.append({'type': message.type, 'text': raw,
                                     't': time.monotonic(), 'load': load[0]})
                    if message.type == 'error': report['errors'].append(raw)
                    for tag, target in [('ST_LS_STATE ', states), ('ST_LS_HIT ', hits), ('ST_LS_HUD_LAYOUT ', layouts)]:
                        if tag in raw:
                            target.append(json.loads(raw.split(tag, 1)[1].splitlines()[0]))
                page.on('console', collect)
                trace = observe_input(page)
                page.on('pageerror', lambda error: report['errors'].append(str(error)))
                def failed_request(request):
                    response = request.response()
                    request_failures.append({
                        'url': request.url, 'failure': request.failure,
                        'method': request.method, 'resource_type': request.resource_type,
                        'response_status': response.status if response else None,
                        'load': load[0]})
                page.on('requestfailed', failed_request)
                page.on('response', lambda response: report['errors'].append('HTTP ' + str(response.status) + ' ' + response.url)
                        if response.status >= 400 else None)

                def until(items, start, predicate, seconds=110):
                    deadline = time.monotonic() + seconds
                    while time.monotonic() < deadline:
                        found = [item for item in items[start:] if predicate(item)]
                        if found: return found[-1]
                        page.wait_for_timeout(40)
                    capture = output / 'failure-screen.png'
                    page.screenshot(path=str(capture), timeout=5000)
                    report['failure_screen'] = {'file': capture.name, 'sha256': digest(capture)}
                    raise AssertionError('Expected game event absent; inspect browser result')

                def layout(name):
                    require(layouts, 'No actual HUD geometry emitted')
                    current = layouts[-1]
                    require(current['coordinates'] == 'top-left', 'Unknown HUD coordinate convention')
                    matches = [item for item in current['controls'] if item['name'] == name and item['active'] and item['interactable']]
                    require(len(matches) == 1, 'Missing operable ' + name)
                    item = matches[0]
                    require(item['x'] >= -.5 and item['y'] >= -.5 and item['x'] + item['width'] <= current['width'] + .5
                            and item['y'] + item['height'] <= current['height'] + .5, 'Clipped primary action ' + name)
                    return current

                def settled_layout(width, height, start):
                    until(layouts, start, lambda item: item['width'] == width and item['height'] == height, 8)
                    last_count = -1
                    stable_since = time.monotonic()
                    deadline = time.monotonic() + 8
                    while time.monotonic() < deadline:
                        count = len(layouts)
                        if count != last_count:
                            last_count = count
                            stable_since = time.monotonic()
                        elif time.monotonic() - stable_since >= .35:
                            break
                        page.wait_for_timeout(30)
                    current = layouts[-1]
                    check(current['width'] == width and current['height'] == height,
                          'settled HUD geometry matches requested viewport', current)
                    return current

                def click(name, action, predicate=None):
                    current = layout(name)
                    point = pointer(current, name, page.locator('#unity-canvas').bounding_box())
                    start = len(states)
                    page.bring_to_front()
                    page.mouse.move(point['x'], point['y'])
                    page.wait_for_timeout(80)
                    page.mouse.down()
                    page.wait_for_timeout(150)
                    page.mouse.up()
                    report['actions'].append({'name': name, 'action': action, **point, 'hold_ms': 150})
                    return until(states, start, lambda item: item['action'] == action and
                                 (predicate is None or predicate(item)), 8)

                def shot(name):
                    path = output / (name + '.png')
                    page.screenshot(path=str(path))
                    report['screenshots'].append({'file': path.name, 'sha256': digest(path),
                                                  'viewport': page.viewport_size, 'phase': states[-1]['phase']})

                def audio_mark():
                    return page.evaluate('performance.now()')

                def focus_loaded_page(label):
                    page.bring_to_front()
                    page.locator('#unity-canvas').focus()
                    initial = page.evaluate('({hidden:document.hidden,focused:document.hasFocus()})')
                    page.wait_for_function('!document.hidden && document.hasFocus()', timeout=10000)
                    final = page.evaluate('({hidden:document.hidden,focused:document.hasFocus()})')
                    check(not final['hidden'] and final['focused'], label + ' browser tab visible and focused',
                          {'initial': initial, 'final': final})

                def audio_energy(start, end, minimum_samples=5):
                    samples = page.evaluate('window.__stAudioCapture && window.__stAudioCapture.captures.flatMap(c=>c.samples)')
                    require(samples is not None, 'WebAudio capture unavailable')
                    selected = [item['rms'] for item in samples if start <= item['t'] <= end]
                    require(len(selected) >= minimum_samples, 'Too few measured audio samples')
                    return {'samples': len(selected), 'maximum_rms': max(selected),
                            'mean_rms': sum(selected) / len(selected)}

                def save_audio(name, windows=None):
                    captured = page.evaluate('window.__stAudioCapture && window.__stAudioCapture.finish()')
                    check(captured and captured['supported'] and not captured['errors'] and captured['captures'],
                          name + ' browser WebAudio capture available', captured['errors'] if captured else None)
                    saved = []
                    for index, item in enumerate(captured['captures']):
                        check(item['started'] is not None, name + ' recorder began only after AudioContext ran')
                        data = base64.b64decode(item['audio'], validate=True)
                        check(len(data) > 1000, name + ' captured rendered WebAudio bytes')
                        path = output / (name + '-audio-%d.webm' % index)
                        path.write_bytes(data)
                        report['audio'].append({'file': path.name, 'sha256': digest(path), 'bytes': len(data),
                                                'mime': item['mime'], 'source': 'test-page WebAudio output mirror',
                                                'sample_count': len(item['samples'])})
                        if windows:
                            for cue, (begin, end) in windows.items():
                                energy = decoded_audio_energy(path, (begin - item['started']) / 1000,
                                                              (end - begin) / 1000)
                                check(energy['rms'] > .0005, name + ' recorded ' + cue + ' is non-silent', energy)
                                report['audio'][-1].setdefault('decoded_cues', {})[cue] = energy
                        saved.append({'file': path.name, 'started': item['started']})
                    return saved

                page.bring_to_front()
                page.goto(url, wait_until='domcontentloaded')
                focus_loaded_page('initial load')
                ready = until(states, 0, lambda item: item['action'] == 'ready', 60)
                report['renderer'] = page.evaluate("""() => {
                  const canvas = document.querySelector('#unity-canvas');
                  const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
                  if (!gl) return {available:false};
                  const info = gl.getExtension('WEBGL_debug_renderer_info');
                  return {available:true, vendor:gl.getParameter(gl.VENDOR),
                    renderer:gl.getParameter(gl.RENDERER), version:gl.getParameter(gl.VERSION),
                    unmasked_vendor:info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : null,
                    unmasked_renderer:info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null};
                }""")
                check(ready['phase'] == 'garage' and ready['wallet'] == 0 and ready['level'] == 0, 'new save starts in garage')
                check(ready['saveState'] == 'ready', 'initial save write and readback succeeded')
                fitting = next(item for item in layouts[-1]['controls'] if item['name'] == 'ToggleFitting')
                check(fitting['label'].strip().upper() == 'FIT LAUNCHER', 'baseline run explicitly uses repair fitting', fitting)
                shot('00-garage')
                start_audio = audio_mark()
                deployed = click('Deploy', 'deploy')
                check(deployed['phase'] == 'battle' and deployed['cannonDamage'] == 20, 'base run actually deployed')
                frame_probe_start_ms = page.evaluate('window.__stFrameProbe.start()')
                motion = MotionCapture(native.context, page, output, 'normal-speed-repair')
                motion_start_ms = audio_mark()
                first = until(hits, 0, lambda item: item['cannonDamage'] == 20, 45)
                check(first['firstFoeHull'] == 10, 'first base cannon hit leaves first 30 HP foe at 10 HP', first)
                first_hit_ms = audio_mark()
                page.wait_for_timeout(750)
                sound = audio_energy(max(start_audio, first_hit_ms - 500), audio_mark())
                check(sound['maximum_rms'] > .0005, 'rendered cannon/impact audio has measurable output', sound)
                shot('01-base-first-hit')
                click('ToggleMute', 'mute')
                mute_start = audio_mark(); page.wait_for_timeout(1200)
                mute = audio_energy(mute_start + 150, audio_mark())
                check(mute['maximum_rms'] < .0005, 'mute suppresses rendered audio', mute)
                click('ToggleMute', 'mute')
                paused = click('Pause', 'session', lambda item: item['paused'])
                check(paused['paused'], 'pointer pause accepted')
                pause_start = audio_mark(); page.wait_for_timeout(1200)
                pause_sound = audio_energy(pause_start + 150, audio_mark())
                check(pause_sound['maximum_rms'] < .0005 and states[-1]['tick'] == paused['tick'],
                      'paused combat and rendered sound remain stopped', pause_sound)
                resumed = click('Pause', 'session', lambda item: not item['paused'])
                check(not resumed['paused'], 'pointer resume accepted')
                resume_start = audio_mark(); page.wait_for_timeout(700)
                resume_sound = audio_energy(resume_start, audio_mark())
                check(resume_sound['maximum_rms'] <= max(.005, sound['maximum_rms'] * 2),
                      'resume has no output burst above twice normal admitted peak', resume_sound)
                focus_start = len(states)
                focus_start_ms = audio_mark()
                other = native.context.new_page()
                other.goto('about:blank'); other.bring_to_front()
                hidden = page.evaluate('({hidden:document.hidden, focused:document.hasFocus()})')
                check(hidden['hidden'] or not hidden['focused'], 'real browser focus or visibility loss observed', hidden)
                hidden_start = audio_mark()
                page.wait_for_timeout(1200)
                page.bring_to_front(); other.close()
                hidden_end_ms = audio_mark()
                hidden_sound = audio_energy(hidden_start + 200, audio_mark(), minimum_samples=1)
                check(hidden_sound['maximum_rms'] < .0005, 'hidden or unfocused Web audio is silent', hidden_sound)
                suspended = until(states, focus_start, lambda item: item['paused'], 8)
                check(states[-1]['tick'] == suspended['tick'], 'hidden or unfocused combat did not catch up')
                if states[-1]['phase'] == 'battle':
                    check(not click('Pause', 'session', lambda item: not item['paused'])['paused'],
                          'explicit resume after focus loss')
                post_focus_start_ms = audio_mark()
                defeat_start = len(states)
                settling = until(states, defeat_start, lambda item: item['phase'] == 'settling', 110)
                settling_ms = audio_mark()
                defeat_time = audio_mark()
                page.wait_for_timeout(750)
                result = until(states, defeat_start, lambda item: item['phase'] == 'result', 8)
                check(result['pendingRunId'] > 0 and result['wallet'] == 0, 'ordinary defeat staged exactly one pending reward', result)
                defeat_sound = audio_energy(defeat_time - 250, audio_mark())
                check(defeat_sound['maximum_rms'] > .0005, 'rendered defeat cue measured at ordinary defeat', defeat_sound)
                shot('02-defeat-pending')
                frame_times = page.evaluate('window.__stFrameProbe.stop()')
                frame_path = output / 'animation-frame-timestamps.json'
                frame_path.write_text(json.dumps({'clock': 'page performance.now milliseconds',
                    'timestamps': frame_times, 'active_windows': [
                        ['first-foe-before-impact', motion_start_ms, first_hit_ms],
                        ['first-hit-through-pause', first_hit_ms, pause_start],
                        ['resumed-before-focus-loss', resume_start, focus_start_ms],
                        ['resumed-after-focus-loss', post_focus_start_ms, settling_ms]],
                    'nonactive_windows': [
                        ['explicit-pause', pause_start, resume_start],
                        ['hidden-or-unfocused', hidden_start, hidden_end_ms]]},
                    indent=2, allow_nan=False), encoding='utf-8')
                active_windows = [
                    ('first-foe-before-impact', motion_start_ms, first_hit_ms),
                    ('first-hit-through-pause', first_hit_ms, pause_start),
                    ('resumed-before-focus-loss', resume_start, focus_start_ms),
                    ('resumed-after-focus-loss', post_focus_start_ms, settling_ms)]
                report['frame_timing'] = {
                    'source': 'in-page requestAnimationFrame callbacks during observed browser visibility',
                    'raw': frame_path.name, 'raw_sha256': digest(frame_path),
                    'probe_start_ms': frame_probe_start_ms,
                    'capture_active': {name: frame_timing(frame_times, begin, end)
                                       for name, begin, end in active_windows},
                    'nonactive': {name: {'wall_seconds': (end - begin) / 1000,
                                         'callbacks': sum(begin <= value <= end for value in frame_times)}
                                  for name, begin, end in [
                                      ('explicit-pause', pause_start, resume_start),
                                      ('hidden-or-unfocused', hidden_start, hidden_end_ms)]}}
                active_samples = list(report['frame_timing']['capture_active'].values())
                check(all(item['p95_ms'] <= 50 and item['p99_ms'] <= 100 and item['max_ms'] <= 250
                          for item in active_samples),
                      'active gameplay frame cadence stays within 50 ms p95, 100 ms p99, 250 ms maximum',
                      report['frame_timing']['capture_active'])
                report['motion'] = motion.encode()
                record = page.evaluate('(key)=>localStorage.getItem(key)', SAVE_KEY)
                check(record and json.loads(record)['pendingDefeat']['reward'] == 1, 'pending defeat is in real localStorage')
                first_audio = save_audio('first-run', {'cannon-impact': (first_hit_ms - 500, first_hit_ms + 750),
                                                       'defeat': (defeat_time - 250, defeat_time + 750)})
                require(first_audio, 'No recorded audio for playable capture')
                offset_seconds = (first_audio[0]['started'] - motion_start_ms) / 1000
                movie = output / 'normal-speed-repair-with-audio.mp4'
                command = ['ffmpeg', '-hide_banner', '-nostdin', '-y', '-i', str(output / report['motion']['path'])]
                if offset_seconds >= 0:
                    command += ['-itsoffset', '%.3f' % offset_seconds]
                else:
                    command += ['-ss', '%.3f' % -offset_seconds]
                command += ['-i', str(output / first_audio[0]['file']), '-c:v', 'copy', '-c:a', 'aac',
                            '-b:a', '160k', str(movie)]
                mux = subprocess.run(command, capture_output=True, text=True, timeout=120)
                (output / 'audio-video-mux.log').write_text(mux.stdout + '\n' + mux.stderr, encoding='utf-8')
                check(mux.returncode == 0 and movie.is_file() and movie.stat().st_size > 10000,
                      'normal-speed motion and captured rendered WebAudio muxed')
                mux_probe = subprocess.run(['ffprobe', '-v', 'error', '-count_frames',
                    '-show_entries', 'stream=codec_type,start_time,duration,nb_read_frames',
                    '-of', 'json', str(movie)], capture_output=True, text=True, timeout=30)
                check(mux_probe.returncode == 0, 'muxed motion and audio streams are readable')
                streams = json.loads(mux_probe.stdout)['streams']
                video_stream = next(item for item in streams if item['codec_type'] == 'video')
                audio_stream = next(item for item in streams if item['codec_type'] == 'audio')
                check(int(video_stream['nb_read_frames']) == report['motion']['encoded_frames'] and
                      abs(float(video_stream['duration']) - report['motion']['encoded_duration_seconds']) <= .25 and
                      int(audio_stream['nb_read_frames']) > 0,
                      'audio mux preserves every real video frame and its normal-speed duration', streams)
                report['playable_capture'] = {'file': movie.name, 'sha256': digest(movie),
                    'audio_alignment_seconds': offset_seconds, 'audio_source': first_audio[0]['file'],
                    'video_frames': int(video_stream['nb_read_frames']),
                    'video_duration_seconds': float(video_stream['duration']),
                    'audio_start_seconds': float(audio_stream['start_time']),
                    'audio_duration_seconds': float(audio_stream['duration'])}
                review_start = (post_focus_start_ms - motion_start_ms) / 1000
                review_duration = (defeat_time + 750 - post_focus_start_ms) / 1000
                check(review_start >= 0 and review_duration >= 15,
                      'uninterrupted active-play review segment is long enough',
                      {'start_seconds': review_start, 'duration_seconds': review_duration})
                review_movie = output / 'active-play-review-with-audio.mp4'
                review_command = ['ffmpeg', '-hide_banner', '-nostdin', '-y', '-i', str(movie),
                                  '-ss', '%.3f' % review_start, '-t', '%.3f' % review_duration,
                                  '-fps_mode', 'passthrough', '-c:v', 'libx264', '-crf', '19',
                                  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
                                  '-movflags', '+faststart', str(review_movie)]
                review_mux = subprocess.run(review_command, capture_output=True, text=True, timeout=120)
                (output / 'active-play-review-encode.log').write_text(
                    review_mux.stdout + '\n' + review_mux.stderr, encoding='utf-8')
                check(review_mux.returncode == 0 and review_movie.is_file() and
                      review_movie.stat().st_size > 10000,
                      'active-play review clip uses real captured frames and rendered audio')
                review_probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                    '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json',
                    str(review_movie)], capture_output=True, text=True, timeout=30)
                check(review_probe.returncode == 0, 'review clip video frame count is readable')
                review_encoded_frames = int(json.loads(review_probe.stdout)['streams'][0]['nb_read_frames'])
                check(review_encoded_frames > 0, 'review clip contains captured video frames')
                report['active_play_review'] = {
                    'file': review_movie.name, 'sha256': digest(review_movie),
                    'source': movie.name, 'start_seconds': review_start,
                    'duration_seconds': review_duration,
                    'encoded_frames': review_encoded_frames,
                    'frame_count_method': 'ffprobe decoded frame count; passthrough timestamps and no interpolation',
                    'edit': 'single hard trim after deliberate focus-loss test; original frame cadence preserved'}

                reload_start = len(states)
                load[0] += 1
                page.reload(wait_until='domcontentloaded')
                focus_loaded_page('pending reload')
                restored = until(states, reload_start, lambda item: item['action'] == 'ready', 60)
                check(restored['phase'] == 'result' and restored['pendingRunId'] == result['pendingRunId'],
                      'same-origin reload restores pending claim', restored)
                shot('03-reloaded-pending')
                claimed = click('Claim', 'claim')
                check(claimed['phase'] == 'workshop' and claimed['wallet'] == 1 and claimed['level'] == 0,
                      'Claim pays exactly one salvage', claimed)
                resize_start = len(layouts)
                page.set_viewport_size({'width': 800, 'height': 600})
                settled_layout(800, 600, resize_start)
                layout('Purchase'); shot('04-compact-workshop')
                purchase_start = audio_mark()
                bought = click('Purchase', 'purchase')
                check(bought['wallet'] == 0 and bought['level'] == 1 and bought['cannonDamage'] == 30,
                      'purchase commits level 1 for one salvage', bought)
                page.wait_for_timeout(600)
                purchase_sound = audio_energy(purchase_start, audio_mark())
                check(purchase_sound['maximum_rms'] > .0005, 'purchase cue rendered in captured WebAudio', purchase_sound)
                shot('05-compact-purchased')
                save_audio('workshop', {'purchase': (purchase_start, audio_mark())})

                reload_start = len(states)
                load[0] += 1
                page.reload(wait_until='domcontentloaded')
                focus_loaded_page('purchased upgrade reload')
                again = until(states, reload_start, lambda item: item['action'] == 'ready', 60)
                check(again['level'] == 1 and again['wallet'] == 0 and again['pendingRunId'] == 0,
                      'same-origin reload retains spent balance and permanent level', again)
                fitting = next(item for item in layouts[-1]['controls'] if item['name'] == 'ToggleFitting')
                check(fitting['label'].strip().upper() == 'FIT LAUNCHER', 'upgraded run uses same repair fitting', fitting)
                layout('Deploy'); shot('06-reloaded-upgrade')
                upgraded = click('Deploy', 'deploy')
                check(upgraded['phase'] == 'battle' and upgraded['cannonDamage'] == 30, 'upgraded run deployed with committed damage')
                no_capture_start_ms = page.evaluate('window.__stFrameProbe.start()')
                second_hit = until(hits, len(hits), lambda item: item['cannonDamage'] == 30, 45)
                no_capture_end_ms = audio_mark()
                no_capture_frames = page.evaluate('window.__stFrameProbe.stop()')
                no_capture_path = output / 'animation-frame-no-capture-timestamps.json'
                no_capture_path.write_text(json.dumps({'clock': 'page performance.now milliseconds',
                    'timestamps': no_capture_frames, 'active_window':
                    [no_capture_start_ms, no_capture_end_ms]}, indent=2, allow_nan=False), encoding='utf-8')
                report['frame_timing']['no_capture_active'] = frame_timing(
                    no_capture_frames, no_capture_start_ms, no_capture_end_ms)
                report['frame_timing']['no_capture_raw'] = no_capture_path.name
                report['frame_timing']['no_capture_raw_sha256'] = digest(no_capture_path)
                captured_prehit = report['frame_timing']['capture_active']['first-foe-before-impact']
                uncaptured_prehit = report['frame_timing']['no_capture_active']
                report['frame_timing']['capture_comparison'] = {
                    'basis': 'separate real deployments before first impact; same scene, upgraded cannon in second run',
                    'captured_p95_ms': captured_prehit['p95_ms'],
                    'uncaptured_p95_ms': uncaptured_prehit['p95_ms'],
                    'p95_delta_ms': captured_prehit['p95_ms'] - uncaptured_prehit['p95_ms']}
                check(captured_prehit['p95_ms'] <= uncaptured_prehit['p95_ms'] * 1.5 + 5,
                      'screencast adds at most 50 percent plus 5 ms to active pre-impact p95',
                      report['frame_timing']['capture_comparison'])
                check(second_hit['firstFoeHull'] == 0 and second_hit['kills'] >= 1,
                      'same first foe dies to one upgraded cannon hit', second_hit)
                shot('07-upgraded-first-hit')
                save_audio('second-run')

                audio_events = [item['text'].split('ST_LS_AUDIO event=', 1)[1].splitlines()[0]
                                for item in messages if 'ST_LS_AUDIO event=' in item['text']]
                check({'cannon', 'impact', 'destruction', 'defeat', 'purchase'}.issubset(audio_events),
                      'all five procedural cue kinds admitted in actual game', audio_events)

                console_classification = classify_console(messages)
                report['console_classification'] = console_classification
                report['errors'].extend(console_classification['errors'])
                report['request_failures'] = request_failures
                accepted_cache_revalidations, request_errors = classify_request_failures(
                    request_failures, messages)
                report['accepted_cache_revalidations'] = accepted_cache_revalidations
                report['errors'].extend(request_errors)
                check(not report['errors'], 'no unclassified browser, Unity console, request or page errors',
                      {'errors': report['errors'], 'console': console_classification})
                report['input_trace'] = validate_input(trace, report['actions'])
                (output / 'console.json').write_text(json.dumps(messages, indent=2), encoding='utf-8')
                report['browser_version'] = native.browser.version
                native.close(); native = None

                for probe_name, init_script in (
                    ('corrupt', "localStorage.setItem('singedTerra.lastStand.prototype.v1', '{bad json');"),
                    ('blocked', "for(const name of ['getItem','setItem']) { const old=Storage.prototype[name]; Storage.prototype[name]=function(key,...args) { if(key==='singedTerra.lastStand.prototype.v1') throw new DOMException('blocked by test profile','SecurityError'); return old.call(this,key,...args); }; }")):
                    probe_dir = output / ('storage-' + probe_name)
                    probe_dir.mkdir()
                    probe = NativeChrome(playwright, probe_dir, headless=True)
                    try:
                        probe_page = probe.context.pages[0]
                        probe_page.set_viewport_size({'width': 800, 'height': 600})
                        probe_page.add_init_script(init_script)
                        probe_states, probe_layouts = [], []
                        def probe_collect(message):
                            raw = message.text
                            for tag, target in [('ST_LS_STATE ', probe_states), ('ST_LS_HUD_LAYOUT ', probe_layouts)]:
                                if tag in raw: target.append(json.loads(raw.split(tag, 1)[1].splitlines()[0]))
                        probe_page.on('console', probe_collect)
                        probe_page.bring_to_front()
                        probe_page.goto(url, wait_until='domcontentloaded')
                        probe_page.bring_to_front()
                        probe_page.locator('#unity-canvas').focus()
                        probe_page.wait_for_function('!document.hidden && document.hasFocus()', timeout=10000)
                        deadline = time.monotonic() + 60
                        while not any(state['action'] == 'ready' for state in probe_states) and time.monotonic() < deadline:
                            probe_page.wait_for_timeout(40)
                        ready_probe = next((state for state in probe_states if state['action'] == 'ready'), None)
                        check(ready_probe and ready_probe['saveState'] != 'ready', probe_name + ' storage failure shown', ready_probe)
                        check(any(item['name'] == 'RetrySave' and item['active'] for item in probe_layouts[-1]['controls']),
                              probe_name + ' storage Retry is visible')
                        capture = probe_dir / 'failure-ui.png'
                        probe_page.screenshot(path=str(capture))
                        report.setdefault('storage_probes', []).append({'name': probe_name, 'state': ready_probe,
                            'screenshot': str(capture.relative_to(output)), 'sha256': digest(capture),
                            'profile': 'separate isolated Chrome profile'})
                    finally:
                        probe.close()
                report['status'] = 'pass'
        except BaseException as error:
            report.update(status='failed', error=type(error).__name__ + ': ' + str(error))
            raise
        finally:
            (output / 'console.json').write_text(json.dumps(messages, indent=2), encoding='utf-8')
            (output / 'runtime-telemetry.json').write_text(json.dumps({'states': states, 'hits': hits, 'layouts': layouts}, indent=2), encoding='utf-8')
            (output / 'input-trace.json').write_text(json.dumps(trace, indent=2), encoding='utf-8')
            if page is not None and report['status'] == 'failed' and 'failure_screen' not in report and 'failure_screen_error' not in report:
                try:
                    capture = output / 'failure-screen.png'
                    page.screenshot(path=str(capture), timeout=5000)
                    report['failure_screen'] = {'file': capture.name, 'sha256': digest(capture)}
                except Exception as capture_error:
                    report['failure_screen_error'] = str(capture_error)
            if native is not None: native.close()
            if server is not None:
                server.shutdown(); server.server_close()
            report_path.write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
            print('LAST_STAND_LOOP_EVIDENCE=' + str(output), flush=True)


if __name__ == '__main__':
    unittest.main()
