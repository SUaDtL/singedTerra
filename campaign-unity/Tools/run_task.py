"""Run one explicit development command; preserve output and its exit code."""
from pathlib import Path
import subprocess, sys, datetime, json, os, uuid
ROOT=Path(__file__).resolve().parents[1]
label=sys.argv[1]; cmd=sys.argv[2:]
if not cmd: raise SystemExit('A command is required')
folder=ROOT/'Evidence'/(label+'-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6])
folder.mkdir(parents=True,exist_ok=False)
env=os.environ.copy()
if os.name=='nt':
    env.setdefault('ProgramData',str(Path(os.environ['SystemDrive']+'/')/'ProgramData'))
    env.setdefault('ALLUSERSPROFILE',env['ProgramData'])
record={'argv':cmd,'cwd':str(ROOT),'kind':'explicit-local-development-command'}
(folder/'started.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print('EVIDENCE='+str(folder),flush=True)
with (folder/'output.log').open('wb') as output:
    p=subprocess.Popen(cmd,cwd=ROOT,env=env,stdout=output,stderr=subprocess.STDOUT)
    print('CHILD_PID='+str(p.pid),flush=True)
    try: rc=p.wait(timeout=1800)
    except subprocess.TimeoutExpired:
        p.terminate(); p.wait(timeout=15); rc=124
record.update(exit_code=rc,completed_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
(folder/'result.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print('EXIT='+str(rc),flush=True)
raise SystemExit(rc)
