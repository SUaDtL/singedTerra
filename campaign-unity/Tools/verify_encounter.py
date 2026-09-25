"""Real-pointer ST-ENC-01 check against a successful, explicitly supplied build receipt."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import datetime, hashlib, json, math, re, socket, sys, threading, time, uuid
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
RECEIPT = Path(sys.argv[1]).resolve()
if not RECEIPT.is_relative_to(ROOT / 'Evidence'):
    raise SystemExit('Expected this project\'s successful build receipt')
source = json.loads(RECEIPT.read_text(encoding='utf-8'))
BUILD = Path(source['build']).resolve()
if source['status'] != 'pass' or not BUILD.is_relative_to(ROOT / 'Builds'):
    raise SystemExit('Build has not passed')
def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()
inputs = {p.relative_to(BUILD).as_posix(): digest(p) for p in BUILD.rglob('*') if p.is_file()}
if inputs != source['artifacts']: raise SystemExit('Build bytes differ from receipt')
log = (RECEIPT.parent / 'unity-web.log').read_text(encoding='utf-8', errors='replace')
model_results = re.findall(r'ST_ENC_MODEL_PASS (\{[^\n]+\})', log)
if len(model_results) != 1: raise SystemExit('Expected one C# model receipt')
expected = json.loads(model_results[0])['summaries']
OUT = ROOT / 'Evidence' / ('encounter-browser-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6])
OUT.mkdir(parents=True, exist_ok=False)
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm'}
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(BUILD)))
threading.Thread(target=server.serve_forever, daemon=True).start()
states, art, messages, errors, requests, checks, clicks, terminals = [], [], [], [], [], [], [], []
report = {'status': 'running', 'build': BUILD.name, 'artifacts': inputs, 'build_receipt_sha256': digest(RECEIPT),
          'checks': checks, 'clicks': clicks, 'terminals': terminals, 'expected_csharp': expected,
          'temporary_port': server.server_port, 'android': False, 'performance_test': False}
def check(ok, name):
    checks.append({'check': name, 'pass': bool(ok)})
    if not ok: raise RuntimeError(name)
def collect(message):
    text = message.text; messages.append({'type': message.type, 'text': text})
    if message.type == 'error': errors.append(text)
    for tag, target in [('ST_ENC_STATE ', states), ('ST_ART_STATE ', art)]:
        if tag in text: target.append(json.loads(text.split(tag, 1)[1].splitlines()[0]))
print('ENCOUNTER_BROWSER_EVIDENCE=' + str(OUT), flush=True)
try:
    with sync_playwright() as pw:
        from native_chrome import NativeChrome
        native = NativeChrome(pw, OUT)
        browser = native.browser
        report['browser_mode'] = 'owned-default-context-no-overrides'
        report['debug_port'] = native.port
        report['browser_version'] = browser.version
        context = native.context
        page = context.pages[0]; page.set_viewport_size({'width':1600,'height':900}); page.on('console', collect)
        from input_observer import install
        report['input_trace'] = install(page)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('requestfailed', lambda request: requests.append(request.url))
        page.on('response', lambda response: requests.append(str(response.status)+' '+response.url) if response.status >= 400 else None)
        try:
            def event(items, start, predicate, timeout=30):
                end = time.monotonic() + timeout
                while time.monotonic() < end:
                    found = [s for s in items[start:] if predicate(s)]
                    if found: return found[-1]
                    page.wait_for_timeout(40)
                raise RuntimeError('Missing expected encounter event')
            def click(offset, action, top=False, legacy=False):
                items = art if legacy else states; start = len(items)
                box = page.locator('#unity-canvas').bounding_box()
                scale = math.sqrt(box['width']/1600 * box['height']/900)
                x = box['x'] + box['width']/2 + offset*scale
                y = box['y'] + (54*scale if top else box['height']-58*scale)
                clicks.append({'action': action, 'x': x, 'y': y, 'hold_ms': 150})
                page.bring_to_front(); page.mouse.move(x, y); page.wait_for_timeout(80)
                page.mouse.down(); page.wait_for_timeout(150); page.mouse.up()
                return event(items, start, lambda s: s['action'] == action)
            def capture(name): page.screenshot(path=str(OUT/(name+'.png')))
            def deployed(fitting):
                s = click(0, 'deploy', top=True)
                check(s['tick'] == 0 and s['hp'] == 120 and s['alive'] == 0, fitting+' fresh deployment')
                check(s['locked'] and s['fitting'] == fitting and not s['failed'], fitting+' committed fitting')
                return s
            def finish(fitting, name):
                s = event(states, 0, lambda s: s['action'] == 'terminal' and s['run'] == states[-1]['run'], 60)
                check(s['status'] == 'Defeated' and s['hp'] == 0 and s['locked'], name+' actual defeat')
                check(s['summary'] == expected[1 if fitting == 'launcher' else 0], name+' matches C# fixture outcome')
                check(s['closeHits'] > 0 and s['rangedHits'] > 0 and s['cannon'] > 0, name+' both threat roles and automatic cannon')
                check(s['visibleUnits'] == s['alive'] and s['pool'] == 32, name+' presentation matches active population')
                terminals.append(s); capture(name+'-defeat'); return s
            def returned(name):
                s = click(300, 'return')
                check(s['status'] == 'Fitting' and not s['locked'] and s['visibleUnits'] == 0, name+' return clears encounter')
                return s
            page.goto('http://127.0.0.1:'+str(server.server_port)+'/', wait_until='domcontentloaded')
            event(art, 0, lambda s: s['action'] == 'ready')
            ready = event(states, 0, lambda s: s['action'] == 'ready')
            check(ready['status'] == 'Fitting' and not ready['locked'], 'inspection remains initial mode')
            page.bring_to_front(); page.locator('#unity-canvas').focus(); page.wait_for_timeout(500)
            capture('00-inspection-with-deploy'); deployed('repair')
            event(states, 0, lambda s: s['action'] == 'tick' and s['tick'] >= 40)
            capture('01-repair-automatic')
            n = len(art); page.mouse.click(800, 450, delay=150); page.wait_for_timeout(200)
            check(len(art) == n, 'world click does not issue aiming, fitting or manual preview commands')
            paused = click(-300, 'pause'); check(paused['paused'], 'user pause accepted')
            page.wait_for_timeout(1200)
            reduced = click(0, 'effects')
            check(reduced['tick'] == paused['tick'] and reduced['hp'] == paused['hp'] and not reduced['fullEffects'], 'paused tick/hull freeze and reduced decoration')
            restored = click(0, 'effects')
            check(restored['fullEffects'] and restored['tick'] == paused['tick'], 'restore decoration without combat advance')
            resumed = click(-300, 'pause'); check(not resumed['paused'], 'explicit resume accepted')
            start = len(states); other = context.new_page()
            other.goto('about:blank'); other.bring_to_front()
            report['background_dom'] = page.evaluate('({hidden:document.hidden, focused:document.hasFocus()})')
            check(not report['background_dom']['focused'], 'actual foreground focus loss without focus emulation')
            page.wait_for_timeout(1200)
            page.bring_to_front(); page.locator('#unity-canvas').focus(); other.close()
            suspended = event(states, start, lambda s: s['action'] == 'suspend' and s['reason'] == 'focus')
            still = click(0, 'effects')
            check(still['paused'] and still['tick'] == suspended['tick'] and still['hp'] == suspended['hp'], 'real focus loss retains run without catch-up')
            check(click(0, 'effects')['fullEffects'], 'restore full tracers after focus check')
            check(not click(-300, 'pause')['paused'], 'resume after foreground return')
            repair_end = finish('repair', '02-repair-full')
            page.wait_for_timeout(800); terminal_check = click(0, 'effects')
            check(terminal_check['tick'] == repair_end['tick'] and terminal_check['hp'] == 0, 'terminal state never advances')
            click(0, 'effects'); returned('repair')
            fitted = click(-114, 'attachment', legacy=True)
            check(fitted['launcherVisible'] and not fitted['repairVisible'], 'launcher chosen before deployment')
            deployed('launcher')
            run_id = states[-1]['run']
            event(states, 0, lambda s: s['run'] == run_id and s['tick'] >= 80)
            capture('03-launcher-automatic')
            page.set_viewport_size({'width': 1280, 'height': 720}); page.wait_for_timeout(600)
            capture('04-launcher-resized')
            full_end = finish('launcher', '05-launcher-full'); returned('launcher full')
            deployed('launcher')
            check(not click(0, 'effects')['fullEffects'], 'reduced tracer mode during live run')
            run_id = states[-1]['run']
            event(states, 0, lambda s: s['run'] == run_id and s['tick'] >= 80)
            capture('06-launcher-reduced')
            low_end = finish('launcher', '07-launcher-reduced')
            check(full_end['summary'] == low_end['summary'], 'full/reduced effects produce identical complete outcome')
            returned('launcher reduced')
            for i in range(4):
                deployed('launcher'); returned('repeat '+str(i+1))
            capture('08-returned-inspection')
            # Separate the optional OS-minimize acceptance from completed encounter flows.
            deployed('launcher')
            start = len(states)
            cdp = context.new_cdp_session(page)
            window_id = cdp.send('Browser.getWindowForTarget')['windowId']
            cdp.send('Browser.setWindowBounds', {'windowId': window_id, 'bounds': {'windowState': 'minimized'}})
            page.wait_for_timeout(1200)
            report['minimized_dom'] = page.evaluate('({hidden:document.hidden, focused:document.hasFocus()})')
            check(report['minimized_dom']['hidden'] and not report['minimized_dom']['focused'], 'actual minimized page is hidden and unfocused')
            cdp.send('Browser.setWindowBounds', {'windowId': window_id, 'bounds': {'windowState': 'normal'}})
            page.bring_to_front(); page.locator('#unity-canvas').focus()
            hidden = event(states, start, lambda s: s['action'] == 'suspend' and s['reason'] in ('focus', 'application'))
            still = click(0, 'effects')
            check(still['paused'] and still['tick'] == hidden['tick'] and still['hp'] == hidden['hp'], 'minimized interval neither advances combat nor auto-resumes')
            click(0, 'effects'); check(not click(-300, 'pause')['paused'], 'explicit resume after minimize')
            returned('minimize check')
            check(not errors, 'no JavaScript or error-level console events')
            check(not requests, 'no failed HTTP requests')
            check(inputs == {p.relative_to(BUILD).as_posix(): digest(p) for p in BUILD.rglob('*') if p.is_file()}, 'tested artifact unchanged')
            report['status'] = 'pass'
        except (Exception, KeyboardInterrupt):
            page.screenshot(path=str(OUT/'failure-frame.png')); raise
        finally:
            native.close(); report['browser_closed'] = native.closed; report['browser_forced'] = native.forced
except (Exception, KeyboardInterrupt) as exception:
    report.update(status='failed', error=type(exception).__name__+': '+str(exception))
finally:
    server.shutdown(); server.server_close()
    try:
        connection = socket.create_connection(('127.0.0.1', server.server_port), timeout=.5)
        connection.close(); report.update(status='failed', server_closed=False)
    except OSError: report['server_closed'] = True
    report.update(errors=errors, requests=requests, verifier_sha256=digest(Path(__file__)))
    report['warnings'] = [m['text'] for m in messages if m['type'] == 'warning']
    report['shader_diagnostics'] = [m['text'] for m in messages if 'shader is not supported' in m['text']]
    report['sources'] = {p.relative_to(ROOT).as_posix(): digest(p) for p in (ROOT/'Unity/Assets/Scripts').glob('*.cs')}
    for name, data in [('result', report), ('states', states), ('art-states', art), ('console', messages)]:
        (OUT/(name+'.json')).write_text(json.dumps(data, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps({'status': report['status'], 'checks': len(checks), 'error': report.get('error'),
                      'server_closed': report.get('server_closed'), 'evidence': str(OUT)}, indent=2), flush=True)
raise SystemExit(0 if report['status'] == 'pass' else 1)
