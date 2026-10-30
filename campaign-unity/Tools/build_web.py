"""Build a saved art scene; no Android, scene regeneration or deployment."""
from pathlib import Path
import argparse,datetime,hashlib,json,os,re,shutil,subprocess,sys,uuid
from unity_shader_log import accepts_log, shader_diagnostics
ROOT=Path(__file__).resolve().parents[1];PROJECT=ROOT/'Unity'
def require(ok,message):
    if not ok:raise RuntimeError(message)
def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def portable_entry(path):
    raw = path.read_bytes()
    try:
        text = raw.decode('utf-8', 'strict')
        if '\x00' in text or any(ord(char) < 32 and char not in '\t\r\n' for char in text):
            raise ValueError('binary control byte')
        normalized = text.replace('\r\n', '\n').replace('\r', '\n').encode('utf-8')
        return {'mode': 'lf-text', 'sha256': hashlib.sha256(normalized).hexdigest()}
    except (UnicodeError, ValueError):
        return {'mode': 'raw', 'sha256': hashlib.sha256(raw).hexdigest()}


def regular_files(folder):
    require(folder.is_dir() and not folder.is_symlink() and not folder.is_junction(),
            'Missing or linked inventory root: ' + str(folder))
    files = []
    for path in folder.rglob('*'):
        require(not path.is_symlink() and not path.is_junction(), 'Linked source input: ' + str(path))
        if path.is_dir():
            continue
        require(path.is_file(), 'Non-regular source input: ' + str(path))
        files.append(path)
    return sorted(files)


def inventory_digest(files):
    return hashlib.sha256(json.dumps(files, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()


def source_binding(root=None):
    root = ROOT if root is None else root
    # Runtime roots are closed, including ignored embedded packages. Only the
    # actual exporter and its non-stdlib helper affect export admission. Test and
    # browser drivers are evidence owners, not export inputs.
    roots = ['Unity/Assets', 'Unity/ProjectSettings', 'Unity/Packages']
    explicit = ['Tools/build_web.py', 'Tools/unity_shader_log.py']
    files = [path for folder in roots for path in regular_files(root / folder)]
    files += [root / name for name in explicit if (root / name).is_file()]
    files = sorted(set(files))
    raw_inventory = {path.relative_to(root).as_posix(): digest(path) for path in files}
    portable = {path.relative_to(root).as_posix(): portable_entry(path) for path in files}
    wrapper_names = ['Tools/make_web_entry.py', 'Tools/web-index-template.html']
    wrapper = {name: portable_entry(root / name) for name in wrapper_names if (root / name).is_file()}
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode('utf-8').strip()
    return {'head': head, 'files': raw_inventory, 'sha256': inventory_digest(portable),
            'closure': {'roots': roots, 'explicitFiles': explicit, 'files': portable,
                        'sha256': inventory_digest(portable)},
            'wrapperFiles': wrapper}


def toolchain_binding(editor):
    base = editor.parent
    webgl = base / 'Data/PlaybackEngines/WebGLSupport'
    origin = base / 'Data/Resources/PackageManager/BuiltInPackages/com.unity.render-pipelines.universal'
    require(json.loads((origin / 'package.json').read_text(encoding='utf-8'))['version'] == '17.3.0',
            'Unexpected installed URP toolchain')
    files = [editor] + regular_files(webgl) + regular_files(origin)
    require(any(path.is_relative_to(webgl) for path in files), 'WebGL module inventory is empty')
    inventory = {'Editor/' + path.relative_to(base).as_posix(): {'mode': 'raw', 'sha256': digest(path)}
                 for path in sorted(set(files))}
    inventory['Python/' + Path(sys.executable).name] = {'mode': 'raw', 'sha256': digest(Path(sys.executable))}
    inventory = dict(sorted(inventory.items()))
    return {'editorVersion': '6000.3.24f1', 'urpVersion': '17.3.0',
            'files': inventory, 'sha256': inventory_digest(inventory)}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--editor',required=True,type=Path)
    p.add_argument('--scene',choices=('field','review','gallery','last-stand'),default='field',help='Existing saved scene to export (default: field)')
    p.add_argument('--stamp', help='Pre-frozen fresh output/evidence suffix')
    p.add_argument('--approval-binding', help='Caller-observed native spec/plan identity JSON; metadata, not runtime inputs')
    p.add_argument('--configuration', choices=('development','release'), default='release')
    a=p.parse_args();editor=a.editor.resolve();require(editor.is_file(),'Editor executable missing')
    require(a.scene=='last-stand' or a.configuration=='release', 'Explicit development configuration is supported for Last Stand only')
    stamp=a.stamp or datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6]
    require(re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}',stamp) is not None, 'Invalid frozen output stamp')
    evidence_root=ROOT/'Evidence'
    if a.scene=='last-stand':evidence_root=evidence_root/'last-stand-playable-loop'/'t05'
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
    record={'schema':'singedterra-last-stand-build/v2','status':'running','build':str(build),'stages':[],'scene':scene_path,
            'scene_before':digest(scene),'protected_scenes_before':protected_scenes,
            'approved_artifacts':json.loads(a.approval_binding) if a.approval_binding else {},
            'android':False,'publish':False,'editor':str(editor),'configuration':a.configuration}
    if a.scene == 'last-stand':
        require(set(record['approved_artifacts']) in ({'ST-LS-LOOP-SPEC', 'ST-LS-LOOP-PLAN'},
                {'ST-LS-WAVES-SPEC', 'ST-LS-WAVES-PLAN'},
                {'ST-LS-RESEARCH-SPEC', 'ST-LS-RESEARCH-PLAN'},
                {'ST-LS-ARCH-SPEC', 'ST-LS-ARCH-PLAN'},
                {'ST-LS-DEPTH-SPEC', 'ST-LS-DEPTH-PLAN'},
                {'ST-LS-INTEL-SPEC', 'ST-LS-INTEL-PLAN'},
                {'ST-LS-CLARITY-SPEC', 'ST-LS-CLARITY-PLAN'}),
                'Supply the caller-observed Last Stand spec/plan identity pair')
        for identity in record['approved_artifacts'].values():
            require(set(identity) == {'revision', 'model_sha256', 'normative_sha256'}
                    and type(identity['revision']) is int and identity['revision'] > 0
                    and all(re.fullmatch(r'[0-9a-f]{64}', identity[key]) for key in ('model_sha256', 'normative_sha256')),
                    'Invalid native approval metadata')
    # These are observed identities only. This exporter cannot confer native approval.
    env=os.environ.copy();env['ST_ART_WEB_OUTPUT']=str(build);env['ST_ART_PROJECT_CHECK']=str(PROJECT)
    env['ST_LS_BUILD_CONFIGURATION']=a.configuration
    if os.name=='nt':
        common=Path(env.get('ProgramData',env.get('SystemDrive','C:')+'/ProgramData'))
        require(common.is_dir(),'ProgramData unavailable');env.setdefault('ProgramData',str(common));env.setdefault('ALLUSERSPROFILE',str(common))
    def save():(evidence/'result.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
    def run(label,cmd,timeout=1200):
        if os.name == 'nt' and cmd[0] == str(editor):
            scan="$p=$env:ST_ART_PROJECT_CHECK.Replace('\\','/'); $n=@(Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains($p)}).Count; if($n){exit 9}"
            run('editor-not-open-before-' + label, ['powershell.exe','-NoProfile','-Command',scan],30)
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
        vendor=PROJECT/'Packages/com.unity.render-pipelines.universal'
        require(vendor.is_dir(), 'Embedded URP must already be present; no install or restoration during export')
        require(json.loads((vendor/'package.json').read_text(encoding='utf-8'))['version']=='17.3.0','Unexpected embedded URP')
        if a.scene == 'last-stand':
            record['toolchain_before'] = toolchain_binding(editor)
            for name in ('build_web.py', 'unity_shader_log.py', 'make_web_entry.py', 'web-index-template.html'):
                require((ROOT / 'Tools' / name).is_file(), 'Missing export tool: ' + name)
        record['source_before']=source_binding();save()
        method={'field':'SceneBuild.BuildWeb','review':'VisualReviewBuild.BuildWeb',
                'gallery':'PartsGalleryBuild.BuildWeb','last-stand':'LastStandLoopBuild.BuildWeb'}[a.scene]
        run('unity-web',[str(editor),'-batchmode','-quit','-projectPath',str(PROJECT),'-buildTarget','WebGL','-executeMethod',method,'-logFile','-'])
        log=(evidence/'unity-web.log').read_text(encoding='utf-8',errors='replace')
        if a.scene=='last-stand':
            require('ST_LS_WEB_BUILD_PASS' in log,'Missing Last Stand Web build marker')
            require('ST_LS_WEB_BUILD_PASS configuration='+a.configuration+' options='
                    +('Development' if a.configuration=='development' else 'None') in log,
                    'Last Stand Web build configuration mismatch')
            diagnostics=shader_diagnostics(log)
            require(accepts_log(log,'ST_LS_WEB_BUILD_PASS'),
                    'Unity shader compiler diagnostics: '+' | '.join(diagnostics[:8]))
        if a.scene=='review':
            for marker in ('ST_VIS_VALIDATE_PASS','ST_VIS_CHECKS_PASS','ST_VIS_WEB_BUILD_PASS'):
                require(marker in log,'Missing visual review checks: '+marker)
        elif a.scene=='gallery':
            for marker in ('ST_KIT_GALLERY_PASS','ST_KIT_GALLERY_WEB_BUILD_PASS'):
                require(marker in log,'Missing gallery checks: '+marker)
        elif a.scene=='last-stand':
            for marker in ('ST_LS_UNITY_PASS test_real_session_modes_and_damage',
                           'ST_LS_UNITY_PASS test_pause_terminal_ui_and_audio_lifecycle',
                           'ST_LS_UNITY_PASS test_batched_frame_retains_shot_audio',
                           'ST_LS_UNITY_PASS test_same_tick_launcher_kill_keeps_impact_cue'):
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
        if a.scene == 'last-stand':
            record['toolchain_after'] = toolchain_binding(editor)
            require(record['toolchain_before'] == record['toolchain_after'], 'Toolchain changed during export')
        require(record['source_before']==record['source_after'],'Build source changed during export; output is not source-bound')
        record.update(status='pass',scene_after=digest(scene),protected_scenes_after={name:digest(PROJECT/path) for name,path in {
            'field':'Assets/Scenes/FieldAssembly.unity',
            'review':'Assets/Scenes/BattlefieldReview.unity'}.items()},
            artifacts={f.relative_to(build).as_posix():digest(f) for f in build.rglob('*') if f.is_file()})
    except Exception as exc:
        record.update(status='failed',error=type(exc).__name__+': '+str(exc));raise
    finally:save();print(json.dumps({'status':record['status'],'build':str(build),'evidence':str(evidence)}),flush=True)


if __name__ == '__main__':
    main()
