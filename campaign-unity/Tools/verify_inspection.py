"""Exercise inspection by ordinary pointer input against a completed local Web build."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import datetime, hashlib, json, math, sys, threading, time, uuid
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('build',type=Path)
parser.add_argument('--receipt',type=Path,default=ROOT/'docs/inspection-20260925/receipt.json')
args=parser.parse_args();BUILD=args.build.resolve();EXPECTED=args.receipt.resolve()
if not EXPECTED.is_relative_to(ROOT) or not EXPECTED.is_file():
    raise SystemExit('Expected an explicit receipt inside this project')
if not BUILD.is_relative_to(ROOT/'Builds') or not (BUILD/'index.html').is_file():
    raise SystemExit('Expected a completed task-owned Web build')
OUT=ROOT/'Evidence'/('inspection-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6])
OUT.mkdir(parents=True,exist_ok=False)
def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()
inputs={p.relative_to(BUILD).as_posix():digest(p) for p in BUILD.rglob('*') if p.is_file()}
class Handler(SimpleHTTPRequestHandler):
    extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.wasm':'application/wasm'}
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(BUILD)))
threading.Thread(target=server.serve_forever,daemon=True).start()
checks=[]; states=[]; inspections=[]; console=[]; errors=[]; requests=[]
report={'status':'running','build':str(BUILD),'kind':'real-pointer-inspection-check','checks':checks,'inputs':inputs,'phone_tested':False,'performance_measured':False}
def check(condition,name):
    checks.append({'check':name,'pass':bool(condition)})
    if not condition: raise RuntimeError(name)
def collect(message):
    text=message.text; console.append({'type':message.type,'text':text})
    if message.type=='error': errors.append(text)
    for tag, target in [('ST_ART_STATE ', states), ('ST_ART_INSPECTION ', inspections)]:
        if tag in text:
            try: target.append(json.loads(text.split(tag, 1)[1].splitlines()[0]))
            except (ValueError, IndexError) as exc: errors.append(str(exc))

import io, re, socket
from PIL import Image, ImageChops
from inspection_checks import vector, validate_geometry, camera_matches
clicks=[]; observations=[]; browser=None; max_projection_error=0.0
report.update(clicks=clicks, observations=observations, temporary_port=server.server_port)
print('INSPECTION_EVIDENCE='+str(OUT), flush=True)
try:
    expected=json.loads(EXPECTED.read_text(encoding='utf-8'))
    if expected.get('status','pass')!='pass':raise RuntimeError('Receipt did not pass')
    report.update(expected_receipt=EXPECTED.relative_to(ROOT).as_posix(),expected_receipt_sha256=digest(EXPECTED))
    check(inputs==expected['artifacts'], 'exact previously built artifact identity')
    scene=(ROOT/'Unity/Assets/Scenes/FieldAssembly.unity').read_text()
    fovs=re.findall(r'^  field of view: ([0-9.]+)$', scene, re.MULTILINE)
    check(len(fovs)==1 and float(fovs[0])==43, 'saved single camera FOV is 43 degrees')
    fov=float(fovs[0])
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='chrome', headless=False)
        report['browser_version']=browser.version
        context=browser.new_context(viewport={'width':1600,'height':900}, device_scale_factor=1)
        page=context.new_page(); page.on('console', collect)
        from input_observer import install
        report['input_trace'] = install(page)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('requestfailed', lambda request: requests.append(request.url))
        page.on('response', lambda response: requests.append(str(response.status)+' '+response.url) if response.status>=400 else None)
        try:
            def event(items, start, action=None):
                end=time.monotonic()+15
                while time.monotonic()<end:
                    found=[r for r in items[start:] if action is None or r.get('action')==action]
                    if found: return found[-1]
                    page.wait_for_timeout(50)
                raise RuntimeError('Missing event: '+str(action))
            def click(offset, action, upper=False):
                count=len(states); box=page.locator('#unity-canvas').bounding_box()
                scale=math.sqrt(box['width']/1600*box['height']/900)
                x=box['x']+box['width']/2+offset*scale
                y=box['y']+box['height']-(122 if upper else 58)*scale
                clicks.append({'action':action,'x':x,'y':y,'hold_ms':150})
                page.bring_to_front(); page.mouse.move(x,y); page.wait_for_timeout(100)
                page.mouse.down(); page.wait_for_timeout(150); page.mouse.up()
                state=event(states,count,action)
                receipt=event(inspections,len(inspections))
                return state, receipt
            def capture(name):
                path=OUT/(name+'.png'); page.screenshot(path=str(path))
                return Image.open(path).convert('RGB')
            def validate(name, receipt, view='inspection', shown=True, fitting='repair', yaw=0):
                global max_projection_error
                check(receipt['view']==view and receipt['controlsVisible']==(view=='inspection'), name+' view/controls')
                check(abs(receipt['yaw']-yaw)<.001, name+' yaw')
                error=validate_geometry(receipt, shown, fitting, fov)
                max_projection_error=max(max_projection_error,error)
                check(True, name+' independent endpoint projection and panel bounds')
                if view=='inspection':
                    check(camera_matches(receipt,baseline,yaw), name+' actual orbit position')
                check(math.dist(vector(receipt['tankRotation'],'xyzw'),vector(baseline['tankRotation'],'xyzw'))<1e-6, name+' tank not rotated')
                check(math.dist(vector(receipt['turretRotation'],'xyzw'),vector(baseline['turretRotation'],'xyzw'))<1e-6, name+' paused turret not aimed')
                observations.append({'case':name,'receipt':receipt,'projection_error_px':error})
            def visible_pixels(image, receipt, name):
                check(image.size==(receipt['width'],receipt['height']), name+' screenshot geometry')
                for part in receipt['parts']:
                    x,y=vector(part['endpointScreen'],'xy'); y=image.height-y
                    region=image.crop((round(x)-3,round(y)-3,round(x)+4,round(y)+4))
                    gold=sum(all(abs(c-v)<=8 for c,v in zip(pixel,(194,156,87))) for pixel in region.getdata())
                    check(gold>=2, name+' rendered anchor '+part['id'])
            page.add_init_script('''
                for (const kind of ['pointerdown','pointerup']) {
                    document.addEventListener(kind,e=>console.log('ST_TEST_POINTER '+JSON.stringify({
                        kind,x:e.clientX,y:e.clientY,target:e.target.id,focused:document.hasFocus(),
                        dpr:devicePixelRatio,width:innerWidth,height:innerHeight
                    })),true);
                }
            ''')
            page.goto('http://127.0.0.1:'+str(server.server_port)+'/',wait_until='domcontentloaded')
            page.wait_for_function("getComputedStyle(document.querySelector('#loading')).display==='none'",timeout=180000)
            page.bring_to_front(); page.locator('#unity-canvas').focus(); page.wait_for_timeout(1500)
            event(states,0,'ready')
            initial=event(inspections,0)
            check(initial['controlsVisible'], 'scene controls initialized before any pointer input')
            capture('00-before-input')
            state,baseline=click(342,'motion')
            check(not state['motion'], 'pause before geometry comparison')
            validate('initial front',baseline)
            front=capture('01-front-repair'); visible_pixels(front,baseline,'front')
            _,right=click(-114,'orbit',True); validate('right orbit',right,yaw=45)
            visible_pixels(capture('02-right-orbit'),right,'right orbit')
            _,left=click(-342,'orbit',True); validate('left returns front',left)
            _,wrapped=click(-342,'orbit',True); validate('left wraps',wrapped,yaw=315)
            _,reset=click(114,'orbit_reset',True); validate('front reset',reset)
            for step in range(1,9):
                _,receipt=click(-114,'orbit',True)
                validate('circle '+str(step),receipt,yaw=(step*45)%360)
                image=capture('03-circle-'+str(step)); visible_pixels(image,receipt,'circle '+str(step))
            _,fitted=click(-114,'attachment'); validate('launcher retarget',fitted,fitting='launcher')
            check(math.dist(vector(baseline['parts'][2]['anchorWorld']),vector(fitted['parts'][2]['anchorWorld']))>.01,'fitting anchor changes with real mesh')
            shown_image=capture('04-launcher-labels'); visible_pixels(shown_image,fitted,'launcher')
            state,hidden=click(342,'callouts',True)
            check(not state['callouts'] and not hidden['requested'],'hide preference recorded')
            validate('hidden labels',hidden,shown=False,fitting='launcher')
            hidden_image=capture('05-hidden-labels')
            for part in fitted['parts']:
                lo,hi=vector(part['panelMin'],'xy'),vector(part['panelMax'],'xy')
                box=(round(lo[0]),round(fitted['height']-hi[1]),round(hi[0]),round(fitted['height']-lo[1]))
                diff=ImageChops.difference(shown_image.crop(box),hidden_image.crop(box))
                changed=sum(max(pixel)>20 for pixel in diff.getdata())
                check(changed>diff.width*diff.height*.25,'actual panel disappears '+part['id'])
            _,hidden_orbit=click(-114,'orbit',True)
            validate('orbit with labels hidden',hidden_orbit,shown=False,fitting='launcher',yaw=45)
            _,wide=click(-342,'battlefield')
            validate('battlefield hidden',wide,view='battlefield',shown=False,fitting='launcher',yaw=45)
            capture('06-battlefield'); before=len(states)
            page.mouse.click(458,778,delay=150); page.wait_for_timeout(400)
            check(len(states)==before,'hidden orbit row does not accept pointer input')
            _,returned=click(-342,'inspection')
            validate('return retains hidden preference',returned,shown=False,fitting='launcher',yaw=45)
            check(not returned['requested'],'hidden preference survives view change')
            _,shown=click(342,'callouts',True)
            validate('show labels',shown,fitting='launcher',yaw=45)
            visible_pixels(capture('07-restored-labels'),shown,'restored')
            _,wide=click(-342,'battlefield')
            validate('battlefield with preference on',wide,view='battlefield',shown=False,fitting='launcher',yaw=45)
            check(wide['requested'],'battlefield does not erase label preference')
            _,back=click(-342,'inspection'); validate('return shows labels',back,fitting='launcher',yaw=45)
            for width,height in [(1280,720),(1024,768)]:
                start=len(inspections); page.set_viewport_size({'width':width,'height':height})
                receipt=event(inspections,start)
                validate(str(width)+' resize',receipt,fitting='launcher',yaw=45)
                visible_pixels(capture('08-resize-'+str(width)),receipt,str(width))
                _,receipt=click(-114,'orbit',True)
                validate(str(width)+' orbit',receipt,fitting='launcher',yaw=90)
                _,receipt=click(-342,'orbit',True)
                validate(str(width)+' reverse',receipt,fitting='launcher',yaw=45)
            _,reset=click(114,'orbit_reset',True); validate('resized reset',reset,fitting='launcher')
            _,repair=click(-114,'attachment'); validate('repair retarget',repair)
            visible_pixels(capture('09-final-repair'),repair,'final')
            check(not errors,'no browser errors'); check(not requests,'no failed HTTP requests')
            check(inputs=={p.relative_to(BUILD).as_posix():digest(p) for p in BUILD.rglob('*') if p.is_file()},'tested Web bytes unchanged')
            report['status']='pass'
        except (Exception, KeyboardInterrupt):
            capture('failure-frame')
            raise
        finally:
            context.close(); browser.close(); report['browser_closed']=True
except (Exception, KeyboardInterrupt) as exc:
    report.update(status='failed',error=type(exc).__name__+': '+str(exc))
finally:
    server.shutdown(); server.server_close()
    try:
        connection=socket.create_connection(('127.0.0.1',server.server_port),timeout=.5)
        connection.close(); report.update(status='failed',server_closed=False)
    except OSError:
        report['server_closed']=True
    report.update(errors=errors,requests=requests,max_projection_error_px=max_projection_error)
    report['verifier_sha256']=digest(Path(__file__))
    report['geometry_checks_sha256']=digest(ROOT/'Tools/inspection_checks.py')
    for name,data in [('result',report),('console',console),('states',states),('inspection',inspections)]:
        (OUT/(name+'.json')).write_text(json.dumps(data,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps({'status':report['status'],'checks':len(checks),'error':report.get('error'),
                      'server_closed':report.get('server_closed'),'evidence':str(OUT)},indent=2),flush=True)
raise SystemExit(0 if report['status']=='pass' else 1)
