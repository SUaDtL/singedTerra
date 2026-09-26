"""Real-pointer ST-VIS-01 evidence from an explicitly bound, successful review build.

--smoke produces a bounded first-look receipt, never a full-suite pass. Default mode
checks both fittings/effects through normal-speed defeat and records browser motion.
--headless uses owned Chrome without focus emulation; focus proof covers browser tabs.
"""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse
import datetime
import json
import socket
import threading
import time
import uuid
from input_observer import validate as validate_pointer_trace
from visual_review_checks import (artifact_hashes, digest, load_build, pointer, require,
                                  validate_layout, validate_pair, validate_ring, validate_ring_clear_of_hud)

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm'}

    def log_message(self, *args):
        pass


def run(receipt, smoke=False, headless=False):
    source, build, model_receipts = load_build(ROOT, receipt)
    expected = model_receipts['ST_VIS_MODEL_PASS']['summaries']
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6]
    output = ROOT / 'Evidence' / (('visual-smoke-' if smoke else 'visual-browser-') + stamp)
    output.mkdir(parents=True, exist_ok=False)
    states, art, visual, layouts, messages, errors, requests = [], [], [], [], [], [], []
    checks, clicks, captures, pairs, terminals, motion = [], [], [], [], [], []
    recordings = []
    started = time.monotonic()
    report = {'status': 'running', 'mode': 'smoke' if smoke else 'full',
              'headless': headless, 'focus_scope': 'browser-tab' if headless else 'desktop-browser-tab',
              'windows_window_acceptance': False,
              'scope': 'matched early stills and bounded input/framing' if smoke else 'full ST-VIS-01 technical browser check',
              'owner_visual_acceptance': False, 'normal_speed_motion_reviewed_by_owner': False,
              'build': str(build), 'artifacts': source['artifacts'], 'build_receipt': str(Path(receipt).resolve()),
              'build_receipt_sha256': digest(receipt), 'expected_csharp': model_receipts,
              'build_source_head': source['source_after']['head'],
              'build_source_inventory_sha256': source['source_after']['sha256'],
              'build_source_dirty': source['source_after']['dirty'],
              'checks': checks, 'clicks': clicks, 'captures': captures, 'pairs': pairs,
              'terminals': terminals, 'motion': motion, 'android': False, 'performance_test': False}
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    report['temporary_port'] = server.server_port
    print('VISUAL_REVIEW_EVIDENCE=' + str(output), flush=True)
    native = None

    def check(value, name, detail=None):
        checks.append({'check': name, 'pass': bool(value), **({'detail': detail} if detail is not None else {})})
        if not value:
            raise RuntimeError(name)

    def collect(message):
        text = message.text
        messages.append({'elapsed_seconds': time.monotonic() - started, 'type': message.type, 'text': text})
        if message.type == 'error':
            errors.append(text)
        for tag, target in [('ST_ENC_STATE ', states), ('ST_ART_STATE ', art),
                            ('ST_VIS_STATE ', visual), ('ST_VIS_HUD_LAYOUT ', layouts)]:
            if tag in text:
                target.append(json.loads(text.split(tag, 1)[1].splitlines()[0]))

    try:
        from playwright.sync_api import sync_playwright
        from input_observer import install, validate
        from native_chrome import NativeChrome
        from visual_review_motion import MotionCapture
        with sync_playwright() as playwright:
            native = NativeChrome(playwright, output, headless=headless)
            context = native.context
            page = context.pages[0]
            report.update(browser_mode='owned-headless-new-no-overrides' if headless else 'owned-default-context-no-overrides', debug_port=native.port,
                          browser_version=native.browser.version)
            page.set_viewport_size({'width': 1600, 'height': 900})
            page.on('console', collect)
            report['input_trace'] = install(page)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('requestfailed', lambda request: requests.append(request.url))
            page.on('response', lambda response: requests.append(str(response.status) + ' ' + response.url)
                    if response.status >= 400 else None)

            def event(items, start, predicate, timeout=30):
                end = time.monotonic() + timeout
                while time.monotonic() < end:
                    matches = [item for item in items[start:] if predicate(item)]
                    if matches:
                        return matches[-1]
                    page.wait_for_timeout(40)
                raise RuntimeError('Expected runtime event was not observed; inspect retained states/console')

            def layout_check(battle=True):
                result = validate_layout(layouts[-1], battle)
                check(True, 'actual HUD geometry and command availability', result)

            def owner_counts():
                return {field: visual[-1][field] for field in ('sessions', 'views', 'canvases', 'eventSystems')}

            def click(name, action, stream=None):
                stream = states if stream is None else stream
                start = len(stream)
                point = pointer(layouts[-1], name, page.locator('#unity-canvas').bounding_box())
                clicks.append({'control': name, 'action': action, **point, 'hold_ms': 150})
                page.bring_to_front()
                page.mouse.move(point['x'], point['y'])
                page.wait_for_timeout(80)
                page.mouse.down()
                page.wait_for_timeout(150)
                page.mouse.up()
                observed = event(stream, start, lambda item: item['action'] == action)
                page.wait_for_timeout(70)
                return observed

            def treatment(value):
                return click('SelectAsh' if value == 0 else 'SelectIron', 'treatment', visual)

            def screenshot(name, state=None):
                path = output / (name + '.png')
                page.screenshot(path=str(path))
                item = {'path': path.name, 'sha256': digest(path), 'kind': 'actual Unity Web browser capture',
                        'visual': state if state is not None else (visual[-1] if visual else None),
                        'encounter': states[-1] if states else None,
                        'viewport': page.viewport_size}
                captures.append(item)
                return item

            def compare(name):
                check(states[-1]['paused'], name + ' starts paused')
                a = treatment(0)
                validate_ring(a); validate_ring_clear_of_hud(a, layouts[-1]); layout_check()
                left = screenshot(name + '-A-sunlit-ash', a)
                b = treatment(1)
                validate_ring(b); validate_ring_clear_of_hud(b, layouts[-1]); layout_check()
                right = screenshot(name + '-B-iron-perimeter', b)
                pair = validate_pair(a, b)
                pair.update(name=name, left=left['path'], right=right['path'])
                pairs.append(pair)
                check(True, name + ' same paused state/profile/fitting/effects/viewport', pair)

            def pause():
                state = click('PauseEncounter', 'pause')
                check(state['paused'], 'pointer pause accepted')
                return state

            def resume():
                state = click('PauseEncounter', 'pause')
                check(not state['paused'], 'explicit pointer resume accepted')
                return state

            def at_tick(tick, timeout=95):
                run_id = states[-1]['run']
                end = time.monotonic() + timeout
                while time.monotonic() < end:
                    current = next(item for item in reversed(states) if item['run'] == run_id)
                    if current['paused']:
                        report.setdefault('unexpected_suspensions', []).append({
                            'elapsed_seconds': time.monotonic() - started, 'waiting_for_tick': tick,
                            'state': current, 'dom': page.evaluate('({hidden:document.hidden,focused:document.hasFocus()})')})
                        raise RuntimeError('Encounter suspended at tick ' + str(current['tick']) +
                                           ' (' + current['reason'] + '); no automatic resume was attempted')
                    if current['status'] != 'Running':
                        raise RuntimeError('Encounter ended before requested tick ' + str(tick))
                    if current['tick'] >= tick:
                        return current
                    page.wait_for_timeout(40)
                raise RuntimeError('Requested tick ' + str(tick) + ' was not reached before deadline')

            def deploy(fitting, effects=True, selection=None):
                state = click('DeployEncounter', 'deploy')
                check(state['tick'] == 0 and state['hp'] == 120 and state['alive'] == 0 and state['locked'] and
                      state['fitting'] == fitting and not state['failed'] and state['rules'] == 'review-pacing-v1' and
                      state['fullEffects'] == effects, 'fresh deployment commits review profile/fitting/effects')
                layout_check()
                if selection is not None and visual[-1]['treatment'] != selection:
                    treatment(selection)
                return state

            def effects(value):
                if states[-1]['fullEffects'] != value:
                    state = click('EncounterEffects', 'effects')
                    check(state['fullEffects'] == value, 'pointer effects mode accepted')

            def returned(name):
                state = click('ReturnToInspection', 'return')
                check(state['status'] == 'Fitting' and not state['locked'] and state['visibleUnits'] == 0 and
                      state['pool'] == 32 and state['tick'] == 0, name + ' discards run and hides pooled presentation')
                layout_check(False)
                check(len(layouts[-1]['controls']) == baseline_controls, name + ' does not accumulate controls')
                counts = owner_counts()
                check(counts == baseline_owners, name + ' preserves runtime owner counts', counts)
                return state

            def finish(fitting, name):
                run_id = states[-1]['run']
                state = event(states, 0, lambda item: item['run'] == run_id and item['action'] == 'terminal', 100)
                check(state['status'] == 'Defeated' and state['hp'] == 0 and state['locked'] and
                      state['summary'] == expected[1 if fitting == 'launcher' else 0], name + ' matches C# complete review outcome')
                check(state['cannon'] > 0 and state['rangedHits'] > 0 and state['closeHits'] == 0 and
                      state['visibleUnits'] == state['alive'] and state['pool'] == 32,
                      name + ' records ranged-driven v1 defeat and bounded presentation')
                terminals.append(state)
                screenshot(name + '-defeat')
                return state

            def record(name, until_tick):
                recorder = MotionCapture(context, page, output, name)
                recordings.append(recorder)
                start = {'encounter': states[-1], 'visual': visual[-1]}
                at_tick(until_tick)
                recorder.stop()
                # Encoding occurs after all browser runs so it cannot starve the live renderer.
                motion.append({'name': name, 'start': start, 'end': {'encounter': states[-1], 'visual': visual[-1]},
                               'raw': recorder.directory.name + '/frames.json'})

            try:
                page.bring_to_front()
                page.goto('http://127.0.0.1:' + str(server.server_port) + '/', wait_until='domcontentloaded')
                page.bring_to_front()
                page.locator('#unity-canvas').focus()
                report['startup_dom_initial'] = page.evaluate('({hidden:document.hidden,focused:document.hasFocus()})')
                try:
                    page.wait_for_function('!document.hidden && document.hasFocus()', timeout=10000)
                finally:
                    report['startup_dom'] = page.evaluate('({hidden:document.hidden,focused:document.hasFocus()})')
                check(not report['startup_dom']['hidden'] and report['startup_dom']['focused'],
                      'owned browser tab is visible and focused before Unity readiness')
                ready = event(states, 0, lambda item: item['action'] == 'ready', 90)
                report['ready_elapsed_seconds'] = time.monotonic() - started
                event(layouts, 0, lambda item: any(control['name'] == 'DeployEncounter' for control in item['controls']))
                check(ready['status'] == 'Fitting' and ready['rules'] == 'review-pacing-v1', 'separate review scene starts in fitting')
                page.bring_to_front(); page.locator('#unity-canvas').focus(); page.wait_for_timeout(600)
                report['renderer'] = page.evaluate("""() => {
                    const c=document.querySelector('#unity-canvas'), g=c.getContext('webgl2') || c.getContext('webgl');
                    if(!g) return {available:false}; const e=g.getExtension('WEBGL_debug_renderer_info');
                    return {available:true,version:g.getParameter(g.VERSION),vendor:g.getParameter(g.VENDOR),
                        renderer:g.getParameter(g.RENDERER),unmaskedVendor:e?g.getParameter(e.UNMASKED_VENDOR_WEBGL):null,
                        unmaskedRenderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null,devicePixelRatio:devicePixelRatio};
                }""")
                baseline_controls = len(layouts[-1]['controls'])
                baseline_owners = owner_counts()
                check(all(value == 1 for value in baseline_owners.values()), 'one runtime session/view/canvas/input owner', baseline_owners)
                report['baseline_owners'] = baseline_owners
                layout_check(False); screenshot('00-inspection')
                deploy('repair', True, 0)
                if smoke:
                    at_tick(160)
                else:
                    record('motion-repair-full-A-early', 160)
                frozen = pause()
                compare('01-repair-early-wide')
                before = visual[-1]['snapshot']
                page.wait_for_timeout(1000)
                effects(False)
                check(visual[-1]['snapshot'] == before and states[-1]['tick'] == frozen['tick'], 'paused model ignores wall time and effects toggle')
                effects(True)
                for width, height, label in [(1280, 720, 'standard'), (800, 600, 'compact')]:
                    prior = len(layouts)
                    page.set_viewport_size({'width': width, 'height': height})
                    event(layouts, prior, lambda item: item['width'] == width and item['height'] == height)
                    page.wait_for_timeout(400)
                    compare('02-repair-early-' + label)
                prior = len(layouts)
                page.set_viewport_size({'width': 1600, 'height': 900})
                event(layouts, prior, lambda item: item['width'] == 1600 and item['height'] == 900)
                page.wait_for_timeout(400); treatment(0)
                if smoke:
                    returned('smoke')
                    report['status'] = 'smoke-pass'
                    report['unexecuted'] = ['complete browser outcomes', 'full/reduced outcome equivalence',
                                            'normal-speed motion capture', 'focus interruption', 'repeated runs', 'owner visual acceptance']
                else:
                    resume()
                    start = len(states)
                    other = context.new_page(); other.goto('about:blank'); other.bring_to_front()
                    report['background_dom'] = page.evaluate('({hidden:document.hidden,focused:document.hasFocus()})')
                    check(not report['background_dom']['focused'], 'actual browser focus loss without focus emulation')
                    page.wait_for_timeout(1200)
                    page.bring_to_front(); page.locator('#unity-canvas').focus(); other.close()
                    suspended = event(states, start, lambda item: item['action'] == 'suspend' and item['reason'] == 'focus')
                    effects(False)
                    check(states[-1]['paused'] and states[-1]['tick'] == suspended['tick'] and states[-1]['hp'] == suspended['hp'],
                          'focus loss freezes model and requires explicit resume')
                    effects(True); resume()
                    at_tick(1200); record('motion-repair-full-A-busy', 1400)
                    pause(); compare('03-repair-busy-wide'); treatment(0); resume()
                    repair_full = finish('repair', '04-repair-full-A')
                    # Terminal A/B selection/effects remain operable without restarting combat.
                    terminal_tick = repair_full['tick']; effects(False); effects(True)
                    check(states[-1]['tick'] == terminal_tick and states[-1]['hp'] == 0, 'terminal effects command cannot advance model')
                    returned('repair A')
                    deploy('repair', True, 1)
                    record('motion-repair-full-B-early', 160)
                    at_tick(1200); record('motion-repair-full-B-busy', 1400)
                    repair_b = finish('repair', '05-repair-full-B')
                    check(repair_b['summary'] == repair_full['summary'], 'treatment does not change complete outcome')
                    effects(False); returned('repair B')
                    deploy('repair', False, 1)
                    repair_reduced = finish('repair', '06-repair-reduced')
                    check(repair_reduced['summary'] == repair_full['summary'], 'repair full/reduced complete outcomes identical')
                    effects(True); returned('repair reduced')
                    fitted = click('Attachment', 'attachment', art)
                    check(fitted['launcherVisible'] and not fitted['repairVisible'], 'real pointer commits launcher before deployment')
                    deploy('launcher', True, 1)
                    at_tick(160); pause(); compare('07-launcher-early-wide'); resume()
                    at_tick(1400); pause(); compare('08-launcher-busy-wide'); resume()
                    launcher_full = finish('launcher', '09-launcher-full')
                    effects(False); returned('launcher full')
                    deploy('launcher', False, 0)
                    launcher_reduced = finish('launcher', '10-launcher-reduced')
                    check(launcher_reduced['summary'] == launcher_full['summary'], 'launcher full/reduced complete outcomes identical')
                    effects(True); returned('launcher reduced')
                    for index in range(4):
                        deploy('launcher', True)
                        returned('repeat ' + str(index + 1))
                    screenshot('11-returned-inspection')
                    report['status'] = 'pass'
                report['pointer_validation'] = validate(report['input_trace'], clicks)
                check(not errors, 'no JavaScript or error-level console events')
                check(not requests, 'no failed HTTP requests')
                check(artifact_hashes(build) == source['artifacts'], 'tested artifact bytes unchanged')
            except (Exception, KeyboardInterrupt):
                try:
                    screenshot('failure-frame')
                except Exception as capture_error:
                    report['failure_capture_error'] = str(capture_error)
                raise
            finally:
                for recorder in recordings:
                    try:
                        recorder.stop()
                    except Exception as capture_error:
                        report.setdefault('motion_cleanup_errors', []).append(str(capture_error))
                native.close()
                report['browser_closed'], report['browser_forced'] = native.closed, native.forced
        if not smoke:
            for index, recorder in enumerate(recordings):
                motion[index].update(recorder.encode())
                check(motion[index]['duration_seconds'] >= 6, 'normal-speed motion segment has useful recorded duration', motion[index]['name'])
    except (Exception, KeyboardInterrupt) as exception:
        report.update(status='failed', error=type(exception).__name__ + ': ' + str(exception))
    finally:
        if native is not None and not native.closed:
            try:
                native.close()
                report['browser_closed'], report['browser_forced'] = native.closed, native.forced
            except Exception as cleanup_error:
                report.update(status='failed', browser_cleanup_error=str(cleanup_error))
        server.shutdown(); server.server_close(); server_thread.join(timeout=3)
        try:
            connection = socket.create_connection(('127.0.0.1', server.server_port), timeout=.5)
            connection.close(); report.update(status='failed', server_closed=False)
        except OSError:
            report['server_closed'] = True
        report.update(errors=errors, requests=requests, verifier_sha256=digest(Path(__file__)))
        if 'input_trace' in report:
            try:
                report['pointer_validation'] = validate_pointer_trace(report['input_trace'], clicks)
            except ValueError as pointer_error:
                report['pointer_validation'] = {'matched': False, 'error': str(pointer_error),
                    'planned_actions': len(clicks), 'observed_edges': sum(item['kind'] in ('pointerdown', 'pointerup')
                                                                       for item in report['input_trace']),
                    'extra_input_source': 'unknown'}
                report['status'] = 'failed'
        report['warnings'] = [message['text'] for message in messages if message['type'] == 'warning']
        report['shader_diagnostics'] = [message['text'] for message in messages if 'shader is not supported' in message['text']]
        report['sources_at_verification'] = {path.relative_to(ROOT).as_posix(): digest(path)
                                             for path in (ROOT / 'Unity/Assets/Scripts').glob('*.cs')}
        for name, value in [('result', report), ('states', states), ('art-states', art),
                            ('visual-states', visual), ('layouts', layouts), ('console', messages)]:
            (output / (name + '.json')).write_text(json.dumps(value, indent=2, allow_nan=False), encoding='utf-8')
        print(json.dumps({'status': report['status'], 'mode': report['mode'], 'checks': len(checks),
                          'error': report.get('error'), 'server_closed': report.get('server_closed'),
                          'evidence': str(output)}, indent=2), flush=True)
    return 0 if report['status'] in ('pass', 'smoke-pass') else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--smoke', action='store_true', help='short first-look check; does not claim full acceptance')
    parser.add_argument('--headless', action='store_true', help='owned Chrome headless new; browser-tab focus scope only')
    arguments = parser.parse_args()
    raise SystemExit(run(arguments.receipt, arguments.smoke, arguments.headless))
