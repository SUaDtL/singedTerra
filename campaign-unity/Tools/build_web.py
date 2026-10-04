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
    for name in ('unity-battlefield-visual-review.md','unity-parts-library.md','last-stand-playable-loop.html'):
        spec=ROOT.parent/'.codearbiter/specs'/name
        if spec.is_file():files.append(spec)
    plan=ROOT.parent/'.codearbiter/plans/last-stand-playable-loop.html'
    if plan.is_file():files.append(plan)
    inventory={os.path.relpath(f,ROOT).replace('\\','/'):digest(f) for f in sorted(set(files))}
    head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode('utf-8').strip()
    dirty=subprocess.check_output(['git','status','--porcelain=v1','--untracked-files=all','--',
                                   'campaign-unity','.codearbiter/specs/unity-battlefield-visual-review.md',
                                   '.codearbiter/specs/unity-parts-library.md',
                                   '.codearbiter/specs/last-stand-playable-loop.html',
                                   '.codearbiter/plans/last-stand-playable-loop.html'],
                                  cwd=ROOT.parent).decode('utf-8').splitlines()
    return {'head':head,'dirty':dirty,'files':inventory,
            'sha256':hashlib.sha256(json.dumps(inventory,sort_keys=True).encode('utf-8')).hexdigest()}

p=argparse.ArgumentParser(description=__doc__);p.add_argument('--editor',required=True,type=Path)
p.add_argument('--scene',choices=('field','review','gallery','last-stand'),default='field',help='Existing saved scene to export (default: field)')
a=p.parse_args();editor=a.editor.resolve();require(editor.is_file(),'Editor executable missing')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6]
evidence_root=ROOT/'Evidence'
if a.scene=='last-stand':evidence_root=evidence_root/'last-stand-playable-loop'/'t03'
evidence=evidence_root/('build-'+stamp);evidence.mkdir(parents=True,exist_ok=False)
build=ROOT/'Builds'/('Web-'+stamp)
scene_path={'field':'Assets/Scenes/FieldAssembly.unity',
            'review':'Assets/Scenes/BattlefieldReview.unity',
            'gallery':'Assets/PartsLibrary/PartsGallery.unity',
            'last-stand':'Assets/Scenes/LastStandPrototype.unity'}[a.scene]
scene=PROJECT/scene_path
protected_scenes={name:digest(PROJECT/path) for name,path in {
    'field':'Assets/Scenes/FieldAssembly.unity',
    'review':'Assets/Scenes/BattlefieldReview.unity'}.items()}
record={'status':'running','build':str(build),'stages':[],'scene':scene_path,
        'scene_before':digest(scene),'protected_scenes_before':protected_scenes,
        'approved_artifacts':{
            'ST-LS-LOOP-SPEC':{'revision':4,'model_sha256':'0fce3f7b2eb7f6743b3b5c5960b8fdece577c884403710bca32ea84427ddf1df','normative_sha256':'58b5ecaec95493a38751a65320949dd846716b86abf46a6cab82a62161b694aa'},
            'ST-LS-LOOP-PLAN':{'revision':6,'model_sha256':'f912cf6d951328966555e3c2f9511fcaca3bbefc5c21d04de7c896f1920a7304','normative_sha256':'b8a8dd6156609bb6c14d5ce45ce34c8fb4124d37af806b240741e90e640f00b1'}},
        'android':False,'publish':False}
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
    method={'field':'SceneBuild.BuildWeb','review':'VisualReviewBuild.BuildWeb',
            'gallery':'PartsGalleryBuild.BuildWeb','last-stand':'LastStandLoopBuild.BuildWeb'}[a.scene]
    run('unity-web',[str(editor),'-batchmode','-quit','-projectPath',str(PROJECT),'-buildTarget','WebGL','-executeMethod',method,'-logFile','-'])
    log=(evidence/'unity-web.log').read_text(encoding='utf-8',errors='replace')
    if a.scene=='review':
        for marker in ('ST_VIS_VALIDATE_PASS','ST_VIS_CHECKS_PASS','ST_VIS_WEB_BUILD_PASS'):
            require(marker in log,'Missing visual review checks: '+marker)
    elif a.scene=='gallery':
        for marker in ('ST_KIT_GALLERY_PASS','ST_KIT_GALLERY_WEB_BUILD_PASS'):
            require(marker in log,'Missing gallery checks: '+marker)
    elif a.scene=='last-stand':
        for marker in ('ST_LS_UNITY_PASS test_real_session_modes_and_damage',
                       'ST_LS_UNITY_PASS test_pause_terminal_ui_and_audio_lifecycle',
                       'ST_LS_WEB_BUILD_PASS'):
            require(marker in log,'Missing Last Stand checks: '+marker)
    else:require('ST_ART_WEB_BUILD_PASS' in log,'Missing Unity success marker')
    if a.scene!='gallery':require('ST_ENC_MODEL_PASS' in log,'Missing encounter model checks')
    require(digest(scene)==record['scene_before'],'Build unexpectedly changed saved scene')
    require({name:digest(PROJECT/path) for name,path in {
        'field':'Assets/Scenes/FieldAssembly.unity',
        'review':'Assets/Scenes/BattlefieldReview.unity'}.items()}==protected_scenes,
        'Build changed protected field or review scene')
    run('web-entry',[sys.executable,str(ROOT/'Tools/make_web_entry.py'),str(build),'--scene',a.scene],30)
    index=build/'index.html';s=index.read_text(encoding='utf-8');index.write_text(s.replace('</head>','<link rel="icon" href="TemplateData/favicon.ico">\n</head>'),encoding='utf-8')
    record['source_after']=source_binding()
    require(record['source_before']==record['source_after'],'Build source changed during export; output is not source-bound')
    record.update(status='pass',scene_after=digest(scene),protected_scenes_after={name:digest(PROJECT/path) for name,path in {
        'field':'Assets/Scenes/FieldAssembly.unity',
        'review':'Assets/Scenes/BattlefieldReview.unity'}.items()},
        artifacts={f.relative_to(build).as_posix():digest(f) for f in build.rglob('*') if f.is_file()})
except Exception as exc:
    record.update(status='failed',error=type(exc).__name__+': '+str(exc));raise
finally:save();print(json.dumps({'status':record['status'],'build':str(build),'evidence':str(evidence)}),flush=True)
