"""Build a saved art scene; no Android, scene regeneration or deployment."""
from pathlib import Path
import argparse,datetime,hashlib,json,os,shutil,subprocess,sys,uuid
ROOT=Path(__file__).resolve().parents[1];PROJECT=ROOT/'Unity'
def require(ok,message):
    if not ok:raise RuntimeError(message)
def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def source_binding():
    # Bind the actual dirty sources, not only the last committed revision.
    files=[]
    for folder in ('Unity/Assets','Unity/ProjectSettings','Tools'):
        files.extend(f for f in (ROOT/folder).rglob('*') if f.is_file() and '__pycache__' not in f.parts)
    files.extend(f for f in (PROJECT/'Packages').glob('*.json') if f.is_file())
    spec=ROOT.parent/'.codearbiter/specs/unity-battlefield-visual-review.md'
    if spec.is_file():files.append(spec)
    inventory={os.path.relpath(f,ROOT).replace('\\','/'):digest(f) for f in sorted(set(files))}
    head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode('utf-8').strip()
    dirty=subprocess.check_output(['git','status','--porcelain=v1','--untracked-files=all','--',
                                   'campaign-unity','.codearbiter/specs/unity-battlefield-visual-review.md'],
                                  cwd=ROOT.parent).decode('utf-8').splitlines()
    return {'head':head,'dirty':dirty,'files':inventory,
            'sha256':hashlib.sha256(json.dumps(inventory,sort_keys=True).encode('utf-8')).hexdigest()}

p=argparse.ArgumentParser(description=__doc__);p.add_argument('--editor',required=True,type=Path)
p.add_argument('--scene',choices=('field','review'),default='field',help='Existing saved scene to export (default: field)')
a=p.parse_args();editor=a.editor.resolve();require(editor.is_file(),'Editor executable missing')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6]
evidence=ROOT/'Evidence'/('build-'+stamp);evidence.mkdir(parents=True,exist_ok=False)
build=ROOT/'Builds'/('Web-'+stamp)
scene_path='Assets/Scenes/'+('BattlefieldReview.unity' if a.scene=='review' else 'FieldAssembly.unity')
scene=PROJECT/scene_path
record={'status':'running','build':str(build),'stages':[],'scene':scene_path,
        'scene_before':digest(scene),'android':False,'publish':False}
env=os.environ.copy();env['ST_ART_WEB_OUTPUT']=str(build)
if os.name=='nt':
    common=Path(env.get('ProgramData',env.get('SystemDrive','C:')+'/ProgramData'))
    require(common.is_dir(),'ProgramData unavailable');env.setdefault('ProgramData',str(common));env.setdefault('ALLUSERSPROFILE',str(common))
def save():(evidence/'result.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
def run(label,cmd,timeout=1200):
    with (evidence/(label+'.log')).open('wb') as log:
        child=subprocess.Popen(cmd,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
        try:rc=child.wait(timeout)
        except subprocess.TimeoutExpired:
            child.terminate();record['timed_out_child']=child.pid;save();raise
    record['stages'].append({'stage':label,'exit':rc});save();require(rc==0,label+' failed; inspect '+str(evidence))
print('BUILD_EVIDENCE='+str(evidence),flush=True)
try:
    run('editor-version',[str(editor),'-version'],30)
    require((evidence/'editor-version.log').read_text(encoding='utf-8').strip()=='6000.3.24f1','Unexpected editor version')
    require((editor.parent/'Data/PlaybackEngines/WebGLSupport').is_dir(),'Install matching Web support through Hub')
    require(shutil.disk_usage(ROOT).free>3*1024**3,'Less than 3 GiB free')
    if os.name=='nt':
        env['ST_ART_PROJECT_CHECK']=str(PROJECT)
        cmd="$p=$env:ST_ART_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"
        run('editor-not-open',['powershell.exe','-NoProfile','-Command',cmd],30)
    # Restore an unmodified same-version dependency from the installed editor.
    vendor=PROJECT/'Packages/com.unity.render-pipelines.universal'
    if not vendor.exists():
        origin=editor.parent/'Data/Resources/PackageManager/BuiltInPackages/com.unity.render-pipelines.universal'
        require(origin.is_dir(),'Installed URP package unavailable; no alternative version substituted')
        package=json.loads((origin/'package.json').read_text(encoding='utf-8'))
        require(package['version']=='17.3.0','Unexpected URP version')
        inputs={f.relative_to(origin).as_posix():digest(f) for f in origin.rglob('*') if f.is_file()}
        shutil.copytree(origin,vendor)
        require(all(digest(vendor/rel)==h for rel,h in inputs.items()),'URP copy mismatch')
        (evidence/'vendor-input.json').write_text(json.dumps(inputs,indent=2),encoding='utf-8')
    require(json.loads((vendor/'package.json').read_text(encoding='utf-8'))['version']=='17.3.0','Unexpected embedded URP')
    record['source_before']=source_binding();save()
    method='VisualReviewBuild.BuildWeb' if a.scene=='review' else 'SceneBuild.BuildWeb'
    run('unity-web',[str(editor),'-batchmode','-quit','-projectPath',str(PROJECT),'-buildTarget','WebGL','-executeMethod',method,'-logFile','-'])
    log=(evidence/'unity-web.log').read_text(encoding='utf-8',errors='replace')
    if a.scene=='review':
        for marker in ('ST_VIS_VALIDATE_PASS','ST_VIS_CHECKS_PASS','ST_VIS_WEB_BUILD_PASS'):
            require(marker in log,'Missing visual review checks: '+marker)
    else:require('ST_ART_WEB_BUILD_PASS' in log,'Missing Unity success marker')
    require('ST_ENC_MODEL_PASS' in log,'Missing encounter model checks')
    require(digest(scene)==record['scene_before'],'Build unexpectedly changed saved scene')
    run('web-entry',[sys.executable,str(ROOT/'Tools/make_web_entry.py'),str(build)],30)
    index=build/'index.html';s=index.read_text(encoding='utf-8');index.write_text(s.replace('</head>','<link rel="icon" href="TemplateData/favicon.ico">\n</head>'),encoding='utf-8')
    record['source_after']=source_binding()
    require(record['source_before']==record['source_after'],'Build source changed during export; output is not source-bound')
    record.update(status='pass',scene_after=digest(scene),artifacts={f.relative_to(build).as_posix():digest(f) for f in build.rglob('*') if f.is_file()})
except Exception as exc:
    record.update(status='failed',error=type(exc).__name__+': '+str(exc));raise
finally:save();print(json.dumps({'status':record['status'],'build':str(build),'evidence':str(evidence)}),flush=True)
