"""Read-only browser verification of the owner's completed Web build."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import datetime, hashlib, json, math, threading, time, uuid, sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
PRIOR=None
BUILD=Path(sys.argv[1]).resolve()
assert BUILD.is_relative_to(ROOT/'Builds') and (BUILD/'index.html').is_file()
OUT=ROOT/'Evidence'/('browser-verify-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6])
OUT.mkdir(parents=True,exist_ok=False)
def digest(p):
    with p.open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()
inputs={p.relative_to(BUILD).as_posix():digest(p) for p in BUILD.rglob('*') if p.is_file()}
class Handler(SimpleHTTPRequestHandler):
    extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.wasm':'application/wasm'}
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(BUILD)))
threading.Thread(target=server.serve_forever,daemon=True).start()
checks=[]; states=[]; recoils=[]; messages=[]; errors=[]; network=[]; clicks=[]
report={'kind':'browser-only-verification-no-rebuild','build':str(BUILD),'prior_receipt':str(PRIOR),'status':'running','checks':checks,'clicks':clicks,'recoils':recoils,'inputs':inputs,'phone_tested':False,'performance_measured':False}
def check(ok,name):
    checks.append({'check':name,'pass':bool(ok)})
    if not ok: raise RuntimeError(name)
def console(msg):
    text=msg.text; messages.append({'type':msg.type,'text':text})
    if msg.type=='error': errors.append(text)
    for tag,target in [('ST_ART_STATE ',states),('ST_ART_RECOIL ',recoils)]:
        if tag in text: target.append(json.loads(text.split(tag,1)[1].splitlines()[0]))

print('BROWSER_EVIDENCE='+str(OUT),flush=True)
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='chrome',headless=False)
        report['browser_version']=browser.version
        context=browser.new_context(viewport={'width':1600,'height':900},device_scale_factor=1)
        page=context.new_page(); page.on('console',console)
        from input_observer import install
        report['input_trace'] = install(page)
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.on('requestfailed',lambda request: network.append(request.url))
        def event(items,start,action=None):
            end=time.monotonic()+15
            while time.monotonic()<end:
                found=[x for x in items[start:] if action is None or x.get('action')==action]
                if found:return found[-1]
                page.wait_for_timeout(50)
            raise RuntimeError('Missing event: '+str(action))
        def click(offset,action):
            n=len(states); box=page.locator('#unity-canvas').bounding_box()
            scale=math.sqrt(box['width']/1600*box['height']/900)
            x=box['x']+box['width']/2+offset*scale; y=box['y']+box['height']-58*scale
            clicks.append({'action':action,'x':x,'y':y,'hold_ms':150,'canvas':box})
            page.bring_to_front();page.mouse.move(x,y);page.wait_for_timeout(100)
            page.mouse.down();page.wait_for_timeout(150);page.mouse.up()
            return event(states,n,action)
        def capture(name):page.screenshot(path=str(OUT/(name+'.png')))
        page.goto('http://127.0.0.1:'+str(server.server_port)+'/',wait_until='domcontentloaded')
        page.wait_for_function("getComputedStyle(document.querySelector('#loading')).display==='none'",timeout=180000)
        page.bring_to_front();page.locator('#unity-canvas').focus();page.wait_for_timeout(1000)
        initial=event(states,0,'ready');check(initial['repairVisible'] and not initial['launcherVisible'],'initial repair')
        capture('00-loaded');check(not click(342,'motion')['motion'],'pause idle with held pointer')
        page.wait_for_timeout(400);capture('01-inspection-repair')
        item=click(-114,'attachment');check(item['launcherVisible'] and not item['repairVisible'],'launcher replaces repair')
        page.wait_for_timeout(300);capture('02-inspection-launcher')
        def recoil(name):
            n=len(recoils);click(114,'preview');r=event(recoils,n)
            peak=float(r['peakWorld']);home=float(r['returnWorld'])
            check(math.isfinite(peak) and .30<=peak<=.321 and math.isfinite(home) and 0<=home<=.0001,name)
        for i in range(3):recoil('inspection recoil cycle '+str(i+1))
        capture('03-recoil-restored');check(click(-342,'battlefield')['view']=='battlefield','battlefield view')
        page.wait_for_timeout(1600);capture('04-battlefield-launcher')
        item=click(-114,'attachment');check(item['repairVisible'] and not item['launcherVisible'],'repair in battlefield')
        page.wait_for_timeout(300);capture('05-battlefield-repair');recoil('battlefield recoil')
        check(click(-342,'inspection')['view']=='inspection','inspection restored')
        page.wait_for_timeout(1600);page.set_viewport_size({'width':1280,'height':720})
        page.wait_for_timeout(700);check(click(-114,'attachment')['launcherVisible'],'attachment after resize')
        check(click(342,'motion')['motion'],'resume idle');recoil('recoil with rotating turret')
        capture('06-resized-inspection');check(not errors,'no observed browser errors')
        check(not network,'no failed requests');report['status']='pass'
        context.close();browser.close()
except Exception as exc:
    report.update(status='failed',error=type(exc).__name__+': '+str(exc))
finally:
    server.shutdown();server.server_close();report.update(errors=errors,network=network)
    for name,data in [('result',report),('console',messages),('states',states)]:
        (OUT/(name+'.json')).write_text(json.dumps(data,indent=2),encoding='utf-8')
    print(json.dumps({'status':report['status'],'checks':len(checks),'error':report.get('error'),'evidence':str(OUT)},indent=2),flush=True)
raise SystemExit(0 if report['status']=='pass' else 1)
